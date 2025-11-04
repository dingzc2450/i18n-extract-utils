import { expect, test, describe, afterEach } from "vitest";
import { transformCodeFromFile } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

function createTempFile(content: string, extension = "vue"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.${extension}`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach(f => {
    if (fs.existsSync(f)) fs.unlinkSync(f);
  });
  tempFiles.length = 0;
});

describe("Vue SFC noImport behavior", () => {
  test("template should use $t and no import inserted when noImport=true", () => {
    const vueCode = `<template>\n  <div>{{ '___欢迎___' }}</div>\n</template>\n<script>\nexport default { }\n</script>`;
    const tempFile = createTempFile(vueCode, "vue");
    tempFiles.push(tempFile);

    const result = transformCodeFromFile(tempFile, {
      pattern: "___(.*?)___",
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
          noImport: true,
          globalFunction: "t",
          vueOverrides: {
            templateFunction: "$t",
          },
        },
      },
      // force regex mode for template processing
      vueTemplateMode: "regex",
    });

    // Template should use $t call (allow single or double quotes)
    expect(result.code).toMatch(/\{\{\s*\$t\(['\"]欢迎['\"]\)\s*\}\}/);
    // No import for vue-i18n should be inserted
    expect(result.code).not.toMatch(/import\s+.*from\s+['\"]vue-i18n['\"]/);
    // extracted strings should include 欢迎
    expect(result.extractedStrings.map(s => s.value)).toContain("欢迎");
  });
});
