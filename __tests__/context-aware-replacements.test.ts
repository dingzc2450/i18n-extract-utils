import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto"; // Import crypto for key generation example

// Helper to create temporary test files
function createTempFile(content: string): string {
  const tempDir = tmpdir();
  // Use a more unique ID to avoid potential collisions in rapid test runs
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

describe("Context-Aware Replacements", () => {
  test("simple placeholder replacement", () => {
    const code = `
      function MyComponent() {
        return <div>___Hello World___</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toContain('t("Hello World")');
    expect(result.extractedStrings.length).toBe(1);
  }
  );
});
