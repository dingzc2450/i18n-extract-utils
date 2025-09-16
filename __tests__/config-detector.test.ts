import { expect, test, describe } from "vitest";
import { ConfigDetector } from "../src/config/config-detector";

describe("ConfigDetector Tests", () => {
  describe("existingTranslations deprecation warning", () => {
    test("should warn when existingTranslations is used", () => {
      const userOptions = {
        existingTranslations: {
          key1: "value1",
          key2: "value2",
        },
      };

      const report = ConfigDetector.generateConfigReport(userOptions);

      expect(report.details.validation.warnings).toContain(
        "existingTranslations 已废弃，请使用 existingTranslationsConfig 代替"
      );
    });

    test("should warn when both existingTranslations and existingTranslationsConfig are used", () => {
      const userOptions = {
        existingTranslations: {
          key1: "value1",
        },
        existingTranslationsConfig: {
          source: {
            key2: "value2",
          },
        },
      };

      const report = ConfigDetector.generateConfigReport(userOptions);

      expect(report.details.compatibility.issues).toContain(
        "同时使用了旧配置 existingTranslations 和新配置 existingTranslationsConfig"
      );

      expect(report.details.compatibility.suggestions).toContain(
        "建议使用新配置 existingTranslationsConfig 并移除旧配置 existingTranslations"
      );
    });

    test("should not warn when only existingTranslationsConfig is used", () => {
      const userOptions = {
        existingTranslationsConfig: {
          source: {
            key1: "value1",
            key2: "value2",
          },
        },
      };

      const report = ConfigDetector.generateConfigReport(userOptions);

      // Should not contain any existingTranslations warnings
      expect(report.details.validation.warnings).not.toContain(
        "existingTranslations 已废弃，请使用 existingTranslationsConfig 代替"
      );

      expect(report.details.compatibility.issues).not.toContain(
        "同时使用了旧配置 existingTranslations 和新配置 existingTranslationsConfig"
      );
    });
  });
});
