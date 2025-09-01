/**
 * 核心处理器相关类型定义
 */

import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
} from "../types";
import { I18nError } from "./error-handler";

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
  /**
   * @deprecated Use result instead
   */
  requiredImports?: Set<string>;
  detectedFramework?: string;
  result: ExtractionResult;
}

/**
 * 导入需求接口
 */
export interface ImportRequirement {
  source: string;
  specifiers: { name: string; alias?: string }[];
  isDefault?: boolean;
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
 * 导入变更的详细信息
 */
export type ImportChange =
  | {
      type: "replace";
      start: number;
      end: number;
      text: string;
    }
  | {
      type: "insert";
      start: number;
      end: number;
      insertPosition: number;
      text: string;
    };

/**
 * 核心处理器的最终结果
 */
export interface ProcessingResult {
  code: string;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  changes: ChangeDetail[];
  error?: I18nError; // 错误信息，如果处理过程中出现错误
}
