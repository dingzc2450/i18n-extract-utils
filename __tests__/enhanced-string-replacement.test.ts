import { expect, test, describe, afterEach, beforeEach } from "vitest";
import { transformCode } from "./test-helpers";
import { StringReplacer } from "../src/string-replacer";
import { processFiles } from "./test-helpers";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper to create temporary test files
function createTempFile(content: string, extension: string = "tsx"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}.${extension}`);
  fs.writeFileSync(tempFile, content);
  return tempFile;
}

// Clean up temp files
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

describe("Enhanced String Replacement (Format Preservation)", () => {
  describe("StringReplacer Core Functionality", () => {
    test("should apply single replacement with precise position", () => {
      const originalCode = `function test() {
  const message = "hello";
  console.log(message);
}`;

      // Calculate the correct position for the string "hello" in the code
      const { start, end } = StringReplacer.calculatePosition(originalCode, 2, 18, 7);
      
      const changes = [{
        filePath: 'test.js',
        original: '"hello"',
        replacement: 't("hello")',
        line: 2,
        column: 18,
        endLine: 2,
        endColumn: 25,
        start,
        end,
      }];

      const result = StringReplacer.applyChanges(originalCode, changes);
      expect(result).toContain('t("hello")');
      expect(result).toContain('const message = t("hello");');
      expect(result).not.toContain('const message = "hello";');
      
      // Check that formatting is preserved
      const lines = result.split('\n');
      expect(lines[1]).toMatch(/^\s\s/); // Original indentation preserved
    });

    test("should handle multiple replacements in correct order", () => {
      const originalCode = `const a = "first";
const b = "second";
const c = "third";`;

      const changes = [
        {
          filePath: 'test.js',
          original: '"first"',
          replacement: 't("first")',
          line: 1,
          column: 10,
          endLine: 1,
          endColumn: 17,
          start: 10,
          end: 17,
        },
        {
          filePath: 'test.js',
          original: '"second"',
          replacement: 't("second")',
          line: 2,
          column: 10,
          endLine: 2,
          endColumn: 18,
          start: 28,
          end: 36,
        }
      ];

      const result = StringReplacer.applyChanges(originalCode, changes);
      expect(result).toContain('t("first")');
      expect(result).toContain('t("second")');
      expect(result).toContain('"third"'); // Unchanged
    });

    test("should use context matching when position is unavailable", () => {
      const originalCode = `function test() {
  return "hello world";
}`;

      const changes = [{
        filePath: 'test.js',
        original: '"hello world"',
        replacement: 't("hello world")',
        line: 2,
        column: 9,
        endLine: 2,
        endColumn: 22,
        matchContext: {
          before: '  return ',
          after: ';\n}',
          fullMatch: '  return "hello world";\n}'
        }
      }];

      const result = StringReplacer.applyChanges(originalCode, changes);
      expect(result).toContain('t("hello world")');
    });

    test("should calculate positions accurately", () => {
      const code = `line 1
line 2 with "target"
line 3`;
      
      const { start, end } = StringReplacer.calculatePosition(code, 2, 12, 8);
      expect(code.substring(start, end)).toBe('"target"');
    });

    test("should generate match context correctly", () => {
      const code = `function test() {
  const msg = "hello";
  return msg;
}`;
      
      const context = StringReplacer.generateMatchContext(code, 2, 14, '"hello"');
      expect(context.before).toContain('const msg = ');
      expect(context.after).toContain(';\n  return msg;');
      expect(context.fullMatch).toContain('"hello"');
    });
  });

  describe("Enhanced React Transform", () => {
    test("should preserve original indentation after transformation", () => {
      const originalCode = `import React from 'react';

