/**
 * 配置系统使用示例和文档
 * 简化版配置系统，使用统一的config-normalizer
 */

import type { ExistingValueToKeyMapType, TransformOptions } from "../types";
import { CoreProcessor } from "../core/processor";
import type { NormalizedTransformOptions } from "../core/config-normalizer";
import { CONFIG_DEFAULTS, normalizeConfig } from "../core/config-normalizer";

/**
 * 统一处理器 - 使用简化的配置系统
 */
export class EnhancedProcessor {
  private coreProcessor = new CoreProcessor();

  /**
   * 处理代码的主入口
   * 自动规范化配置，提供完整的配置处理
   */
  processCode(
    code: string,
    filePath: string,
    userOptions: TransformOptions = {},
    existingValueToKeyMap?: ExistingValueToKeyMapType
  ) {
    // CoreProcessor 内部已经使用了normalizeConfig，直接传递即可
    return this.coreProcessor.processCode(
      code,
      filePath,
      userOptions,
      existingValueToKeyMap
    );
  }

  /**
   * 获取规范化后的配置（用于调试或高级用途）
   */
  getNormalizedConfig(
    userOptions: TransformOptions
  ): NormalizedTransformOptions {
    return normalizeConfig(userOptions);
  }

  /**
   * 检查配置是否有效
   */
  validateConfig(userOptions: TransformOptions): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 废弃配置警告
      if (userOptions.translationMethod) {
        warnings.push(
          "translationMethod is deprecated, use i18nConfig.i18nImport.name instead"
        );
      }

      if (userOptions.hookName) {
        warnings.push(
          "hookName is deprecated, use i18nConfig.i18nImport.importName instead"
        );
      }

      if (userOptions.hookImport) {
        warnings.push(
          "hookImport is deprecated, use i18nConfig.i18nImport.source instead"
        );
      }
    } catch (error) {
      errors.push(
        `Configuration error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

/**
 * 配置系统使用示例
 */
export class ConfigExamples {
  /**
   * React 项目配置示例
   */
  static getReactConfig(): TransformOptions {
    return {
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: CONFIG_DEFAULTS.TRANSLATION_METHOD,
          importName: CONFIG_DEFAULTS.HOOK_NAME,
          source: CONFIG_DEFAULTS.HOOK_SOURCE,
        },
      },
      pattern: CONFIG_DEFAULTS.PATTERN,
      outputPath: CONFIG_DEFAULTS.OUTPUT_PATH,
      appendExtractedComment: CONFIG_DEFAULTS.APPEND_EXTRACTED_COMMENT,
      extractedCommentType: CONFIG_DEFAULTS.EXTRACTED_COMMENT_TYPE as "line",
    };
  }

  /**
   * Vue 项目配置示例
   */
  static getVueConfig(): TransformOptions {
    return {
      i18nConfig: {
        framework: "vue",
        i18nImport: {
          name: CONFIG_DEFAULTS.VUE_TRANSLATION_METHOD,
          importName: CONFIG_DEFAULTS.VUE_HOOK_NAME,
          source: CONFIG_DEFAULTS.VUE_HOOK_SOURCE,
        },
      },
      pattern: CONFIG_DEFAULTS.PATTERN,
      outputPath: CONFIG_DEFAULTS.OUTPUT_PATH,
    };
  }

  /**
   * 混合项目配置示例（React + 非React代码）
   */
  static getMixedConfig(): TransformOptions {
    return {
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: CONFIG_DEFAULTS.TRANSLATION_METHOD,
          importName: CONFIG_DEFAULTS.HOOK_NAME,
          source: CONFIG_DEFAULTS.HOOK_SOURCE,
        },
        nonReactConfig: {
          functionName: CONFIG_DEFAULTS.NON_REACT_FUNCTION_NAME,
          importType: CONFIG_DEFAULTS.NON_REACT_IMPORT_TYPE as "named",
          source: CONFIG_DEFAULTS.HOOK_SOURCE,
        },
      },
      pattern: CONFIG_DEFAULTS.PATTERN,
      outputPath: CONFIG_DEFAULTS.OUTPUT_PATH,
    };
  }

  /**
   * 自定义配置示例
   */
  static getCustomConfig(): TransformOptions {
    return {
      i18nConfig: {
        framework: "react",
        i18nImport: {
          name: "t", // 必需字段
          source: "my-custom-i18n", // 必需字段
          custom: "import { translate as t } from 'my-custom-i18n'",
        },
      },
      pattern: "\\$\\{(.*?)\\}",
      outputPath: "./locales",
      generateKey: (value, filePath) => {
        // 自定义键生成逻辑
        const fileName =
          filePath
            .split("/")
            .pop()
            ?.replace(/\.(tsx?|jsx?)$/, "") || "unknown";
        return `${fileName}.${value.toLowerCase().replace(/\s+/g, "_")}`;
      },
    };
  }

  /**
   * 向后兼容的旧配置示例
   */
  static getLegacyConfig(): TransformOptions {
    return {
      translationMethod: "t",
      hookName: "useTranslation",
      hookImport: "react-i18next",
      pattern: "___(.*?)___",
      outputPath: "./src/locales",
    };
  }
}

/**
 * 导出新的推荐入口
 */
export {
  normalizeConfig,
  NormalizedTransformOptions,
  CONFIG_DEFAULTS,
} from "../core/config-normalizer";
export const processor = new EnhancedProcessor();
