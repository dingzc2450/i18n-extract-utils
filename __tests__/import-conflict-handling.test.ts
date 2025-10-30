import { describe, expect, test } from "vitest";
import { transformCode } from "./test-helpers";
import type { TransformOptions } from "../src/types";
import fs from "fs";
import path from "path";
import { beforeAll, afterAll } from "vitest";

describe("导入冲突处理", () => {
  const testDir = path.join(__dirname, "temp");
  const getTestFilePath = (name: string) => path.join(testDir, name);

  // 基础测试配置
  const baseOptions: TransformOptions = {
    pattern: "___(.*?)___",
    i18nConfig: {
      framework: "react",
      i18nImport: {
        name: "t",
        importName: "useTranslation",
        source: "react-i18next",
      },
    },
  };

  // 在每个测试前确保临时目录存在
  beforeAll(() => {
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }
  });

  // 在每个测试后清理临时文件
  afterAll(() => {
    if (fs.existsSync(testDir)) {
      fs.rmSync(testDir, { recursive: true, force: true });
    }
  });

  test("默认策略(skip)：保留现有导入", () => {
    const testFile = getTestFilePath("skip-test.tsx");
    const code = `
import { useTranslation as existingTrans } from "old-i18n";

function MyComponent() {
  const { t } = existingTrans();
  return <div>___测试文本___</div>;
}`;

    fs.writeFileSync(testFile, code, "utf8");

    const options: TransformOptions = {
      ...baseOptions,
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
          importConflict: {
            strategy: "skip",
            enableWarnings: true,
          },
        },
      },
    };

    const result = transformCode(testFile, options);

    expect(result.code).toContain(
      'import { useTranslation as existingTrans } from "old-i18n"'
    );
    expect(result.code).toContain(
      'import { useTranslation } from "react-i18next"'
    );
  });

  test("override策略：替换现有导入", () => {
    const testFile = getTestFilePath("override-test.tsx");
    const code = `
import { useTranslation } from "old-i18n";

function MyComponent() {
  const { t } = useTranslation();
  return <div>___测试文本___</div>;
}`;

    fs.writeFileSync(testFile, code, "utf8");

    const options: TransformOptions = {
      ...baseOptions,
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
          importConflict: {
            strategy: "override",
            enableWarnings: true,
          },
        },
      },
    };

    const result = transformCode(testFile, options);

    expect(result.code).not.toContain(
      'import { useTranslation } from "old-i18n"'
    );
    // 为空后不应该含有旧导入
    expect(result.code).not.toContain("old-i18n");
    expect(result.code).toContain(
      'import { useTranslation } from "react-i18next"'
    );
  });

  test("自定义导入不受冲突策略影响", () => {
    const testFile = getTestFilePath("custom-import-test.tsx");
    const code = `
import { useTranslation } from "old-i18n";

function MyComponent() {
  const { t } = useTranslation();
  return <div>___测试文本___</div>;
}`;

    fs.writeFileSync(testFile, code, "utf8");

    const options: TransformOptions = {
      ...baseOptions,
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
          custom: 'import { customTranslate as t } from "custom-i18n"',
          importConflict: {
            strategy: "override",
            enableWarnings: true,
          },
        },
      },
    };

    const result = transformCode(testFile, options);

    expect(result.code).toContain(
      'import { customTranslate as t } from "custom-i18n"'
    );
    expect(result.code).toContain('import { useTranslation } from "old-i18n"');
  });

  test("不同变量名的导入不触发冲突处理", () => {
    const testFile = getTestFilePath("diff-names-test.tsx");
    const code = `
import { useTranslation as existingTrans } from "old-i18n";
import { useI18n } from "other-lib";

function MyComponent() {
  const { t: oldT } = existingTrans();
  return <div>___测试文本___</div>;
}`;

    fs.writeFileSync(testFile, code, "utf8");

    const options: TransformOptions = {
      ...baseOptions,
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
          importConflict: {
            strategy: "override",
            enableWarnings: true,
          },
        },
      },
    };

    const result = transformCode(testFile, options);

    expect(result.code).not.toContain(
      'import { useTranslation as existingTrans } from "old-i18n"'
    );
    expect(result.code).toContain('import { useI18n } from "other-lib"');
    expect(result.code).toContain(
      'import { useTranslation } from "react-i18next"'
    );
  });
});
