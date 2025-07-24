/**
 * 配置代理 - 保持原有CoreProcessor不变，只是在外层提供配置管理
 * 这是一个更安全的重构方式
 */

import { TransformOptions } from "../types";
import {
  normalizeConfig,
  CONFIG_DEFAULTS,
  NormalizedTransformOptions,
} from "../core/config-normalizer";

/**
 * 配置代理类 - 包装原有功能，添加配置管理
 */
export class ConfigProxy {
  /**
   * 预处理用户选项，确保所有必需的配置都有默认值
   */
  static preprocessOptions(
    userOptions: TransformOptions = {},
    code?: string,
    filePath?: string
  ): TransformOptions &
    Pick<NormalizedTransformOptions, "normalizedI18nConfig"> {
    // 如果提供了代码和文件路径，进行框架检测
  
    let detectedFramework: string | undefined;
    if (code && filePath && !userOptions.i18nConfig?.framework) {
      // 只有在用户没有明确指定framework时才进行自动检测
      // 简单的内联框架检测逻辑，避免模块依赖问题
      detectedFramework = this.simpleDetectFramework(code, filePath);

      // 如果检测到了框架，但用户没有指定，就添加到配置中
      if (detectedFramework) {
        userOptions = {
          ...userOptions,
          i18nConfig: {
            ...userOptions.i18nConfig,
            framework: detectedFramework as
              | "react"
              | "react15"
              | "vue"
              | "vue2"
              | "vue3",
          },
        };
      }
    }

    // 应用框架特定的默认配置
    let userOptionsWithDefault = this.applyFrameworkDefaults(userOptions);

    // 使用新的配置规范化模块处理配置
    const normalizedConfig = normalizeConfig(userOptionsWithDefault);

    // 返回完整的配置
    return {
      ...userOptions,
      normalizedI18nConfig: normalizedConfig.normalizedI18nConfig,
      pattern: normalizedConfig.pattern,
      outputPath: normalizedConfig.outputPath,
      appendExtractedComment: normalizedConfig.appendExtractedComment,
      extractedCommentType: normalizedConfig.extractedCommentType,
      preserveFormatting: normalizedConfig.preserveFormatting,
      useASTTransform: normalizedConfig.useASTTransform,
      i18nConfig: {
        framework: normalizedConfig.normalizedI18nConfig.framework as
          | "react"
          | "react15"
          | "vue"
          | "vue3"
          | "vue2",
        i18nImport: normalizedConfig.normalizedI18nConfig.i18nImport,
        nonReactConfig: normalizedConfig.normalizedI18nConfig.nonReactConfig,
      },
    };
  }

  /**
   * 应用框架特定的默认配置
   */
  private static applyFrameworkDefaults(
    userOptions: TransformOptions
  ): TransformOptions {
    const framework = userOptions.i18nConfig?.framework;

    if (!framework) {
      return userOptions;
    }
    const cloneUserOptions = { ...userOptions };

    // React15 特定默认配置
    if (framework === "react15") {

      // 确保 i18nConfig 存在
      if (!cloneUserOptions.i18nConfig) {
        cloneUserOptions.i18nConfig = {};
      }

      // 设置React15的默认i18n导入配置
      cloneUserOptions.i18nConfig = {
        ...cloneUserOptions.i18nConfig,
        framework: "react15",
        i18nImport: {
          name: "t",
          source: "i18n",
          ...(cloneUserOptions.i18nConfig.i18nImport || {}),
        },
      };

      // 如果用户没有明确指定source，强制使用i18n
      if (!cloneUserOptions.i18nConfig.i18nImport?.source) {
        if (!cloneUserOptions.i18nConfig.i18nImport) {
          cloneUserOptions.i18nConfig.i18nImport = {
            name: "t",
            source: "i18n",
          };
        } else {
          cloneUserOptions.i18nConfig.i18nImport.source = "i18n";
        }
      }
    }

    // Vue 特定默认配置
    if (framework === "vue" || framework === "vue2" || framework === "vue3") {

      // 确保 i18nConfig 存在
      if (!cloneUserOptions.i18nConfig) {
        cloneUserOptions.i18nConfig = {};
      }

      // 设置Vue的默认i18n导入配置
      cloneUserOptions.i18nConfig = {
        ...cloneUserOptions.i18nConfig,
        i18nImport: {
          name: "t",
          importName: "useI18n",
          source: "vue-i18n",
          ...(cloneUserOptions.i18nConfig.i18nImport || {}),
        },
      };
    }

    return cloneUserOptions;
  }

  /**
   * 简单的框架检测逻辑（内联实现，避免循环依赖）
   */
  private static simpleDetectFramework(code: string, filePath: string): string {
    // 检查文件扩展名
    const extension = filePath.split(".").pop()?.toLowerCase();

    if (extension === "vue") {
      return "vue";
    }

    // 检查是否是React.createClass（React15特征）
    if (code.includes("React.createClass")) {
      return "react15";
    }

    // 检查Vue特征
    const hasVueStructure =
      code.includes("export default {") &&
      (code.includes("data()") || code.includes("methods:"));

    if (hasVueStructure) {
      return "vue";
    }

    // 检查代码内容
    if (
      code.includes("import React") ||
      code.includes('from "react"') ||
      code.includes("from 'react'")
    ) {
      // 检查是否为 React 15 (通过缺少现代 hooks 来判断)
      const hasModernHooks =
        code.includes("useState") ||
        code.includes("useEffect") ||
        code.includes("useCallback") ||
        code.includes("useMemo") ||
        code.includes("useContext");

      const hasReact15Features =
        code.includes("React.createClass") ||
        code.includes("createReactClass") ||
        code.includes("getInitialState") ||
        code.includes("componentWillMount");

      // 如果明确有 React 15 特征，或者没有现代 hooks 且有老式写法
      if (
        hasReact15Features ||
        (!hasModernHooks && code.includes("React.createElement"))
      ) {
        return "react15";
      }

      return "react";
    }

    if (
      code.includes("import Vue") ||
      code.includes('from "vue"') ||
      code.includes("from 'vue'") ||
      (code.includes("export default {") &&
        (code.includes("data()") || code.includes("methods:")))
    ) {
      return "vue";
    }

    // 默认返回 react
    return "react";
  }

  /**
   * 验证配置是否有效
   */
  static validateConfig(userOptions: TransformOptions): {
    valid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const normalizedConfig = normalizeConfig(userOptions);

      // 基本验证
      if (!normalizedConfig.pattern) {
        errors.push("Pattern is required");
      }

      if (!normalizedConfig.outputPath) {
        errors.push("Output path is required");
      }

      if (!normalizedConfig.normalizedI18nConfig.i18nImport.source) {
        errors.push("i18n import source is required");
      }

      // 框架特定验证
      if (
        normalizedConfig.normalizedI18nConfig.framework === "react" &&
        !normalizedConfig.normalizedI18nConfig.i18nImport.importName
      ) {
        warnings.push(
          "React hook name not specified, using default 'useTranslation'"
        );
      }

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
        `Configuration error: ${
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
}
