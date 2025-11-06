import { describe, test, expect, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

function createTempFile(content: string, extension: string = "vue"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.${extension}`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach(file => {
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

// 这些用例使用 regex 模式（通过 test-helpers 包装），不要求安装 @vue/compiler-sfc
// 重点验证：SFC 重组后 <script>/<style> 的属性不会丢失，且不产生多余空行

describe("Vue SFC 组装时保留块属性 (regex 模式)", () => {
  test('保留 <script setup lang="ts"> 与 <style scoped lang="less">', () => {
    const code = [
      "<template>",
      "  <div>___你好___</div>",
      "</template>",
      "",
      '<script setup lang="ts">',
      "const a = '___内部___'",
      "</script>",
      "",
      '<style scoped lang="less">',
      ".button { color: red; }",
      "</style>",
      "",
    ].join("\n");

    const file = createTempFile(code, "vue");
    tempFiles.push(file);

    const result = transformCode(file, {
      i18nConfig: {
        framework: "vue",
        i18nImport: { name: "t", importName: "useI18n", source: "vue-i18n" },
      },
    });

    // 属性应被保留
    expect(result.code).toMatch(/<script\s+setup\s+lang="ts">/);
    expect(result.code).toMatch(/<style\s+scoped\s+lang="less">/);

    // 脚本中会注入 useI18n（因为模板/脚本都有提取）
    expect(result.code).toMatch(
      /import\s*{\s*useI18n\s*}\s*from\s*["']vue-i18n["']/
    );

    // 块内部不应出现额外的空行
    expect(result.code).not.toMatch(/<script[^>]*>\r?\n\r?\n/);
    expect(result.code).not.toMatch(/\r?\n\r?\n<\/script>/);
    expect(result.code).not.toMatch(/<style[^>]*>\r?\n\r?\n/);
    expect(result.code).not.toMatch(/\r?\n\r?\n<\/style>/);
  });

  test('保留 <script lang="ts"> 与 <style module lang="scss">', () => {
    const code = [
      "<template>",
      "  <div>___世界___</div>",
      "</template>",
      "",
      '<script lang="ts">',
      "export default { name: 'X', setup() { console.log('___hi___'); return {}; } }",
      "</script>",
      "",
      '<style module lang="scss">',
      ".foo { font-size: 12px; }",
      "</style>",
      "",
    ].join("\n");

    const file = createTempFile(code, "vue");
    tempFiles.push(file);

    const result = transformCode(file, {
      i18nConfig: {
        framework: "vue",
        i18nImport: { name: "t", importName: "useI18n", source: "vue-i18n" },
      },
    });

    // 属性应被保留
    expect(result.code).toMatch(/<script\s+lang="ts">/);
    expect(result.code).toMatch(/<style\s+module\s+lang="scss">/);

    // 仍应注入 useI18n（模板或脚本提取字符串）
    expect(result.code).toMatch(
      /import\s*{\s*useI18n\s*}\s*from\s*["']vue-i18n["']/
    );

    // 块内部不应出现额外的空行
    expect(result.code).not.toMatch(/<script[^>]*>\r?\n\r?\n/);
    expect(result.code).not.toMatch(/\r?\n\r?\n<\/script>/);
    expect(result.code).not.toMatch(/<style[^>]*>\r?\n\r?\n/);
    expect(result.code).not.toMatch(/\r?\n\r?\n<\/style>/);
  });
});
