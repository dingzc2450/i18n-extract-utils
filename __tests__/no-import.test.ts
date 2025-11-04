import { expect, test, describe, afterEach } from "vitest";
import { transformCodeFromFile } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

function createTempFile(content: string, extension = "js"): string {
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

describe("noImport behavior - generic JS", () => {
  test("should not insert import and should use globalFunction when noImport=true", () => {
    const code = `const greeting = "___Hello___";\nconsole.log(greeting);`;
    const tempFile = createTempFile(code, "js");
    tempFiles.push(tempFile);

    const result = transformCodeFromFile(tempFile, {
      pattern: "___(.*?)___",
      i18nConfig: {
        framework: "javaScript",
        i18nImport: {
          name: "t",
          source: "i18n-lib",
          noImport: true,
          globalFunction: "i18nT",
        },
      },
    });

    // Should use global function
    expect(result.code).toContain(`i18nT("Hello")`);
    // Should NOT contain an import statement for i18n-lib
    expect(result.code).not.toMatch(/import\s+.*from\s+['\"]i18n-lib['\"]/);
    // extracted strings should include Hello
    expect(result.extractedStrings.map(s => s.value)).toContain("Hello");
  });
});
