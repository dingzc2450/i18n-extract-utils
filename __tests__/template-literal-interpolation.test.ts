import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "../src/index.js";
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

describe("Template Literal Interpolation", () => {
  test("should handle template literals with one interpolation", () => {
    const code = `
      function MyComponent({ label }) {
        const text = \`___请选择\${label}___\`;
        return <div>{text}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(/const text = t\(['"]请选择\{arg1}['"],\s*\{\s*arg1:\s*label\s*\}\);/);
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].key).toBe("请选择{arg1}");
    expect(result.extractedStrings[0].value).toBe("请选择{arg1}"); // Value should also be the placeholder version
  });

  test("should handle template literals with multiple interpolations", () => {
    const code = `
      function MyComponent({ name, age }) {
        const text = \`___你好, \${name}, \${age}___\`;
        return <div>{text}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(/const text = t\(['"]你好, \{arg1}, \{arg2}['"],\s*\{\s*arg1:\s*name,\s*arg2:\s*age\s*\}\);/);
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].key).toBe("你好, {arg1}, {arg2}");
    expect(result.extractedStrings[0].value).toBe("你好, {arg1}, {arg2}");
  });

  test("should handle template literals with complex expressions", () => {
    const code = `
      function MyComponent({ user }) {
        const text = \`___欢迎\${user.name + "!"}___\`;
        return <div>{text}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(/const text = t\(['"]欢迎\{arg1}['"],\s*\{\s*arg1:\s*user\.name \+ "!"/);
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].key).toBe("欢迎{arg1}");
    expect(result.extractedStrings[0].value).toBe("欢迎{arg1}");
  });

  // Note: The case for template literals *without* interpolation is covered in basic-replacements.test.ts
});