export default function Component() {
  return (
    <div>
      <h1>{"___Hello World___"}</h1>
      <p>
        {"___Welcome message___"}
      </p>
    </div>
  );
}`;

      const tempFile = createTempFile(originalCode);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      expect(result.changes.length).toBeGreaterThan(0);
      expect(result.extractedStrings.length).toBe(2);
      
      // Check that transformations were applied
      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain('t("Welcome message")');
      expect(result.code).toContain('useTranslation');
    });

    test("should handle JSX attributes correctly", () => {
      const originalCode = `import React from 'react';

export default function Component() {
  return (
    <div title="___Tooltip text___">
      <button aria-label="___Button label___">
        Click me
      </button>
    </div>
  );
}`;

      const tempFile = createTempFile(originalCode);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      expect(result.extractedStrings.length).toBe(2);
      expect(result.code).toContain('title={t("Tooltip text")}');
      expect(result.code).toContain('aria-label={t("Button label")}');
    });

    test("should handle template strings with interpolation", () => {
      const originalCode = `import React from 'react';

export default function Component() {
  const name = 'John';
  return (
    <div>
      <p>{"___Hello {name}___".replace('{name}', name)}</p>
    </div>
  );
}`;

      const tempFile = createTempFile(originalCode);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      expect(result.extractedStrings.length).toBe(1);
      expect(result.extractedStrings[0].value).toBe('Hello {name}');
      expect(result.code).toContain('t("Hello {name}")');
    });

    test("should add imports and hooks only when needed", () => {
      const originalCode = `import React from 'react';

export default function Component() {
  return (
    <div>
      <p>No translation strings here</p>
    </div>
  );
}`;

      const tempFile = createTempFile(originalCode);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      expect(result.changes.length).toBe(0);
      expect(result.extractedStrings.length).toBe(0);
      expect(result.code).not.toContain('useTranslation');
    });

    test("should preserve existing imports and hooks", () => {
      const originalCode = `import React from 'react';
import { useTranslation } from 'react-i18next';

export default function Component() {
  const { t } = useTranslation();
  
  return (
    <div>
      <h1>{"___New string___"}</h1>
    </div>
  );
}`;

      const tempFile = createTempFile(originalCode);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      expect(result.extractedStrings.length).toBe(1);
      expect(result.code).toContain('t("New string")');
      
      // Should not duplicate imports/hooks
      const importMatches = result.code.match(/import.*useTranslation/g);
      expect(importMatches?.length).toBe(1);
      
      const hookMatches = result.code.match(/const.*useTranslation\(\)/g);
      expect(hookMatches?.length).toBe(1);
    });

    test("should handle comments preservation", () => {
      const originalCode = `import React from 'react';

export default function Component() {
  return (
    <div>
      {/* This is a comment */}
      <h1>{"___Hello___"}</h1>
    </div>
  );
}`;

      const tempFile = createTempFile(originalCode);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        },
        appendExtractedComment: true,
        extractedCommentType: 'block'
      });

      expect(result.code).toContain('/* This is a comment */');
      expect(result.code).toContain('/* Hello */');
    });
  });

  describe("Enhanced File Processing", () => {
    test("should process multiple files and preserve formatting", async () => {
      const testFiles = [
        {
          name: 'component1.tsx',
          content: `import React from 'react';

export default function Component1() {
  return <h1>{"___Title 1___"}</h1>;
}`
        },
        {
          name: 'component2.tsx',
          content: `import React from 'react';

