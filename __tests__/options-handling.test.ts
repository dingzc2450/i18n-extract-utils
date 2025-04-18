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

describe("Options Handling", () => {
  test("should handle translationMethod: 'default' correctly in AST", () => {
    const code = `
      function MyComponent() {
        const message = "___Hello Default___";
        return <div><h1>___Page Title Default___</h1><p>{message}</p></div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "default", // Use 'default'
      hookName: "useTranslations",
      hookImport: "my-i18n-lib",
    });
    expect(result.code).toContain('import { useTranslations } from "my-i18n-lib";');
    expect(result.code).toMatch(/function MyComponent\(\) \{\s*const t = useTranslations\(\);/); // No destructuring
    expect(result.code).not.toMatch(/const \{.*?\} = useTranslations\(\);/);
    expect(result.code).toMatch(/const message = t\(['"]Hello Default['"]\);/);
    expect(result.code).toMatch(/<h1>\{t\(['"]Page Title Default['"]\)\}<\/h1>/);
    expect(result.extractedStrings.length).toBe(2);
  });

  test("existingValueToKey lookup should use placeholder keyStr for interpolated strings", () => {
    const code = `
      function Demo({ label }) {
        const text = \`___请选择\${label}___\`; // Interpolated
        const simple = "___简单文本___"; // Simple
        return <div>{text}{simple}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    // Pre-populate existing keys
    const existingValueToKey = new Map<string, string>();
    existingValueToKey.set("请选择{arg1}", "select_placeholder_key"); // Key is the placeholder version
    existingValueToKey.set("简单文本", "simple_text_key"); // Key is the original text

    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    }, existingValueToKey); // Pass the map

    // Check interpolated string uses the key found via placeholder
    expect(result.code).toContain(`t("select_placeholder_key", { arg1: label })`);
    // Check simple string uses the key found via original text
    expect(result.code).toContain(`t("simple_text_key")`);

    // Check extracted strings reflect the used keys
    expect(result.extractedStrings.length).toBe(2);
    const extractedInterpolated = result.extractedStrings.find(s => s.value === "请选择{arg1}");
    const extractedSimple = result.extractedStrings.find(s => s.value === "简单文本");
    expect(extractedInterpolated?.key).toBe("select_placeholder_key");
    expect(extractedSimple?.key).toBe("simple_text_key");

    // Check usedExistingKeysList
    expect(result.usedExistingKeysList.length).toBe(2);
    expect(result.usedExistingKeysList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "select_placeholder_key", value: "请选择{arg1}" }),
        expect.objectContaining({ key: "simple_text_key", value: "简单文本" }),
      ])
    );
  });
});