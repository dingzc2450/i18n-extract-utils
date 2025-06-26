import { expect, test, describe } from "vitest";
import { transformCodeEnhanced } from "../src/ast-parser";
import * as fs from "fs";
import * as path from "path";

describe("Test Component Transformation", () => {
  const testComponentPath = path.join(__dirname, "../samples/test-component.tsx");

  test("should transform test-component.tsx correctly using enhanced mode", () => {
    // Verify the test component file exists
    expect(fs.existsSync(testComponentPath)).toBe(true);

    const result = transformCodeEnhanced(testComponentPath, {
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
      'User: {arg1}',
      'You have {arg1} items',
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
    
    // Check specific transformations with comments
    expect(result.code).toContain('t("Hello World") /* Hello World */');
    expect(result.code).toContain('t("Welcome to our application") /* Welcome to our application */');
    expect(result.code).toContain('t("User: {arg1}") /* User: {userName} */');
    expect(result.code).toContain('t("You have {arg1} items") /* You have {count} items */');
    expect(result.code).toContain('alert(t("Click me") /* Click me */)');
    expect(result.code).toContain('t("Submit") /* Submit */');
    expect(result.code).toContain('title={t("This is a tooltip") /* This is a tooltip */}');

    // Verify original code structure is preserved
    expect(result.code).toContain('className="test-component"');
    expect(result.code).toContain('const userName = \'Alice\';');
    expect(result.code).toContain('const count = 5;');
    expect(result.code).toContain('This is a regular text that should not be translated.');

    // Verify that the original pattern strings are not present anymore
    expect(result.code).not.toContain('___Hello World___');
    expect(result.code).not.toContain('___Welcome to our application___');
    expect(result.code).not.toContain('___User: {userName}___');
    expect(result.code).not.toContain('___You have {count} items___');
    expect(result.code).not.toContain('___Click me___');
    expect(result.code).not.toContain('___Submit___');
    expect(result.code).not.toContain('___This is a tooltip___');

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
  });

  test("should preserve code formatting and structure", () => {
    const result = transformCodeEnhanced(testComponentPath, {
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
    
    // Check that basic structure indentation is maintained
    const componentDeclarationLine = lines.find(line => line.includes('export default function'));
    expect(componentDeclarationLine?.startsWith('export')).toBe(true);
    
    const returnLine = lines.find(line => line.trim().startsWith('return'));
    expect(returnLine).toMatch(/^\s+return/); // Should have some indentation
    
    // Check that the main div has proper indentation
    const mainDivLine = lines.find(line => line.includes('className="test-component"'));
    expect(mainDivLine).toMatch(/^\s+<div/); // Should be indented
    
    // Check that variable declarations are preserved
    expect(result.code).toContain('const userName = \'Alice\';');
    expect(result.code).toContain('const count = 5;');
  });

  test("should handle variable interpolation in test component", () => {
    const result = transformCodeEnhanced(testComponentPath, {
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

    // Check that variable placeholders are normalized
    const userString = result.extractedStrings.find(s => s.value.includes('User:'));
    const countString = result.extractedStrings.find(s => s.value.includes('You have'));
    
    expect(userString?.value).toBe('User: {arg1}');
    expect(countString?.value).toBe('You have {arg1} items');
    
    // Verify that the transformation preserves the variable usage context
    expect(result.code).toContain('/* User: {userName} */');
    expect(result.code).toContain('/* You have {count} items */');
  });

  test("should only add imports and hooks once", () => {
    const result = transformCodeEnhanced(testComponentPath, {
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

    // Count occurrences of import and hook
    const importCount = (result.code.match(/import \{ useTranslation \} from ['"]react-i18next['"];/g) || []).length;
    const hookCount = (result.code.match(/const \{ t \} = useTranslation\(\);/g) || []).length;

    expect(importCount).toBe(1);
    expect(hookCount).toBe(1);
  });
});
