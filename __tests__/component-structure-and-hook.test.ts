import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "../src/index.js";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";

function createTempFile(content: string): string {
  const tempDir = tmpdir();
  const tempFile = path.join(
    tempDir,
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}.tsx`
  );
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach((file) => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  tempFiles.length = 0;
});

describe("Component Structure and Hook Insertion", () => {
  test("should ensure import and hook call are on their own lines (demo.tsx)", () => {
    const demoCode = `
'use client'
import React, { useState } from 'react';
import { useDebouncedCallback } from "use-debounce";
import { Input } from 'components/ui/input';
const SearchForm = () => {
  return <input className="w-52" placeholder="___请输入名称___" />;
};

export default SearchForm;
    `;
    const tempFile = createTempFile(demoCode);

    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslations",
      hookImport: "next-intl",
    });

    const lines = result.code.split("\n");
    const importLineIndex = lines.findIndex(
      (line) => line.trim() === 'import { useTranslations } from "next-intl";'
    );
    const useClientIndex = lines.findIndex((line) =>
      line.includes("use client")
    );
    expect(useClientIndex).not.toBe(-1);
    expect(importLineIndex).toBeGreaterThan(useClientIndex);

    const otherImportIndex = lines.findIndex(
      (line, i) => i !== importLineIndex && line.trim().includes("import ")
    );
    expect(otherImportIndex).not.toBe(-1);
    expect(importLineIndex).toBeGreaterThan(otherImportIndex);

    const hookLine = "const { t } = useTranslations();";
    const hookLineIndex = lines.findIndex((line) => line.trim() === hookLine);
    expect(hookLineIndex).toBeGreaterThan(-1);
    if (hookLineIndex > 0) {
      expect(lines[hookLineIndex - 1].trim()).toMatch(/{$/);
    }
    expect(result.code).toContain('t("请输入名称")');
  });

  test("should transform text inside a custom React hook", () => {
    const code = `
      import { useState } from "react";
      function useCustomLogic() {
        const [state, setState] = useState();
        const label = "___自定义hook内的文本___";
        return { label };
      }
      function Demo() {
        const { label } = useCustomLogic();
        return <div>{label}</div>;
      }
    `;
    const tempFile = createTempFile(code);

    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
      hookImport: "react-i18next",
    });

    expect(result.code).toMatch(
      /const label = t\(['"]自定义hook内的文本['"]\);/
    );
    expect(result.code).toMatch(
      /function Demo\(\) \{\s*const \{\s*t\s*\} = useTranslation\(\);/
    );
    expect(result.code).toMatch(
      /function useCustomLogic\(\) \{\s*const \{\s*t\s*\} = useTranslation\(\);/
    );
    expect(
      result.code.match(
        /import { useTranslation } from ['"]react-i18next['"];/g
      )?.length
    ).toBe(1);

    const useCustomLogicBody = result.code.substring(
      result.code.indexOf("function useCustomLogic()"),
      result.code.indexOf("function Demo()")
    );
    expect(useCustomLogicBody).toContain('t("自定义hook内的文本")');
    expect(useCustomLogicBody).toContain("useTranslation()");
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].value).toBe("自定义hook内的文本");
  });
});
