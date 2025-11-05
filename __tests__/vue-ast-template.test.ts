import {
  describe,
  test,
  expect,
  beforeAll,
  afterAll,
  beforeEach,
} from "vitest";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";
import { transformCode } from "../src/processFiles";
import { getVueCompilerManager } from "../src/plugins/vue/compiler-manager";

function createTempFile(content: string, extension: string = "vue"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.${extension}`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

let compilerAvailable = false;
let startedBatch = false;
const manager = getVueCompilerManager();

beforeAll(async () => {
  try {
    // 启动批次并预加载 Vue3 编译器
    manager.startBatch(`test-batch-${Date.now()}`, "vue3");
    startedBatch = true;
    await manager.getCompiler("vue3");
    compilerAvailable = true;
  } catch {
    // 环境未安装 @vue/compiler-sfc，则跳过本文件测试
    compilerAvailable = false;
  }
});

afterAll(() => {
  if (startedBatch) manager.endBatch();
});

beforeEach(function skipIfNoCompiler(this: unknown) {
  if (!compilerAvailable) {
    // vitest: 跳过本测试用例
    // eslint-disable-next-line no-console
    console.warn("@vue/compiler-sfc 未安装，跳过 AST 模板解析测试");
    (this as { skip?: () => void }).skip?.();
  }
});

describe("Vue AST 模板解析（仅在编译器可用时运行）", () => {
  test("文本节点与静态属性替换为 t 调用", () => {
    const code = `
<template>
  <div>
    <h1>___欢迎___</h1>
    <input placeholder="___请输入___" />
  </div>
</template>

<script setup>
// empty
</script>
`;

    const file = createTempFile(code, "vue");
    const result = transformCode(file, {
      vueTemplateMode: "ast",
      i18nConfig: {
        framework: "vue",
        i18nImport: { name: "t", importName: "useI18n", source: "vue-i18n" },
      },
    });

    expect(result.code).toMatch(/\{\s*t\s*\}\s*=\s*useI18n\(\)/);
    // 文本节点变为插值调用
    expect(result.code).toMatch(
      /<h1>\s*\{\{\s*t\(['"][^'"]+['"]\)\s*\}\}\s*<\/h1>/
    );
    // 静态属性转为绑定表达式
    expect(result.code).toMatch(/:placeholder="t\(['"][^'"]+['"]\)"/);
  });

  test("插值中三元表达式内的字符串替换为 t 调用", () => {
    const code = `
<template>
  <div>
    {{ ok ? '___是___' : '___否___' }}
  </div>
</template>

<script>
export default { name: 'C' }
</script>
`;

    const file = createTempFile(code, "vue");
    const result = transformCode(file, {
      vueTemplateMode: "ast",
      i18nConfig: {
        framework: "vue",
        i18nImport: { name: "t", importName: "useI18n", source: "vue-i18n" },
      },
    });

    // 形如：ok ? t('...') : t('...')
    expect(result.code).toMatch(
      /\{\{\s*ok\s*\?\s*t\(['"][^'"]+['"]\)\s*:\s*t\(['"][^'"]+['"]\)\s*\}\}/
    );
  });

  test("插值中模板字面量替换为 t 调用（保留变量占位）", () => {
    const code = [
      "<template>",
      "  <div>",
      "    {{ `___你好, ${name}___` }}",
      "  </div>",
      "</template>",
      "",
      "<script setup>",
      "const name = 'Tom'",
      "</script>",
      "",
    ].join("\n");

    const file = createTempFile(code, "vue");
    const result = transformCode(file, {
      vueTemplateMode: "ast",
      i18nConfig: {
        framework: "vue",
        i18nImport: { name: "t", importName: "useI18n", source: "vue-i18n" },
      },
    });

    // 期望整体模板字面量被替换为单个 t('...') 调用
    expect(result.code).toMatch(/\{\{\s*t\(['"][^'"]+['"]\)\s*\}\}/);
  });
});
