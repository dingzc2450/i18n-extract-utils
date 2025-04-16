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
  test("should process file correctly", () => {
    // 读取文件内容作为测试用例
    const filePath = path.resolve(__dirname, '../samples/example-component.tsx');
    const codeContent = fs.readFileSync(filePath, 'utf8');
    
    // 使用该内容作为测试
    const tempFile = createTempFile(codeContent);
    tempFiles.push(tempFile);
    
    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation'
    });
    
    // 断言验证
    expect(result.code).toBeDefined();
    expect(result.extractedStrings.length).toBeGreaterThan(0);
  });
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
    expect(result.code).toMatch(/title=\{t\(['"]Click me['"]\)\}/);
    expect(result.code).toMatch(/aria-label=\{t\(['"]Press button['"]\)\}/);
    
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
    expect(result.code).toMatch(/const message = t\(['"]Welcome message['"]\);/);
    expect(result.code).toMatch(/const errorText = t\(['"]Error occurred['"]\);/);
    
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
    expect(result.code).toMatch(/<h1>\{t\(['"]Page Title['"]\)\}<\/h1>/);
    expect(result.code).toMatch(/<p>\{t\(['"]This is a paragraph['"]\)\} with some regular text\.<\/p>/);
    expect(result.code).toMatch(/<span>Regular text \{t\(['"]with translation['"]\)\} in the middle<\/span>/);
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
    expect(result.code).toMatch(/const title = t\(['"]Component Title['"]\);/);
    expect(result.code).toMatch(/title=\{t\(['"]Tooltip text['"]\)\}/);
    expect(result.code).toMatch(/<p>\{t\(['"]Welcome['"]\)\} to our <strong>\{t\(['"]Amazing['"]\)\} app<\/strong><\/p>/);
    
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

  test("should handle multiple components in one file correctly", () => {
    const code = `
      'use client'; // Directive
      import React from 'react';
      // Some comment
      function ComponentA() {
        const message = "___Message A___";
        return (
          <div title="___Title A___">
            <h1>___Header A___</h1>
            <p>{message}</p>
          </div>
        );
      }

      const ComponentB = () => {
        return (
          <section aria-label="___Label B___">
            <h2>___Header B___</h2>
            <span>___Text B___</span>
          </section>
        );
      };

      export default ComponentA; // Or both, doesn't matter for the test
    `;

    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);

    const result = transformCode(tempFile, {
      translationMethod: 't',
      hookName: 'useTranslation',
      hookImport: 'react-i18next' // Explicitly define for clarity
    });

    // 1. Check for import of useTranslation
    expect(result.code).toMatch(/import { useTranslation } from "react-i18next";/);
    // 2. Check for hook call in ComponentA
    expect(result.code).toMatch(/function ComponentA\(\) \{\s*const \{ t \} = useTranslation\(\);\s*const message = t\(['"]Message A['"]\);/s);
    // Check transformations in ComponentA
    expect(result.code).toMatch(/title=\{t\(['"]Title A['"]\)\}/);
    expect(result.code).toMatch(/<h1>\{t\(['"]Header A['"]\)\}<\/h1>/);

    // 3. Check for hook call in ComponentB
    expect(result.code).toMatch(/const ComponentB = \(\) => \{\s*const \{ t \} = useTranslation\(\);\s*return \(/s);
    // Check transformations in ComponentB
    expect(result.code).toMatch(/aria-label=\{t\(['"]Label B['"]\)\}/);
    expect(result.code).toMatch(/<h2>\{t\(['"]Header B['"]\)\}<\/h2>/);
    expect(result.code).toMatch(/<span>\{t\(['"]Text B['"]\)\}<\/span>/);

    // 4. Check extraction
    expect(result.extractedStrings.length).toBe(6);
    expect(result.extractedStrings.map(s => s.value)).toEqual(
      expect.arrayContaining(["Message A", "Title A", "Header A", "Label B", "Header B", "Text B"])
    );
  });

  test("should add hooks only to component functions, not to nested functions", () => {
    const code = `
      function MyComponent() {
        // This is the component function, hooks should be added here
        
        // Define an internal helper function
        function formatMessage(msg) {
          // This is an internal function, hooks should NOT be added here
          return msg;
        }
        
        const message = "___Hello World___";
        return (
          <div>
            <h1>{formatMessage(message)}</h1>
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
    
    // Import and hook should be added to component
    expect(result.code).toContain("import { useTranslation } from");
    expect(result.code).toMatch(/function MyComponent\(\) \{\s*const \{ t \} = useTranslation\(\);/);
    
    // Hook should NOT be added to the internal formatMessage function
    expect(result.code).not.toMatch(/function formatMessage\(msg\) \{\s*const \{ t \} = useTranslation\(\);/);
    
    // The translations should be properly applied
    expect(result.code).toContain('t("Hello World")');
    
    // Check extraction still works
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].value).toBe("Hello World");
  });

  test("should format import statements correctly when they are not on separate lines", () => {
    const code = `
      // 这段代码故意不包含导入语句，且让语句连在一起
      const statement1 = true;const statement2 = "___Test String___";
      
      function MyComponent() {
        return (
          <div>
            <h1>___Page Title___</h1>
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
    
    // 检查导入语句是否独立成行
    const lines = result.code.split('\n');
    const importLineIndex = lines.findIndex(line => 
      line.trim().startsWith('import') && line.includes('useTranslation')
    );
    
    expect(importLineIndex).toBeGreaterThan(-1); // 导入语句应该存在
    
    // 检查格式是否正确（导入语句前的行不应该包含statement1或statement2）
    if (importLineIndex > 0) {
      const lineBeforeImport = lines[importLineIndex - 1];
      expect(lineBeforeImport).not.toContain('true;const');
    }
    
    // 检查翻译是否正常工作
    expect(result.code).toContain('t("Test String")');
    expect(result.code).toContain('t("Page Title")');
    
    // 验证添加的hook调用格式正确
    expect(result.code).toMatch(/function MyComponent\(\) \{\s*const \{ t \} = useTranslation\(\);/);
  });
});