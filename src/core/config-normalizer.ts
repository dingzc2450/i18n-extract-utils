/**
 * 配置规范化模块
 * 统一的配置处理中心，处理和规范化所有配置选项，确保配置的一致性
 */

import { TransformOptions } from "../types";

/**
 * 默认值常量 - 集中定义所有默认值
 * 所有配置默认值都应该在这里定义，避免分散在代码各处
 */
export const CONFIG_DEFAULTS = {
  // i18n核心配置默认值
  TRANSLATION_METHOD: "t",
  HOOK_NAME: "useTranslation",
  HOOK_SOURCE: "react-i18next",
  
  // React15框架默认值
  REACT15_TRANSLATION_METHOD: "t",
  REACT15_HOOK_SOURCE: "i18n",
  
  // Vue框架默认值
  VUE_TRANSLATION_METHOD: "t",
  VUE_HOOK_NAME: "useI18n",
  VUE_HOOK_SOURCE: "vue-i18n",
  
  // 通用框架默认值
  DEFAULT_FRAMEWORK: "react",
  
  // 基础配置默认值
  PATTERN: "___(.+)___",
  OUTPUT_PATH: "./i18n",
  APPEND_EXTRACTED_COMMENT: false,
  EXTRACTED_COMMENT_TYPE: "line",
  PRESERVE_FORMATTING: true,
  USE_AST_TRANSFORM: false,
  
  // 非React配置默认值
  NON_REACT_FUNCTION_NAME: "t",
  NON_REACT_IMPORT_TYPE: "named",
  NON_REACT_NAMESPACE: "i18n"
};

/**
 * 规范化的i18n配置接口
 */
export interface NormalizedI18nConfig {
  framework: string;
  i18nImport: {
    name: string;
    importName: string;
    source: string;
    mergeImports: boolean;
    custom?: string;
  };
  nonReactConfig?: any;
  i18nCall?: (
    callName: string, 
    key: string | number, 
    rawText: string
  ) => import("@babel/types").CallExpression;
}

/**
 * 规范化的转换选项接口 - 包含处理后的所有配置
 * 所有配置项都有确定的值（不会有undefined）
 */
export interface NormalizedTransformOptions extends TransformOptions {
  // 基础配置 - 已规范化
  pattern: string;
  outputPath: string;
  appendExtractedComment: boolean;
  extractedCommentType: "block" | "line";
  preserveFormatting: boolean;
  useASTTransform: boolean;
  
  // i18n配置 - 已规范化
  normalizedI18nConfig: NormalizedI18nConfig;
  
  // 可选配置（保持原样）
  generateKey?: (value: string, filePath: string) => string | number;
  existingTranslations?: string | Record<string, string | number>;
}

/**
 * 判断是否是Vue框架
 */
function isVueFramework(options: TransformOptions): boolean {
  const framework = options.i18nConfig?.framework || "";
  return framework.toLowerCase().includes("vue");
}

/**
 * 判断是否是React15框架
 */
function isReact15Framework(options: TransformOptions): boolean {
  const framework = options.i18nConfig?.framework || "";
  return framework.toLowerCase() === "react15";
}

/**
 * 规范化i18n导入配置
 * 处理新旧配置系统的兼容，返回统一格式的配置
 */
