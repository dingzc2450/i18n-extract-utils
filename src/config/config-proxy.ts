/**
 * 配置代理 - 保持原有CoreProcessor不变，只是在外层提供配置管理
 * 这是一个更安全的重构方式
 */

import { TransformOptions } from "../types";
import { resolveConfig, ResolvedConfig } from "./config-manager";
import { ConfigAdapter } from "./config-adapter";

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
  ): TransformOptions {
    // 如果提供了代码和文件路径，进行框架检测
    let detectedFramework: string | undefined;
    if (code && filePath) {
      // 简单的内联框架检测逻辑，避免模块依赖问题
      detectedFramework = this.simpleDetectFramework(code, filePath);
    }

    // 解析为完整配置
    const resolved = resolveConfig(userOptions, detectedFramework);
    
    // 转换回TransformOptions格式，但现在所有字段都有默认值
    return ConfigAdapter.toTransformOptions(resolved);
  }

  /**
   * 简单的框架检测逻辑（内联实现，避免循环依赖）
   */
  private static simpleDetectFramework(code: string, filePath: string): string {
    // 检查文件扩展名
    const extension = filePath.split('.').pop()?.toLowerCase();
    
    if (extension === 'vue') {
      return 'vue';
    }
    
    // 检查代码内容
    if (code.includes('import React') || code.includes('from "react"') || code.includes("from 'react'")) {
      // 检查是否为 React 15 (通过缺少现代 hooks 来判断)
      const hasModernHooks = code.includes('useState') || 
                            code.includes('useEffect') || 
                            code.includes('useCallback') ||
                            code.includes('useMemo') ||
                            code.includes('useContext');
      
      const hasReact15Features = code.includes('React.createClass') || 
                                code.includes('createReactClass') ||
                                code.includes('getInitialState') ||
                                code.includes('componentWillMount');
      
      // 如果明确有 React 15 特征，或者没有现代 hooks 且有老式写法
      if (hasReact15Features || (!hasModernHooks && code.includes('React.createElement'))) {
        return 'react15';
      }
      
      return 'react';
    }
    
    if (code.includes('import Vue') || 
        code.includes('from "vue"') || 
        code.includes("from 'vue'") ||
        code.includes('export default {') && (code.includes('data()') || code.includes('methods:'))) {
      return 'vue';
    }
    
    // 默认返回 react
    return 'react';
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
      const resolved = resolveConfig(userOptions);

      // 基本验证
      if (!resolved.pattern) {
        errors.push("Pattern is required");
      }

      if (!resolved.outputPath) {
        errors.push("Output path is required");
      }

      if (!resolved.i18nConfig.i18nImport.source) {
        errors.push("i18n import source is required");
      }

      // 框架特定验证
      if (resolved.i18nConfig.framework === "react" && !resolved.i18nConfig.i18nImport.importName) {
        warnings.push("React hook name not specified, using default 'useTranslation'");
      }

      // 废弃配置警告
      if (resolved._legacyTranslationMethod) {
        warnings.push("translationMethod is deprecated, use i18nConfig.i18nImport.name instead");
      }

      if (resolved._legacyHookName) {
        warnings.push("hookName is deprecated, use i18nConfig.i18nImport.importName instead");
      }

      if (resolved._legacyHookImport) {
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
