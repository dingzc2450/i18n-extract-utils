/**
 * 配置管理器 - 统一处理用户配置和默认值
 * 将用户传递的原始options与内部使用的配置完全分离
 */

import { TransformOptions, I18nConfig, I18nImportConfig, NonReactI18nConfig } from "../types";

/**
 * 完整的内部配置接口 - 所有配置项都有默认值
 */
export interface ResolvedConfig {
  // 基础配置
  pattern: string;
  outputPath: string;
  appendExtractedComment: boolean;
  extractedCommentType: "block" | "line";
  preserveFormatting: boolean;
  useASTTransform: boolean;

  // i18n 配置 - 已处理好的完整配置
  i18nConfig: ResolvedI18nConfig;

  // 可选配置（保持原样）
  generateKey?: (value: string, filePath: string) => string | number;
  existingTranslations?: string | Record<string, string | number>;

  // 向后兼容的废弃配置（仅内部使用，外部不暴露）
  _legacyTranslationMethod?: string;
  _legacyHookName?: string;
  _legacyHookImport?: string;
}

/**
 * 已解析的完整 i18n 配置
 */
export interface ResolvedI18nConfig {
  framework: "react" | "react15" | "vue" | "vue2" | "vue3";
  i18nImport: ResolvedI18nImportConfig;
  nonReactConfig?: ResolvedNonReactI18nConfig;
  i18nCall?: I18nConfig["i18nCall"];
}

/**
 * 已解析的 i18n 导入配置
 */
export interface ResolvedI18nImportConfig {
  name: string;
  source: string;
  importName?: string;
  custom?: string;
}

/**
 * 已解析的非 React 配置
 */
export interface ResolvedNonReactI18nConfig {
  functionName: string;
  importType: 'default' | 'named' | 'namespace';
  source: string;
  namespace: string;
  customImport?: string;
}

