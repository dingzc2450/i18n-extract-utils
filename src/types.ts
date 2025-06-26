/**
 * Configuration options for the transformation process.
 * 转换过程的配置选项。
 */
export interface TransformOptions {
  /**
   * The pattern used to match text for extraction.
   * Default is "___([\s\S]+?)___".
   * 用于匹配要提取文本的模式。
   * 默认值为 "___([\s\S]+?)___"。
   */
  pattern?: string;

  /**
   * The output path where extracted translations will be saved.
   * 提取的多语言文件的输出路径。
   */
  outputPath?: string;

  /**
   * The name of the translation method to use when replacing matched patterns.
   * Default is "t".
   * 替换匹配模式时使用的翻译方法名称。
   * 默认值为 "t"。
   * @deprecated 请使用 i18nConfig.i18nImport.name 代替 translationMethod
   */
  translationMethod?: string;

  /**
   * The name of the hook to be added for translation functionality.
   * Default is "useTranslation".
   * 添加用于翻译功能的hook名称。
   * 默认值为 "useTranslation"。
   * @deprecated 请使用 i18nConfig.i18nImport.importName 代替 hookName
   */
  hookName?: string;

  /**
   * The import path for the translation hook.
   * Default is 'react-i18next'.
   * 翻译hook的导入路径。
   * 默认值为 'react-i18next'。
   * @deprecated 请使用 i18nConfig.i18nImport.source 代替 hookImport
   */
  hookImport?: string;

  /**
   * A function to generate a unique key for a given string value.
   * If not provided, the string value itself is used as the key.
   *
   * 用于为给定字符串值生成唯一键的函数。
   * 如果未提供，则使用字符串值本身作为键。
   *
   * @param value - The extracted string value that needs a key.
   * @param filePath - The path of the file where the string was found.
   * @returns - The generated key (string or number) to use in the translation file.
   */
  generateKey?: (value: string, filePath: string) => string | number;

  /**
   * Existing translations, either as a path to a JSON file or a direct object.
   * This is used to check for existing translations and reuse keys.
   * The expected format (for both file and object) is { key: value }.
   *
   * 现有的翻译内容，可以是JSON文件的路径，也可以是直接的对象。
   * 用于检查现有翻译并复用键。
   * 预期的格式（文件和对象相同）为 { key: value }。
   */
  existingTranslations?: string | Record<string, string | number>; // Renamed and updated type

  /**
   * 是否在执行函数后添加待翻译文本注释，方便核对。
   * Whether to append extracted text as a comment after the function call for review.
   * 默认 false。
   */
  appendExtractedComment?: boolean;

  /**
   * 待翻译文本注释类型：block（多行注释 /* ... *&#47;）或 line（单行注释 // ...）。
   * Type of comment for extracted text: 'block' (/* ... *&#47;) or 'line' (// ...). Default is 'block'.
   */
  extractedCommentType?: "block" | "line";

  /**
   * 多语言相关配置（框架、导入、调用等）
   */
  i18nConfig?: I18nConfig;

  /**
   * 处理模式配置
   */
  
  /**
   * 是否保持原始代码格式（使用字符串替换而不是AST重新生成）
   * Whether to preserve original code formatting (use string replacement instead of AST regeneration)
   * 默认 false
   */
  preserveFormatting?: boolean;

  /**
   * 是否使用字符串替换模式（等同于 preserveFormatting）
   * Whether to use string replacement mode (equivalent to preserveFormatting)
   * 默认 false
   */
  useStringReplacement?: boolean;

  /**
   * 是否强制使用AST转换模式（可能破坏格式，但更稳妥）
   * Whether to force AST transformation mode (may break formatting but more robust)
   * 默认 false
   */
  useASTTransform?: boolean;

  /**
   * 是否强制使用传统模式（禁用增强功能）
   * Whether to force legacy mode (disable enhanced features)
   * 默认 false - 建议使用默认的增强模式
   */
  useLegacyMode?: boolean;
}

export interface ExtractedString {
  key: string | number; // Updated type to match generateKey return type
  value: string;
  filePath: string;
  line: number;
  column: number;
}

export interface UsedExistingKey {
  filePath: string;
  line: number;
  column: number;
  key: string | number;
  value: string;
}

/**
 * Represents the location (start/end line and column) of a code segment.
 */
export interface CodeLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/**
 * Details about a single replacement made in the code.
 * 关于在代码中所做的单个替换的详细信息。
 */
