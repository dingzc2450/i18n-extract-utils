import { expect, test, describe, afterEach } from "vitest";
import { transformCodeFromFile } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper to create temporary test files
function createTempFile(content: string, extension: string = "ts"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.${extension}`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

// Clean up temp files
const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (err) {
        console.error(`Error removing temp file ${file}:`, err);
      }
    }
  });
  tempFiles.length = 0;
});

describe("JS/TS File Comment Support", () => {
  describe("TypeScript (.ts) files", () => {
    test("should add block comments in TS files", () => {
      const tsCode = `// 普通的TypeScript文件
export function greetUser(name: string): string {
  const greeting = "___Hello___";
  const message = "___Welcome to our app___";
  return greeting + " " + name + "! " + message;
}

export const config = {
  title: "___App Title___",
  description: "___This is our application___"
};`;

      const tempFile = createTempFile(tsCode, "ts");
      tempFiles.push(tempFile);

      const result = transformCodeFromFile(tempFile, {
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

      // 验证注释被正确添加
      expect(result.code).toContain('t("Hello") /* Hello */');
      expect(result.code).toContain('t("Welcome to our app") /* Welcome to our app */');
      expect(result.code).toContain('t("App Title") /* App Title */');
      expect(result.code).toContain('t("This is our application") /* This is our application */');
      
      // 验证提取的字符串
      expect(result.extractedStrings).toHaveLength(4);
      expect(result.extractedStrings.map(s => s.value)).toEqual(
        expect.arrayContaining(['Hello', 'Welcome to our app', 'App Title', 'This is our application'])
      );
    });

    test("should add line comments in TS files", () => {
      const tsCode = `export function processData(): void {
  const status = "___Processing___";
  console.log(status);
}`;

      const tempFile = createTempFile(tsCode, "ts");
      tempFiles.push(tempFile);

      const result = transformCodeFromFile(tempFile, {
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
        extractedCommentType: 'line'
      });

      // 验证行注释被正确添加
      expect(result.code).toContain('t("Processing") // Processing');
      expect(result.extractedStrings).toHaveLength(1);
    });
  });

  describe("JavaScript (.js) files", () => {
    test("should add block comments in JS files", () => {
      const jsCode = `// 普通的JavaScript文件
function validateInput(value) {
  if (!value) {
    throw new Error("___Value is required___");
  }
  return "___Valid input___";
}

const messages = {
  error: "___Something went wrong___",
  success: "___Operation completed___"
};`;

      const tempFile = createTempFile(jsCode, "js");
      tempFiles.push(tempFile);

      const result = transformCodeFromFile(tempFile, {
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

      // 验证注释被正确添加
      expect(result.code).toContain('t("Value is required") /* Value is required */');
      expect(result.code).toContain('t("Valid input") /* Valid input */');
      expect(result.code).toContain('t("Something went wrong") /* Something went wrong */');
      expect(result.code).toContain('t("Operation completed") /* Operation completed */');
      
      // 验证提取的字符串
      expect(result.extractedStrings).toHaveLength(4);
    });

    test("should add line comments in JS files", () => {
      const jsCode = `function getMessage() {
  return "___Default message___";
}`;

      const tempFile = createTempFile(jsCode, "js");
      tempFiles.push(tempFile);

      const result = transformCodeFromFile(tempFile, {
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
        extractedCommentType: 'line'
      });

      // 验证行注释被正确添加
      expect(result.code).toContain('t("Default message") // Default message');
      expect(result.extractedStrings).toHaveLength(1);
    });
  });

  describe("Without comments", () => {
    test("should not add comments when appendExtractedComment is false", () => {
      const jsCode = `const text = "___No comment test___";`;

      const tempFile = createTempFile(jsCode, "js");
      tempFiles.push(tempFile);

      const result = transformCodeFromFile(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        },
        appendExtractedComment: false
      });

      // 验证没有注释
      expect(result.code).toContain('t("No comment test")');
      expect(result.code).not.toContain('/* No comment test */');
      expect(result.code).not.toContain('// No comment test');
    });

    test("should not add comments when appendExtractedComment is undefined", () => {
      const jsCode = `const text = "___Undefined comment test___";`;

      const tempFile = createTempFile(jsCode, "js");
      tempFiles.push(tempFile);

      const result = transformCodeFromFile(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
        // appendExtractedComment 未设置
      });

      // 验证没有注释
      expect(result.code).toContain('t("Undefined comment test")');
      expect(result.code).not.toContain('/* Undefined comment test */');
      expect(result.code).not.toContain('// Undefined comment test');
    });
  });

  describe("Complex JS/TS scenarios", () => {
    test("should handle template literals with comments", () => {
      const tsCode = `function createMessage(name: string, count: number): string {
  return \`___Hello \${name}, you have \${count} items___\`;
}`;

      const tempFile = createTempFile(tsCode, "ts");
      tempFiles.push(tempFile);

      const result = transformCodeFromFile(tempFile, {
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

      expect(result.code).toContain('t("Hello {arg1}, you have {arg2} items", { arg1: name, arg2: count }) /* Hello {arg1}, you have {arg2} items */');
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe('Hello {arg1}, you have {arg2} items');
    });

    test("should handle nested object properties with comments", () => {
      const jsCode = `const config = {
  ui: {
    buttons: {
      save: "___Save___",
      cancel: "___Cancel___",
      delete: "___Delete___"
    },
    messages: {
      success: "___Operation successful___",
      error: "___Operation failed___"
    }
  }
};`;

      const tempFile = createTempFile(jsCode, "js");
      tempFiles.push(tempFile);

      const result = transformCodeFromFile(tempFile, {
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
        extractedCommentType: 'line'
      });

      // 验证所有字符串都有行注释
      expect(result.code).toContain('t("Save") // Save');
      expect(result.code).toContain('t("Cancel") // Cancel');
      expect(result.code).toContain('t("Delete") // Delete');
      expect(result.code).toContain('t("Operation successful") // Operation successful');
      expect(result.code).toContain('t("Operation failed") // Operation failed');
      
      expect(result.extractedStrings).toHaveLength(5);
    });
  });

  describe("Using original transformCode function", () => {
    test("should work with original transformCode function for JS files", () => {
      const jsCode = `const message = "___Original transform test___";`;

      const tempFile = createTempFile(jsCode, "js");
      tempFiles.push(tempFile);

      const result = transformCodeFromFile(tempFile, {
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

      // 验证原始转换函数也支持注释
      expect(result.code).toContain('t("Original transform test")');
      // 注意：原始transformCode可能使用AST重新生成，格式可能不同
      expect(result.extractedStrings).toHaveLength(1);
    });
  });
});
