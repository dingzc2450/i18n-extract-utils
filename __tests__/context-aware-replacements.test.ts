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

// Clean up temp files
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
  test("should handle JSX attributes correctly", () => {
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
      hookName: 'useTranslation'
    });
    
    // Check that JSX attributes are properly transformed with curly braces
    expect(result.code).toContain('title={t(\'Click me\')}');
    expect(result.code).toContain('aria-label={t(\'Press button\')}');
    
    // Check extraction
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Click me");
    expect(result.extractedStrings[1].value).toBe("Press button");
  });
  
  test("should handle string literals correctly", () => {
    const code = `
      function MyComponent() {
        const message = "___Welcome message___";
        const errorText = \`___Error occurred___\`;
        
        return (
          <div>{message}</div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation'
    });
    
    // Check that string literals are properly transformed without curly braces
    expect(result.code).toContain('const message = t(\'Welcome message\');');
    expect(result.code).toContain('const errorText = t(\'Error occurred\');');
    
    // Check extraction
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Welcome message");
    expect(result.extractedStrings[1].value).toBe("Error occurred");
  });
  
  test("should handle JSX text correctly", () => {
    const code = `
      function MyComponent() {
        return (
          <div>
            <h1>___Page Title___</h1>
            <p>___This is a paragraph___ with some regular text.</p>
            <span>Regular text ___with translation___ in the middle</span>
          </div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation'
    });
    
    // Check that JSX text is properly transformed with curly braces
    expect(result.code).toContain('<h1>{t(\'Page Title\')}</h1>');
    expect(result.code).toContain('<p>{t(\'This is a paragraph\')} with some regular text.</p>');
    expect(result.code).toContain('<span>Regular text {t(\'with translation\')} in the middle</span>');
    
    // Check extraction
    expect(result.extractedStrings.length).toBe(3);
    expect(result.extractedStrings[0].value).toBe("Page Title");
    expect(result.extractedStrings[1].value).toBe("This is a paragraph");
    expect(result.extractedStrings[2].value).toBe("with translation");
  });
  
  test("should handle mixed contexts correctly", () => {
    const code = `
      function MyComponent() {
        const title = "___Component Title___";
        
        return (
          <div title="___Tooltip text___">
            <h1>{title}</h1>
            <p>___Welcome___ to our <strong>___Amazing___ app</strong></p>
          </div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation'
    });
    
    // Check different contexts
    expect(result.code).toContain('const title = t(\'Component Title\');');
    expect(result.code).toContain('title={t(\'Tooltip text\')}');
    expect(result.code).toContain('<p>{t(\'Welcome\')} to our <strong>{t(\'Amazing\')} app</strong></p>');
    
    // Check extraction
    expect(result.extractedStrings.length).toBe(4);
    expect(result.extractedStrings.map(s => s.value)).toContain("Component Title");
    expect(result.extractedStrings.map(s => s.value)).toContain("Tooltip text");
    expect(result.extractedStrings.map(s => s.value)).toContain("Welcome");
    expect(result.extractedStrings.map(s => s.value)).toContain("Amazing");
  });
  
  test("should handle special characters in translated strings", () => {
    const code = `
      function MyComponent() {
        return (
          <div>
            <p>___Hello, 'world'!___</p>
            <button title="___Click 'here' now___">Click</button>
            <span>___String with \`backticks\`___</span>
          </div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation'
    });
    
    // Check that special characters are properly escaped
    expect(result.code).toMatch(/t\(['"]Hello, ['\\]?world['\\]?!["']\)/);
    expect(result.code).toMatch(/title=\{t\(['"]Click ['\\]?here['\\]? now["']\)\}/);
    expect(result.code).toMatch(/t\(['"]String with `backticks`["']\)/);
    // Check extraction
    expect(result.extractedStrings.length).toBe(3);
    expect(result.extractedStrings[0].value).toBe("Hello, 'world'!");
    expect(result.extractedStrings[1].value).toBe("Click 'here' now");
    expect(result.extractedStrings[2].value).toBe("String with `backticks`");
  });
  
  test("should handle fallback to regex replacement when AST parsing fails", () => {
    // Creating intentionally malformed JSX that will fail AST parsing
    const code = `
      function MyComponent() {
        return (
          <div>
            <h1>___Hello World___</h1>
            {/* Unclosed JSX tag below */}
            <p>___Welcome to our app___
          </div>
        );
      }
    `;
    
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation'
    });
    
    // Even with bad JSX, the regex fallback should work
    expect(result.code).toContain('t("Hello World")');
    expect(result.code).toContain('t("Welcome to our app")');
    
    // Check extraction still works
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Hello World");
    expect(result.extractedStrings[1].value).toBe("Welcome to our app");
  });
});