export interface ChangeDetail {
  /** The absolute path to the file where the change occurred. 文件路径 */
  filePath: string;
  /** The generated code string of the original node that was replaced. 原始节点的代码字符串 */
  original: string;
  /** The generated code string of the node that replaced the original one. 替换节点的代码字符串 */
  replacement: string;
  /** The starting line number of the original node. 原始节点的起始行号 */
  line: number;
  /** The starting column number of the original node. 原始节点的起始列号 */
  column: number;
  /** The ending line number of the original node. 原始节点的结束行号 */
  endLine: number;
  /** The ending column number of the original node. 原始节点的结束列号 */
  endColumn: number;
  /** The exact start position in the source code (0-based) for string replacement. 源代码中的精确起始位置（从0开始）*/
  start?: number;
  /** The exact end position in the source code (0-based) for string replacement. 源代码中的精确结束位置（从0开始）*/
  end?: number;
  /** 用于字符串匹配的上下文信息，包含前后若干字符 */
  matchContext?: {
    /** 替换点前的上下文字符串 */
    before: string;
    /** 替换点后的上下文字符串 */
    after: string;
    /** 完整的匹配字符串（包含前后上下文） */
    fullMatch: string;
  };
}

/**
 * Represents a record of a file that was modified, including details of the changes.
 * 表示已修改文件的记录，包括更改的详细信息。
 */
export interface FileModificationRecord {
  /** The absolute path to the modified file. 修改文件的绝对路径 */
  filePath: string;
  /** An array detailing each replacement made in the file. 文件中每次替换的详细信息数组 */
  changes: ChangeDetail[];
  /** The full content of the file after all transformations. 所有转换后文件的完整内容 */
  newContent: string;
}

/**
 * 多语言导入配置
 */
export interface I18nImportConfig {
  /** 最终调用的国际化方法名（如 t），兼容 translationMethod */
  name: string;
  /** 导入的变量名（如 useTranslation），兼容 hookName，可选 */
  importName?: string;
  /** 导入源，如 'i18n-lib'，兼容 hookImport */
  source: string;
  /** 可选：完全自定义导入语句（如 import t from ...），若设置则覆盖自动生成 */
  custom?: string;
}

/**
 * 框架无关的多语言提取与替换接口
 */
export interface I18nTransformer {
  /**
   * 提取和替换多语言内容，返回替换后的代码、提取的字符串、已用 key、变更详情等
   */
  extractAndReplace(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ): {
    code: string;
    extractedStrings: ExtractedString[];
    usedExistingKeysList: UsedExistingKey[];
    changes: ChangeDetail[];
  };
}

/**
 * 框架特定的代码生成器接口
 * 每个框架实现自己的解析和代码生成逻辑
 */
export interface FrameworkCodeGenerator {
  /**
   * 框架名称
   */
  name: string;

  /**
   * 解析源代码并替换i18n字符串
   * @param code 源代码
   * @param filePath 文件路径
   * @param options 转换选项
   * @param existingValueToKey 已存在的键值映射
   * @returns 转换结果
   */
  processCode(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ): {
    code: string;
    extractedStrings: ExtractedString[];
    usedExistingKeysList: UsedExistingKey[];
    changes: ChangeDetail[];
  };

  /**
   * 检查是否支持处理此文件
   * @param code 源代码
   * @param filePath 文件路径
   * @returns 是否支持
   */
  canHandle(code: string, filePath: string): boolean;
}

/**
 * 非React组件上下文的国际化配置
 */
export interface NonReactI18nConfig {
  /** 
   * 翻译函数名，如 't', '$t' 等
   * @default 't'
   */
  functionName?: string;
  /** 
   * 导入类型：'default' | 'named' | 'namespace'
   * @default 'named'
   * @example 
   * - 'default': import t from 'i18n-lib'
   * - 'named': import { t } from 'i18n-lib'  
   * - 'namespace': import * as i18n from 'i18n-lib'; i18n.t()
   */
  importType?: 'default' | 'named' | 'namespace';
  /** 
   * 导入源，如 'react-i18n-plus', 'i18next' 等
   */
  source?: string;
  /** 
   * 命名空间名称（当 importType 为 'namespace' 时使用）
   * @default 'i18n'
   */
  namespace?: string;
  /**
   * 完全自定义的导入语句（可选，会覆盖上述所有配置）
   * @example "import { translate as t } from 'custom-i18n'"
   */
  customImport?: string;
}

/**
 * 多语言配置总入口
 */
export interface I18nConfig {
  /** 
   * 当前框架类型（如 'react' | 'react15' | 'vue' 等）
   * @default 'react'
   * @description 'react' 表示 React 16+，'react15' 表示 React 15
   * @description 'vue' 表示 Vue.js，'vue2' 表示 Vue 2.x，'vue3' 表示 Vue 3.x
   */
  framework?: "react" | "react15" | "vue" | "vue2" | "vue3";
  /** 国际化导入配置，支持自定义，兼容 translationMethod/hookName/hookImport */
  i18nImport?: I18nImportConfig;
  /**
   * 非React组件场景下的国际化配置（仅在 framework 为 'react' 时生效）
   * 用于处理普通函数、工具函数等非组件场景
   */
  nonReactConfig?: NonReactI18nConfig;
  /**
   * 自定义生成调用表达式的方法（返回 t.CallExpression）
   * (callName, key, rawText) => t.CallExpression
   */
  i18nCall?: (
    callName: string,
    key: string | number,
    rawText: string
  ) => import("@babel/types").CallExpression;
}
