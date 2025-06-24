import { vueFallbackTransform } from "../src/frameworks/vue-fallback-transform";
import { TransformOptions } from "../src/types";
import { expect, test, describe, afterEach, it } from "vitest";

describe("vueFallbackTransform", () => {
  it("should replace matched pattern with $t and insert import/hook for setup", () => {
    const code = `
<template>
  <div>___你好___</div>
</template>
<script setup>
console.log('test');
</script>
`;
    const options: TransformOptions = {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "$t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
    };
    const result = vueFallbackTransform(code, [], options);
    expect(result).toContain(`import { useI18n } from 'vue-i18n';`);
    expect(result).toContain(`const { $t } = useI18n();`);
    expect(result).toContain('$t("你好")');
  });

  it("should use custom pattern if provided", () => {
    const code = `<div>@@@Hello@@@</div>`;
    const options: TransformOptions = {
      pattern: "@@@(.+?)@@@",
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "$t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
    };
    const result = vueFallbackTransform(code, [], options);
    expect(result).toContain('$t("Hello")');
  });

  it("should not duplicate import or hook if already present", () => {
    const code = `import { useI18n } from 'vue-i18n';
const { $t } = useI18n();
console.log($t("你好"));`;
    const options: TransformOptions = {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "$t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
    };
    const result = vueFallbackTransform(code, [], options);
    // 不应重复插入 import 和 hook
    expect(result.match(/import \{ useI18n \} from 'vue-i18n';/g)?.length).toBe(
      1
    );
    expect(result.match(/const \{ \$t \} = useI18n\(\);/g)?.length).toBe(1);
  });
});
