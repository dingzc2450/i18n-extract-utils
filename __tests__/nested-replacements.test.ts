import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "../src/index.js";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper functions (createTempFile, afterEach)
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

describe("Nested Replacements", () => {
  test("should handle nested strings within template literal interpolation", () => {
    const code = `
      function NestedComponent({ isA }) {
        const title = \`___Value = \${isA ? '___A___' : '___B___'}___\`;
        return <div>{title}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);

    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
      generateKey: generateTestKey, // Use key generation
    });

    // Check extracted strings
    expect(result.extractedStrings).toHaveLength(3);
    const keyOuter = generateTestKey("Value = {arg1}", tempFile);
    const keyA = generateTestKey("A", tempFile);
    const keyB = generateTestKey("B", tempFile);

    expect(result.extractedStrings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: keyOuter, value: "Value = {arg1}" }),
        expect.objectContaining({ key: keyA, value: "A" }),
        expect.objectContaining({ key: keyB, value: "B" }),
      ])
    );

    // Check transformed code
    const expectedCode = `t("${keyOuter}", { arg1: isA ? t("${keyA}") : t("${keyB}") })`;
    expect(result.code).toContain(expectedCode);
    // Check hook and import were added
    expect(result.code).toContain('import { useTranslation }');
    expect(result.code).toContain('const { t } = useTranslation()');
  });

  test("should reuse existing keys for nested strings", () => {
    const code = `
      function NestedComponent({ isA }) {
        const title = \`___Value = \${isA ? '___A___' : '___B___'}___\`;
        const simpleA = "___A___"; // Reuse 'A'
        return <div>{title}{simpleA}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);

    const existingValueToKey = new Map<string, string>();
    existingValueToKey.set("Value = {arg1}", "outer.key");
    existingValueToKey.set("A", "inner.a.key");
    // 'B' will be generated

    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
      generateKey: generateTestKey, // Still provide for 'B'
    }, existingValueToKey);

    // Check extracted strings (only 'B' should be newly extracted)
    expect(result.extractedStrings).toHaveLength(1);
    const keyB = generateTestKey("B", tempFile);
    expect(result.extractedStrings[0]).toEqual(expect.objectContaining({ key: keyB, value: "B" }));

    // Check used existing keys
    expect(result.usedExistingKeysList).toHaveLength(2); // outer.key and inner.a.key used
     expect(result.usedExistingKeysList).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: "outer.key", value: "Value = {arg1}" }),
        // Note: 'A' might be recorded twice if visited twice, adjust getKeyAndRecord if needed
        expect.objectContaining({ key: "inner.a.key", value: "A" }),
      ])
    );


    // Check transformed code
    const expectedCodeNested = `t("outer.key", { arg1: isA ? t("inner.a.key") : t("${keyB}") })`;
    const expectedCodeSimple = `t("inner.a.key")`;
    expect(result.code).toContain(expectedCodeNested);
    expect(result.code).toContain(expectedCodeSimple);
  });

   test("should handle deeper nesting", () => {
    const code = `
      function DeepNest({ condition1, condition2 }) {
        const text = \`___Level1 \${condition1 ? \`___Level2a \${condition2 ? '___Level3a___' : '___Level3b___'}___\` : '___Level2b___'}___\`;
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

    // Check extracted strings
    expect(result.extractedStrings).toHaveLength(5); // L1, L2a, L3a, L3b, L2b
    const keyL1 = generateTestKey("Level1 {arg1}", tempFile);
    const keyL2a = generateTestKey("Level2a {arg1}", tempFile);
    const keyL3a = generateTestKey("Level3a", tempFile);
    const keyL3b = generateTestKey("Level3b", tempFile);
    const keyL2b = generateTestKey("Level2b", tempFile);

     expect(result.extractedStrings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: keyL1, value: "Level1 {arg1}" }),
        expect.objectContaining({ key: keyL2a, value: "Level2a {arg1}" }),
        expect.objectContaining({ key: keyL3a, value: "Level3a" }),
        expect.objectContaining({ key: keyL3b, value: "Level3b" }),
        expect.objectContaining({ key: keyL2b, value: "Level2b" }),
      ])
    );

    // Check transformed code structure (simplified check)
    expect(result.code).toContain(`t("${keyL1}", { arg1: condition1 ? t("${keyL2a}", { arg1: condition2 ? t("${keyL3a}") : t("${keyL3b}") }) : t("${keyL2b}") })`);
  });

});