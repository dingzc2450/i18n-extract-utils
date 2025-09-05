import { expect, test, describe } from "vitest";
import { ASTParserUtils } from "../../src/core/utils";
import { normalizeConfig } from "../../src/core/config-normalizer";
import type { TransformOptions, CustomParserOptions } from "../../src/types";
import type { ParserOptions } from "@babel/parser";

describe("ASTParserUtils - ParserOptions Support", () => {
  describe("getParserConfigFromOptions", () => {
    test("should merge default plugins with user custom plugins", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: ["optional-chaining", "nullish-coalescing-operator"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.tsx";

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions
      );

      expect(config.plugins).toContain("decorators-legacy"); // Default plugin
      expect(config.plugins).toContain("typescript"); // Default for .tsx
      expect(config.plugins).toContain("jsx"); // Default for .tsx
      expect(config.plugins).toContain("optional-chaining"); // Custom plugin
      expect(config.plugins).toContain("nullish-coalescing-operator"); // Custom plugin
    });

    test("should deduplicate plugins when user provides existing defaults", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: [
          "typescript",
          "jsx",
          "decorators-legacy",
          "optional-chaining",
        ],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.tsx";

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions
      );

      // Count occurrences of each plugin
      const pluginCounts =
        config.plugins?.reduce(
          (acc, plugin) => {
            acc[plugin] = (acc[plugin] || 0) + 1;
            return acc;
          },
          {} as Record<string, number>
        ) || {};

      // Each plugin should appear only once
      expect(pluginCounts["typescript"]).toBe(1);
      expect(pluginCounts["jsx"]).toBe(1);
      expect(pluginCounts["decorators-legacy"]).toBe(1);
      expect(pluginCounts["optional-chaining"]).toBe(1);
    });

    test("should work with empty custom plugins", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: [],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.tsx";

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions
      );

      // Should still have default plugins
      expect(config.plugins).toContain("decorators-legacy");
      expect(config.plugins).toContain("typescript");
      expect(config.plugins).toContain("jsx");
    });

    test("should work with no custom plugins specified", () => {
      const options: TransformOptions = {};

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.tsx";

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions
      );

      // Should have default plugins only
      expect(config.plugins).toContain("decorators-legacy");
      expect(config.plugins).toContain("typescript");
      expect(config.plugins).toContain("jsx");
    });

    test("should handle additional plugins parameter", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: ["optional-chaining"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.tsx";
      const additionalPlugins: ParserOptions["plugins"] = ["class-properties"];

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions,
        additionalPlugins
      );

      expect(config.plugins).toContain("decorators-legacy"); // Default
      expect(config.plugins).toContain("typescript"); // Default for .tsx
      expect(config.plugins).toContain("jsx"); // Default for .tsx
      expect(config.plugins).toContain("optional-chaining"); // Custom
      expect(config.plugins).toContain("class-properties"); // Additional
    });

    test("should preserve other parser config properties", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.ts";

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions
      );

      expect(config.sourceType).toBe("module");
      expect(config.strictMode).toBe(false);
      expect(Array.isArray(config.plugins)).toBe(true);
    });
  });

  describe("parseCodeWithOptions", () => {
    test("should parse code with custom plugins", () => {
      const code = `
        import React from 'react';
        
        function MyComponent() {
          const value = obj?.property ?? 'default';
          return <div>{value}</div>;
        }
      `;

      const customParserOptions: CustomParserOptions = {
        plugins: ["optional-chaining", "nullish-coalescing-operator"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.tsx";

      expect(() => {
        const ast = ASTParserUtils.parseCodeWithOptions(
          code,
          filePath,
          normalizedOptions
        );
        expect(ast).toBeDefined();
        expect(ast.type).toBe("File");
      }).not.toThrow();
    });

    test("should parse TypeScript code with custom plugins", () => {
      const code = `
        import React from 'react';
        
        interface Props {
          title: string;
          optional?: boolean;
        }
        
        function MyComponent({ title, optional }: Props) {
          return <div title={title}>{optional && 'Optional content'}</div>;
        }
      `;

      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.tsx";

      expect(() => {
        const ast = ASTParserUtils.parseCodeWithOptions(
          code,
          filePath,
          normalizedOptions
        );
        expect(ast).toBeDefined();
        expect(ast.type).toBe("File");
      }).not.toThrow();
    });

    test("should work with additional plugins parameter", () => {
      const code = `
        class MyClass {
          private value = 'test';
          
          getValue() {
            return this.value;
          }
        }
      `;

      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.ts";
      const additionalPlugins: ParserOptions["plugins"] = [
        "class-properties",
        "private-methods",
      ];

      expect(() => {
        const ast = ASTParserUtils.parseCodeWithOptions(
          code,
          filePath,
          normalizedOptions,
          additionalPlugins
        );
        expect(ast).toBeDefined();
        expect(ast.type).toBe("File");
      }).not.toThrow();
    });
  });

  describe("File type specific behavior", () => {
    test("should handle .js files with custom plugins", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: ["optional-chaining"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.js";

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions
      );

      expect(config.plugins).toContain("decorators-legacy"); // Default
      expect(config.plugins).toContain("optional-chaining"); // Custom
      expect(config.plugins).not.toContain("typescript"); // Should not have TS for .js
    });

    test("should handle .jsx files with custom plugins", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: ["class-properties"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.jsx";

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions
      );

      expect(config.plugins).toContain("decorators-legacy"); // Default
      expect(config.plugins).toContain("jsx"); // Default for .jsx
      expect(config.plugins).toContain("class-properties"); // Custom
      expect(config.plugins).not.toContain("typescript"); // Should not have TS for .jsx
    });

    test("should handle .ts files with custom plugins", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: ["nullish-coalescing-operator"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.ts";

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions
      );

      expect(config.plugins).toContain("decorators-legacy"); // Default
      expect(config.plugins).toContain("typescript"); // Default for .ts
      expect(config.plugins).toContain("nullish-coalescing-operator"); // Custom
      expect(config.plugins).not.toContain("jsx"); // Should not have JSX for .ts
    });

    test("should handle .vue files with custom plugins", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: ["optional-chaining"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalizedOptions = normalizeConfig(options);
      const filePath = "test.vue";

      const config = ASTParserUtils.getParserConfigFromOptions(
        filePath,
        normalizedOptions
      );

      expect(config.plugins).toContain("decorators-legacy"); // Default
      expect(config.plugins).toContain("typescript"); // Default for .vue
      expect(config.plugins).toContain("jsx"); // Default for .vue
      expect(config.plugins).toContain("optional-chaining"); // Custom
    });
  });
});
