import { describe, expect, test } from "vitest";
import { processFiles } from "../src/processFiles";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

function createTempDir(): string {
  const tempDir = path.join(
    tmpdir(),
    `test-${Date.now()}-${crypto.randomBytes(6).toString("hex")}`
  );
  fs.mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

describe("Vue SFC script no-import with this.$t", () => {
  test("脚本中使用 this.$t 并且不插入 import（AST 模式）", async () => {
    const tempDir = createTempDir();

    const sfc = `
<template>
  <div>{{ '___模板文本___' }}</div>
</template>
<script>
export default {
  name: 'ScriptNoImport',
  data() {
    return {
      message: '___脚本文本___'
    }
  },
  methods: {
    log() {
      console.log('___日志文本___')
    }
  }
}
</script>`;

    const filePath = path.join(tempDir, "script-no-import.vue");
    fs.writeFileSync(filePath, sfc);

    const result = await processFiles(path.join(tempDir, "*.vue"), {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          noImport: true,
          globalFunction: "$t",
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
          vueOverrides: {
            useThisInScript: true,
            scriptFunction: "$t",
            templateFunction: "$t",
          },
        },
      },
      vueTemplateMode: "ast",
    });

    // 检查提取到的字符串
    const values = result.extractedStrings.map(s => s.value);
    expect(values).toContain("模板文本");
    expect(values).toContain("脚本文本");
    expect(values).toContain("日志文本");

    // 检查没有插入 import/useI18n
    const modified = result.modifiedFiles[0].newContent;
    expect(modified).not.toContain("import { useI18n }");
    expect(modified).not.toContain("const { t } = useI18n()");

    // 检查脚本中使用 this.$t 或 $t（根据配置应为 this.$t）
    expect(modified).toMatch(/this\.\$t\(['\"]脚本文本['\"]\)/);
    expect(modified).toMatch(/this\.\$t\(['\"]日志文本['\"]\)/);

    // 模板中应该使用 $t
    expect(modified).toMatch(/\{\{\s*\$t\(['\"]模板文本['\"]\)\s*\}\}/);

    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
