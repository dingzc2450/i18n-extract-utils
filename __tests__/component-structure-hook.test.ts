import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "../src/index.js";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper functions (createTempFile, afterEach) as in basic-replacements.test.ts
function createTempFile(content: string): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.tsx`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}
const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      try { fs.unlinkSync(file); } catch (err) { console.error(`Error removing temp file ${file}:`, err); }
    }
  });
  tempFiles.length = 0;
});

describe("Component Structure and Hook Insertion", () => {
  test("should process file correctly (reading from samples/demo.tsx)", () => {
    const filePath = path.resolve(__dirname, "../samples/demo.tsx");
    const codeContent = fs.readFileSync(filePath, "utf8");
    const tempFile = createTempFile(codeContent);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookImport: "next-intl",
      hookName: "useTranslations",
    });
    expect(result.code).toBeDefined();
    expect(result.extractedStrings.length).toBeGreaterThan(0);
    expect(result.code).toContain('import { useTranslations } from "next-intl";');
    expect(result.code).toContain('const { t } = useTranslations();');
    expect(result.code).toMatch(/placeholder=\{t\(['"]请输入名称['"]\)\}/);
  });

  test("should handle multiple components in one file correctly", () => {
    const code = `
      import React from 'react';
      function ComponentA() {
        const message = "___Message A___";
        return <div title="___Title A___"><h1>___Header A___</h1><p>{message}</p></div>;
      }
      const ComponentB = () => {
        return <section aria-label="___Label B___"><h2>___Header B___</h2><span>___Text B___</span></section>;
      };
      export default ComponentA;
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
      hookImport: "react-i18next",
    });
    expect(result.code).toMatch(/import { useTranslation } from "react-i18next";/);
    expect(result.code).toMatch(/function ComponentA\(\) \{\s*const \{\s*t\s*} = useTranslation\(\);\s*const message = t\(['"]Message A['"]\);/s);
    expect(result.code).toMatch(/const ComponentB = \(\) => \{\s*const \{\s*t\s*} = useTranslation\(\);/s);
    expect(result.extractedStrings.length).toBe(6);
  });

  test("should add hooks only to component functions, not to nested functions", () => {
    const code = `
      function MyComponent() {
        function formatMessage(msg) { return msg; }
        const message = "___Hello World___";
        return <div><h1>{formatMessage(message)}</h1></div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    expect(result.code).toMatch(/function MyComponent\(\) \{\s*const \{\s*t\s*} = useTranslation\(\);/);
    expect(result.code).not.toMatch(/function formatMessage\(msg\) \{\s*const \{ t \} = useTranslation\(\);/);
    expect(result.code).toContain('t("Hello World")');
  });

  test("should format import statements correctly when they are not on separate lines", () => {
    const code = `
      const statement1 = true;const statement2 = "___Test String___";
      function MyComponent() { return <div><h1>___Page Title___</h1></div>; }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });
    const lines = result.code.split("\n");
    const importLineIndex = lines.findIndex(line => line.trim().startsWith("import") && line.includes("useTranslation"));
    expect(importLineIndex).toBeGreaterThan(-1);
    if (importLineIndex > 0) {
      expect(lines[importLineIndex - 1].trim()).not.toContain("true;const"); // Check line before import
    }
    expect(result.code).toContain('t("Test String")');
    expect(result.code).toContain('t("Page Title")');
  });

  test("should handle arrow function components correctly", () => {
    const code = `
      import React from 'react';
      const ArrowComponent = ({ initialCount }) => {
        const [count, setCount] = React.useState(initialCount);
        const label = "___Counter Label___";
        return (
          <div>
            <label>{label}</label>
            <p>___Current count___: {count}</p>
            <button aria-label="___Increment count___">___Increment___</button>
          </div>
        );
      };
      export default ArrowComponent;
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookImport: "next-intl",
      hookName: "useTranslations",
    });
    expect(result.code).toContain('import { useTranslations } from "next-intl";');
    expect(result.code).toMatch(/const ArrowComponent = \(\{ initialCount \}\) => \{\s*const \{\s*t\s*} = useTranslations\(\);/);
    expect(result.code).toMatch(/const label = t\(['"]Counter Label['"]\);/);
    expect(result.code).toMatch(/<p>\{t\(['"]Current count['"]\)\}: \{count\}<\/p>/);
    expect(result.code).toMatch(/aria-label=\{t\(['"]Increment count['"]\)\}/);
    expect(result.code).toMatch(/\{t\(['"]Increment['"]\)\}/);
    expect(result.extractedStrings.length).toBe(4);
  });

  test("should handle nested components correctly (simple case)", () => {
    const code = `
      const SearchForm = () => {
        return <input className="w-52" placeholder="___请输入名称___" />;
      };
      export default SearchForm;
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookImport: "next-intl",
      hookName: "useTranslations",
    });
    expect(result.code).toMatch(/import { useTranslations } from ["']next-intl["'];/);
    expect(result.code).toContain("useTranslations()");
    expect(result.code).toMatch(/placeholder=\{t\(['"]请输入名称['"]\)\}/);
    expect(result.extractedStrings.length).toBe(1);
  });

  test("should transform text inside a custom React hook and its consuming component", () => {
    const code = `
      import { useState } from "react";
      function useCustomLogic() {
        const [state, setState] = useState();
        const label = "___自定义hook内的文本___"; // Text inside custom hook
        return { label };
      }
      function Demo() {
        const { label } = useCustomLogic();
        const title = "___组件内的文本___"; // Text inside component
        return <div>{label}{title}</div>;
      }
    `;
    const tempFile = createTempFile(code);
    tempFiles.push(tempFile);
    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
      hookImport: "react-i18next",
    });
    // Check hook added to both
    expect(result.code).toMatch(/function useCustomLogic\(\) \{\s*const \{\s*t\s*\} = useTranslation\(\);/);
    expect(result.code).toMatch(/function Demo\(\) \{\s*const \{\s*t\s*\} = useTranslation\(\);/);
    // Check transformations
    expect(result.code).toMatch(/const label = t\(['"]自定义hook内的文本['"]\);/);
    expect(result.code).toMatch(/const title = t\(['"]组件内的文本['"]\);/);
    // Check import added once
    expect(result.code.match(/import { useTranslation } from ['"]react-i18next['"];/g)?.length).toBe(1);
    expect(result.extractedStrings.length).toBe(2);
  });
});