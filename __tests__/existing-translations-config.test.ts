import { expect, test, describe, afterEach } from "vitest";
import { processFiles } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper to create temporary test files
function createTempFile(content: string, extension = ".tsx"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}${extension}`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

// Helper to create temporary JSON files
function createTempJsonFile(content: Record<string, string | number>): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.json`);
  fs.writeFileSync(tempFile, JSON.stringify(content, null, 2));
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

describe("existingTranslationsConfig Tests", () => {
  describe("Single existingTranslationsConfig object", () => {
    test("should reuse keys from object source", async () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;

      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = await processFiles(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        existingTranslationsConfig: {
          source: {
            greeting: "Hello World",
            title: "Welcome",
          },
        },
      });

      expect(result.modifiedFiles.length).toBe(1);
      expect(result.modifiedFiles[0].newContent).toContain('t("greeting")');
      expect(result.usedExistingKeys.length).toBe(1);
      expect(result.usedExistingKeys[0].key).toBe("greeting");
      expect(result.usedExistingKeys[0].value).toBe("Hello World");
    });

    test("should reuse keys from file source", async () => {
      const translations = {
        greeting: "Hello World",
        title: "Welcome",
      };
      const tempJsonFile = createTempJsonFile(translations);
      tempFiles.push(tempJsonFile);

      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = await processFiles(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        existingTranslationsConfig: {
          source: tempJsonFile,
        },
      });

      expect(result.modifiedFiles.length).toBe(1);
      expect(result.modifiedFiles[0].newContent).toContain('t("greeting")');
      expect(result.usedExistingKeys.length).toBe(1);
      expect(result.usedExistingKeys[0].key).toBe("greeting");
      expect(result.usedExistingKeys[0].value).toBe("Hello World");
    });

    test("should handle missing file source gracefully", async () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = await processFiles(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        existingTranslationsConfig: {
          source: "/path/to/non/existent/file.json",
        },
      });

      // Should generate a new key since file doesn't exist
      expect(result.modifiedFiles.length).toBe(1);
      expect(result.modifiedFiles[0].newContent).toContain('t("Hello World")');
      expect(result.usedExistingKeys.length).toBe(0);
      expect(result.extractedStrings.length).toBe(1);
      expect(result.extractedStrings[0].key).toBe("Hello World");
      expect(result.extractedStrings[0].value).toBe("Hello World");
    });
  });

  describe("Array of existingTranslationsConfig objects", () => {
    test("should merge multiple translation sources", async () => {
      const translations1 = {
        greeting: "Hello World",
      };

      const translations2 = {
        title: "Welcome Message",
      };

      const tempJsonFile1 = createTempJsonFile(translations1);
      const tempJsonFile2 = createTempJsonFile(translations2);
      tempFiles.push(tempJsonFile1);
      tempFiles.push(tempJsonFile2);

      const code = `
        function MyComponent() {
          const greeting = "___Hello World___";
          const title = "___Welcome Message___";
          return <div>{greeting} - {title}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = await processFiles(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        existingTranslationsConfig: [
          {
            source: tempJsonFile1,
          },
          {
            source: tempJsonFile2,
          },
        ],
      });

      expect(result.modifiedFiles.length).toBe(1);
      expect(result.modifiedFiles[0].newContent).toContain('t("greeting")');
      expect(result.modifiedFiles[0].newContent).toContain('t("title")');
      expect(result.usedExistingKeys.length).toBe(2);

      const usedKeys = result.usedExistingKeys.map(item => item.key);
      expect(usedKeys).toContain("greeting");
      expect(usedKeys).toContain("title");
    });

    test("should handle mixed object and file sources", async () => {
      const translations = {
        title: "Welcome Message",
      };

      const tempJsonFile = createTempJsonFile(translations);
      tempFiles.push(tempJsonFile);

      const code = `
        function MyComponent() {
          const greeting = "___Hello World___";
          const title = "___Welcome Message___";
          return <div>{greeting} - {title}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = await processFiles(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        existingTranslationsConfig: [
          {
            source: {
              greeting: "Hello World",
            },
          },
          {
            source: tempJsonFile,
          },
        ],
      });

      expect(result.modifiedFiles.length).toBe(1);
      expect(result.modifiedFiles[0].newContent).toContain('t("greeting")');
      expect(result.modifiedFiles[0].newContent).toContain('t("title")');
      expect(result.usedExistingKeys.length).toBe(2);

      const usedKeys = result.usedExistingKeys.map(item => item.key);
      expect(usedKeys).toContain("greeting");
      expect(usedKeys).toContain("title");
    });
  });

  describe("Namespace support", () => {
    test("should include namespace information in existing translations", async () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = await processFiles(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        existingTranslationsConfig: {
          source: {
            greeting: "Hello World",
          },
          namespace: "common",
        },
      });

      expect(result.modifiedFiles.length).toBe(1);
      expect(result.modifiedFiles[0].newContent).toContain('t("greeting")');
      expect(result.usedExistingKeys.length).toBe(1);
      expect(result.usedExistingKeys[0].key).toBe("greeting");
      expect(result.usedExistingKeys[0].value).toBe("Hello World");
    });
  });

  describe("Backward compatibility", () => {
    test("should work with deprecated existingTranslations option", async () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = await processFiles(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        existingTranslations: {
          greeting: "Hello World",
          title: "Welcome",
        },
      });

      expect(result.modifiedFiles.length).toBe(1);
      expect(result.modifiedFiles[0].newContent).toContain('t("greeting")');
      expect(result.usedExistingKeys.length).toBe(1);
      expect(result.usedExistingKeys[0].key).toBe("greeting");
      expect(result.usedExistingKeys[0].value).toBe("Hello World");
    });

    test("should prioritize existingTranslationsConfig over existingTranslations", async () => {
      const code = `
        function MyComponent() {
          const message = "___Hello World___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = await processFiles(tempFile, {
        i18nConfig: {
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        existingTranslations: {
          old_key: "Hello World",
        },
        existingTranslationsConfig: {
          source: {
            new_key: "Hello World",
          },
        },
      });

      expect(result.modifiedFiles.length).toBe(1);
      expect(result.modifiedFiles[0].newContent).toContain('t("new_key")');
      expect(result.usedExistingKeys.length).toBe(1);
      expect(result.usedExistingKeys[0].key).toBe("new_key");
      expect(result.usedExistingKeys[0].value).toBe("Hello World");
    });
  });
});