function normalizeI18nImport(options: TransformOptions): NormalizedI18nConfig["i18nImport"] {
  // 首先检查是否是React15框架，这有特殊处理逻辑
  const isReact15 = isReact15Framework(options);
  const isVue = isVueFramework(options);
  
  // 优先使用新配置
  if (options.i18nConfig?.i18nImport) {
    const { name, importName, source, custom } = options.i18nConfig.i18nImport;
    
    // React15特殊处理：如果是React15框架但没有明确指定source，使用"i18n"
    if (isReact15 && !source) {
      return {
        name: name || CONFIG_DEFAULTS.REACT15_TRANSLATION_METHOD,
        importName: importName || CONFIG_DEFAULTS.REACT15_TRANSLATION_METHOD, // React15直接用t，不用hook
        source: CONFIG_DEFAULTS.REACT15_HOOK_SOURCE, // 强制使用"i18n"
        mergeImports: options.i18nConfig.i18nImport.mergeImports ?? true,
        custom
      };
    }
    
    return {
      name: name || (isVue ? CONFIG_DEFAULTS.VUE_TRANSLATION_METHOD : CONFIG_DEFAULTS.TRANSLATION_METHOD),
      importName: importName || (isVue ? CONFIG_DEFAULTS.VUE_HOOK_NAME : CONFIG_DEFAULTS.HOOK_NAME),
      source: source || (isVue ? CONFIG_DEFAULTS.VUE_HOOK_SOURCE : CONFIG_DEFAULTS.HOOK_SOURCE),
      mergeImports: options.i18nConfig.i18nImport.mergeImports ?? true,
      custom
    };
  }

  // 回退到旧配置
  // React15特殊处理
  if (isReact15) {
    return {
      name: options.translationMethod || CONFIG_DEFAULTS.REACT15_TRANSLATION_METHOD,
      importName: CONFIG_DEFAULTS.REACT15_TRANSLATION_METHOD, // React15直接导入t
      source: CONFIG_DEFAULTS.REACT15_HOOK_SOURCE, // 强制使用"i18n"
      mergeImports: true
    };
  }
  
  return {
    name: options.translationMethod || (isVue ? CONFIG_DEFAULTS.VUE_TRANSLATION_METHOD : CONFIG_DEFAULTS.TRANSLATION_METHOD),
    importName: options.hookName || (isVue ? CONFIG_DEFAULTS.VUE_HOOK_NAME : CONFIG_DEFAULTS.HOOK_NAME),
    source: options.hookImport || (isVue ? CONFIG_DEFAULTS.VUE_HOOK_SOURCE : CONFIG_DEFAULTS.HOOK_SOURCE),
    mergeImports: true
  };
}

/**
 * 检测是否为React15框架
 */
function detectReact15Framework(code: string): boolean {
  // 强React15特征检测 - 这些是React15特有的
  const hasStrongReact15Features = 
    code.includes('React.createClass') || 
    code.includes('createReactClass') ||
    code.includes('getInitialState') ||
    code.includes('componentWillMount') ||
    code.includes('componentWillReceiveProps') ||
    code.includes('componentWillUpdate') ||
    code.includes('getDefaultProps');

  // 如果有强React15特征，直接返回true
  if (hasStrongReact15Features) {
    return true;
  }

  // 现代React特征检测 - 这些表明不是React15
  const hasModernReactFeatures = 
    // Hooks
    code.includes('useState') || 
    code.includes('useEffect') || 
    code.includes('useCallback') ||
    code.includes('useMemo') ||
    code.includes('useContext') ||
    code.includes('useReducer') ||
    code.includes('useRef') ||
    code.includes('useLayoutEffect') ||
    code.includes('useImperativeHandle') ||
    code.includes('useDebugValue') ||
    // React 16.3+ 特征
    code.includes('componentDidCatch') ||
    code.includes('getDerivedStateFromError') ||
    code.includes('getDerivedStateFromProps') ||
    code.includes('getSnapshotBeforeUpdate') ||
    // React 16+ 特征
    code.includes('React.Fragment') ||
    code.includes('React.memo') ||
    code.includes('React.lazy') ||
    code.includes('React.Suspense') ||
    code.includes('React.forwardRef') ||
    // JSX Fragments
    code.includes('<>') ||
    code.includes('</>') ||
    // 现代导入方式
    code.includes('import React, { ') ||
    code.includes('from "react/jsx-runtime"') ||
    code.includes('from "react/jsx-dev-runtime"');

  // 如果有现代React特征，肯定不是React15
  if (hasModernReactFeatures) {
    return false;
  }

  // 更严格的React15判断：
  // 1. 必须有React导入
  // 2. 使用的是老式的类组件语法或者老式的函数组件
  // 3. 没有现代特征
  const hasReactImport = code.includes('import React') || 
                        code.includes('from "react"') || 
                        code.includes("from 'react'");

  if (!hasReactImport) {
    return false;
  }

  // 检查是否是老式的函数组件写法（React15风格）
  const hasOldStyleFunctionComponent = 
    // 使用React.createElement而不是JSX语法且没有JSX标签
    (code.includes('React.createElement') && !/\<[A-Za-z]/.test(code));

  // 如果有老式函数组件或类组件特征，可能是React15
  return hasOldStyleFunctionComponent;
}

