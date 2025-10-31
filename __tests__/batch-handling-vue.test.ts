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

describe("Vue项目批处理测试", () => {
  test("processFiles能正常处理多个Vue文件", async () => {
    const tempDir = createTempDir();

    // 创建多个Vue测试文件
    const file1Content = `
<template>
  <div>
    <h1>___标题1___</h1>
    <p>___内容1___</p>
  </div>
</template>
<script>
export default {
  name: 'Component1'
}
</script>`;

    const file2Content = `
<template>
  <div>
    <h1>___标题2___</h1>
    <p>___内容2___</p>
  </div>
</template>
<script>
export default {
  name: 'Component2'
}
</script>`;

    // 写入测试文件
    fs.writeFileSync(path.join(tempDir, "component1.vue"), file1Content);
    fs.writeFileSync(path.join(tempDir, "component2.vue"), file2Content);

    const result = await processFiles(path.join(tempDir, "*.vue"), {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
    });

    // 检查是否成功处理了所有文件
    expect(result.extractedStrings.length).toBe(4); // 每个文件2个字符串
    expect(result.modifiedFiles.length).toBe(2); // 两个文件都应该被修改

    // 清理临时文件
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("processFiles能正确处理嵌套目录中的Vue文件", async () => {
    const tempDir = createTempDir();
    const nestedDir = path.join(tempDir, "nested");
    fs.mkdirSync(nestedDir);

    const files = [
      {
        path: path.join(tempDir, "root.vue"),
        content: `
<template>
  <div>___根组件___</div>
</template>`,
      },
      {
        path: path.join(nestedDir, "nested.vue"),
        content: `
<template>
  <div>___嵌套组件___</div>
</template>`,
      },
    ];

    // 写入测试文件
    files.forEach(file => fs.writeFileSync(file.path, file.content));

    const result = await processFiles(path.join(tempDir, "**/*.vue"), {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
    });

    // 验证结果
    expect(result.extractedStrings.length).toBe(2); // 两个文件各一个字符串
    expect(result.modifiedFiles.length).toBe(2); // 两个文件都应该被修改

    // 检查修改后的文件是否包含预期的改动
    result.modifiedFiles.forEach(file => {
      expect(file.newContent).toContain('import { useI18n } from "vue-i18n"');
      expect(file.newContent).toContain("const { t } = useI18n()");
    });

    // 清理临时文件
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("processFiles在Vue文件处理失败时能优雅处理错误", async () => {
    const tempDir = createTempDir();

    // 创建一个语法错误的Vue文件
    const invalidContent = `
<template>
  <div>
    <h1>___标题___</h1
  </div>
</template>
<script>
export default {
  // 缺少闭合大括号
`;

    fs.writeFileSync(path.join(tempDir, "invalid.vue"), invalidContent);

    const result = await processFiles(path.join(tempDir, "*.vue"), {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
    });

    // 验证错误处理
    expect(result.errors).toBeDefined();
    expect(result.errors?.length).toBeGreaterThan(0);

    // 清理临时文件
    fs.rmSync(tempDir, { recursive: true, force: true });
  });
});
