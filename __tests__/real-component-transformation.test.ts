import { expect, test, describe } from "vitest";
import { transformCode } from "./test-helpers";
import { StringReplacer } from "../src/string-replacer";

describe("Real Component Transformation Test", () => {
  const testComponentCode = `// 测试增强React框架的示例组件
import React from 'react';

export default function TestComponent() {
  const userName = 'Alice';
  const count = 5;

  return (
    <div className="test-component">
      <h1>{"___Hello World___"}</h1>
      <p>
        {"___Welcome to our application___"}
      </p>
      <span className="user-info">
        {"___User: {userName}___".replace('{userName}', userName)}
      </span>
      <div>
        {"___You have {count} items___".replace('{count}', count.toString())}
      </div>
      <button onClick={() => alert("___Click me___")}>
        {"___Submit___"}
      </button>
      <p>
        This is a regular text that should not be translated.
      </p>
      <div title="___This is a tooltip___">
        Some content
      </div>
    </div>
  );
}`;

  test("should transform complete component correctly", () => {
    // Create a mock file path for testing
    const mockFilePath = '/mock/test-component.tsx';
    
    // Mock fs.readFileSync to return our test code
    const originalReadFileSync = require('fs').readFileSync;
    require('fs').readFileSync = (path: string, encoding: string) => {
      if (path === mockFilePath) {
        return testComponentCode;
      }
      return originalReadFileSync(path, encoding);
    };

    try {
      const result = transformCode(mockFilePath, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        },
        appendExtractedComment: true,
        extractedCommentType: 'block'
      });

      // Verify all expected strings were extracted
      expect(result.extractedStrings).toHaveLength(7);
      
      const expectedStrings = [
        'Hello World',
        'Welcome to our application', 
        'User: {userName}',
        'You have {count} items',
        'Click me',
        'Submit',
        'This is a tooltip'
      ];
      
      expectedStrings.forEach(expectedString => {
        expect(result.extractedStrings.some(s => s.value === expectedString)).toBe(true);
      });

      // Verify transformations were applied correctly
      expect(result.code).toMatch(/import { useTranslation } from ['"]react-i18next['"];/);
      expect(result.code).toContain('const { t } = useTranslation();');
      
      // Check specific transformations
      expect(result.code).toContain('t("Hello World") /* Hello World */');
      expect(result.code).toContain('t("Welcome to our application") /* Welcome to our application */');
      // 要保持原样提取 否则会破坏用户后续的代码逻辑
      expect(result.code).toContain('t("User: {userName}") /* User: {userName} */');
      expect(result.code).toContain('t("You have {count} items") /* You have {count} items */');
      expect(result.code).toContain('alert(t("Click me") /* Click me */)');
      expect(result.code).toContain('t("Submit") /* Submit */');
      expect(result.code).toContain('title={t("This is a tooltip") /* This is a tooltip */}');

      // Verify original code structure is preserved
      expect(result.code).toContain('className="test-component"');
      expect(result.code).toContain('const userName = \'Alice\';');
      expect(result.code).toContain('const count = 5;');
      expect(result.code).toContain('This is a regular text that should not be translated.');

      // Verify change details
      expect(result.changes).toHaveLength(7);
      
      result.changes.forEach(change => {
        expect(change.start).toBeDefined();
        expect(change.end).toBeDefined();
        expect(change.start!).toBeGreaterThanOrEqual(0);
        expect(change.end!).toBeGreaterThan(change.start!);
        expect(change.line).toBeGreaterThan(0);
        expect(change.column).toBeGreaterThanOrEqual(0);
        expect(change.matchContext).toBeDefined();
        expect(change.matchContext!.fullMatch).toContain(change.original);
      });

    } finally {
      // Restore original fs.readFileSync
      require('fs').readFileSync = originalReadFileSync;
    }
  });

  test("should handle variable interpolation correctly", () => {
    // Mock fs.readFileSync for this test too
    const originalReadFileSync = require('fs').readFileSync;
    require('fs').readFileSync = (path: string, encoding: string) => {
      if (path === '/mock/test-component.tsx') {
        return testComponentCode;
      }
      return originalReadFileSync(path, encoding);
    };

    try {
      const result = transformCode('/mock/test-component.tsx', {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      // Check that variable placeholders are preserved (not normalized to {argN})
      const userString = result.extractedStrings.find(s => s.value.includes('User:'));
      const countString = result.extractedStrings.find(s => s.value.includes('You have'));
      
      expect(userString?.value).toBe('User: {userName}');
      expect(countString?.value).toBe('You have {count} items');
    } finally {
      require('fs').readFileSync = originalReadFileSync;
    }
  });

  test("should preserve code formatting in main areas", () => {
    // Mock fs.readFileSync for this test too
    const originalReadFileSync = require('fs').readFileSync;
    require('fs').readFileSync = (path: string, encoding: string) => {
      if (path === '/mock/test-component.tsx') {
        return testComponentCode;
      }
      return originalReadFileSync(path, encoding);
    };

    try {
      const result = transformCode('/mock/test-component.tsx', {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      const lines = result.code.split('\n');
      
      // Check that basic structure indentation is maintained in most places
      const componentDeclarationLine = lines.find(line => line.includes('export default function'));
      expect(componentDeclarationLine?.startsWith('export')).toBe(true); // No unexpected leading spaces
      
      const returnLine = lines.find(line => line.trim().startsWith('return'));
      expect(returnLine).toMatch(/^\s+return/); // Should have some indentation
      
      // Check that the main div has proper indentation
      const mainDivLine = lines.find(line => line.includes('className="test-component"'));
      expect(mainDivLine).toMatch(/^\s+<div/); // Should be indented
    } finally {
      require('fs').readFileSync = originalReadFileSync;
    }
  });

  test("should apply string replacements with exact positioning", () => {
    // Test the StringReplacer directly with a simpler case
    const simpleCode = `<h1>{"___Hello___"}</h1>`;
    
    const change = {
      filePath: 'test.tsx',
      original: '"___Hello___"',
      replacement: 't("Hello")',
      line: 1,
      column: 5,
      endLine: 1,
      endColumn: 18,
      start: 5,
      end: 18,
    };

    const result = StringReplacer.applyChanges(simpleCode, [change]);
    expect(result).toBe('<h1>{t("Hello")}</h1>');
  });

  test("should handle multiple string patterns in single line", () => {
    const codeWithMultiple = `<p>{"___First___"} and {"___Second___"}</p>`;
    
    // Calculate correct positions for both strings
    const firstPos = StringReplacer.calculatePosition(codeWithMultiple, 1, 4, 13); // "___First___"
    const secondPos = StringReplacer.calculatePosition(codeWithMultiple, 1, 24, 14); // "___Second___"
    
    const changes = [
      {
        filePath: 'test.tsx',
        original: '"___First___"',
        replacement: 't("First")',
        line: 1,
        column: 4,
        endLine: 1,
        endColumn: 17,
        start: firstPos.start,
        end: firstPos.end,
      },
      {
        filePath: 'test.tsx',
        original: '"___Second___"',
        replacement: 't("Second")',
        line: 1,
        column: 24,
        endLine: 1,
        endColumn: 38,
        start: secondPos.start,
        end: secondPos.end,
      }
    ];

    const result = StringReplacer.applyChanges(codeWithMultiple, changes);
    expect(result).toBe('<p>{t("First")} and {t("Second")}</p>');
  });
});
