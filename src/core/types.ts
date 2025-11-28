/**
 * 核心处理器相关类型定义
 */

import type {
  ExtractedString,
  UsedExistingKey,
  ChangeDetail,
  Framework,
  ExistingValueToKeyMapType,
} from "../types";
import type { I18nError } from "./error-handler";
import type { NormalizedTransformOptions } from "./config-normalizer";
import type { ParserOptions } from "@babel/parser";

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
    options: NormalizedTransformOptions
  ): boolean;

  /**
   * 预处理代码（可选）
   */
  preProcess?(code: string, options: NormalizedTransformOptions): string;

  /**
   * 将代码拆分为一个或多个可复用的片段，交由核心管线处理。
   * 返回空值表示使用默认的单次处理流程。
   */
  prepareSegments?(
    args: PrepareSegmentsArgs
  ): FrameworkSegmentsPlan | undefined | null;

  /**
   * 获取需要的导入和hook调用
   */
  getRequiredImportsAndHooks?(
    options: NormalizedTransformOptions,
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
    options: NormalizedTransformOptions,
    context: ProcessingContext
  ): string;

  /**
   * 在片段处理完成后，对片段结果进行汇总并生成最终代码。
   * 仅在 prepareSegments 返回有效计划时调用。
   */
  applySegmentResults?(
    plan: FrameworkSegmentsPlan,
    outputs: SegmentProcessingOutput[],
    args: ApplySegmentResultsArgs
  ): ProcessingResult;

  /**
   * 获取解析器配置
   */
  getParserConfig?(): ParserOptions;
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
  segment?: ProcessingSegment;
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
  /**
   * 当前处理用到的框架
   */
  framework: Framework;
}

/**
 * 深度可选类型，帮助描述片段对规范化配置的局部覆写。
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Record<string, unknown>
    ? DeepPartial<T[K]>
    : T[K];
};

/**
 * 片段化处理参数
 */
export interface PrepareSegmentsArgs {
  code: string;
  filePath: string;
  options: NormalizedTransformOptions;
  existingValueToKeyMap?: ExistingValueToKeyMapType;
}

/**
 * 描述一个待处理的片段
 */
export interface ProcessingSegment {
  id: string;
  code: string;
  filePath?: string;
  forceProcess?: boolean;
  optionsOverride?: DeepPartial<NormalizedTransformOptions>;
  skipPreProcess?: boolean;
  skipPostProcess?: boolean;
  meta?: Record<string, unknown>;
  existingValueToKeyMap?: ExistingValueToKeyMapType;
}

/**
 * 插件生成的片段处理计划
 */
export interface FrameworkSegmentsPlan {
  segments: ProcessingSegment[];
  pluginContext?: unknown;
}

/**
 * 单个片段的处理输出
 */
export interface SegmentProcessingOutput {
  segment: ProcessingSegment;
  processingResult: ProcessingResult;
  extractionResult: ExtractionResult;
}

/**
 * 汇总片段结果时的参数
 */
export interface ApplySegmentResultsArgs {
  originalCode: string;
  filePath: string;
  options: NormalizedTransformOptions;
  existingValueToKeyMap?: ExistingValueToKeyMapType;
}
