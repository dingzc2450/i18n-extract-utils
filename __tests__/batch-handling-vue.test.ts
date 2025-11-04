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
  test("使用AST模式处理Vue模板中的条件表达式和插值", async () => {
    const tempDir = createTempDir();

    const templateWithExprContent = `
<template>
  <div class="container">
    <!-- 简单条件渲染 -->
    <div v-if="showMessage">{{ condition ? '___成功___' : '___失败___' }}</div>
    
    <!-- 嵌套条件渲染 -->
    <div>{{ isActive ? condition ? '___在线___' : '___离线___' : '___未知___' }}</div>
    
    <!-- 带模板字面量的条件渲染 -->
    <p>{{ status === 'ok' ? \`___状态：\${type}___\` : '___错误___' }}</p>
    
    <!-- 数组条件映射 -->
    <ul>
      <li v-for="item in items">
        {{ item.active ? '___活跃用户___' : '___非活跃___' }}：{{ item.name }}
      </li>
    </ul>
    
    <!-- 带函数调用的条件 -->
    <div>{{ getMessage() ? '___有消息___' : '___无消息___' }}</div>
    
    <!-- 复杂表达式中的条件 -->
    <p>{{ loading ? '___加载中___' : error ? '___出错了___' : '___完成___' }}</p>
  </div>
</template>
<script setup>
import { ref, computed } from 'vue'

const showMessage = ref(true)
const condition = ref(true)
const isActive = ref(true)
const status = ref('ok')
const type = ref('___普通___')
const loading = ref(false)
const error = ref(false)
const items = ref([
  { name: '___用户1___', active: true },
  { name: '___用户2___', active: false }
])

const getMessage = () => Math.random() > 0.5
</script>`;

    fs.writeFileSync(
      path.join(tempDir, "template-expressions.vue"),
      templateWithExprContent
    );

    const result = await processFiles(path.join(tempDir, "*.vue"), {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
      vueTemplateMode: "ast", // 显式指定使用AST模式
    });

    // 验证提取的字符串总数
    expect(result.extractedStrings.length).toBe(17); // 所有条件分支中的字符串

    // 验证特定场景的字符串提取
    const extractedValues = result.extractedStrings.map(s => s.value);

    // 简单三元表达式
    expect(extractedValues).toContain("成功");
    expect(extractedValues).toContain("失败");

    // 嵌套三元表达式
    expect(extractedValues).toContain("在线");
    expect(extractedValues).toContain("离线");
    expect(extractedValues).toContain("未知");

    // 模板字面量
    expect(extractedValues).toContain("状态：{arg1}");
    expect(extractedValues).toContain("错误");

    // 循环中的条件
    expect(extractedValues).toContain("活跃用户");
    expect(extractedValues).toContain("非活跃");
    expect(extractedValues).toContain("用户1");
    expect(extractedValues).toContain("用户2");

    // 复杂条件分支
    expect(extractedValues).toContain("加载中");
    expect(extractedValues).toContain("出错了");
    expect(extractedValues).toContain("完成");

    // 验证普通变量中的字符串
    expect(extractedValues).toContain("普通");

    // 验证文件修改
    const modifiedContent = result.modifiedFiles[0].newContent;
    expect(modifiedContent).toContain('import { useI18n } from "vue-i18n"');
    expect(modifiedContent).toContain("const { t } = useI18n()");

    // 验证条件表达式的转换
    [
      '{{ condition ? t("成功") : t("失败") }}',
      '{{ isActive ? condition ? t("在线") : t("离线") : t("未知") }}',
      '{{ status === \'ok\' ? t("状态：{arg1}") : t("错误") }}',
      '{{ item.active ? t("活跃用户") : t("非活跃") }}',
      '{{ loading ? t("加载中") : error ? t("出错了") : t("完成") }}',
    ].forEach(expectedContent => {
      // 忽略引号的差异 可以单引号或双引号
      expect(modifiedContent).toMatch(
        new RegExp(
          expectedContent
            .replace(/"/g, "[\"']")
            .replaceAll("?", "\\?")
            .replaceAll("(", "\\(")
            .replaceAll(")", "\\)")
        )
      );
    });

    // 清理临时文件
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  test("AST模式下处理Vue组件中的动态属性和指令", async () => {
    const tempDir = createTempDir();

    const directiveVueContent = `
<template>
  <div>
    <input :placeholder="___请输入内容___">
    <button :title="___点击提交___" v-tooltip="___提示信息___">
      ___提交___
    </button>
    <p v-text="___静态文本___"></p>
    <span :aria-label="___无障碍标签___">
      {{ ___内容描述___ }}
    </span>
  </div>
</template>
<script>
export default {
  name: 'DirectiveTest',
  data() {
    return {
      message: '___测试消息___'
    }
  }
}
</script>`;

    fs.writeFileSync(path.join(tempDir, "directive.vue"), directiveVueContent);

    const result = await processFiles(path.join(tempDir, "*.vue"), {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
      vueTemplateMode: "ast",
    });

    // 验证提取的字符串
    expect(result.extractedStrings.length).toBe(8);

    // 验证提取的实际文本内容（不含下划线）
    const extractedValues = result.extractedStrings.map(s => s.value);
    expect(extractedValues).toContain("请输入内容");
    expect(extractedValues).toContain("点击提交");
    expect(extractedValues).toContain("提示信息");
    expect(extractedValues).toContain("提交");
    expect(extractedValues).toContain("静态文本");
    expect(extractedValues).toContain("无障碍标签");
    expect(extractedValues).toContain("内容描述");
    expect(extractedValues).toContain("测试消息");

    // 检查特定属性的转换
    const modifiedContent = result.modifiedFiles[0].newContent;
    expect(modifiedContent).toContain(':placeholder="t(');
    expect(modifiedContent).toContain(':title="t(');
    expect(modifiedContent).toContain('v-tooltip="t(');
    expect(modifiedContent).toContain(':aria-label="t(');

    // 清理临时文件
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

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
