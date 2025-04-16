import { expect, test, describe, afterEach } from "vitest"; // Ensure describe and afterEach are imported if not already
import { extractStringsFromCode, transformCode } from "../src/index.js";
import * as fs from 'fs';
import * as path from 'path';
import { tmpdir } from 'os';

// Helper to create temporary test files
function createTempFile(content: string): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(2, 15)}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.tsx`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

// Clean up temp files (ensure it exists or copy)
const tempFiles: string[] = [];
afterEach(() => {
  while (tempFiles.length > 0) {
    const file = tempFiles.pop();
    if (file && fs.existsSync(file)) {
      fs.unlinkSync(file);
    }
  }
});

test("extractStringsFromCode should extract strings with ___pattern___", () => {
  const code = `
    function MyComponent() {
      return (
        <div>
          <h1>___Hello World___</h1>
          <p>___Welcome to our app___</p>
          <span>Regular text</span>
        </div>
      );
    }
  `;
  
  const extracted = extractStringsFromCode(code, "test-file.tsx");
  
  expect(extracted.length).toBe(2);
  expect(extracted[0].value).toBe("Hello World");
  expect(extracted[1].value).toBe("Welcome to our app");
});

test("transformCode should replace patterns with t() calls", () => {
  const code = `
    function MyComponent() {
      return (
        <div>
          <h1>___Hello World___</h1>
          <p>___Welcome to our app___</p>
        </div>
      );
    }
  `;

  const tempFile = createTempFile(code);
  tempFiles.push(tempFile);

  const result = transformCode(tempFile, {
    translationMethod: 't',
    hookName: 'useTranslation',
    hookImport: 'react-i18next'
  });

  expect(result.code).toMatch(/t\(['"]Hello World['"]\)/g);
  expect(result.code).toMatch(/t\(['"]Welcome to our app['"]\)/g);
  expect(result.code).toContain("const { t } = useTranslation()");
  expect(result.code).toMatch(/import { useTranslation } from ['"]react-i18next['"]/);

  expect(result.extractedStrings.length).toBe(2);
  expect(result.extractedStrings[0].value).toBe("Hello World");
  expect(result.extractedStrings[1].value).toBe("Welcome to our app");
});

test("transformCode should not add hooks when no translations found", () => {
  const code = `
    function MyComponent() {
      return (
        <div>
          <h1>Hello World</h1>
          <p>Welcome to our app</p>
        </div>
      );
    }
  `;
  
  const tempFile = createTempFile(code);
  tempFiles.push(tempFile); // Add to cleanup list
  
  const result = transformCode(tempFile, {
    translationMethod: 't',
    hookName: 'useTranslation'
  });
  
  // Clean up the temp file
  fs.unlinkSync(tempFile);
  
  // Check that no changes were made
  expect(result.code).toBe(code);
  expect(result.extractedStrings.length).toBe(0);
  expect(result.code).not.toContain("useTranslation");
  expect(result.code).not.toContain("import");
});

test("transformCode should handle existing translation hooks", () => {
  const code = `
    import { useTranslation } from 'react-i18next';
    
    function MyComponent() {
      const { t } = useTranslation();
      
      return (
        <div>
          <h1>___Hello World___</h1>
          <p>{t("Existing translation")}</p>
        </div>
      );
    }
  `;
  
  const tempFile = createTempFile(code);
  tempFiles.push(tempFile); // Add to cleanup list
  
  const result = transformCode(tempFile, {
    translationMethod: 't',
    hookName: 'useTranslation'
  });
  
  // Clean up the temp file
  fs.unlinkSync(tempFile);
  
  // Check that ___Hello World___ was replaced with t function call
  expect(result.code).toMatch(/t\(['"]Hello World['"]\)/);
  
  // Check that we didn't add duplicate imports or hooks
  const importCount = (result.code.match(/import.*from 'react-i18next'/g) || []).length;
  const hookCount = (result.code.match(/useTranslation\(\)/g) || []).length;
  
  expect(importCount).toBe(1);
  expect(hookCount).toBe(1);
});

test("transformCode should insert import after directives and comments", () => {
  const code = `
'use client';

// This is a top-level comment

import React from 'react'; // Existing import

/**
 * Another comment block
 */
function MyComponent() {
  return (
    <div>
      <h1>___Hello Directive___</h1>
    </div>
  );
}
`;

  const tempFile = createTempFile(code);
  tempFiles.push(tempFile); // Add to cleanup list

  const result = transformCode(tempFile, {
    translationMethod: 't',
    hookName: 'useTranslation',
    hookImport: 'react-i18next'
  });

  // Check that the import is added AFTER 'use client' and existing import
  const lines = result.code.split('\n');
  const useClientIndex = lines.findIndex(line => line.includes("'use client';"));
  const reactImportIndex = lines.findIndex(line => line.includes("import React from 'react';"));
  const hookImportIndex = lines.findIndex(line => line.includes("import { useTranslation } from 'react-i18next';"));

  expect(useClientIndex).toBeGreaterThan(-1);
  expect(reactImportIndex).toBeGreaterThan(-1);
  expect(hookImportIndex).toBeGreaterThan(-1);

  // Verify order
  expect(hookImportIndex).toBeGreaterThan(useClientIndex);
  expect(hookImportIndex).toBeGreaterThan(reactImportIndex); // Should be inserted after the last existing import

  // Verify other transformations
  expect(result.code).toMatch(/t\(['"]Hello Directive['"]\)/);
  expect(result.code).toContain("const { t } = useTranslation()");

  // Check extraction
  expect(result.extractedStrings.length).toBe(1);
  expect(result.extractedStrings[0].value).toBe("Hello Directive");
});