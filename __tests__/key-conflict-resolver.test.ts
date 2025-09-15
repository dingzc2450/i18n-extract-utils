import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper to create temporary test files
function createTempFile(content: string): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.tsx`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

// Clean up temp files
const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach(file => {
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

describe("keyConflictResolver Configuration Tests", () => {
  describe("Boolean keyConflictResolver", () => {
    test("should reuse existing keys when keyConflictResolver is false (default)", () => {
      const code = `
        function MyComponent() {
          const message = "___Welcome Message___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const existingValueToKey = new Map<string, string>();
      existingValueToKey.set("Welcome Message", "common.welcome");

      const result = transformCode(
        tempFile,
        {
          i18nConfig: {
            i18nImport: {
              name: "t",
              importName: "useTranslation",
              source: "react-i18next",
            },
          },
          keyConflictResolver: false, // 默认行为
        },
        existingValueToKey
      );

      expect(result.code).toContain('t("common.welcome")');
      expect(result.usedExistingKeysList.length).toBe(1);
      expect(result.usedExistingKeysList[0].key).toBe("common.welcome");
      expect(result.usedExistingKeysList[0].value).toBe("Welcome Message");
    });

    test("should generate new keys when keyConflictResolver is true", () => {
      const code = `
        function MyComponent() {
          const message = "___Welcome Message___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const existingValueToKey = new Map<string, string>();
      existingValueToKey.set("Welcome Message", "common.welcome");

      const result = transformCode(
        tempFile,
        {
          i18nConfig: {
            i18nImport: {
              name: "t",
              importName: "useTranslation",
              source: "react-i18next",
            },
          },
          keyConflictResolver: true, // 总是生成新键
          generateKey: value =>
            `new.${value.toLowerCase().replace(/\s+/g, "-")}`,
        },
        existingValueToKey
      );

      expect(result.code).toContain('t("new.welcome-message")');
      expect(result.usedExistingKeysList.length).toBe(0);
      expect(result.extractedStrings.length).toBe(1);
      expect(result.extractedStrings[0].key).toBe("new.welcome-message");
      expect(result.extractedStrings[0].value).toBe("Welcome Message");
    });
  });

  describe("Function type keyConflictResolver", () => {
    test("should use custom resolver function to determine key usage", () => {
      const code = `
        function MyComponent() {
          const welcome = "___Welcome Message___";
          const goodbye = "___Goodbye Message___";
          return <div>{welcome} {goodbye}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const existingValueToKey = new Map<string, string>();
      existingValueToKey.set("Welcome Message", "common.welcome");
      existingValueToKey.set("Goodbye Message", "common.bye");

      // 自定义解析器：对包含"Goodbye"的值生成新键，其他重用现有键
      const keyConflictResolver = (
        existingKey: string | number,
        value: string
      ) => {
        if (value.includes("Goodbye")) {
          return `new.${value.toLowerCase().replace(/\s+/g, "-")}`;
        }
        return null; // 使用默认行为（重用现有键）
      };

      const result = transformCode(
        tempFile,
        {
          i18nConfig: {
            i18nImport: {
              name: "t",
              importName: "useTranslation",
              source: "react-i18next",
            },
          },
          keyConflictResolver,
        },
        existingValueToKey
      );

      expect(result.code).toContain('t("common.welcome")');
      expect(result.code).toContain('t("new.goodbye-message")');
      expect(result.usedExistingKeysList.length).toBe(1);
      expect(result.usedExistingKeysList[0].key).toBe("common.welcome");
      expect(result.usedExistingKeysList[0].value).toBe("Welcome Message");
      expect(result.extractedStrings.length).toBe(1);
      expect(result.extractedStrings[0].key).toBe("new.goodbye-message");
      expect(result.extractedStrings[0].value).toBe("Goodbye Message");
    });

    test("should pass context information to resolver function", () => {
      const code = `
        function MyComponent() {
          const message = "___Test Message___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const existingValueToKey = new Map<string, string>();
      existingValueToKey.set("Test Message", "common.test");

      // 检查是否传递了上下文信息
      let contextReceived: any = null;
      const keyConflictResolver = (
        _existingKey: string | number,
        _value: string,
        context: any
      ) => {
        contextReceived = context;
        return null; // 使用默认行为
      };

      const result = transformCode(
        tempFile,
        {
          i18nConfig: {
            i18nImport: {
              name: "t",
              importName: "useTranslation",
              source: "react-i18next",
            },
          },
          keyConflictResolver,
        },
        existingValueToKey
      );

      expect(result.code).toContain('t("common.test")');
      expect(contextReceived).not.toBeNull();
      expect(contextReceived.filePath).toBe(tempFile);
      expect(contextReceived.line).toBe(3); // 行号可能需要根据实际情况调整
      expect(contextReceived.column).toBeDefined();
    });

    test("should pass sameValueKeys in context when multiple keys map to same value", () => {
      const code = `
        function MyComponent() {
          const message = "___Welcome Message___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      // 创建一个具有多个键对应相同值的映射
      const existingValueToKey = new Map<
        string,
        { primaryKey: string | number; keys: Set<string | number> }
      >();
      existingValueToKey.set("Welcome Message", {
        primaryKey: "greeting",
        keys: new Set(["greeting", "welcome_msg", "intro_message"]),
      });

      let receivedSameValueKeys: (string | number)[] | undefined;
      const keyConflictResolver = (
        _existingKey: string | number,
        _value: string,
        context: any
      ) => {
        receivedSameValueKeys = context.sameValueKeys;
        return null; // 使用默认行为
      };

      const result = transformCode(
        tempFile,
        {
          i18nConfig: {
            i18nImport: {
              name: "t",
              importName: "useTranslation",
              source: "react-i18next",
            },
          },
          keyConflictResolver,
        },
        existingValueToKey
      );

      // 验证代码正确生成
      expect(result.code).toContain('t("greeting")');

      // 验证sameValueKeys正确传递
      expect(receivedSameValueKeys).toBeDefined();
      expect(receivedSameValueKeys).toEqual(
        expect.arrayContaining(["greeting", "welcome_msg", "intro_message"])
      );
      expect(receivedSameValueKeys!.length).toBe(3);
    });

    test("should use non-primary key from sameValueKeys when returned by keyConflictResolver", () => {
      const code = `
        function MyComponent() {
          const message = "___Welcome Message___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      // 创建一个具有多个键对应相同值的映射
      const existingValueToKey = new Map<
        string,
        { primaryKey: string | number; keys: Set<string | number> }
      >();
      existingValueToKey.set("Welcome Message", {
        primaryKey: "greeting",
        keys: new Set(["greeting", "welcome_msg", "intro_message"]),
      });

      const keyConflictResolver = (
        _existingKey: string | number,
        _value: string,
        _context: any
      ) => {
        // 返回非主键的值
        return "welcome_msg";
      };

      const result = transformCode(
        tempFile,
        {
          i18nConfig: {
            i18nImport: {
              name: "t",
              importName: "useTranslation",
              source: "react-i18next",
            },
          },
          keyConflictResolver,
        },
        existingValueToKey
      );

      // 验证代码使用了指定的非主键
      expect(result.code).toContain('t("welcome_msg")');

      // 验证正确记录了使用的键
      expect(result.usedExistingKeysList.length).toBe(1);
      expect(result.usedExistingKeysList[0].key).toBe("welcome_msg");
      expect(result.usedExistingKeysList[0].value).toBe("Welcome Message");
    });

    test("should use returned existing key from resolver function", () => {
      const code = `
        function MyComponent() {
          const message = "___Welcome Message___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const existingValueToKey = new Map<string, string>();
      existingValueToKey.set("Welcome Message", "common.welcome");

      // 自定义解析器：明确返回现有键
      const keyConflictResolver = (
        _existingKey: string | number,
        _value: string
      ) => {
        return "common.welcome";
      };

      const result = transformCode(
        tempFile,
        {
          i18nConfig: {
            i18nImport: {
              name: "t",
              importName: "useTranslation",
              source: "react-i18next",
            },
          },
          keyConflictResolver,
        },
        existingValueToKey
      );

      expect(result.code).toContain('t("common.welcome")');
      expect(result.usedExistingKeysList.length).toBe(1);
      expect(result.usedExistingKeysList[0].key).toBe("common.welcome");
    });

    test("should use returned new key from resolver function", () => {
      const code = `
        function MyComponent() {
          const message = "___Welcome Message___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const existingValueToKey = new Map<string, string>();
      existingValueToKey.set("Welcome Message", "common.welcome");

      // 自定义解析器：返回新键
      const keyConflictResolver = (
        _existingKey: string | number,
        _value: string
      ) => {
        return "custom.welcome.key";
      };

      const result = transformCode(
        tempFile,
        {
          i18nConfig: {
            i18nImport: {
              name: "t",
              importName: "useTranslation",
              source: "react-i18next",
            },
          },
          keyConflictResolver,
        },
        existingValueToKey
      );

      expect(result.code).toContain('t("custom.welcome.key")');
      expect(result.extractedStrings.length).toBe(1);
      expect(result.extractedStrings[0].key).toBe("custom.welcome.key");
      expect(result.extractedStrings[0].value).toBe("Welcome Message");
    });
  });
});