/**
 * 检测是否为React框架
 */
function detectReactFramework(code: string, filePath: string): boolean {
  return (
    /\.(jsx|tsx)$/.test(filePath) ||
    code.includes("import React") ||
    code.includes('from "react"') ||
    code.includes("from \'react\'") ||
    /<[A-Z][a-zA-Z0-9]*/.test(code) || 
    /<[a-z]+/.test(code)
  );
}

/**
 * 检测是否为Vue框架
 */
function detectVueFramework(code: string, filePath: string): boolean {
  // 检查文件扩展名
  if (filePath.endsWith(".vue")) {
    return true;
  }

  // 检查Vue特有结构
  const hasVueTemplate = code.includes("<template>");
  const hasVueExport = code.includes("export default") &&
                    (code.includes("setup()") ||
                     code.includes("setup:") ||
                     code.includes("data()") ||
                     code.includes("methods:"));
                     
  return hasVueTemplate || hasVueExport;
}

/**
 * 规范化框架配置
 */
function normalizeFramework(options: TransformOptions, code: string = "", filePath: string = ""): string {
  // 优先使用新配置中的框架
  if (options.i18nConfig?.framework) {
    return options.i18nConfig.framework;
  }

  // 根据代码内容和文件路径检测框架
  if (detectReact15Framework(code)) {
    return "react15";
  }
  
  if (detectReactFramework(code, filePath)) {
    return "react";
  }
  
  if (detectVueFramework(code, filePath)) {
    return "vue";
  }
  if(/\.(js|ts|mjs|cjs)$/.test(filePath)){
    return "javaScript";
  }

  // 否则根据文件后缀或其他特征推断
  // 这里可以添加框架自动检测逻辑
  return CONFIG_DEFAULTS.DEFAULT_FRAMEWORK; // 默认使用React
}

/**
 * 规范化非React配置
 */
function normalizeNonReactConfig(options: TransformOptions): any {
  // 如果有新配置中的nonReactConfig，直接使用
  if (options.i18nConfig?.nonReactConfig) {
    const { functionName, importType, source, namespace, customImport } = options.i18nConfig.nonReactConfig;
    return {
      functionName: functionName || CONFIG_DEFAULTS.NON_REACT_FUNCTION_NAME,
      importType: importType || CONFIG_DEFAULTS.NON_REACT_IMPORT_TYPE,
      source: source || (isVueFramework(options) ? CONFIG_DEFAULTS.VUE_HOOK_SOURCE : CONFIG_DEFAULTS.HOOK_SOURCE),
      namespace: namespace || CONFIG_DEFAULTS.NON_REACT_NAMESPACE,
      customImport
    };
  }
  
  // 如果是Vue框架但没有nonReactConfig，返回Vue默认配置
  if (isVueFramework(options)) {
    return {
      functionName: CONFIG_DEFAULTS.VUE_TRANSLATION_METHOD,
      importType: CONFIG_DEFAULTS.NON_REACT_IMPORT_TYPE,
      source: CONFIG_DEFAULTS.VUE_HOOK_SOURCE,
      namespace: CONFIG_DEFAULTS.NON_REACT_NAMESPACE
    };
  }
  
  // 默认返回null，表示不需要非React配置
  return null;
}

