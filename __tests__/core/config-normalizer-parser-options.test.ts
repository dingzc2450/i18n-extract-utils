import { expect, test, describe } from "vitest";
import {
  normalizeConfig,
  CONFIG_DEFAULTS,
} from "../../src/core/config-normalizer";
import type { TransformOptions, CustomParserOptions } from "../../src/types";
import type { ParserOptions } from "@babel/parser";

describe("Config Normalizer - ParserOptions", () => {
  describe("normalizeConfig with parserOptions", () => {
    test("should normalize empty parserOptions", () => {
      const options: TransformOptions = {
        parserOptions: {},
      };

      const normalized = normalizeConfig(options);

      expect(normalized.parserOptions).toBeDefined();
      expect(normalized.parserOptions.plugins).toEqual([]);
    });

    test("should normalize parserOptions with plugins", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx", "decorators-legacy"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalized = normalizeConfig(options);

      expect(normalized.parserOptions).toBeDefined();
      expect(normalized.parserOptions.plugins).toEqual([
        "typescript",
        "jsx",
        "decorators-legacy",
      ]);
    });

    test("should handle missing parserOptions", () => {
      const options: TransformOptions = {
        pattern: "___(.+?)___",
      };

      const normalized = normalizeConfig(options);

      expect(normalized.parserOptions).toBeDefined();
      expect(normalized.parserOptions.plugins).toEqual([]);
    });

    test("should handle parserOptions with undefined plugins", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: undefined,
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalized = normalizeConfig(options);

      expect(normalized.parserOptions).toBeDefined();
      expect(normalized.parserOptions.plugins).toEqual([]);
    });

    test("should preserve other configuration options when normalizing parserOptions", () => {
      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx"],
      };

      const options: TransformOptions = {
        pattern: "___(.+?)___",
        outputPath: "./custom-output.json",
        appendExtractedComment: true,
        extractedCommentType: "line",
        preserveFormatting: false,
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next",
          },
        },
        parserOptions: customParserOptions,
      };

      const normalized = normalizeConfig(options);

      // Check that parserOptions are normalized correctly
      expect(normalized.parserOptions.plugins).toEqual(["typescript", "jsx"]);

      // Check that other options are preserved
      expect(normalized.pattern).toBe("___(.+?)___");
      expect(normalized.outputPath).toBe("./custom-output.json");
      expect(normalized.appendExtractedComment).toBe(true);
      expect(normalized.extractedCommentType).toBe("line");
      expect(normalized.preserveFormatting).toBe(false);
      expect(normalized.normalizedI18nConfig.framework).toBe("react");
      expect(normalized.normalizedI18nConfig.i18nImport.name).toBe("t");
    });

    test("should apply default values when parserOptions is not provided", () => {
      const options: TransformOptions = {};

      const normalized = normalizeConfig(options);

      // Check default values
      expect(normalized.pattern).toBe(CONFIG_DEFAULTS.PATTERN);
      expect(normalized.outputPath).toBe(CONFIG_DEFAULTS.OUTPUT_PATH);
      expect(normalized.appendExtractedComment).toBe(
        CONFIG_DEFAULTS.APPEND_EXTRACTED_COMMENT
      );
      expect(normalized.extractedCommentType).toBe(
        CONFIG_DEFAULTS.EXTRACTED_COMMENT_TYPE
      );
      expect(normalized.preserveFormatting).toBe(
        CONFIG_DEFAULTS.PRESERVE_FORMATTING
      );
      expect(normalized.useASTTransform).toBe(
        CONFIG_DEFAULTS.USE_AST_TRANSFORM
      );

      // Check parserOptions default
      expect(normalized.parserOptions.plugins).toEqual([]);
    });

    test("should handle complex parserOptions with multiple plugins", () => {
      const complexPlugins: ParserOptions["plugins"] = [
        "typescript",
        "jsx",
        "decorators-legacy",
        "optionalChaining",
        "nullishCoalescingOperator",
        "classProperties",
        "classPrivateMethods",
      ];

      const customParserOptions: CustomParserOptions = {
        plugins: complexPlugins,
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalized = normalizeConfig(options);

      expect(normalized.parserOptions.plugins).toEqual(complexPlugins);
      expect(normalized.parserOptions.plugins).toHaveLength(7);
    });
  });

  describe("Type safety and validation", () => {
    test("should handle type-safe parserOptions", () => {
      // This test ensures TypeScript compilation passes with correct types
      const validParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx"] as const,
      };

      const options: TransformOptions = {
        parserOptions: validParserOptions,
      };

      const normalized = normalizeConfig(options);

      expect(normalized.parserOptions.plugins).toEqual(["typescript", "jsx"]);

      // Type assertion to ensure the structure is correct
      expect(typeof normalized.parserOptions).toBe("object");
      expect(Array.isArray(normalized.parserOptions.plugins)).toBe(true);
    });

    test("should maintain immutability of input options", () => {
      const originalPlugins = ["typescript", "jsx"] as ["typescript", "jsx"];
      const customParserOptions: CustomParserOptions = {
        plugins: originalPlugins,
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalized = normalizeConfig(options);

      // Ensure original options are not mutated
      expect(options.parserOptions?.plugins).toEqual(originalPlugins);
      expect(normalized.parserOptions.plugins).toEqual(originalPlugins);

      // Ensure they are different references (immutability)
      expect(normalized.parserOptions.plugins).not.toBe(originalPlugins);
    });
  });

  describe("Integration with framework detection", () => {
    test("should work with React framework detection", () => {
      const reactCode = `
        import React from 'react';
        function MyComponent() {
          return <div>Hello</div>;
        }
      `;

      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript", "jsx"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalized = normalizeConfig(options, reactCode, "test.tsx");

      expect(normalized.normalizedI18nConfig.framework).toBe("react");
      expect(normalized.parserOptions.plugins).toEqual(["typescript", "jsx"]);
    });

    test("should work with Vue framework detection", () => {
      const vueCode = `
        export default {
          name: 'MyComponent',
          template: '<div>Hello</div>'
        };
      `;

      const customParserOptions: CustomParserOptions = {
        plugins: ["typescript"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalized = normalizeConfig(options, vueCode, "test.vue");

      expect(normalized.normalizedI18nConfig.framework).toBe("vue");
      expect(normalized.parserOptions.plugins).toEqual(["typescript"]);
    });

    test("should work with React15 framework detection", () => {
      const react15Code = `
        var MyComponent = React.createClass({
          render: function() {
            return React.createElement('div', null, 'Hello');
          }
        });
      `;

      const customParserOptions: CustomParserOptions = {
        plugins: ["jsx"],
      };

      const options: TransformOptions = {
        parserOptions: customParserOptions,
      };

      const normalized = normalizeConfig(options, react15Code, "test.js");

      expect(normalized.normalizedI18nConfig.framework).toBe("react15");
      expect(normalized.parserOptions.plugins).toEqual(["jsx"]);
    });
  });
});
