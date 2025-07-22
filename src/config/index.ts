/**
 * 配置系统使用示例和文档
 * 演示如何使用新的配置管理系统
 */

import { TransformOptions } from "../types";
import { resolveConfig, ResolvedConfig } from "../config/config-manager";
import { ConfigAdapter } from "../config/config-adapter";
import { CoreProcessor } from "../core/processor";

/**
 * 新的统一处理器 - 使用配置管理系统
 */
export class EnhancedProcessor {
  private coreProcessor = new CoreProcessor();

  /**
   * 处理代码的主入口
   * 自动解析配置，提供完全配置好的内部处理
   */
  processCode(
    code: string,
    filePath: string,
    userOptions: TransformOptions = {},
    existingValueToKey?: Map<string, string | number>
  ) {
    // 配置解析在这里进行，内部组件只使用解析后的配置
    const config = resolveConfig(userOptions);
    
    // CoreProcessor 现在使用的是解析后的完整配置
    return this.coreProcessor.processCode(
      code,
      filePath,
      userOptions, // 传递原始选项，内部会重新解析
      existingValueToKey
    );
  }

  /**
   * 获取解析后的配置（用于调试或高级用途）
   */
  getResolvedConfig(userOptions: TransformOptions): ResolvedConfig {
    return resolveConfig(userOptions);
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
      const config = resolveConfig(userOptions);

      // 基本验证
      if (!config.pattern) {
        errors.push("Pattern is required");
      }

      if (!config.outputPath) {
        errors.push("Output path is required");
      }

      if (!config.i18nConfig.i18nImport.source) {
        errors.push("i18n import source is required");
      }

      // 框架特定验证
      if (config.i18nConfig.framework === "react" && !config.i18nConfig.i18nImport.importName) {
        warnings.push("React hook name not specified, using default 'useTranslation'");
      }

      // 废弃配置警告
      if (config._legacyTranslationMethod) {
        warnings.push("translationMethod is deprecated, use i18nConfig.i18nImport.name instead");
      }

      if (config._legacyHookName) {
        warnings.push("hookName is deprecated, use i18nConfig.i18nImport.importName instead");
      }

      if (config._legacyHookImport) {
        warnings.push("hookImport is deprecated, use i18nConfig.i18nImport.source instead");
      }

    } catch (error) {
      errors.push(`Configuration error: ${error instanceof Error ? error.message : String(error)}`);
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
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
        },
      },
      pattern: "___(.*?)___",
      outputPath: "./src/locales",
      appendExtractedComment: true,
      extractedCommentType: "line",
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
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
      pattern: "___(.*?)___",
      outputPath: "./src/locales",
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
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
        },
        nonReactConfig: {
          functionName: "t",
          importType: "named",
          source: "react-i18next",
        },
      },
      pattern: "___(.*?)___",
      outputPath: "./src/locales",
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
        const fileName = filePath.split('/').pop()?.replace(/\.(tsx?|jsx?)$/, '') || 'unknown';
        return `${fileName}.${value.toLowerCase().replace(/\s+/g, '_')}`;
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
export { resolveConfig, ConfigAdapter, ResolvedConfig };
export const processor = new EnhancedProcessor();
