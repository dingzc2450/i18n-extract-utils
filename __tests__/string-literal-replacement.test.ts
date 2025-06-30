import { expect, test, describe, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto"; // Import crypto if not already present

// Helper to create temporary test files
function createTempFile(content: string): string {
  const tempDir = tmpdir();
  // Use a more unique ID to avoid potential collisions in rapid test runs
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.tsx`);
  fs.writeFileSync(tempFile, content);
  tempFiles.push(tempFile); // Add to cleanup list
  return tempFile;
}

const tempFiles: string[] = [];
afterEach(() => {
  tempFiles.forEach((file) => {
    if (fs.existsSync(file)) {
      try {
        fs.unlinkSync(file);
      } catch (err) {
        console.error(`Error removing temp file ${file}:`, err);
      }
    }
  });
  tempFiles.length = 0;
});


describe("String/JSX Literal and Attribute Replacements", () => {
  // ... existing tests ...

  test("should handle string literals correctly", () => {
    const code = `
      function MyComponent() {
        const message = "___Welcome message___";
        const errorText = \`___Error occurred___\`;
        return (
          <div>{message}</div>
        );
      }
    `;
    const tempFile = createTempFile(code);
    // tempFiles.push(tempFile); // createTempFile now handles this

    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });

    expect(result.code).toMatch(/const message = t\(['"]Welcome message['"]\);/);
    expect(result.code).toMatch(/const errorText = t\(['"]Error occurred['"]\);/);
    expect(result.extractedStrings.length).toBe(2);
    expect(result.extractedStrings[0].value).toBe("Welcome message");
    expect(result.extractedStrings[1].value).toBe("Error occurred");
  });


  test("should handle JSX text correctly", () => {
    const code = `
      function MyComponent() {
        return (
          <div>
            <h1>___Page Title___</h1>
            <p>___This is a paragraph___ with some regular text.</p>
            <span>Regular text ___with translation___ in the middle</span>
          </div>
        );
      }
    `;
    const tempFile = createTempFile(code);
    // tempFiles.push(tempFile); // createTempFile now handles this

    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
    });

    expect(result.code).toMatch(/<h1>\{t\(['"]Page Title['"]\)\}<\/h1>/);
    expect(result.code).toMatch(/<p>\{t\(['"]This is a paragraph['"]\)\} with some regular text\.<\/p>/);
    expect(result.code).toMatch(/<span>Regular text \{t\(['"]with translation['"]\)\} in the middle<\/span>/);
    expect(result.extractedStrings.length).toBe(3);
    expect(result.extractedStrings[0].value).toBe("Page Title");
    expect(result.extractedStrings[1].value).toBe("This is a paragraph");
    expect(result.extractedStrings[2].value).toBe("with translation");
  });

  // --- NEW TEST CASE ---
  test("should handle string/template literals containing HTML with pattern inside", () => {
    const code = `
      import React from 'react';

      function MyComponent() {
        // Using template literal for easier expectation matching
        const linkHtml = \`<a href="/some/path" title="Click here">___Link Text___</a>\`;
        const complexHtml = \`<span>Prefix <strong>___Bold Text___</strong> Suffix</span>\`;
        const stringLit = "Plain string ___with pattern___ inside.";
        return (
          <div>
            <div dangerouslySetInnerHTML={{ __html: linkHtml }} />
            <div dangerouslySetInnerHTML={{ __html: complexHtml }} />
            <p>{stringLit}</p>
          </div>
        );
      }
    `;
    const tempFile = createTempFile(code);

    const result = transformCode(tempFile, {
      translationMethod: "t",
      hookName: "useTranslation",
      hookImport: "react-i18next",
    });

    // Check hook and import are added
    expect(result.code).toContain('import { useTranslation } from "react-i18next";');
    expect(result.code).toContain('const { t } = useTranslation();');

    // Check that the pattern within the literals is replaced, keeping surrounding HTML/text
    expect(result.code).toContain(`const linkHtml = \`<a href="/some/path" title="Click here">\${t("Link Text")}</a>\`;`);
    expect(result.code).toContain(`const complexHtml = \`<span>Prefix <strong>\${t("Bold Text")}</strong> Suffix</span>\`;`);
    expect(result.code).toContain(`const stringLit = \`Plain string \${t("with pattern")} inside.\`;`);


    // Check extracted strings
    expect(result.extractedStrings.length).toBe(3);
    expect(result.extractedStrings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ value: "Link Text", key: "Link Text" }),
        expect.objectContaining({ value: "Bold Text", key: "Bold Text" }),
        expect.objectContaining({ value: "with pattern", key: "with pattern" }),
      ])
    );

    // Ensure the original surrounding HTML/text structure is still present
    expect(result.code).toContain('<a href="/some/path" title="Click here">');
    expect(result.code).toContain('</a>');
    expect(result.code).toContain('<span>Prefix <strong>');
    expect(result.code).toContain('</strong> Suffix</span>');
    expect(result.code).toContain('Plain string ');
    expect(result.code).toContain(' inside.');
  });
  // --- END NEW TEST CASE ---

});