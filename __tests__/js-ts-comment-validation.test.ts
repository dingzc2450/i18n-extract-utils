import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
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

describe("JS/TS Comment Support Validation", () => {
  test("Validates .js files with various comment types", () => {
    const jsCode = `
const config = {
  greeting: "___Hello World___",
  farewell: "___Goodbye___"
};

function displayMessage() {
  console.log("___Processing___");
  return "___Success___";
}
`;

    const tempFile = createTempFile(jsCode, "js");
    tempFiles.push(tempFile);

    // 测试块注释
    const blockResult = transformCode(tempFile, {
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

    expect(blockResult.code).toContain('t("Hello World") /* Hello World */');
    expect(blockResult.code).toContain('t("Goodbye") /* Goodbye */');
    expect(blockResult.code).toContain('t("Processing") /* Processing */');
    expect(blockResult.code).toContain('t("Success") /* Success */');

    // 测试行注释
    const lineResult = transformCode(tempFile, {
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

    expect(lineResult.code).toContain('t("Hello World") // Hello World');
    expect(lineResult.code).toContain('t("Goodbye") // Goodbye');
    expect(lineResult.code).toContain('t("Processing") // Processing');
    expect(lineResult.code).toContain('t("Success") // Success');

    console.log('JS Block Comment Result:');
    console.log(blockResult.code);
    console.log('\nJS Line Comment Result:');
    console.log(lineResult.code);
  });

  test("Validates .ts files with TypeScript features", () => {
    const tsCode = `
interface Message {
  text: string;
  type: 'info' | 'error';
}

class MessageHandler {
  private defaultMessage: string = "___Default Message___";
  
  public showAlert(msg: string): void {
    alert("___Alert___" + msg);
  }
  
  get welcomeText(): string {
    return "___Welcome___";
  }
}

enum Status {
  LOADING = "___Loading___",
  ERROR = "___Error Occurred___"
}
`;

    const tempFile = createTempFile(tsCode, "ts");
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
      },
      appendExtractedComment: true,
      extractedCommentType: 'block'
    });

    expect(result.code).toContain('t("Default Message") /* Default Message */');
    expect(result.code).toContain('t("Alert") /* Alert */');
    expect(result.code).toContain('t("Welcome") /* Welcome */');
    expect(result.code).toContain('t("Loading") /* Loading */');
    expect(result.code).toContain('t("Error Occurred") /* Error Occurred */');

    console.log('TypeScript Result:');
    console.log(result.code);
  });

  test("Validates template literals with complex expressions", () => {
    const complexCode = `
function createNotification(user: string, count: number, type: string) {
  const template1 = \`___Hello \${user}, you have \${count} notifications___\`;
  const template2 = \`___\${type}: \${count} items remaining___\`;
  return [template1, template2];
}
`;

    const tempFile = createTempFile(complexCode, "ts");
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
      },
      appendExtractedComment: true,
      extractedCommentType: 'line'
    });

    expect(result.code).toContain('t("Hello {arg1}, you have {arg2} notifications", { arg1: user, arg2: count }) // Hello {arg1}, you have {arg2} notifications');
    expect(result.code).toContain('t("{arg1}: {arg2} items remaining", { arg1: type, arg2: count }) // {arg1}: {arg2} items remaining');

    console.log('Complex Template Literals Result:');
    console.log(result.code);
    console.log('Extracted strings:', result.extractedStrings);
  });
});
