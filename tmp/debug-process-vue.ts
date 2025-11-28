import { processVueScript } from "../src/plugins/vue/script-processor";
import { normalizeConfig } from "../src/core/config-normalizer";
import type { TransformOptions } from "../src/types";

const code = `import { ref } from 'vue';
const dynamicText = ref('___Dynamic Vue Text___');`;

const options = normalizeConfig(
  {
    i18nConfig: {
      framework: "vue",
      i18nImport: {
        name: "t",
        importName: "useI18n",
        source: "vue-i18n",
      },
    },
    appendExtractedComment: true,
    extractedCommentType: "line",
  } as TransformOptions,
  "test.vue"
);

const result = processVueScript(
  code,
  true,
  options,
  [],
  [],
  new Map(),
  "test.vue",
  new Map(),
  { templateNeedsHook: false }
);

console.log(result.code);
