/**
 * 核心处理器相关类型定义
 */

import { ExtractedString, TransformOptions, UsedExistingKey, ChangeDetail } from "../types";

/**
 * 框架特定处理插件接口
 */
export interface FrameworkPlugin {
  name: string;

  /**
   * 检测是否应该应用此插件
   */
  shouldApply(
    code: string,
    filePath: string,
    options: TransformOptions
  ): boolean;

  /**
   * 预处理代码（可选）
   */
  preProcess?(code: string, options: TransformOptions): string;

  /**
   * 获取需要的导入和hook调用
   */
  getRequiredImportsAndHooks?(
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): {
    imports: ImportRequirement[];
    hooks: HookRequirement[];
  };

  /**
   * 后处理代码 - 轻量级的最终处理（主要的导入和hook插入已由CoreProcessor完成）
   */
  postProcess?(
    code: string,
    extractedStrings: ExtractedString[],
    options: TransformOptions,
    context: ProcessingContext
  ): string;

  /**
   * 获取解析器配置
   */
  getParserConfig?(): object;
}

/**
 * 处理上下文
 */
export interface ProcessingContext {
  filePath: string;
  originalCode: string;
  hasModifications: boolean;
  requiredImports?: Set<string>;
  detectedFramework?: string;
}

/**
 * 导入需求接口
 */
export interface ImportRequirement {
  source: string; // 导入源，如 "react-i18next"
  specifiers: Array<{
    name: string; // 导入名称，如 "useTranslation"
    alias?: string; // 别名，如果有的话
  }>;
  isDefault?: boolean; // 是否为默认导入
}

/**
 * Hook调用需求接口
 */
export interface HookRequirement {
  hookName: string; // hook名称，如 "useTranslation"
  variableName: string; // 变量名，如 "t"
  isDestructured: boolean; // 是否解构，如 const { t } = useTranslation()
  callExpression: string; // 完整的调用表达式
}

/**
 * 处理模式
 */
export enum ProcessingMode {
  CONTEXT_AWARE = "context-aware", // 上下文感知模式（默认，推荐）
  AST_TRANSFORM = "ast-transform", // AST转换模式（可能破坏格式，但更稳妥） 是原有的老模式 暂时在此不启用
}

/**
 * 提取和替换结果
 */
export interface ExtractionResult {
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  changes: ChangeDetail[];
  modified: boolean;
  requiredImports?: Set<string>;
}

/**
 * 核心处理器结果
 */
export interface ProcessingResult {
  code: string;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  changes: ChangeDetail[];
}
