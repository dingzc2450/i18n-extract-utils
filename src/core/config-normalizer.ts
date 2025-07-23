/**
 * 配置规范化模块
 * 负责处理和规范化所有配置选项，确保配置的一致性
 */

import { TransformOptions } from "../types";

/**
 * 默认值常量 - 集中定义所有默认值
 */
export const CONFIG_DEFAULTS = {
  // i18n核心配置默认值
  TRANSLATION_METHOD: "t",
  HOOK_NAME: "useTranslation",
  HOOK_SOURCE: "react-i18next",
  
  // Vue框架默认值
  VUE_TRANSLATION_METHOD: "t",
  VUE_HOOK_NAME: "useI18n",
  VUE_HOOK_SOURCE: "vue-i18n",
  
  // 其他配置默认值
  PATTERN: "___(.+)___",
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
    custom?: string;
  };
  nonReactConfig?: any;
}

/**
 * 规范化的转换选项接口 - 包含处理后的所有配置
 */
export interface NormalizedTransformOptions extends TransformOptions {
  normalizedI18nConfig: NormalizedI18nConfig;
}

/**
 * 判断是否是Vue框架
 */
function isVueFramework(options: TransformOptions): boolean {
  const framework = options.i18nConfig?.framework || "";
  return framework.toLowerCase().includes("vue");
}

/**
 * 规范化i18n导入配置
 * 处理新旧配置系统的兼容，返回统一格式的配置
 */
function normalizeI18nImport(options: TransformOptions): NormalizedI18nConfig["i18nImport"] {
  // 优先使用新配置
  if (options.i18nConfig?.i18nImport) {
    const { name, importName, source, custom } = options.i18nConfig.i18nImport;
    return {
      name: name || (isVueFramework(options) ? CONFIG_DEFAULTS.VUE_TRANSLATION_METHOD : CONFIG_DEFAULTS.TRANSLATION_METHOD),
      importName: importName || (isVueFramework(options) ? CONFIG_DEFAULTS.VUE_HOOK_NAME : CONFIG_DEFAULTS.HOOK_NAME),
      source: source || (isVueFramework(options) ? CONFIG_DEFAULTS.VUE_HOOK_SOURCE : CONFIG_DEFAULTS.HOOK_SOURCE),
      custom
    };
  }

  // 回退到旧配置
  const framework = options.i18nConfig?.framework || "";
  const isVue = framework.toLowerCase().includes("vue");

  return {
    name: options.translationMethod || (isVue ? CONFIG_DEFAULTS.VUE_TRANSLATION_METHOD : CONFIG_DEFAULTS.TRANSLATION_METHOD),
    importName: options.hookName || (isVue ? CONFIG_DEFAULTS.VUE_HOOK_NAME : CONFIG_DEFAULTS.HOOK_NAME),
    source: options.hookImport || (isVue ? CONFIG_DEFAULTS.VUE_HOOK_SOURCE : CONFIG_DEFAULTS.HOOK_SOURCE)
  };
}

/**
 * 规范化框架配置
 */
function normalizeFramework(options: TransformOptions): string {
  // 优先使用新配置中的框架
  if (options.i18nConfig?.framework) {
    return options.i18nConfig.framework;
  }

  // 否则根据文件后缀或其他特征推断
  // 这里可以添加框架自动检测逻辑
  return "react"; // 默认使用React
}

/**
 * 规范化配置 - 主入口函数
 * 处理转换选项，生成统一的规范化配置
 */
export function normalizeConfig(options: TransformOptions): NormalizedTransformOptions {
  // 创建规范化的i18n配置
  const normalizedI18nConfig: NormalizedI18nConfig = {
    framework: normalizeFramework(options),
    i18nImport: normalizeI18nImport(options),
    nonReactConfig: options.i18nConfig?.nonReactConfig
  };

  // 创建规范化的转换选项
  return {
    ...options,
    normalizedI18nConfig,
    // 规范化其他选项
    pattern: options.pattern || CONFIG_DEFAULTS.PATTERN
  };
}

/**
 * 获取转换方法名称
 */
export function getTranslationMethodName(options: TransformOptions | NormalizedTransformOptions): string {
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
