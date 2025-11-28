import { transformCodeFromFile } from "../__tests__/test-helpers";
import type { TransformOptions } from "../src/types";
import fs from "fs";
import path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

const options: TransformOptions = {
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
};

const content = `
<template>
  <p>___Static Vue Text___</p>
</template>
<script setup>
import { ref } from 'vue';
const dynamicText = ref('___Dynamic Vue Text___');
</script>
`;

const tempPath = path.join(
  tmpdir(),
  `debug-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.vue`
);
fs.writeFileSync(tempPath, content, "utf8");

const result = transformCodeFromFile(tempPath, options);

console.log(result.code);