/**
 * 配置管理器类
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private configCache = new Map<string, ResolvedConfig>();

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  /**
   * 解析用户配置，返回完整的内部配置
   * @param userOptions 用户传递的原始配置
   * @param detectedFramework 自动检测的框架类型（可选）
   * @returns 完整的内部配置
   */
  resolveConfig(
    userOptions: TransformOptions = {},
    detectedFramework?: string
  ): ResolvedConfig {
    // 如果配置包含函数，不使用缓存
    const hasFunctions = userOptions.generateKey ||
                        userOptions.existingTranslations ||
                        userOptions.i18nConfig?.i18nCall;
    
    if (!hasFunctions) {
      // 生成配置的缓存键
      const cacheKey = this.generateCacheKey(userOptions, detectedFramework);
      
      // 检查缓存
      if (this.configCache.has(cacheKey)) {
        return this.configCache.get(cacheKey)!;
      }
    }

    // 解析配置
    const resolvedConfig = this.buildResolvedConfig(userOptions, detectedFramework);

    // 只有在没有函数的情况下才缓存配置
    if (!hasFunctions) {
      const cacheKey = this.generateCacheKey(userOptions, detectedFramework);
      this.configCache.set(cacheKey, resolvedConfig);
    }

    return resolvedConfig;
  }

  /**
   * 清除配置缓存
   */
  clearCache(): void {
    this.configCache.clear();
  }

  /**
   * 构建完整的解析配置
   */
  private buildResolvedConfig(
    userOptions: TransformOptions,
    detectedFramework?: string
  ): ResolvedConfig {
    // 1. 确定框架类型
    const framework = this.resolveFramework(userOptions, detectedFramework);

    // 2. 获取框架默认配置
    const frameworkDefaults = this.getFrameworkDefaults(framework);

    // 3. 解析 i18n 配置
    const i18nConfig = this.resolveI18nConfig(userOptions, frameworkDefaults, framework);

    // 4. 构建完整配置
    const resolvedConfig: ResolvedConfig = {
      // 基础配置 - 设置默认值（正确处理正则表达式）
      pattern: userOptions.pattern !== undefined ? userOptions.pattern : "___([\\\s\\\S]+?)___",
      outputPath: userOptions.outputPath || "./locales",
      appendExtractedComment: userOptions.appendExtractedComment ?? false,
      extractedCommentType: userOptions.extractedCommentType || "block",
      preserveFormatting: userOptions.preserveFormatting ?? false,
      useASTTransform: userOptions.useASTTransform ?? false,

      // i18n 配置
      i18nConfig,

      // 可选配置（保持原样）
      generateKey: userOptions.generateKey,
      existingTranslations: userOptions.existingTranslations,

      // 向后兼容的废弃配置
      _legacyTranslationMethod: userOptions.translationMethod,
      _legacyHookName: userOptions.hookName,
      _legacyHookImport: userOptions.hookImport,
    };

    return resolvedConfig;
  }

  /**
   * 确定框架类型
   */
  private resolveFramework(
    userOptions: TransformOptions,
    detectedFramework?: string
  ): "react" | "react15" | "vue" | "vue2" | "vue3" {
    // 用户明确指定的框架优先级最高
    if (userOptions.i18nConfig?.framework) {
      return userOptions.i18nConfig.framework;
    }

    // 根据旧配置推断框架
    if (userOptions.hookName || userOptions.hookImport || userOptions.translationMethod) {
      return "react"; // 默认为 React
    }

    // 使用检测到的框架
    if (detectedFramework) {
      return detectedFramework as any;
    }

    // 默认为 React
    return "react";
  }

  /**
   * 获取框架默认配置
   */
  private getFrameworkDefaults(framework: string): Partial<I18nConfig> {
    const defaults: Record<string, Partial<I18nConfig>> = {
      react: {
        framework: "react",
        i18nImport: {
          name: "t",
          importName: "useTranslation",
          source: "react-i18next",
        },
      },
      react15: {
        framework: "react15",
        i18nImport: {
          name: "t",
          source: "i18n",
        },
      },
      vue: {
        framework: "vue",
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
      vue2: {
        framework: "vue2",
        i18nImport: {
          name: "$t",
          source: "vue-i18n",
        },
      },
      vue3: {
        framework: "vue3",
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
        },
      },
    };

    return defaults[framework] || defaults.react;
  }

  /**
   * 解析 i18n 配置
   */
  private resolveI18nConfig(
    userOptions: TransformOptions,
    frameworkDefaults: Partial<I18nConfig>,
    framework: string
  ): ResolvedI18nConfig {
    // 合并用户配置和框架默认配置
    const mergedConfig = this.mergeI18nConfig(userOptions, frameworkDefaults);

    // 解析 i18nImport 配置
    const i18nImport = this.resolveI18nImportConfig(mergedConfig.i18nImport!);

    // 解析 nonReactConfig（如果存在）
    const nonReactConfig = mergedConfig.nonReactConfig 
      ? this.resolveNonReactConfig(mergedConfig.nonReactConfig)
      : undefined;

    return {
      framework: framework as any,
      i18nImport,
      nonReactConfig,
      i18nCall: mergedConfig.i18nCall,
    };
  }

  /**
   * 合并 i18n 配置
   */
  private mergeI18nConfig(
    userOptions: TransformOptions,
    frameworkDefaults: Partial<I18nConfig>
  ): I18nConfig {
    // 处理向后兼容的旧配置
    const legacyI18nImport = this.convertLegacyToI18nImport(userOptions);

    // 合并配置的优先级：用户的 i18nConfig > 旧配置转换 > 框架默认值
    // 确保必需的字段有默认值
    const baseI18nImport = frameworkDefaults.i18nImport;
    const mergedI18nImport: I18nImportConfig = {
      name: userOptions.i18nConfig?.i18nImport?.name || 
            legacyI18nImport.name || 
            baseI18nImport?.name || 
            "t",
      source: userOptions.i18nConfig?.i18nImport?.source || 
              legacyI18nImport.source || 
              baseI18nImport?.source || 
              "react-i18next",
      importName: userOptions.i18nConfig?.i18nImport?.importName || 
                  legacyI18nImport.importName || 
                  baseI18nImport?.importName,
      custom: userOptions.i18nConfig?.i18nImport?.custom || 
              legacyI18nImport.custom || 
              baseI18nImport?.custom,
    };

    return {
      framework: userOptions.i18nConfig?.framework || frameworkDefaults.framework || "react",
      i18nImport: mergedI18nImport,
      nonReactConfig: userOptions.i18nConfig?.nonReactConfig,
      i18nCall: userOptions.i18nConfig?.i18nCall,
    };
  }

  /**
   * 将旧配置转换为新的 i18nImport 配置
   */
  private convertLegacyToI18nImport(userOptions: TransformOptions): Partial<I18nImportConfig> {
    const legacyConfig: Partial<I18nImportConfig> = {};

    if (userOptions.translationMethod) {
      legacyConfig.name = userOptions.translationMethod;
    }

    if (userOptions.hookName) {
      legacyConfig.importName = userOptions.hookName;
    }

    if (userOptions.hookImport) {
      legacyConfig.source = userOptions.hookImport;
    }

    return legacyConfig;
  }

  /**
   * 解析 i18nImport 配置，确保所有必需的字段都有默认值
   */
  private resolveI18nImportConfig(config: I18nImportConfig): ResolvedI18nImportConfig {
    return {
      name: config.name || "t",
      source: config.source || "react-i18next",
      importName: config.importName,
      custom: config.custom,
    };
  }

  /**
   * 解析 nonReactConfig，确保所有字段都有默认值
   */
  private resolveNonReactConfig(config: NonReactI18nConfig): ResolvedNonReactI18nConfig {
    return {
      functionName: config.functionName || "t",
      importType: config.importType || "named",
      source: config.source || "i18n",
      namespace: config.namespace || "i18n",
      customImport: config.customImport,
    };
  }

  /**
   * 生成配置的缓存键
   */
  private generateCacheKey(userOptions: TransformOptions, detectedFramework?: string): string {
    // 创建一个稳定的配置表示用于缓存
    const keyData = {
      pattern: userOptions.pattern,
      outputPath: userOptions.outputPath,
      appendExtractedComment: userOptions.appendExtractedComment,
      extractedCommentType: userOptions.extractedCommentType,
      preserveFormatting: userOptions.preserveFormatting,
      useASTTransform: userOptions.useASTTransform,
      i18nConfig: userOptions.i18nConfig,
      translationMethod: userOptions.translationMethod,
      hookName: userOptions.hookName,
      hookImport: userOptions.hookImport,
      // 为函数字段添加特殊处理
      hasGenerateKey: !!userOptions.generateKey,
      hasExistingTranslations: !!userOptions.existingTranslations,
      hasI18nCall: !!userOptions.i18nConfig?.i18nCall,
      detectedFramework,
    };

    return JSON.stringify(keyData);
  }
}

/**
 * 便捷函数：解析用户配置
 */
export function resolveConfig(
  userOptions: TransformOptions = {},
  detectedFramework?: string
): ResolvedConfig {
  return ConfigManager.getInstance().resolveConfig(userOptions, detectedFramework);
}

/**
 * 便捷函数：清除配置缓存
 */
export function clearConfigCache(): void {
  ConfigManager.getInstance().clearCache();
}
