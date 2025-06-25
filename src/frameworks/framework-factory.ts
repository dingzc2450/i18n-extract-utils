// framework-factory.ts
// 框架工厂，根据配置选择合适的 I18nTransformer

import { TransformOptions, I18nTransformer, FrameworkCodeGenerator } from "../types";
import { ReactTransformer } from "../ast-parser";
import { React15Transformer } from "./react15-support";
import { VueTransformer } from "./vue-support";
import { VueCodeGenerator } from "./vue-code-generator";

/**
 * 根据 i18nConfig.framework 创建对应的 transformer
 */
export function createFrameworkTransformer(options: TransformOptions): I18nTransformer {
  const framework = options.i18nConfig?.framework || "react";
  
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
 */
export function mergeWithFrameworkDefaults(
  userOptions: TransformOptions,
  detectedFramework?: string
): TransformOptions {
  // 确定最终使用的框架
  const framework = userOptions.i18nConfig?.framework || detectedFramework || "react";
  
  // 获取框架默认配置
  const defaults = getFrameworkDefaults(framework);
  
  // 处理老格式的配置（向后兼容）
  const legacyCompatibleOptions = { ...userOptions };
  
  // 如果用户使用老格式（hookName, hookImport 等），转换为新格式
  if (!userOptions.i18nConfig && (userOptions.hookName || userOptions.hookImport || userOptions.translationMethod)) {
    legacyCompatibleOptions.i18nConfig = {
      framework: framework as any,
      i18nImport: {
        name: userOptions.translationMethod || "t",
        source: userOptions.hookImport || defaults.i18nConfig?.i18nImport?.source || "react-i18next",
        ...(userOptions.hookName && { importName: userOptions.hookName }),
      },
    };
  }
  
  // 深度合并配置
  const merged: TransformOptions = {
    ...defaults,
    ...legacyCompatibleOptions,
    i18nConfig: {
      ...defaults.i18nConfig,
      ...legacyCompatibleOptions.i18nConfig,
    },
  };

  // 安全合并 i18nImport 配置
  if (defaults.i18nConfig?.i18nImport || legacyCompatibleOptions.i18nConfig?.i18nImport) {
    merged.i18nConfig = merged.i18nConfig || {};
    merged.i18nConfig.i18nImport = {
      name: legacyCompatibleOptions.i18nConfig?.i18nImport?.name || defaults.i18nConfig?.i18nImport?.name || "t",
      source: legacyCompatibleOptions.i18nConfig?.i18nImport?.source || defaults.i18nConfig?.i18nImport?.source || "react-i18next",
      ...((legacyCompatibleOptions.i18nConfig?.i18nImport?.importName || defaults.i18nConfig?.i18nImport?.importName) && {
        importName: legacyCompatibleOptions.i18nConfig?.i18nImport?.importName || defaults.i18nConfig?.i18nImport?.importName
      }),
      ...((legacyCompatibleOptions.i18nConfig?.i18nImport?.custom || defaults.i18nConfig?.i18nImport?.custom) && {
        custom: legacyCompatibleOptions.i18nConfig?.i18nImport?.custom || defaults.i18nConfig?.i18nImport?.custom
      }),
    };
  }

  return merged;
}

/**
 * 创建框架特定的代码生成器（新架构）
 */
export function createFrameworkCodeGenerator(options: TransformOptions): FrameworkCodeGenerator {
  const framework = options.i18nConfig?.framework || "react";
  
  switch (framework.toLowerCase()) {
    case "vue":
    case "vue3":
    case "vue2":
      return new VueCodeGenerator();
    
    default:
      // 其他框架暂时返回包装过的 transformer
      const transformer = createFrameworkTransformer(options);
      return new TransformerWrapper(transformer, framework);
  }
}

/**
 * 包装器，将老的 I18nTransformer 适配为新的 FrameworkCodeGenerator
 */
class TransformerWrapper implements FrameworkCodeGenerator {
  constructor(
    private transformer: I18nTransformer,
    public name: string
  ) {}

  canHandle(_code: string, _filePath: string): boolean {
    // 简单的框架检测逻辑
    return true; // 默认都能处理
  }

  processCode(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ) {
    return this.transformer.extractAndReplace(
      code,
      filePath,
      options,
      existingValueToKey
    );
  }
}
