import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper to create temporary test files
function createTempFile(content: string, extension: string = "tsx"): string {
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

describe("Context-Aware React Code Generation", () => {
  describe("Mixed React and Non-React scenarios", () => {
    test("should handle React component with utility functions", () => {
      const mixedCode = `
import React from 'react';

// 普通工具函数
function validateEmail(email: string): boolean {
  const message = "___Invalid email format___";
  console.log(message);
  return email.includes('@');
}

// React 函数组件
function UserForm() {
  const [email, setEmail] = useState('');
  
  const handleSubmit = () => {
    if (!validateEmail(email)) {
      alert("___Please enter a valid email___");
      return;
    }
    
    console.log("___Form submitted successfully___");
  };

  return (
    <div>
      <h1>___User Registration___</h1>
      <input 
        type="email" 
        placeholder="___Enter your email___"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      />
      <button onClick={handleSubmit}>___Submit___</button>
    </div>
  );
}

// 类组件
class UserProfile extends React.Component {
  render() {
    return <div>___User Profile___</div>;
  }
}

export { validateEmail, UserForm, UserProfile };
`;

      const tempFile = createTempFile(mixedCode, "tsx");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          },
          nonReactConfig: {
            functionName: 't',
            importType: 'named',
            source: 'react-i18n-plus'
          }
        },
        appendExtractedComment: true,
        extractedCommentType: 'block'
      });
      // 验证普通函数中使用了非React配置的导入
      expect(result.code).toContain('import { t } from \'react-i18n-plus\';');
      
      // 验证React组件中使用了Hook配置的导入
      expect(result.code).toContain('import { useTranslation } from \'react-i18next\';');
      
      // 验证字符串被正确替换和注释
      expect(result.code).toContain('t("Invalid email format") /* Invalid email format */');
      expect(result.code).toContain('t("Please enter a valid email") /* Please enter a valid email */');
      expect(result.code).toContain('t("User Registration") /* User Registration */');
      
      // 验证Hook被添加到React函数组件中
      expect(result.code).toContain('const { t } = useTranslation();');
      
      expect(result.extractedStrings.length).toBeGreaterThan(0);
    });

    test("should handle different import types for non-React contexts", () => {
      const codeWithDefaults = `
function processData() {
  const status = "___Processing data___";
  const error = "___Failed to process___";
  return { status, error };
}
`;

      const tempFile = createTempFile(codeWithDefaults, "ts");
      tempFiles.push(tempFile);

      // 测试默认导入
      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          nonReactConfig: {
            functionName: 't',
            importType: 'default',
            source: 'my-i18n-lib'
          }
        },
        appendExtractedComment: true,
        extractedCommentType: 'line'
      });

      expect(result.code).toContain('import t from \'my-i18n-lib\';');
      expect(result.code).toContain('t("Processing data") // Processing data');
      expect(result.code).toContain('t("Failed to process") // Failed to process');
    });

    test("should handle namespace import for non-React contexts", () => {
      const codeWithNamespace = `
const config = {
  title: "___App Configuration___",
  description: "___Configure your application___"
};
`;

      const tempFile = createTempFile(codeWithNamespace, "js");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          nonReactConfig: {
            functionName: 'translate',
            importType: 'namespace',
            namespace: 'i18n',
            source: 'global-i18n'
          }
        },
        appendExtractedComment: true,
        extractedCommentType: 'block'
      });

      expect(result.code).toContain('import * as i18n from \'global-i18n\';');
      expect(result.code).toContain('i18n.translate("App Configuration") /* App Configuration */');
      expect(result.code).toContain('i18n.translate("Configure your application") /* Configure your application */');
    });

    test("should handle custom import statement", () => {
      const customCode = `
function showMessage() {
  return "___Custom message___";
}
`;

      const tempFile = createTempFile(customCode, "ts");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          nonReactConfig: {
            customImport: "import { translate as t } from 'custom-i18n-package'"
          }
        },
        appendExtractedComment: false
      });

      expect(result.code).toContain('import { translate as t } from \'custom-i18n-package\'');
      expect(result.code).toContain('t("Custom message")');
    });

    test("should handle custom hooks properly", () => {
      const customHookCode = `
// 自定义Hook，应该能使用React Hook
function useUserData() {
  const errorMessage = "___Failed to load user data___";
  return { errorMessage };
}

// 普通函数，不应该使用Hook
function validateUser() {
  return "___Invalid user___";
}

// React组件，应该使用Hook
function UserComponent() {
  const { errorMessage } = useUserData();
  const validationResult = validateUser();
  
  return <div>___User Component___</div>;
}
`;

      const tempFile = createTempFile(customHookCode, "tsx");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          },
          nonReactConfig: {
            functionName: 't',
            importType: 'named',
            source: 'i18n-utils'
          }
        },
        appendExtractedComment: true,
        extractedCommentType: 'line'
      });

      // 验证自定义Hook可以使用React Hook配置
      expect(result.code).toContain('import { useTranslation } from \'react-i18next\';');
      
      // 验证普通函数使用非React配置
      expect(result.code).toContain('import { t } from \'i18n-utils\';');
      
      expect(result.code).toContain('t("Failed to load user data") // Failed to load user data');
      expect(result.code).toContain('t("Invalid user") // Invalid user');
      expect(result.code).toContain('t("User Component") // User Component');
    });
  });

  describe("Fallback behavior", () => {
    test("should fallback to React config when no nonReactConfig is provided", () => {
      const simpleCode = `
function getMessage() {
  return "___Hello World___";
}
`;

      const tempFile = createTempFile(simpleCode, "ts");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
          // 没有 nonReactConfig
        },
        appendExtractedComment: true,
        extractedCommentType: 'block'
      });

      // 应该回退到原来的React配置，但不使用Hook
      expect(result.code).toContain('t("Hello World") /* Hello World */');
      expect(result.extractedStrings).toHaveLength(1);
    });
  });
});
