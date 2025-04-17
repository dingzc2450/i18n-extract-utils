import { describe, test, expect } from "vitest";
import { fallbackTransform } from "../src/fallback-transform";
import { ExtractedString, TransformOptions } from "../src/types";

describe("fallbackTransform", () => {
  const baseOptions: TransformOptions = {
    translationMethod: "t",
    hookName: "useTranslation",
    hookImport: "react-i18next",
  };

  test("should replace ___pattern___ with t() call", () => {
    const code = `
      function MyComponent() {
        return <div>___Hello World___</div>;
      }
    `;
    const extractedStrings: ExtractedString[] = [
      { key: "Hello World", value: "Hello World", filePath: "test.tsx", line: 2, column: 20 },
    ];
    const result = fallbackTransform(code, extractedStrings, baseOptions);
    expect(result).toContain('t("Hello World")');
  });

  test("should insert import and hook if not present", () => {
    const code = `
      function MyComponent() {
        return <div>___Hello___</div>;
      }
    `;
    const extractedStrings: ExtractedString[] = [
      { key: "Hello", value: "Hello", filePath: "test.tsx", line: 2, column: 20 },
    ];
    const result = fallbackTransform(code, extractedStrings, baseOptions);
    expect(result).toMatch(/import { useTranslation } from ['"]react-i18next['"];/);
    expect(result).toContain("const { t } = useTranslation();");
  });

  test("should not add import/hook if already present", () => {
    const code = `
      import { useTranslation } from 'react-i18next';
      function MyComponent() {
        const { t } = useTranslation();
        return <div>___Hi___</div>;
      }
    `;
    const extractedStrings: ExtractedString[] = [
      { key: "Hi", value: "Hi", filePath: "test.tsx", line: 3, column: 20 },
    ];
    const result = fallbackTransform(code, extractedStrings, baseOptions);
    // Should not duplicate import or hook
    expect(result.match(/import { useTranslation } from ['"]react-i18next['"];/g)?.length).toBe(1);
    expect(result.match(/const { t } = useTranslation\(\);/g)?.length).toBe(1);
    expect(result).toContain('t("Hi")');
  });

  test("should handle multiple matches", () => {
    const code = `
      function MyComponent() {
        return <div>___A___ ___B___ ___C___</div>;
      }
    `;
    const extractedStrings: ExtractedString[] = [
      { key: "A", value: "A", filePath: "test.tsx", line: 2, column: 20 },
      { key: "B", value: "B", filePath: "test.tsx", line: 2, column: 25 },
      { key: "C", value: "C", filePath: "test.tsx", line: 2, column: 30 },
    ];
    const result = fallbackTransform(code, extractedStrings, baseOptions);
    expect(result).toContain('t("A")');
    expect(result).toContain('t("B")');
    expect(result).toContain('t("C")');
  });

  test("should do nothing if no extractedStrings", () => {
    const code = `
      function MyComponent() {
        return <div>Hello</div>;
      }
    `;
    const extractedStrings: ExtractedString[] = [];
    const result = fallbackTransform(code, extractedStrings, baseOptions);
    expect(result).toBe(code);
  });
});