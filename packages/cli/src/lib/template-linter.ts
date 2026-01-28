/**
 * Template Linter
 *
 * Validates workflow markdown files within templates for:
 * - Correct output paths (_output/{method}/)
 * - No cross-method contamination (gsd referencing bmad paths)
 * - Proper template references (_{method}/templates/)
 * - Correct workflow references (/method:workflow)
 */

import {existsSync, readdirSync, readFileSync} from 'node:fs';
import path from 'node:path';

export interface LintViolation {
  file: string;
  line: number;
  match: string;
  message: string;
  rule: string;
}

export interface LintRule {
  description: string;
  /** Message template - use {match} for the matched text */
  message: string;
  name: string;
  /** Regex to find violations - matches indicate problems */
  pattern: RegExp;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replaceAll(/[$()*+.?[\\\]^{|}]/g, String.raw`\$&`);
}

/**
 * Generate lint rules for a specific method
 * Rules detect when a method's workflows reference other methods incorrectly
 */
export function getRulesForMethod(method: string): LintRule[] {
  // Known methods to check against
  const allMethods = ['cc-native'];
  const otherMethods = allMethods.filter((m) => m !== method);

  // Create regex pattern that matches other methods but not the current one
  const otherMethodsPattern = otherMethods.map((m) => escapeRegex(m)).join('|');

  return [
    {
      description: `Output paths should use _output/${method}/, not other methods`,
      message: `Wrong method in output path: {match} (should be _output/${method}/)`,
      name: 'wrong-output-path',
      pattern: new RegExp(`_output/(${otherMethodsPattern})/`, 'g'),
    },
    {
      description: `Template references should use _${method}/templates/, not other methods`,
      message: `Wrong method in template reference: {match} (should be _${method}/templates/)`,
      name: 'wrong-template-ref',
      pattern: new RegExp(`_(${otherMethodsPattern})/templates/`, 'g'),
    },
    {
      description: `Workflow references should use /${method}:, not other methods`,
      message: `Wrong method in workflow reference: {match} (should be /${method}:)`,
      name: 'wrong-workflow-ref',
      pattern: new RegExp(`/(${otherMethodsPattern}):`, 'g'),
    },
    {
      description: `Method folder references should use _${method}/, not other methods`,
      message: `Wrong method in folder reference: {match} (should be _${method}/workflows/)`,
      name: 'wrong-method-folder',
      pattern: new RegExp(`_(${otherMethodsPattern})/workflows/`, 'g'),
    },
    // Note: bare-output-file rule removed as it produces too many false positives
    // in README documentation that explains workflow outputs.
    // The cross-method contamination rules are the primary value of this linter.
  ];
}

/**
 * Check a single line for violations of a rule
 */
function checkLineForViolations(
  line: string,
  lineNum: number,
  filePath: string,
  rule: LintRule
): LintViolation[] {
  const violations: LintViolation[] = [];

  // Skip code block fences and comments
  if (line.trim().startsWith('```') || line.trim().startsWith('<!--')) {
    return violations;
  }

  // Reset regex for this line
  rule.pattern.lastIndex = 0;
  let match: null | RegExpExecArray;

  while ((match = rule.pattern.exec(line)) !== null) {
    violations.push({
      file: filePath,
      line: lineNum + 1,
      match: match[0],
      message: rule.message.replace('{match}', match[0]),
      rule: rule.name,
    });
  }

  return violations;
}

/**
 * Lint a single file's content
 */
export function lintFileContent(
  content: string,
  filePath: string,
  rules: LintRule[]
): LintViolation[] {
  const violations: LintViolation[] = [];
  const lines = content.split('\n');

  for (const rule of rules) {
    // Reset regex state for each rule
    rule.pattern.lastIndex = 0;

    for (const [lineNum, line] of lines.entries()) {
      const lineViolations = checkLineForViolations(line, lineNum, filePath, rule);
      violations.push(...lineViolations);
    }
  }

  return violations;
}

/**
 * Get all markdown files in a template method directory
 */
export function getTemplateMarkdownFiles(templatesDir: string, method: string): string[] {
  const methodDir = path.join(templatesDir, method);
  const files: string[] = [];

  if (!existsSync(methodDir)) {
    return files;
  }

  function walkDir(dir: string): void {
    const entries = readdirSync(dir, {withFileTypes: true});

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // Skip node_modules and hidden dirs (except .claude, .windsurf, .cursor)
        if (
          entry.name === 'node_modules' ||
          (entry.name.startsWith('.') &&
            !entry.name.startsWith('.claude') &&
            !entry.name.startsWith('.windsurf') &&
            !entry.name.startsWith('.cursor'))
        ) {
          continue;
        }

        walkDir(fullPath);
      } else if (entry.name.endsWith('.md') && !entry.name.endsWith('.template')) {
        // Only lint .md files, not .md.template files (those have placeholders)
        files.push(fullPath);
      }
    }
  }

  walkDir(methodDir);
  return files;
}

/**
 * Lint all markdown files for a specific template method
 */
export function lintTemplateMethod(
  templatesDir: string,
  method: string
): LintViolation[] {
  const rules = getRulesForMethod(method);
  const files = getTemplateMarkdownFiles(templatesDir, method);
  const allViolations: LintViolation[] = [];

  for (const filePath of files) {
    const content = readFileSync(filePath, 'utf8');
    const violations = lintFileContent(content, filePath, rules);
    allViolations.push(...violations);
  }

  return allViolations;
}

/**
 * Lint all template methods in a templates directory
 */
export function lintAllTemplates(templatesDir: string): Map<string, LintViolation[]> {
  const results = new Map<string, LintViolation[]>();
  const methods = ['cc-native'];

  for (const method of methods) {
    const methodDir = path.join(templatesDir, method);

    if (existsSync(methodDir)) {
      results.set(method, lintTemplateMethod(templatesDir, method));
    }
  }

  return results;
}

/**
 * Format violations for display
 */
export function formatViolations(violations: LintViolation[], basePath?: string): string {
  if (violations.length === 0) {
    return 'No violations found.';
  }

  return violations
    .map((v) => {
      const relativePath = basePath
        ? path.relative(basePath, v.file)
        : v.file;
      return `${relativePath}:${v.line} [${v.rule}] ${v.message}`;
    })
    .join('\n');
}
