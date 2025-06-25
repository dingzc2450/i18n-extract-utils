import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "../src/index.js";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

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

describe("Framework Configuration Tests", () => {
  describe("React Framework", () => {
    test("should handle React with default configuration", () => {
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
        },
      });

      expect(result.code).toContain(
        'import { useTranslation } from "react-i18next";'
      );
      expect(result.code).toContain("const { t } = useTranslation();");
      expect(result.code).toContain('t("Hello World")');
    });

    test("should auto-detect React framework", () => {
      const code = `
        import React, { useState } from 'react';
        
        function MyComponent() {
          const [message] = useState("___Hello World___");
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      // 不指定 framework，应该自动检测为 React（因为有 useState）
      const result = transformCode(tempFile, {});

      expect(result.code).toContain(
        'import { useTranslation } from "react-i18next";'
      );
      expect(result.code).toContain("const { t } = useTranslation();");
      expect(result.code).toContain('t("Hello World")');
    });
  });

  describe("React 15 Framework", () => {
    test("should handle React 15 without hooks", () => {
      const code = `
        import React from 'react';
        
        const MyComponent = React.createClass({
          render: function() {
            const message = "___Hello World___";
            return React.createElement('div', null, message);
          }
        });
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react15",
        },
      });

      expect(result.code).toContain('import { t } from "i18n";');
      expect(result.code).toContain('t("Hello World")');
      expect(result.code).not.toContain("useTranslation");
      expect(result.code).not.toContain("const { t } =");
    });

    test("should auto-detect React 15 framework", () => {
      const code = `
        import React from 'react';
        
        const MyComponent = React.createClass({
          render: function() {
            const message = "___Hello World___";
            return React.createElement('div', null, message);
          }
        });
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      // 应该自动检测为 React 15
      const result = transformCode(tempFile, {});

      expect(result.code).toContain('import { t } from "i18n";');
      expect(result.code).toContain('t("Hello World")');
    });

    test("should handle React 15 with custom i18n configuration", () => {
      const code = `
        import React from 'react';
        
        function MyComponent() {
          const message = "___Hello World___";
          return React.createElement('div', null, message);
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "react15",
          i18nImport: {
            name: "translate",
            source: "my-i18n-lib",
          },
        },
      });

      expect(result.code).toContain('import { translate } from "my-i18n-lib";');
      expect(result.code).toContain('translate("Hello World")');
    });
  });

  describe("Vue Framework", () => {
    test("should handle Vue 3 with Composition API", () => {
      const code = `
        import { defineComponent } from 'vue';
        
        export default defineComponent({
          setup() {
            const message = "___Hello World___";
            return { message };
          }
        });
      `;
      const tempFile = createTempFile(code, "tsx");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
        },
      });

      expect(result.code).toContain('import { useI18n } from "vue-i18n";');
      expect(result.code).toContain("const { t } = useI18n();");
      expect(result.code).toContain('t("Hello World")');
    });

    test("should auto-detect Vue framework from .tsx extension", () => {
      const code = `
        export default {
          data() {
            return {
              message: "___Hello World___"
            };
          }
        };
      `;
      const tempFile = createTempFile(code, "tsx");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
        },
      });

      expect(result.code).toContain('import { useI18n } from "vue-i18n";');
      expect(result.code).toContain('t("Hello World")');
    });

    test("should handle Vue with custom i18n configuration", () => {
      const code = `
        export default {
          setup() {
            const message = "___Hello World___";
            return { message };
          }
        };
      `;
      const tempFile = createTempFile(code, "tsx");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "translate",
            importName: "useTranslate",
            source: "vue-i18n-next",
          },
        },
      });

      expect(result.code).toContain(
        'import { useTranslate } from "vue-i18n-next";'
      );
      expect(result.code).toContain("const { translate } = useTranslate();");
      expect(result.code).toContain('translate("Hello World")');
    });
  });

  describe("Framework Detection", () => {
    test("should detect React from imports", () => {
      const code = `
        import React, { useState } from 'react';
        
        function MyComponent() {
          const [message] = useState("___Hello World___");
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {});

      expect(result.code).toContain(
        'import { useTranslation } from "react-i18next";'
      );
      expect(result.code).toContain("const { t } = useTranslation();");
    });

    test("should detect Vue from exports and methods", () => {
      const code = `
        export default {
          data() {
            return {
              message: "___Hello World___"
            };
          },
          methods: {
            handleClick() {
              console.log(this.message);
            }
          }
        };
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {});

      expect(result.code).toContain('import { useI18n } from "vue-i18n";');
      expect(result.code).toContain('t("Hello World")');
    });
  });

  describe("Mixed Framework Support", () => {
    test("should handle multiple files with different frameworks", () => {
      // React file with modern hooks
      const reactCode = `
        import React, { useState } from 'react';
        function ReactComponent() {
          const [message] = useState("___React Message___");
          return <div>{message}</div>;
        }
      `;
      const reactFile = createTempFile(reactCode, "tsx");
      tempFiles.push(reactFile);

      // Vue file
      const vueCode = `
        export default {
          data() {
            return { message: "___Vue Message___" };
          }
        };
      `;
      const vueFile = createTempFile(vueCode, "tsx");
      tempFiles.push(vueFile);

      // Transform React file
      const reactResult = transformCode(reactFile, {});
      expect(reactResult.code).toContain("useTranslation");
      expect(reactResult.code).toContain("react-i18next");

      // Transform Vue file
      const vueResult = transformCode(vueFile, {
        i18nConfig: {
          framework: "vue",
        },
      });
      expect(vueResult.code).toContain("useI18n");
      expect(vueResult.code).toContain("vue-i18n");
    });
  });

  describe("Framework Override", () => {
    test("should respect explicit framework configuration over auto-detection", () => {
      const code = `
        import React, { useState } from 'react';
        function MyComponent() {
          const [message] = useState("___Hello World___");
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      // 强制使用 Vue 框架，即使代码看起来像 React
      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "vue",
        },
      });

      expect(result.code).toContain('import { useI18n } from "vue-i18n";');
      expect(result.code).toContain("const { t } = useI18n();");
    });
  });

  describe("Error Handling", () => {
    test("should fallback to React for unknown frameworks", () => {
      const code = `
        import React, { useState } from 'react';
        function MyComponent() {
          const [message] = useState("___Hello World___");
          return <div>{message}</div>;
        }
      `;
      const tempFile = createTempFile(code);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        i18nConfig: {
          framework: "unknown-framework" as any,
        },
      });

      // 应该回退到 React
      expect(result.code).toContain(
        'import { useTranslation } from "react-i18next";'
      );
      expect(result.code).toContain("const { t } = useTranslation();");
    });

    test("should handle files without clear framework indicators", () => {
      const code = `
        const message = "___Hello World___";
        console.log(message);
      `;
      const tempFile = createTempFile(code, "js");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {});

      // 应该默认使用 React
      expect(result.code).toContain('t("Hello World")');
    });
  });
});
