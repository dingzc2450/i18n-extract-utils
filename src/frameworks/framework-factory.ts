// framework-factory.ts
// 框架工厂，根据配置选择合适的 I18nTransformer

import { TransformOptions, I18nTransformer, FrameworkCodeGenerator } from "../types";
import { ReactTransformer } from "../plugins/react-plugin";
import { React15Transformer } from "./react15-support";
import { VueTransformer } from "./vue-support";
import { UniversalCodeGenerator } from "./universal-code-generator";
import { resolveConfig, ResolvedConfig } from "../config/config-manager";
import { ConfigAdapter } from "../config/config-adapter";

/**
 * 根据 i18nConfig.framework 创建对应的 transformer
 */
export function createFrameworkTransformer(userOptions: TransformOptions): I18nTransformer {
  // 使用配置管理器解析配置
  const config = resolveConfig(userOptions);
  const framework = config.i18nConfig.framework;
  
  switch (framework.toLowerCase()) {
    case "react":
      return new ReactTransformer();
    
    case "react15":
      return new React15Transformer();
    
    case "vue":
    case "vue3":
      return new VueTransformer();
    
    case "vue2":
      // Vue 2 可以复用 VueTransformer，但可能需要不同的默认配置
      return new VueTransformer();
    
    default:
      console.warn(`Unknown framework: ${framework}, falling back to React`);
      return new ReactTransformer();
  }
}

/**
 * 根据文件内容和配置自动检测框架类型
 */
export function detectFramework(code: string, filePath: string): string {
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
 * 获取框架的默认 i18n 配置
 */
export function getFrameworkDefaults(framework: string): Partial<TransformOptions> {
  switch (framework.toLowerCase()) {
    case "react":
      return {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next"
          }
        }
      };
    
    case "react15":
      return {
        i18nConfig: {
          framework: "react15",
          i18nImport: {
            name: "t",
            source: "i18n"
          }
        }
      };
    
    case "vue":
    case "vue3":
      return {
        i18nConfig: {
          framework: "vue",
          i18nImport: {
            name: "t",
            importName: "useI18n",
            source: "vue-i18n"
          }
        }
      };
    
    case "vue2":
      return {
        i18nConfig: {
          framework: "vue2" as any, // 临时类型断言
          i18nImport: {
            name: "$t",
            source: "vue-i18n"
          }
        }
      };
    
    default:
      return {
        i18nConfig: {
          framework: "react",
          i18nImport: {
            name: "t",
            importName: "useTranslation",
            source: "react-i18next"
          }
        }
      };
  }
}

/**
 * 合并用户配置和框架默认配置
 * @deprecated 使用 resolveConfig 代替
 */
export function mergeWithFrameworkDefaults(
  userOptions: TransformOptions,
  detectedFramework?: string
): TransformOptions {
  // 使用新的配置管理器
  const resolvedConfig = resolveConfig(userOptions, detectedFramework);
  
  // 转换回 TransformOptions 格式以保持向后兼容
  return ConfigAdapter.toTransformOptions(resolvedConfig);
}

/**
 * 创建框架特定的代码生成器（新架构）
 */
export function createFrameworkCodeGenerator(options: TransformOptions, useEnhanced: boolean = false): FrameworkCodeGenerator {
  // 现在统一使用 UniversalCodeGenerator 处理所有情况
  return new UniversalCodeGenerator();
}


