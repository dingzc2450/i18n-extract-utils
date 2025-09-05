import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";
import type { CustomParserOptions } from "../src/types";

// Helper functions
function createTempFile(content: string, extension: string = "tsx"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.${extension}`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

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

describe("ParserOptions Tests", () => {
  describe("Basic parserOptions functionality", () => {
    test("should work without parserOptions (backward compatibility)", () => {
      const code = `
        import React from 'react';
        
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
            source: "react-i18next",
          },
        },
      });

      expect(result.code).toContain('t("Hello World")');
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Hello World");
    });

    test("should accept empty parserOptions", () => {
      const code = `
        import React from 'react';
        
        function MyComponent() {
          const message = "___Test Message___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {};

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("Test Message")');
      expect(result.extractedStrings).toHaveLength(1);
    });

    test("should accept parserOptions with empty plugins array", () => {
      const code = `
        import React from 'react';
        
        function MyComponent() {
          const message = "___Empty Plugins___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: [],
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("Empty Plugins")');
      expect(result.extractedStrings).toHaveLength(1);
    });
  });

  describe("Custom plugins support", () => {
    test("should support custom plugins for TypeScript", () => {
      const code = `
        import React from 'react';
        
        interface Props {
          title: string;
        }
        
        function MyComponent({ title }: Props) {
          const message = "___TypeScript Test___";
          return <div><h1>{title}</h1><p>{message}</p></div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx"],
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("TypeScript Test")');
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("TypeScript Test");
    });

    test("should support decorators plugin", () => {
      const code = `
        import React from 'react';
        
        class MyComponent extends React.Component {
          render() {
            const message = "___Decorator Test___";
            return <div>{message}</div>;
          }
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: ["decorators-legacy", "typescript", "jsx"],
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("Decorator Test")');
      expect(result.extractedStrings).toHaveLength(1);
    });

    test("should merge custom plugins with default plugins (deduplication)", () => {
      const code = `
        import React from 'react';
        
        function MyComponent() {
          const message = "___Merge Test___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      // Include some plugins that might already be defaults
      const customParserOptions: CustomParserOptions = {
        plugins: [
          "decorators-legacy",
          "typescript",
          "jsx",
          "optional-chaining",
        ],
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("Merge Test")');
      expect(result.extractedStrings).toHaveLength(1);
      // The test should pass without duplicate plugin errors
    });
  });

  describe("Framework-specific parserOptions", () => {
    test("should work with Vue framework and custom plugins", () => {
      const code = `
        const MyComponent = {
          setup() {
            const message = "___Vue Test___";
            return { message };
          },
          template: '<div>{{ message }}</div>'
        };
      `;
      const tempFile = createTempFile(code, "js");
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx"],
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("Vue Test")');
      expect(result.extractedStrings).toHaveLength(1);
    });

    test("should work with React15 framework and custom plugins", () => {
      const code = `
        import React from 'react';
        
        var MyComponent = React.createClass({
          render: function() {
            var message = "___React15 Test___";
            return React.createElement('div', null, message);
          }
        });
      `;
      const tempFile = createTempFile(code, "js");
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: ["jsx"],
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react15",
          i18nImport: {
            name: "t",
            source: "i18n",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("React15 Test")');
      expect(result.extractedStrings).toHaveLength(1);
    });
  });

  describe("Advanced syntax support", () => {
    test("should support optional chaining with custom plugins", () => {
      const code = `
        import React from 'react';
        
        function MyComponent({ user }) {
          const name = user?.profile?.name || "___Default Name___";
          return <div>{name}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx", "optional-chaining"],
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("Default Name")');
      expect(result.extractedStrings).toHaveLength(1);
    });

    test("should support nullish coalescing with custom plugins", () => {
      const code = `
        import React from 'react';
        
        function MyComponent({ config }) {
          const title = config?.title ?? "___Default Title___";
          return <div>{title}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx", "nullish-coalescing-operator"],
      };

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("Default Title")');
      expect(result.extractedStrings).toHaveLength(1);
    });
  });

  describe("Error handling", () => {
    test("should handle invalid plugins gracefully", () => {
      const code = `
        import React from 'react';
        
        function MyComponent() {
          const message = "___Error Test___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: ["invalid-plugin-name" as any],
      };

      // This should not throw an error but should work with default plugins
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      });

      // Should still process the file despite invalid plugin
      expect(result.code).toBeDefined();
    });
  });

  describe("Configuration normalization", () => {
    test("should normalize parserOptions correctly in config", () => {
      const code = `
        import React from 'react';
        
        function MyComponent() {
          const message = "___Normalization Test___";
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx"],
      };

      const result = transformCode(tempFile, {
        pattern: "___(.+?)___",
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      });

      expect(result.code).toContain('t("Normalization Test")');
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Normalization Test");
    });

    test("should work with complex configuration including parserOptions", () => {
      const code = `
        import React from 'react';
        
        function MyComponent() {
          const message = "___Complex Config___";
          const tooltip = "___Tooltip Text___";
          return (
            <div title={tooltip}>
              {message}
            </div>
          );
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const customParserOptions: CustomParserOptions = {
        plugins: [
          "decorators-legacy",
          "typescript",
          "jsx",
          "optional-chaining",
        ],
      };

      const result = transformCode(tempFile, {
        pattern: "___(.+?)___",
        outputPath: "./test-output.json",
        appendExtractedComment: true,
        extractedCommentType: "line",
        preserveFormatting: true,
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
            mergeImports: true,
          },
        },
        parserOptions: customParserOptions,
        generateKey: (value, filePath) =>
          `test_${value.replace(/\s+/g, "_").toLowerCase()}`,
      });

      expect(result.code).toContain('t("test_complex_config")');
      expect(result.code).toContain('t("test_tooltip_text")');
      expect(result.extractedStrings).toHaveLength(2);

      const keys = result.extractedStrings.map(s => s.key);
      expect(keys).toContain("test_complex_config");
      expect(keys).toContain("test_tooltip_text");
    });
  });
});
