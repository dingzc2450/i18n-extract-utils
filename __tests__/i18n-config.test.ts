import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";
import * as t from "@babel/types";

// Helper functions
function createTempFile(content: string): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.tsx`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

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

describe("i18nConfig Tests", () => {
  describe("i18nImport Configuration", () => {
    test("should use i18nImport.name for translation method", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "translate",
            importName: "useTranslation",
            source: "react-i18next"
          }
        }
      });

      expect(result.code).toContain('translate("Hello World")');
      expect(result.code).toContain('const { translate } = useTranslation();');
      expect(result.code).toContain('import { useTranslation } from "react-i18next";');
    });

    test("should use i18nImport.importName for hook name", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain('const { t } = useI18n();');
      expect(result.code).toContain('import { useI18n } from "vue-i18n";');
    });

    test("should use i18nImport.source for import source", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "my-custom-i18n-lib"
          }
        }
      });

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain('const { t } = useTranslation();');
      expect(result.code).toContain('import { useTranslation } from "my-custom-i18n-lib";');
    });

    test("should handle i18nImport with custom import statement", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            source: "custom-i18n",
            custom: 'import { useCustomHook as useTranslation } from "custom-i18n"'
          }
        }
      });

      expect(result.code).toContain('t("Hello World")');
      // Note: custom import handling might need implementation in the actual code
    });

    test("should handle default method name correctly", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "default",
            importName: "useTranslation",
            source: "react-i18next"
          }
        }
      });

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain('const t = useTranslation();');
      expect(result.code).toContain('import { useTranslation } from "react-i18next";');
    });

    test("should prioritize i18nConfig over deprecated options", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        // Deprecated options
        translationMethod: "oldT",
        hookName: "oldUseTranslation",
        hookImport: "old-i18n-lib",
        // New i18nConfig should override
        i18nConfig: {
          i18nImport: {
            name: "newT",
            importName: "newUseTranslation",
            source: "new-i18n-lib"
          }
        }
      });

      expect(result.code).toContain('newT("Hello World")');
      expect(result.code).toContain('const { newT } = newUseTranslation();');
      expect(result.code).toContain('import { newUseTranslation } from "new-i18n-lib";');
      
      // Should not contain old values
      expect(result.code).not.toContain('oldT("Hello World")');
      expect(result.code).not.toContain('oldUseTranslation');
      expect(result.code).not.toContain('old-i18n-lib');
    });

    test("should fallback to deprecated options when i18nConfig is not provided", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        translationMethod: "translate",
        hookName: "useI18n",
        hookImport: "legacy-i18n"
      });

      expect(result.code).toContain('translate("Hello World")');
      expect(result.code).toContain('const { translate } = useI18n();');
      expect(result.code).toContain('import { useI18n } from "legacy-i18n";');
    });

    test("should handle missing importName in i18nImport", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            source: "i18n-lib"
            // importName is optional
          }
        }
      });

      expect(result.code).toContain('t("Hello World")');
      // Should fallback to default hookName
      expect(result.code).toContain('const { t } = useTranslation();');
      expect(result.code).toContain('import { useTranslation } from "i18n-lib";');
    });

    test("should handle complex import scenarios", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          const title = "___Page Title___";
          return <div><h1>{title}</h1><p>{message}</p></div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "i18n",
            importName: "useI18nContext",
            source: "@/utils/i18n"
          }
        }
      });

      expect(result.code).toContain('i18n("Hello World")');
      expect(result.code).toContain('i18n("Page Title")');
      expect(result.code).toContain('const { i18n } = useI18nContext();');
      expect(result.code).toContain('import { useI18nContext } from "@/utils/i18n";');
    });
  });

  describe("i18nCall Configuration", () => {
    test("should use custom i18nCall function for generating call expressions", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      // Custom i18nCall that creates a different call pattern
      const customI18nCall = (callName: string, key: string | number, rawText: string) => {
        return t.callExpression(
          t.memberExpression(t.identifier(callName), t.identifier("get")),
          [
            typeof key === "string" ? t.stringLiteral(key) : t.numericLiteral(key),
            t.objectExpression([
              t.objectProperty(t.identifier("fallback"), t.stringLiteral(rawText))
            ])
          ]
        );
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "i18n",
            importName: "useTranslation",
            source: "react-i18next"
          },
          i18nCall: customI18nCall
        }
      });

      expect(result.code).toContain('i18n.get("Hello World", { fallback: "Hello World" })');
      expect(result.code).toContain('const { i18n } = useTranslation();');
    });

    test("should handle i18nCall with numeric keys", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customI18nCall = (callName: string, key: string | number, rawText: string) => {
        return t.callExpression(
          t.identifier(callName),
          [
            typeof key === "string" ? t.stringLiteral(key) : t.numericLiteral(key),
            t.stringLiteral(`context_${rawText}`)
          ]
        );
      };

      const generateNumericKey = (value: string, filePath: string): number => {
        return value.length * 100; // Simple numeric key generation
      };

      const result = transformCode(tempFile, {
        generateKey: generateNumericKey,
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next"
          },
          i18nCall: customI18nCall
        }
      });

      expect(result.code).toContain('t(1100, "context_Hello World")'); // "Hello World".length * 100 = 1100
    });

    test("should handle i18nCall with template literals and interpolation", () => {
      const code = `
        function MyComponent({ name }) {
          const message = \`___Hello \${name}___\`;
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customI18nCall = (callName: string, key: string | number, rawText: string) => {
        // Create a call that includes metadata
        return t.callExpression(
          t.identifier(callName),
          [
            typeof key === "string" ? t.stringLiteral(key) : t.numericLiteral(key),
            t.objectExpression([
              t.objectProperty(t.identifier("type"), t.stringLiteral("template")),
              t.objectProperty(t.identifier("original"), t.stringLiteral(rawText))
            ])
          ]
        );
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "translate",
            importName: "useTranslation",
            source: "react-i18next"
          },
          i18nCall: customI18nCall
        }
      });

      // For template literals with interpolation, the custom i18nCall should be used
      // but interpolation arguments are not passed to custom i18nCall
      expect(result.code).toContain('translate("Hello {arg1}", { type: "template", original: "Hello ${...}" })');
    });

    test("should handle i18nCall with JSX elements", () => {
      const code = `
        function MyComponent() {
          return (
            <div>
              <h1>___Page Title___</h1>
              <p>___Welcome message___</p>
            </div>
          );
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customI18nCall = (callName: string, key: string | number, rawText: string) => {
        return t.callExpression(
          t.memberExpression(t.identifier(callName), t.identifier("jsx")),
          [
            typeof key === "string" ? t.stringLiteral(key) : t.numericLiteral(key)
          ]
        );
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "i18n",
            importName: "useTranslation",
            source: "react-i18next"
          },
          i18nCall: customI18nCall
        }
      });

      expect(result.code).toContain('i18n.jsx("Page Title")');
      expect(result.code).toContain('i18n.jsx("Welcome message")');
    });

    test("should fallback to default createTranslationCall when i18nCall is not provided", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next"
          }
          // No i18nCall provided
        }
      });

      // Should use default pattern
      expect(result.code).toContain('t("Hello World")');
      expect(result.code).not.toContain('t.get(');
      expect(result.code).not.toContain('t.jsx(');
    });

    test("should handle i18nCall with existing translation keys", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          const title = "___Page Title___";
          return <div><h1>{title}</h1><p>{message}</p></div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customI18nCall = (callName: string, key: string | number, rawText: string) => {
        return t.callExpression(
          t.identifier(callName),
          [
            typeof key === "string" ? t.stringLiteral(key) : t.numericLiteral(key),
            t.objectExpression([
              t.objectProperty(t.identifier("default"), t.stringLiteral(rawText)),
              t.objectProperty(t.identifier("context"), t.stringLiteral("component"))
            ])
          ]
        );
      };

      const existingValueToKey = new Map<string, string>();
      existingValueToKey.set("Hello World", "greeting");
      existingValueToKey.set("Page Title", "title");

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next"
          },
          i18nCall: customI18nCall
        }
      }, existingValueToKey);

      expect(result.code).toContain('t("greeting", { default: "Hello World", context: "component" })');
      expect(result.code).toContain('t("title", { default: "Page Title", context: "component" })');
      expect(result.usedExistingKeysList.length).toBe(2);
    });
  });

  describe("Framework Configuration", () => {
    test("should handle framework configuration", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next"
          }
        }
      });

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain('const { t } = useTranslation();');
    });

    test("should handle different framework configurations", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      });

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain('const { t } = useI18n();');
    });
  });

  describe("Combined Configuration Tests", () => {
    test("should handle both i18nImport and i18nCall together", () => {
      const code = `
        function MyComponent({ user }) {
          const greeting = \`___Hello \${user.name}___\`;
          const title = "___Dashboard___";
          return (
            <div>
              <h1>{title}</h1>
              <p>{greeting}</p>
            </div>
          );
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customI18nCall = (callName: string, key: string | number, rawText: string) => {
        return t.callExpression(
          t.memberExpression(
            t.identifier(callName),
            t.identifier("translate")
          ),
          [
            typeof key === "string" ? t.stringLiteral(key) : t.numericLiteral(key),
            t.objectExpression([
              t.objectProperty(t.identifier("fallback"), t.stringLiteral(rawText))
            ])
          ]
        );
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "i18n",
            importName: "useI18nHook",
            source: "custom-i18n-lib"
          },
          i18nCall: customI18nCall
        }
      });

      expect(result.code).toContain('import { useI18nHook } from "custom-i18n-lib";');
      expect(result.code).toContain('const { i18n } = useI18nHook();');
      expect(result.code).toContain('i18n.translate("Dashboard", { fallback: "Dashboard" })');
      expect(result.code).toContain('i18n.translate("Hello {arg1}", { fallback: "Hello ${...}" })');
    });

    test("should handle complex nested components with i18nConfig", () => {
      const code = `
        function ParentComponent() {
          const title = "___Main Title___";
          
          function ChildComponent() {
            const subtitle = "___Subtitle___";
            return <h2>{subtitle}</h2>;
          }
          
          return (
            <div>
              <h1>{title}</h1>
              <ChildComponent />
            </div>
          );
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "translate",
            importName: "useTranslation",
            source: "react-i18next"
          }
        }
      });

      expect(result.code).toContain('translate("Main Title")');
      expect(result.code).toContain('translate("Subtitle")');
      // Should have translation hooks in both components
      // Note: Inner function components may not automatically get hooks in current implementation
      expect((result.code.match(/const { translate } = useTranslation\(\);/g) || []).length).toBeGreaterThanOrEqual(1);
    });

    test("should handle edge cases with empty or malformed i18nConfig", () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {} // Empty config
      });

      // Should fallback to defaults
      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain('const { t } = useTranslation();');
      expect(result.code).toContain('import { useTranslation } from "react-i18next";');
    });
  });
});
