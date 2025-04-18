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

// Define a simple key generator for tests
const generateTestKey = (value: string, filePath: string): string => {
  const hash = crypto.createHash("sha1").update(value).digest("hex").substring(0, 6);
  return `test_${hash}`;
};

describe("Key Generation and Reuse", () => {
  test("should reuse the same generated key for identical strings", () => {
    const code = `
      function MyComponent() {
        const message = "___Duplicate Text___"; // String literal
        return (
          <div>
            <h1>___Duplicate Text___</h1> {/* JSX Text */}
            <p title="___Duplicate Text___">{message}</p> {/* JSX Attribute */}
          </div>
        );
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslations",
      generateKey: generateTestKey,
    });
    const expectedKey = generateTestKey("Duplicate Text", tempFile);

    // --- 调整断言 ---
    // extractedStrings 只包含首次遇到的唯一规范值
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].value).toBe("Duplicate Text"); // 规范值
    expect(result.extractedStrings[0].key).toBe(expectedKey);
    // --- 调整结束 ---

    // 检查代码替换是否正确，key 是否被复用
    const expectedReplacement = `t("${expectedKey}")`;
    // 使用更精确的匹配来查找 t("...") 调用
    const occurrencesInCode = (result.code.match(new RegExp(`t\\("${expectedKey}"\\)`, "g")) || []).length;
    expect(occurrencesInCode).toBe(3); // Key 应该在代码中被使用了 3 次
  });

  test("generateKey should use placeholder keyStr for interpolated strings", () => {
    const code = `
      function Demo({ label }) {
        const text = \`___请选择\${label}___\`;
        return <div>{text}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
      generateKey: generateTestKey,
    });
    const expectedKey = generateTestKey("请选择{arg1}", tempFile); // Key generated from placeholder version
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].key).toBe(expectedKey);
    expect(result.extractedStrings[0].value).toBe("请选择{arg1}"); // Value is also placeholder version
    expect(result.code).toContain(`t("${expectedKey}", { arg1: label })`);
  });

  test("generateKey should handle multiple interpolations correctly", () => {
    const code = `
      function Demo({ a, b }) {
        const text = \`___Hi \${a}, \${b}___\`;
        return <div>{text}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
      generateKey: generateTestKey,
    });
    const expectedKey = generateTestKey("Hi {arg1}, {arg2}", tempFile);
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].key).toBe(expectedKey);
    expect(result.extractedStrings[0].value).toBe("Hi {arg1}, {arg2}");
    expect(result.code).toContain(`t("${expectedKey}", { arg1: a, arg2: b })`);
  });

  test("generateKey should use original value for non-interpolated strings", () => {
    const code = `
      function Demo() {
        const text = \`___纯文本___\`; // Template literal without interpolation
        const msg = "___纯文本___"; // String literal
        return <div>{text}{msg}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
      generateKey: generateTestKey,
    });
    const expectedKey = generateTestKey("纯文本", tempFile);

    // --- 调整断言 ---
    // extractedStrings 只包含首次遇到的唯一规范值
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].key).toBe(expectedKey);
    expect(result.extractedStrings[0].value).toBe("纯文本");
    // --- 调整结束 ---

    // 检查代码替换是否正确，key 是否被复用
    const occurrences = (result.code.match(new RegExp(`t\\("${expectedKey}"\\)`, "g")) || []).length;
    expect(occurrences).toBe(2); // Key 应该在代码中被使用了 2 次
  });
});