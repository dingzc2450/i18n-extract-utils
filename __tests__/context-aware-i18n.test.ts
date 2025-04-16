import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "../src/index.js";
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

// Helper to create temporary test files
function createTempFile(content: string): string {
  const tempDir = tmpdir();
  const tempFile = path.join(tempDir, `test-${Date.now()}.tsx`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

// Keep track of temp files for cleanup
const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach(file => {
    if (fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  });
  tempFiles.length = 0;
});

describe('Context-Aware Replacements', () => {
  test("should transform JSX attributes correctly", () => {
    const code = `
      function MyComponent() {
        return (
          <div>
            <button title="___Click me___" aria-label="___Press button___">
              Submit
            </button>
          </div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation',
      hookImport: 'react-i18next'
    });
    
    // JSX attributes should use {t('text')} format with curly braces
    expect(result.code).toContain('title={t(\'Click me\')}');
    expect(result.code).toContain('aria-label={t(\'Press button\')}');
    
    // Should have extracted the strings correctly
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Click me");
    expect(result.extractedStrings[1].value).toBe("Press button");
    
    // Should have added hook imports and usage
    expect(result.code).toContain("import { useTranslation } from 'react-i18next'");
    expect(result.code).toContain("const { t } = useTranslation()");
  });
  
  test("should transform string literals correctly", () => {
    const code = `
      function MyComponent() {
        const message = "___Welcome message___";
        const greeting = '___Hello user___';
        
        return (
          <div>{message} {greeting}</div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation',
      hookImport: 'react-i18next'
    });
    
    // String literals should transform to t('text') without curly braces
    expect(result.code).toContain("const message = t('Welcome message')");
    expect(result.code).toContain("const greeting = t('Hello user')");
    
    // Should have extracted the strings correctly
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Welcome message");
    expect(result.extractedStrings[1].value).toBe("Hello user");
  });
  
  test("should transform JSX text nodes correctly", () => {
    const code = `
      function MyComponent() {
        return (
          <div>
            <h1>___Page Title___</h1>
            <p>___This is a paragraph___ with some regular text.</p>
          </div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation',
      hookImport: 'react-i18next'
    });
    
    // JSX text should transform to {t('text')} with curly braces
    expect(result.code).toContain("<h1>{t('Page Title')}</h1>");
    expect(result.code).toContain("<p>{t('This is a paragraph')} with some regular text.</p>");
    
    // Should have extracted the strings correctly
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Page Title");
    expect(result.extractedStrings[1].value).toBe("This is a paragraph");
  });
  
  test("should handle mixed translation contexts in the same component", () => {
    const code = `
      function MyComponent() {
        const title = "___Component Title___";
        
        return (
          <div title="___Tooltip text___">
            <h1>{title}</h1>
            <p>___Welcome___ to our app</p>
          </div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation',
      hookImport: 'react-i18next'
    });
    
    // String literal, JSX attribute, and JSX text should all transform correctly
    expect(result.code).toContain("const title = t('Component Title')");
    expect(result.code).toContain('title={t(\'Tooltip text\')}');
    expect(result.code).toContain("<p>{t('Welcome')} to our app</p>");
    
    // Should have extracted all strings correctly
    expect(result.extractedStrings.length).toBe(3);
    expect(result.extractedStrings.map(s => s.value)).toContain("Component Title");
    expect(result.extractedStrings.map(s => s.value)).toContain("Tooltip text");
    expect(result.extractedStrings.map(s => s.value)).toContain("Welcome");
  });
  
  test("should handle special characters properly", () => {
    const code = `
      function MyComponent() {
        return (
          <div>
            <p>___Hello, 'world'!___</p>
            <button title="___Click &quot;here&quot;___">Click</button>
          </div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation',
      hookImport: 'react-i18next'
    });
    
    // Special characters should be properly escaped
    expect(result.code).toContain("{t('Hello, \\'world\\'!')}");
    expect(result.code).toContain('title={t(\'Click &quot;here&quot;\')}');
    
    // Should have extracted strings with special characters
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Hello, 'world'!");
    expect(result.extractedStrings[1].value).toBe('Click &quot;here&quot;');
  });
  
  test("should fallback to regex replacement when AST parsing fails", () => {
    // Intentionally malformed JSX to trigger the fallback mechanism
    const code = `
      function MyComponent() {
        return (
          <div>
            <h1>___Hello World___</h1>
            {/* Unclosed tag below will cause AST parsing to fail */}
            <p>___Welcome to our app___
          </div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation',
      hookImport: 'react-i18next'
    });
    
    // Fallback to regex replacement should still extract and transform the strings
    expect(result.code).toContain('t("Hello World")');
    expect(result.code).toContain('t("Welcome to our app")');
    
    // Should still extract the strings
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Hello World");
    expect(result.extractedStrings[1].value).toBe("Welcome to our app");
  });
});