/**
 * 规范化配置 - 主入口函数
 * 处理转换选项，生成统一的规范化配置
 * 所有配置项都会有默认值，确保返回的配置是完整的
 */
export function normalizeConfig(options: TransformOptions, code: string = "", filePath: string = ""): NormalizedTransformOptions {
  // 创建规范化的i18n配置
  const normalizedI18nConfig: NormalizedI18nConfig = {
    framework: normalizeFramework(options, code, filePath),
    i18nImport: normalizeI18nImport(options),
    nonReactConfig: normalizeNonReactConfig(options),
    i18nCall: options.i18nConfig?.i18nCall // 确保传递i18nCall配置
  };

  // 创建规范化的转换选项
  return {
    // 基础配置 - 使用用户配置或默认值
    pattern: options.pattern || CONFIG_DEFAULTS.PATTERN,
    outputPath: options.outputPath || CONFIG_DEFAULTS.OUTPUT_PATH,
    appendExtractedComment: options.appendExtractedComment ?? CONFIG_DEFAULTS.APPEND_EXTRACTED_COMMENT,
    extractedCommentType: (options.extractedCommentType as "block" | "line") || CONFIG_DEFAULTS.EXTRACTED_COMMENT_TYPE as "line",
    preserveFormatting: options.preserveFormatting ?? CONFIG_DEFAULTS.PRESERVE_FORMATTING,
    useASTTransform: options.useASTTransform ?? CONFIG_DEFAULTS.USE_AST_TRANSFORM,
    
    // i18n配置
    normalizedI18nConfig,
    
    // 可选配置（直接传递，不处理）
    generateKey: options.generateKey,
    existingTranslations: options.existingTranslations,
    
    // 传递其他原始配置（向后兼容）
    ...options
  };
}

/**
 * 获取转换方法名称
 */
export function getTranslationMethodName(options: TransformOptions | NormalizedTransformOptions): string {
  // 检查是否是React15框架
  const isReact15 = 'normalizedI18nConfig' in options 
    ? options.normalizedI18nConfig.framework === 'react15' 
    : options.i18nConfig?.framework === 'react15';
    
  if ('normalizedI18nConfig' in options) {
    return options.normalizedI18nConfig.i18nImport.name;
  }
  
  return normalizeI18nImport(options).name;
}

/**
 * 获取钩子名称
 */
export function getHookName(options: TransformOptions | NormalizedTransformOptions): string {
  if ('normalizedI18nConfig' in options) {
    return options.normalizedI18nConfig.i18nImport.importName;
  }
  
  return normalizeI18nImport(options).importName;
}

/**
 * 获取导入来源
 */
export function getImportSource(options: TransformOptions | NormalizedTransformOptions): string {
  if ('normalizedI18nConfig' in options) {
    return options.normalizedI18nConfig.i18nImport.source;
  }
  
  return normalizeI18nImport(options).source;
}

/**
 * 获取mergeImports配置
 */
export function getMergeImports(options: TransformOptions | NormalizedTransformOptions): boolean {
  // 优先使用新配置格式
  if ('normalizedI18nConfig' in options) {
    // 新配置格式中，mergeImports在i18nImport下
    return (options as NormalizedTransformOptions).normalizedI18nConfig.i18nImport.mergeImports ?? true;
  }
  
  // 旧配置格式兼容
  if (options.i18nConfig?.i18nImport?.mergeImports !== undefined) {
    return options.i18nConfig.i18nImport.mergeImports !== false;
  }
  
  // 默认值
  return true;
}

/**
 * 获取i18nCall配置
 */
export function getI18nCall(options: TransformOptions | NormalizedTransformOptions): any {
  if ('normalizedI18nConfig' in options && options.normalizedI18nConfig.i18nCall) {
    return options.normalizedI18nConfig.i18nCall;
  }
  
  return options.i18nConfig?.i18nCall;
}
