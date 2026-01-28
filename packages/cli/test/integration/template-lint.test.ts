import path from 'node:path';

import {expect} from 'chai';
import {describe, it} from 'mocha';

import {
  formatViolations,
  getRulesForMethod,
  lintFileContent,
  lintTemplateMethod,
} from '../../src/lib/template-linter.js';

describe('Template Linting - Integration Tests', () => {
  // Get the templates directory path
  const templatesDir = path.join(process.cwd(), 'src', 'templates');

  describe('Rule Generation', () => {
    it('generates rules for cc-native method', () => {
      const rules = getRulesForMethod('cc-native');

      expect(rules).to.have.length.greaterThan(0);
      expect(rules.map((r) => r.name)).to.include('wrong-output-path');
      expect(rules.map((r) => r.name)).to.include('wrong-template-ref');
      expect(rules.map((r) => r.name)).to.include('wrong-workflow-ref');
    });

    it('cc-native rules allow cc-native references', () => {
      const rules = getRulesForMethod('cc-native');
      const wrongOutputRule = rules.find((r) => r.name === 'wrong-output-path');

      expect(wrongOutputRule).to.exist;
      // cc-native is the only method, so pattern should not match cc-native paths
      expect(wrongOutputRule!.pattern.test('_output/cc-native/')).to.be.false;
    });
  });

  describe('Content Linting', () => {
    it('allows correct output path for cc-native', () => {
      const rules = getRulesForMethod('cc-native');
      const content = `
# My Workflow

Write output to \`_output/cc-native/.planning/file.md\`
`;
      const violations = lintFileContent(content, 'test.md', rules);

      // Filter out bare-output-file warnings for this test
      const pathViolations = violations.filter((v) => v.rule !== 'bare-output-file');
      expect(pathViolations).to.have.length(0);
    });

    it('allows correct workflow reference for cc-native', () => {
      const rules = getRulesForMethod('cc-native');
      const content = `
# My Workflow

Run \`/cc-native:review-plan\` next
`;
      const violations = lintFileContent(content, 'test.md', rules);

      expect(violations).to.have.length(0);
    });
  });

  describe('Template Method Validation', () => {
    it('cc-native templates have no cross-method contamination', () => {
      const violations = lintTemplateMethod(templatesDir, 'cc-native');

      // Format violations for readable error message
      if (violations.length > 0) {
        const formatted = formatViolations(violations, templatesDir);
        expect.fail(`CC-Native template violations found:\n${formatted}`);
      }

      expect(violations).to.have.length(0);
    });
  });

  describe('Violation Formatting', () => {
    it('formats violations with file and line info', () => {
      const violations = [
        {
          file: '/path/to/file.md',
          line: 42,
          rule: 'wrong-output-path',
          message: 'Wrong method in output path: _output/bmad/',
          match: '_output/bmad/',
        },
      ];

      const formatted = formatViolations(violations);

      expect(formatted).to.include('/path/to/file.md:42');
      expect(formatted).to.include('[wrong-output-path]');
      expect(formatted).to.include('_output/bmad/');
    });

    it('returns friendly message for no violations', () => {
      const formatted = formatViolations([]);

      expect(formatted).to.equal('No violations found.');
    });
  });
});
