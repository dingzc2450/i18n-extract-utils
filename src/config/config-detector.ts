/**
 * 配置检测工具 - 专门用于配置验证和问题诊断
 * 不修改用户传入的配置，只进行验证和报告问题
 */

import type { TransformOptions } from "../types";
import { normalizeConfig } from "../core/config-normalizer";

/**
 * 配置检测工具类
 * 专门负责配置的验证、检查和问题报告
 */
export class ConfigDetector {
  /**
   * 验证配置是否有效
   * 不会修改原配置，只返回验证结果
   */
  static validateConfig(userOptions: TransformOptions): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // 使用normalizeConfig进行配置规范化，但不修改原配置
      const normalizedConfig = normalizeConfig(userOptions);

      // 基本验证
      if (!normalizedConfig.pattern) {
        errors.push("缺少必要的匹配模式 (pattern)");
      }

      if (!normalizedConfig.outputPath) {
        errors.push("缺少必要的输出路径 (outputPath)");
      }

      if (!normalizedConfig.normalizedI18nConfig.i18nImport.source) {
        errors.push("缺少必要的 i18n 导入源 (i18nImport.source)");
      }

      // 框架特定验证
      if (
        normalizedConfig.normalizedI18nConfig.framework === "react" &&
        !normalizedConfig.normalizedI18nConfig.i18nImport.importName
      ) {
        warnings.push(
          "React 框架下未指定 hook 名称，将使用默认值 'useTranslation'"
        );
      }

      // 废弃配置警告
      if (userOptions.translationMethod) {
        warnings.push(
          "translationMethod 已废弃，请使用 i18nConfig.i18nImport.name 代替"
        );
      }

      if (userOptions.hookName) {
        warnings.push(
          "hookName 已废弃，请使用 i18nConfig.i18nImport.importName 代替"
        );
      }

      if (userOptions.hookImport) {
        warnings.push(
          "hookImport 已废弃，请使用 i18nConfig.i18nImport.source 代替"
        );
      }
    } catch (error) {
      errors.push(
        `配置验证错误: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * 检查配置兼容性
   * 检查新旧配置的兼容性问题
   */
  static checkConfigCompatibility(userOptions: TransformOptions): {
    compatible: boolean;
    issues: string[];
    suggestions: string[];
  } {
    const issues: string[] = [];
    const suggestions: string[] = [];

    // 检查旧配置与新配置的冲突
    if (
      userOptions.translationMethod &&
      userOptions.i18nConfig?.i18nImport?.name
    ) {
      issues.push(
        "同时使用了旧配置 translationMethod 和新配置 i18nConfig.i18nImport.name"
      );
      suggestions.push("建议使用新配置并移除旧配置");
    }

    if (
      userOptions.hookName &&
      userOptions.i18nConfig?.i18nImport?.importName
    ) {
      issues.push(
        "同时使用了旧配置 hookName 和新配置 i18nConfig.i18nImport.importName"
      );
      suggestions.push("建议使用新配置并移除旧配置");
    }

    if (userOptions.hookImport && userOptions.i18nConfig?.i18nImport?.source) {
      issues.push(
        "同时使用了旧配置 hookImport 和新配置 i18nConfig.i18nImport.source"
      );
      suggestions.push("建议使用新配置并移除旧配置");
    }

    // 检查框架配置的一致性
    if (
      userOptions.i18nConfig?.framework &&
      userOptions.i18nConfig.nonReactConfig
    ) {
      const framework = userOptions.i18nConfig.framework;
      if (framework === "react" || framework === "react15") {
        suggestions.push("React 框架下通常不需要 nonReactConfig 配置");
      }
    }

    return {
      compatible: issues.length === 0,
      issues,
      suggestions,
    };
  }

  /**
   * 生成配置问题报告
   * 综合所有检查结果，生成友好的报告
   */
  static generateConfigReport(userOptions: TransformOptions): {
    summary: string;
    details: {
      validation: ReturnType<typeof ConfigDetector.validateConfig>;
      compatibility: ReturnType<typeof ConfigDetector.checkConfigCompatibility>;
    };
  } {
    const validation = ConfigDetector.validateConfig(userOptions);
    const compatibility = ConfigDetector.checkConfigCompatibility(userOptions);

    let summary = "配置检查结果: ";

    if (validation.valid && compatibility.compatible) {
      summary += "✅ 配置正常，没有发现问题";
    } else {
      const errorCount = validation.errors.length;
      const warningCount = validation.warnings.length;
      const issueCount = compatibility.issues.length;

      summary += `⚠️ 发现 ${errorCount} 个错误、${warningCount} 个警告、${issueCount} 个兼容性问题`;
    }

    return {
      summary,
      details: {
        validation,
        compatibility,
      },
    };
  }

  /**
   * 快速检查配置
   * 只返回最重要的问题，适用于快速验证
   */
  static quickCheck(userOptions: TransformOptions): {
    hasErrors: boolean;
    criticalErrors: string[];
  } {
    const validation = ConfigDetector.validateConfig(userOptions);

    return {
      hasErrors: validation.errors.length > 0,
      criticalErrors: validation.errors,
    };
  }
}
