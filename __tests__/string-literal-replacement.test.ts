import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "../src/index.js";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";

// Helper to create temporary test files
function createTempFile(content: string): string {
  const tempDir = tmpdir();
  const tempFile = path.join(tempDir, `test-${Date.now()}-${Math.random().toString(36).slice(2)}.tsx`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach((file) => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  tempFiles.length = 0;
});

describe("String/JSX Literal and Attribute Replacements", () => {
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
      translationMethod: "t",
      hookName: "useTranslation",
    });

    expect(result.code).toMatch(/const message = t\(['"]Welcome message['"]\);/);
    expect(result.code).toMatch(/const errorText = t\(['"]Error occurred['"]\);/);
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
      translationMethod: "t",
      hookName: "useTranslation",
    });

    expect(result.code).toMatch(/<h1>\{t\(['"]Page Title['"]\)\}<\/h1>/);
    expect(result.code).toMatch(/<p>\{t\(['"]This is a paragraph['"]\)\} with some regular text\.<\/p>/);
    expect(result.code).toMatch(/<span>Regular text \{t\(['"]with translation['"]\)\} in the middle<\/span>/);
    expect(result.extractedStrings.length).toBe(3);
    expect(result.extractedStrings[0].value).toBe("Page Title");
    expect(result.extractedStrings[1].value).toBe("This is a paragraph");
    expect(result.extractedStrings[2].value).toBe("with translation");
  });

});