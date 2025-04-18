import { expect, test, describe, afterEach } from "vitest";
import { processFiles } from "../src/transformer"; // Adjust path if needed
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";
import { FileModificationRecord } from "../src/types"; // Import the updated types

// Helper functions (createTempFile, afterEach)
function createTempFile(content: string, ext = ".tsx"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}${ext}`);
  fs.mkdirSync(path.dirname(tempFile), { recursive: true });
  fs.writeFileSync(tempFile, content, "utf8");
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

describe("processFiles Functionality", () => {
  test("should correctly identify and modify files, returning modifiedFiles list", async () => {
    // 1. Create files: one to be modified, one to be skipped
    const codeToModify = `
      import React from 'react';

      function ComponentA() {
        return <h1>___Hello___</h1>; // Line 5
      }
      export default ComponentA;
    `;
    const codeToSkip = `
      import React from 'react';

      function ComponentB() {
        return <h2>World</h2>; // No translation needed
      }
      export default ComponentB;
    `;

    const fileToModifyPath = createTempFile(codeToModify, "-modify.tsx");
    const fileToSkipPath = createTempFile(codeToSkip, "-skip.tsx");

    // Use a pattern that matches both files in the temp directory
    const tempDir = path.dirname(fileToModifyPath);
    const pattern = path.join(tempDir, "test-*-modify.tsx"); // More specific pattern

    // 2. Call processFiles
    const result = await processFiles(pattern, {
      translationMethod: "t",
      hookName: "useTranslation",
      hookImport: "react-i18next", // Specify hook import
      // No existingTranslations or outputPath needed for this specific test
    });

    // 3. Assertions
    // Check modifiedFiles array
    expect(result.modifiedFiles).toBeDefined();
    expect(result.modifiedFiles.length).toBe(1); // Only the modify file should be in the list

    // Check the details of the modified file record
    const modifiedRecord = result.modifiedFiles[0];
    expect(modifiedRecord.filePath).toBe(fileToModifyPath);
    // Check content for expected transformation and hook additions
    expect(modifiedRecord.newContent).toContain('import { useTranslation } from "react-i18next";');
    expect(modifiedRecord.newContent).toContain('const { t } = useTranslation();');
    expect(modifiedRecord.newContent).toContain('<h1>{t("Hello")}</h1>');

    // Check changes array within the record
    expect(modifiedRecord.changes).toBeDefined();
    expect(modifiedRecord.changes.length).toBe(1); // One replacement was made

    // Verify file contents on disk
    const modifiedFileContent = fs.readFileSync(fileToModifyPath, "utf8");
    const skippedFileContent = fs.readFileSync(fileToSkipPath, "utf8");

    expect(modifiedFileContent).toBe(modifiedRecord.newContent); // Content should match returned content
    expect(skippedFileContent).toBe(codeToSkip); // Skipped file should be unchanged
  });

  test("should return detailed modification records in modifiedFiles", async () => {
    const codeToModify = `
      import React from 'react';

      function ComponentA() {
        const greeting = "___Hello___"; // Line 5
        return <h1>___World___</h1>; // Line 6
      }
      export default ComponentA;
    `;
    const codeToSkip = `
      function ComponentB() { return <h2>No changes here</h2>; }
    `;

    const fileToModifyPath = createTempFile(codeToModify, "-details.tsx");
    const fileToSkipPath = createTempFile(codeToSkip, "-skip-details.tsx");
    const tempDir = path.dirname(fileToModifyPath);
    // Use a pattern matching only the file intended for modification
    const pattern = path.join(tempDir, "test-*-details.tsx");

    const result = await processFiles(pattern, {
      translationMethod: "t",
      hookName: "useTranslation",
      hookImport: "react-i18next",
      // Use default key generation (value as key) for simplicity here
    });

    // Assert modifiedFiles array structure
    expect(result.modifiedFiles).toBeDefined();
    expect(result.modifiedFiles.length).toBe(1);

    const modifiedRecord: FileModificationRecord = result.modifiedFiles[0];
    expect(modifiedRecord.filePath).toBe(fileToModifyPath);
    // Check overall content changes
    expect(modifiedRecord.newContent).toContain('import { useTranslation } from "react-i18next";');
    expect(modifiedRecord.newContent).toContain('const { t } = useTranslation();');
    expect(modifiedRecord.newContent).toContain('const greeting = t("Hello");');
    expect(modifiedRecord.newContent).toContain('<h1>{t("World")}</h1>');

    // Assert detailed changes array
    expect(modifiedRecord.changes).toBeDefined();
    expect(modifiedRecord.changes.length).toBe(2); // Found two replacements

    // Check details of the first change ("___Hello___")
    // Note: Finding by original/replacement might be more robust than index
    const change1 = modifiedRecord.changes.find(c => c.original === '"___Hello___"');
    expect(change1).toBeDefined();
    expect(change1?.filePath).toBe(fileToModifyPath);
    expect(change1?.original).toBe('"___Hello___"'); // Generated code includes quotes
    expect(change1?.replacement).toBe('t("Hello")');
    expect(change1?.line).toBe(5); // Check line number (adjust if code changes)
    expect(change1?.column).toBeGreaterThanOrEqual(0);
    expect(change1?.endLine).toBe(5);
    expect(change1?.endColumn).toBeGreaterThan(change1?.column ?? 0);

    // Check details of the second change ("___World___")
    const change2 = modifiedRecord.changes.find(c => c.original === '___World___');
    expect(change2).toBeDefined();
    expect(change2?.filePath).toBe(fileToModifyPath);
    expect(change2?.original).toBe('___World___'); // Original was JSXText, check generated code
    expect(change2?.replacement).toBe('{t("World")}'); // Replacement is JSXExpressionContainer
    expect(change2?.line).toBe(6); // Check line number
    expect(change2?.column).toBeGreaterThanOrEqual(0);
    expect(change2?.endLine).toBe(6);
    expect(change2?.endColumn).toBeGreaterThan(change2?.column ?? 0);

    // Verify file content on disk (optional but good)
    const finalContentOnDisk = fs.readFileSync(fileToModifyPath, "utf8");
    expect(finalContentOnDisk).toBe(modifiedRecord.newContent);
    const skippedContentOnDisk = fs.readFileSync(fileToSkipPath, "utf8");
    expect(skippedContentOnDisk).toBe(codeToSkip); // Should be unchanged
  });

  // Add more tests as needed, e.g., for existingTranslations, outputPath, generateKey, template literals etc.
});