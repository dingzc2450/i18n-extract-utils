import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "../src/index.js";
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

describe("Basic Replacements", () => {
  test("should handle string literals correctly", () => {
    const code = `
      function MyComponent() {
        const message = "___Welcome message___";
        const errorText = \`___Error occurred___\`; // Template literal without interpolation
        return <div>{message}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(
      /const message = t\(['"]Welcome message['"]\);/
    );
    expect(result.code).toMatch(
      /const errorText = t\(['"]Error occurred['"]\);/
    );
    expect(result.extractedStrings.length).toBe(2);
  });

  test("should handle JSX attributes correctly (double quotes)", () => {
    const code = `
      function MyComponent() {
        return <button title="___Click me___" aria-label="___Press button___">Submit</button>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(/title=\{t\(['"]Click me['"]\)\}/);
    expect(result.code).toMatch(/aria-label=\{t\(['"]Press button['"]\)\}/);
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Click me");
    expect(result.extractedStrings[1].value).toBe("Press button");
  });

  test("should handle JSX attributes with single quotes correctly", () => {
    const code = `
      function InputComponent() {
        return <input placeholder='___请输入名称___' />;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(/placeholder=\{t\(['"]请输入名称['"]\)\}/);
    expect(result.extractedStrings.length).toBe(1);
  });

  test("should handle JSX text correctly", () => {
    const code = `
      function MyComponent() {
        return (
          <div>
            <h1>___Page Title___</h1>
            <p>___This is a paragraph___ with regular text.</p>
            <span>Regular text ___with translation___ in the middle</span>
          </div>
        );
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(/<h1>\{t\(['"]Page Title['"]\)\}<\/h1>/);
    expect(result.code).toMatch(
      /<p>\{t\(['"]This is a paragraph['"]\)\} with regular text\.<\/p>/
    );
    expect(result.code).toMatch(
      /<span>Regular text \{t\(['"]with translation['"]\)\} in the middle<\/span>/
    );
    expect(result.extractedStrings.length).toBe(3);
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
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(/const title = t\(['"]Component Title['"]\);/);
    expect(result.code).toMatch(/title=\{t\(['"]Tooltip text['"]\)\}/);
    expect(result.code).toMatch(
      /<p>\{t\(['"]Welcome['"]\)\} to our <strong>\{t\(['"]Amazing['"]\)\} app<\/strong><\/p>/
    );
    expect(result.extractedStrings.length).toBe(4);
    expect(result.extractedStrings.map((s) => s.value)).toContain(
      "Component Title"
    );
    expect(result.extractedStrings.map((s) => s.value)).toContain(
      "Tooltip text"
    );
    expect(result.extractedStrings.map((s) => s.value)).toContain("Welcome");
    expect(result.extractedStrings.map((s) => s.value)).toContain("Amazing");
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
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(/t\(['"]Hello, ['\\]?world['\\]?!["']\)/);
    expect(result.code).toMatch(
      /title=\{t\(['"]Click ['\\]?here['\\]? now["']\)\}/
    );
    expect(result.code).toMatch(/t\(['"]String with `backticks`["']\)/);
    expect(result.extractedStrings.length).toBe(3);
  });
});
