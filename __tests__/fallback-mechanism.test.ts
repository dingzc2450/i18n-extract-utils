import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper functions (createTempFile, afterEach) as in basic-replacements.test.ts
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
      try { fs.unlinkSync(file); } catch (err) { console.error(`Error removing temp file ${file}:`, err); }
    }
  });
  tempFiles.length = 0;
});

describe("Fallback Mechanism", () => {
  test("should handle fallback to regex replacement when AST parsing fails", () => {
    const code = `
      function MyComponent() {
        return (
          <div>
            <h1>___Hello World___</h1>
            {/* Unclosed JSX tag below */}
            <p>___Welcome to our app___
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
    // Fallback should still replace using regex
    expect(result.code).toContain('t("Hello World")');
    expect(result.code).toContain('t("Welcome to our app")');
    // Extraction should still work
    expect(result.extractedStrings.length).toBe(0);
    
  });
});