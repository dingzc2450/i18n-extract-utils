/**
 * 配置适配器 - 为了保持向后兼容性
 * 提供统一的接口，让现有代码可以无缝使用新的配置系统
 */

import { TransformOptions } from "../types";
import { ResolvedConfig, resolveConfig } from "./config-manager";

/**
 * 配置适配器类
 * 提供统一的接口来处理配置，无论输入是什么格式
 */
export class ConfigAdapter {
  
  /**
   * 统一的配置获取方法
   * 无论输入是 TransformOptions 还是 ResolvedConfig，都返回 ResolvedConfig
   */
  static normalize(
    options: TransformOptions | ResolvedConfig,
    detectedFramework?: string
  ): ResolvedConfig {
    // 如果已经是 ResolvedConfig，直接返回
    if (this.isResolvedConfig(options)) {
      return options as ResolvedConfig;
    }

    // 否则解析为 ResolvedConfig
    return resolveConfig(options as TransformOptions, detectedFramework);
  }

  /**
   * 判断是否为 ResolvedConfig
   */
  static isResolvedConfig(options: any): boolean {
    return options && 
           typeof options === 'object' &&
           'i18nConfig' in options &&
           typeof options.i18nConfig === 'object' &&
           'framework' in options.i18nConfig &&
           typeof options.pattern === 'string' &&
           typeof options.outputPath === 'string' &&
           typeof options.appendExtractedComment === 'boolean';
  }

  /**
   * 从 ResolvedConfig 提取向后兼容的 TransformOptions
   * 用于需要传递给旧接口的场景
   */
  static toTransformOptions(config: ResolvedConfig): TransformOptions {
    return {
      pattern: config.pattern,
      outputPath: config.outputPath,
      appendExtractedComment: config.appendExtractedComment,
      extractedCommentType: config.extractedCommentType,
      preserveFormatting: config.preserveFormatting,
      useASTTransform: config.useASTTransform,
      generateKey: config.generateKey,
      existingTranslations: config.existingTranslations,
      i18nConfig: {
        framework: config.i18nConfig.framework,
        i18nImport: config.i18nConfig.i18nImport,
        nonReactConfig: config.i18nConfig.nonReactConfig,
        i18nCall: config.i18nConfig.i18nCall,
      },
      // 向后兼容的废弃字段
      translationMethod: config._legacyTranslationMethod,
      hookName: config._legacyHookName,
      hookImport: config._legacyHookImport,
    };
  }

  /**
   * 安全地获取翻译方法名
   */
  static getTranslationMethod(config: ResolvedConfig): string {
    return config.i18nConfig.i18nImport.name;
  }

  /**
   * 安全地获取Hook名称（如果存在）
   */
  static getHookName(config: ResolvedConfig): string | undefined {
    return config.i18nConfig.i18nImport.importName;
  }

  /**
   * 安全地获取导入源
   */
  static getImportSource(config: ResolvedConfig): string {
    return config.i18nConfig.i18nImport.source;
  }

  /**
   * 安全地获取框架类型
   */
  static getFramework(config: ResolvedConfig): string {
    return config.i18nConfig.framework;
  }

  /**
   * 检查是否为非 React 配置
   */
  static isNonReactConfig(config: ResolvedConfig): boolean {
    return !!config.i18nConfig.nonReactConfig;
  }

  /**
   * 获取非 React 配置（如果存在）
   */
  static getNonReactConfig(config: ResolvedConfig) {
    return config.i18nConfig.nonReactConfig;
  }
}
