import { describe, it, expect, afterEach } from "vitest";
import { transformCode } from "./test-helpers";
import { TransformOptions } from "../src/types";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";
import crypto from "crypto";

// Helper to create temporary test files
function createTempFile(content: string, extension: string = ".tsx"): string {
  const tempDir = tmpdir();
  const uniqueId = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
  const tempFile = path.join(tempDir, `test-${uniqueId}${extension}`);
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

describe("Extracted Comment Functionality Tests", () => {
  describe("React Framework - Block Comments", () => {
    const baseOptions: TransformOptions = {
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
        },
      },
      appendExtractedComment: true,
      extractedCommentType: "block",
    };

    it("should add block comment for simple string replacement", () => {
      const input = `
export function Welcome() {
  return <div>___Hello World___</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      console.log("Generated code:", result.code);

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain("/* Hello World */");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Hello World");
    });

    it("should add block comment for JSX attribute replacement", () => {
      const input = `
export function Button() {
  return <button title="___Click me___">Button</button>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Click me")');
      expect(result.code).toContain("/* Click me */");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Click me");
    });

    it("should add block comment for template literal replacement", () => {
      const input = `
export function Message() {
  const name = "John";
  return <div>{\`___Hello \${name}___\`}</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Hello {arg1}", { arg1: name })');
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Hello {arg1}");
    });

    it("should handle multiple replacements with comments", () => {
      const input = `
export function MultiText() {
  return (
    <div>
      <h1>___Welcome___</h1>
      <p>___This is a description___</p>
      <button>___Click here___</button>
    </div>
  );
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Welcome")');
      expect(result.code).toContain("/* Welcome */");
      expect(result.code).toContain('t("This is a description")');
      expect(result.code).toContain("/* This is a description */");
      expect(result.code).toContain('t("Click here")');
      expect(result.code).toContain("/* Click here */");
      expect(result.extractedStrings).toHaveLength(3);
    });
  });

  describe("React Framework - Line Comments", () => {
    const baseOptions: TransformOptions = {
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
        },
      },
      appendExtractedComment: true,
      extractedCommentType: "line",
    };

    it("should add line comment for simple string replacement", () => {
      const input = `
export function Welcome() {
  return <div>___Hello World___</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain("// Hello World");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Hello World");
    });

    it("should add line comment for JSX attribute replacement", () => {
      const input = `
export function Button() {
  return <button title="___Click me___">Button</button>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Click me")');
      expect(result.code).toContain("// Click me");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Click me");
    });
  });

  describe("React15 Framework - Block Comments", () => {
    const baseOptions: TransformOptions = {
      i18nConfig: {
        framework: "react15",
        i18nImport: {
          name: "t",
          source: "i18n-lib",
        },
      },
      appendExtractedComment: true,
      extractedCommentType: "block",
    };

    it("should add block comment for React15 string replacement", () => {
      const input = `
import React from 'react';

function Welcome() {
  return React.createElement('div', null, '___Hello World___');
}`;

      const tempFile = createTempFile(input, ".js");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).toContain("/* Hello World */");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Hello World");
    });

    it("should add block comment for React15 JSX replacement", () => {
      const input = `
import React from 'react';

class Welcome extends React.Component {
  render() {
    return <div>___Welcome to React 15___</div>;
  }
}`;

      const tempFile = createTempFile(input, ".jsx");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Welcome to React 15")');
      expect(result.code).toContain("/* Welcome to React 15 */");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Welcome to React 15");
    });
  });

  describe("React15 Framework - Line Comments", () => {
    const baseOptions: TransformOptions = {
      i18nConfig: {
        framework: "react15",
        i18nImport: {
          name: "t",
          source: "i18n-lib",
        },
      },
      appendExtractedComment: true,
      extractedCommentType: "line",
    };

    it("should add line comment for React15 string replacement", () => {
      const input = `
import React from 'react';

function Welcome() {
  return <div>___Hello React 15___</div>;
}`;

      const tempFile = createTempFile(input, ".jsx");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Hello React 15")');
      expect(result.code).toContain("// Hello React 15");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Hello React 15");
    });
  });

  describe("Comment Disabled Tests", () => {
    const baseOptions: TransformOptions = {
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
        },
      },
      appendExtractedComment: false,
    };

    it("should not add comments when appendExtractedComment is false", () => {
      const input = `
export function Welcome() {
  return <div>___Hello World___</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).not.toContain("/*");
      expect(result.code).not.toContain("//");
      expect(result.extractedStrings).toHaveLength(1);
    });

    it("should not add comments when appendExtractedComment is undefined", () => {
      const optionsWithoutComment: TransformOptions = {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        // appendExtractedComment 未设置，默认为 false
      };

      const input = `
export function Welcome() {
  return <div>___Hello World___</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, optionsWithoutComment);

      expect(result.code).toContain('t("Hello World")');
      expect(result.code).not.toContain("/*");
      expect(result.code).not.toContain("//");
      expect(result.extractedStrings).toHaveLength(1);
    });
  });

  describe("Complex Scenarios", () => {
    const baseOptions: TransformOptions = {
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
        },
      },
      appendExtractedComment: true,
      extractedCommentType: "block",
    };

    it("should handle mixed content with comments", () => {
      const input = `
export function ComplexComponent() {
  const userName = "John";
  const count = 5;
  
  return (
    <div>
      <h1>{\`___Welcome \${userName}___\`}</h1>
      <p>{\`___You have \${count} messages___\`}</p>
      <button onClick={() => alert('___Action completed___')}>
        ___Click me___
      </button>
    </div>
  );
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      // 检查所有翻译调用都有对应的注释
      expect(result.code).toContain('t("Welcome {arg1}", { arg1: userName })');
      expect(result.code).toContain(
        't("You have {arg1} messages", { arg1: count })'
      );
      expect(result.code).toContain('t("Action completed")');
      expect(result.code).toContain('t("Click me")');

      // 检查注释存在
      expect(result.code).toContain("/* Welcome {arg1} */");
      expect(result.code).toContain("/* You have {arg1} messages */");
      expect(result.code).toContain("/* Action completed */");
      expect(result.code).toContain("/* Click me */");

      expect(result.extractedStrings).toHaveLength(4);
    });

    it("should handle existing translations with comments", () => {
      const optionsWithExisting: TransformOptions = {
        ...baseOptions,
      };

      const input = `
export function Welcome() {
  return <div>___Welcome___</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(
        tempFile,
        optionsWithExisting,
        new Map([["Welcome", "welcome"]])
      );

      expect(result.code).toContain('t("welcome")');
      expect(result.code).toContain("/* Welcome */");
      expect(result.usedExistingKeysList).toHaveLength(1);
      expect(result.usedExistingKeysList[0].key).toBe("welcome");
    });

    it("should handle custom generateKey with comments", () => {
      const optionsWithCustomKey: TransformOptions = {
        ...baseOptions,
        generateKey: (value: string) =>
          `custom_${value.toLowerCase().replace(/\s+/g, "_")}`,
      };

      const input = `
export function Welcome() {
  return <div>___Hello World___</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, optionsWithCustomKey);

      expect(result.code).toContain('t("custom_hello_world")');
      expect(result.code).toContain("/* Hello World */");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].key).toBe("custom_hello_world");
    });
  });

  describe("Edge Cases", () => {
    const baseOptions: TransformOptions = {
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
        },
      },
      appendExtractedComment: true,
      extractedCommentType: "block",
    };

    it("should handle empty strings", () => {
      const input = `
export function Welcome() {
  return <div>______</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain("______");
    });

    it("should handle strings with special characters", () => {
      const input = `
export function Welcome() {
  return <div>___Hello "World" & 'Friends'!___</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Hello \\"World\\" & \'Friends\'!")');
      expect(result.code).toContain("/* Hello \"World\" & 'Friends'! */");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe(
        "Hello \"World\" & 'Friends'!"
      );
    });

    it("should handle multiline strings", () => {
      const input = `
export function Welcome() {
  return <div>___Hello\\nWorld\\nFrom\\nReact___</div>;
}`;

      const tempFile = createTempFile(input);
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, baseOptions);

      expect(result.code).toContain('t("Hello\\\\nWorld\\\\nFrom\\\\nReact")');
      expect(result.code).toContain("/* Hello\\nWorld\\nFrom\\nReact */");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe(
        "Hello\\nWorld\\nFrom\\nReact"
      );
    });
  });

  describe("Vue Framework - Comments", () => {
    const baseOptions: TransformOptions = {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
      appendExtractedComment: true,
    };

    it("should add HTML comment in template for string replacement", () => {
      const input = `
<template>
  <div>___Hello Vue Template___</div>
</template>
`;
      const tempFile = createTempFile(input, ".vue");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, { ...baseOptions, extractedCommentType: "line" });

      expect(result.code).toContain("{{ t(\"Hello Vue Template\") }}");
      // Vue templates use HTML comments
      expect(result.code).toContain("<!-- Hello Vue Template -->");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Hello Vue Template");
    });

    it("should add line comment in script setup", () => {
      const input = `
<script setup>
import { ref } from 'vue';
const message = ref('___Hello Vue Script___');
</script>
`;
      const tempFile = createTempFile(input, ".vue");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, { ...baseOptions, extractedCommentType: "line" });

      expect(result.code).toContain("const message = ref(t(\"Hello Vue Script\")");
      expect(result.code).toContain("// Hello Vue Script");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Hello Vue Script");
    });

    it("should add block comment in script setup", () => {
      const input = `
<script setup>
import { ref } from 'vue';
const message = ref('___Hello Vue Script Block___');
</script>
`;
      const tempFile = createTempFile(input, ".vue");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, { ...baseOptions, extractedCommentType: "block" });

      expect(result.code).toContain("const message = ref(t(\"Hello Vue Script Block\")");
      expect(result.code).toContain("/* Hello Vue Script Block */");
      expect(result.extractedStrings).toHaveLength(1);
      expect(result.extractedStrings[0].value).toBe("Hello Vue Script Block");
    });

    it("should handle both template and script replacements with comments", () => {
      const input = `
<template>
  <p>___Static Vue Text___</p>
</template>
<script setup>
import { ref } from 'vue';
const dynamicText = ref('___Dynamic Vue Text___');
</script>
`;
      const tempFile = createTempFile(input, ".vue");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, { ...baseOptions, extractedCommentType: "line" });

      expect(result.code).toContain("{{ t(\"Static Vue Text\") }}");
      expect(result.code).toContain("<!-- Static Vue Text -->");
      expect(result.code).toContain("const dynamicText = ref(t(\"Dynamic Vue Text\"));");
      expect(result.code).toContain("// Dynamic Vue Text");
      expect(result.extractedStrings).toHaveLength(2);
    });

    it("should not add comments for Vue when appendExtractedComment is false", () => {
      const input = `
<template>
  <div>___No Comment Vue___</div>
</template>
<script setup>
const text = '___No Comment Script___';
</script>
`;
      const tempFile = createTempFile(input, ".vue");
      tempFiles.push(tempFile);

      const result = transformCode(tempFile, { ...baseOptions, appendExtractedComment: false });

      expect(result.code).toContain("{{ t(\"No Comment Vue\") }}");
      expect(result.code).toContain("const text = t(\"No Comment Script\");");
      expect(result.code).not.toContain("<!--");
      expect(result.code).not.toContain("//");
      expect(result.code).not.toContain("/*");
      expect(result.extractedStrings).toHaveLength(2);
    });
  });
});
