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
    it('generates rules for gsd method', () => {
      const rules = getRulesForMethod('gsd');

      expect(rules).to.have.length.greaterThan(0);
      expect(rules.map((r) => r.name)).to.include('wrong-output-path');
      expect(rules.map((r) => r.name)).to.include('wrong-template-ref');
      expect(rules.map((r) => r.name)).to.include('wrong-workflow-ref');
    });

    it('gsd rules detect bmad references', () => {
      const rules = getRulesForMethod('gsd');
      const wrongOutputRule = rules.find((r) => r.name === 'wrong-output-path');

      expect(wrongOutputRule).to.exist;
      expect(wrongOutputRule!.pattern.test('_output/bmad/')).to.be.true;
      expect(wrongOutputRule!.pattern.test('_output/gsd/')).to.be.false;
    });

    it('bmad rules detect gsd references', () => {
      const rules = getRulesForMethod('bmad');
      const wrongOutputRule = rules.find((r) => r.name === 'wrong-output-path');

      expect(wrongOutputRule).to.exist;
      // Reset regex
      wrongOutputRule!.pattern.lastIndex = 0;
      expect(wrongOutputRule!.pattern.test('_output/gsd/')).to.be.true;

      wrongOutputRule!.pattern.lastIndex = 0;
      expect(wrongOutputRule!.pattern.test('_output/bmad/')).to.be.false;
    });
  });

  describe('Content Linting', () => {
    it('detects wrong output path in content', () => {
      const rules = getRulesForMethod('gsd');
      const content = `
# My Workflow

Write output to \`_output/bmad/file.md\`
`;
      const violations = lintFileContent(content, 'test.md', rules);

      expect(violations).to.have.length.greaterThan(0);
      const firstViolation = violations[0];
      expect(firstViolation).to.exist;
      expect(firstViolation?.rule).to.equal('wrong-output-path');
      expect(firstViolation?.message).to.include('_output/bmad/');
    });

    it('allows correct output path', () => {
      const rules = getRulesForMethod('gsd');
      const content = `
# My Workflow

Write output to \`_output/gsd/.planning/file.md\`
`;
      const violations = lintFileContent(content, 'test.md', rules);

      // Filter out bare-output-file warnings for this test
      const pathViolations = violations.filter((v) => v.rule !== 'bare-output-file');
      expect(pathViolations).to.have.length(0);
    });

    it('detects wrong template reference', () => {
      const rules = getRulesForMethod('gsd');
      const content = `
# My Workflow

Use template from \`_bmad/templates/FILE.md.template\`
`;
      const violations = lintFileContent(content, 'test.md', rules);

      expect(violations).to.have.length.greaterThan(0);
      const firstViolation = violations[0];
      expect(firstViolation).to.exist;
      expect(firstViolation?.rule).to.equal('wrong-template-ref');
    });

    it('detects wrong workflow reference', () => {
      const rules = getRulesForMethod('gsd');
      const content = `
# My Workflow

Run \`/bmad:create-prd\` next
`;
      const violations = lintFileContent(content, 'test.md', rules);

      expect(violations).to.have.length.greaterThan(0);
      const firstViolation = violations[0];
      expect(firstViolation).to.exist;
      expect(firstViolation?.rule).to.equal('wrong-workflow-ref');
    });

    it('allows correct workflow reference', () => {
      const rules = getRulesForMethod('gsd');
      const content = `
# My Workflow

Run \`/gsd:discuss-phase\` next
`;
      const violations = lintFileContent(content, 'test.md', rules);

      expect(violations).to.have.length(0);
    });
  });

  describe('Template Method Validation', () => {
    it('gsd templates have no cross-method contamination', () => {
      const violations = lintTemplateMethod(templatesDir, 'gsd');

      // Format violations for readable error message
      if (violations.length > 0) {
        const formatted = formatViolations(violations, templatesDir);
        expect.fail(`GSD template violations found:\n${formatted}`);
      }

      expect(violations).to.have.length(0);
    });

    it('bmad templates have no cross-method contamination', () => {
      const violations = lintTemplateMethod(templatesDir, 'bmad');

      // Format violations for readable error message
      if (violations.length > 0) {
        const formatted = formatViolations(violations, templatesDir);
        expect.fail(`BMAD template violations found:\n${formatted}`);
      }

      expect(violations).to.have.length(0);
    });

    it('planning-with-files templates have no cross-method contamination', () => {
      const violations = lintTemplateMethod(templatesDir, 'planning-with-files');

      // Format violations for readable error message
      if (violations.length > 0) {
        const formatted = formatViolations(violations, templatesDir);
        expect.fail(`Planning-with-files template violations found:\n${formatted}`);
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