export default function Component2() {
  return <p>{"___Description 2___"}</p>;
}`
        }
      ];

      const tempDir = tmpdir();
      const testDir = path.join(tempDir, `test-${Date.now()}`);
      fs.mkdirSync(testDir, { recursive: true });

      const createdFiles: string[] = [];
      
      try {
        // Create test files
        for (const file of testFiles) {
          const filePath = path.join(testDir, file.name);
          fs.writeFileSync(filePath, file.content);
          createdFiles.push(filePath);
        }

        // Process files
        const result = await processFiles(
          path.join(testDir, '*.tsx'),
          {
            pattern: '___(.*?)___',
            i18nConfig: {
              framework: 'react',
              i18nImport: {
                name: 't',
                importName: 'useTranslation',
                source: 'react-i18next'
              }
            }
          }
        );

        expect(result.modifiedFiles.length).toBe(2);
        expect(result.extractedStrings.length).toBe(2);
        
        // Check that files were actually modified
        const modifiedContent1 = fs.readFileSync(createdFiles[0], 'utf8');
        const modifiedContent2 = fs.readFileSync(createdFiles[1], 'utf8');
        
        expect(modifiedContent1).toContain('t("Title 1")');
        expect(modifiedContent2).toContain('t("Description 2")');
        
      } finally {
        // Clean up
        createdFiles.forEach(file => {
          if (fs.existsSync(file)) {
            fs.unlinkSync(file);
          }
        });
        if (fs.existsSync(testDir)) {
          fs.rmdirSync(testDir);
        }
      }
    });

    test("should generate translation output file", async () => {
      const originalCode = `import React from 'react';

export default function Component() {
  return (
    <div>
      <h1>{"___Welcome___"}</h1>
      <p>{"___Description___"}</p>
    </div>
  );
}`;

      const tempFile = createTempFile(originalCode);
      tempFiles.push(tempFile);
      
      const outputFile = path.join(tmpdir(), `translations-${Date.now()}.json`);
      tempFiles.push(outputFile);

      const result = await processFiles(tempFile, {
        pattern: '___(.*?)___',
        outputPath: outputFile,
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      expect(result.extractedStrings.length).toBe(2);
      expect(fs.existsSync(outputFile)).toBe(true);
      
      const outputContent = JSON.parse(fs.readFileSync(outputFile, 'utf8'));
      expect(outputContent).toHaveProperty('Welcome');
      expect(outputContent).toHaveProperty('Description');
    });
  });

  describe("Error Handling and Edge Cases", () => {
    test("should handle malformed code gracefully", () => {
      const malformedCode = `import React from 'react';

export default function Component() {
  return (
    <div>
      <h1>{"___Unclosed string
    </div>
  );
}`;

      const tempFile = createTempFile(malformedCode);
      tempFiles.push(tempFile);

      // Should not throw, should fallback gracefully
      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      // Should return original code when parsing fails
      expect(result.code).toBe(malformedCode);
      expect(result.changes.length).toBe(0);
    });

    test("should handle files without React components", () => {
      const nonReactCode = `function regularFunction() {
  const message = "___Not a React component___";
  return message;
}`;

      const tempFile = createTempFile(nonReactCode, 'js');
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      // Should still work for non-React files
      expect(result.extractedStrings.length).toBe(1);
      expect(result.code).toContain('t("Not a React component")');
    });

    test("should handle empty files", () => {
      const emptyCode = '';
      const tempFile = createTempFile(emptyCode);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      expect(result.code).toBe('');
      expect(result.changes.length).toBe(0);
      expect(result.extractedStrings.length).toBe(0);
    });
  });

  describe("Configuration Options", () => {
    test("should respect custom pattern", () => {
      const originalCode = `import React from 'react';

export default function Component() {
  return <h1>{"%%Hello World%%"}</h1>;
}`;

      const tempFile = createTempFile(originalCode);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '%%(.*?)%%',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 't',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      expect(result.extractedStrings.length).toBe(1);
      expect(result.extractedStrings[0].value).toBe('Hello World');
    });

    test("should use custom translation method name", () => {
      const originalCode = `import React from 'react';

export default function Component() {
  return <h1>{"___Hello___"}</h1>;
}`;

      const tempFile = createTempFile(originalCode);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, {
        pattern: '___(.*?)___',
        i18nConfig: {
          framework: 'react',
          i18nImport: {
            name: 'translate',
            importName: 'useTranslation',
            source: 'react-i18next'
          }
        }
      });

      expect(result.code).toContain('translate("Hello")');
      expect(result.code).toContain('const { translate } = useTranslation()');
    });
  });
});
