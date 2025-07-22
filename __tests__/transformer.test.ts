import { expect, test, describe, afterEach } from "vitest";
import { processFiles } from "./test-helpers"; // Adjust path if needed
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";
import { FileModificationRecord } from "../src/types"; // Import the updated types

// Helper functions (createTempFile, afterEach)
// Create a unique test directory for each test instance to avoid race conditions
const testInstanceId = `${Date.now()}-${crypto.randomBytes(8).toString("hex")}`;
const testTempDir = path.join(tmpdir(), `test-instance-${testInstanceId}`);

function createTempFile(content: string, ext = ".tsx"): string {
  // Ensure test instance directory exists
  fs.mkdirSync(testTempDir, { recursive: true });
  
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(testTempDir, `test-${uniqueId}${ext}`);
  fs.writeFileSync(tempFile, content, "utf8");
  tempFiles.push(tempFile); // Add to cleanup list
  return tempFile;
}

const tempFiles: string[] = [];
afterEach(() => {
  // Clean up individual files first
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
  
  // Clean up test instance directory if it exists and is empty
  try {
    if (fs.existsSync(testTempDir)) {
      const remainingFiles = fs.readdirSync(testTempDir);
      if (remainingFiles.length === 0) {
        fs.rmdirSync(testTempDir);
      }
    }
  } catch (err) {
    // Ignore directory cleanup errors
  }
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

    // Use a pattern that matches both files in the isolated test directory  
    const pattern = path.join(testTempDir, "test-*-modify.tsx");

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
    // Use a pattern matching only the file intended for modification in the isolated test directory
    const pattern = path.join(testTempDir, "test-*-details.tsx");

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

  test("should handle files with multiple components, one already using i18n hooks", async () => {
    const codeWithMultipleComponents = `
      import React from 'react';
      import { useTranslation } from "react-i18next";

      function ComponentA() {
        const { t } = useTranslation();
        return <h1>{t("Existing Translation")}</h1>;
      }

      function ComponentB() {
        return <h2>___New Translation___</h2>;
      }

      export { ComponentA, ComponentB };
    `;

    const filePath = createTempFile(
      codeWithMultipleComponents,
      "-multi-component.tsx"
    );
    const pattern = path.join(testTempDir, "test-*-multi-component.tsx");

    const result = await processFiles(pattern, {
      translationMethod: "t",
      hookName: "useTranslation",
      hookImport: "react-i18next",
    });

    expect(result.modifiedFiles.length).toBe(1);
    const modifiedRecord = result.modifiedFiles[0];
    const { newContent } = modifiedRecord;

    // 1. Check that no duplicate import was added.
    const importStatements = (newContent.match(/import { useTranslation } from "react-i18next";/g) || []).length;
    expect(importStatements).toBe(1);

    // 2. Check that ComponentB was correctly transformed.
    // 确保 useTranslation hook 已被正确地添加到 ComponentB 中。
    expect(newContent).toMatch(/function ComponentB\(\) {\s*const { t } = useTranslation\(\);/);
    expect(newContent).toContain('<h2>{t("New Translation")}</h2>');

    // 3. Check that ComponentA remains untouched.
    expect(newContent).toContain("<h1>{t(\"Existing Translation\")}</h1>");

    // 4. Verify the detailed change record for ComponentB.
    expect(modifiedRecord.changes.length).toBe(1);
    const change = modifiedRecord.changes[0];
    expect(change.original).toBe("___New Translation___");
    expect(change.replacement).toBe('{t("New Translation")}');
    expect(change.line).toBe(11); // Line of "___New Translation___"
  });

  // Add more tests as needed, e.g., for existingTranslations, outputPath, generateKey, template literals etc.
});