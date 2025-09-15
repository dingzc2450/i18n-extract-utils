/**
 * 共享上下文类型定义
 * 为不同模块之间提供统一的上下文接口
 */

import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";
import type { ExtractedString, UsedExistingKey } from "../types";
import type { NormalizedTransformOptions } from "./config-normalizer";
import type { ContextInfo } from "../context-detector";
import type { ImportInfo } from "../smart-import-manager";

/**
 * 共享处理上下文接口
 */
export interface SharedProcessingContext {
  // 核心配置
  patternRegex: RegExp;
  options: NormalizedTransformOptions;
  filePath: string;

  // 数据存储
  existingValueToKeyMap: Map<
    string,
    {
      primaryKey: string | number;
      keys: Set<string | number>;
    }
  >;
  generatedKeysMap: Map<string, string | number>;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];

  // 上下文检测和导入管理
  getContextInfo: (path: NodePath<t.Node>) => ContextInfo;
  getImportInfoForContext: (context: ContextInfo) => ImportInfo;

  // 工厂函数
  smartCallFactory: (
    callName: string,
    key: string | number,
    rawText: string,
    interpolations?: t.ObjectExpression,
    originalText?: string
  ) => t.Expression;

  // 替换管理
  recordPendingReplacement: (
    path: NodePath<t.Node>,
    originalNode: t.Node,
    replacementNode: t.Node | t.Node[],
    originalText?: string
  ) => void;

  // 工具函数
  buildTemplateLiteral: (
    parts: string[],
    expressions: t.Expression[]
  ) => t.TemplateLiteral;
}

/**
 * 键生成上下文接口
 */
export interface KeyGenerationContext {
  existingValueToKeyMap: Map<
    string,
    {
      primaryKey: string | number;
      keys: Set<string | number>;
    }
  >;
  generatedKeysMap: Map<string, string | number>;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  options: NormalizedTransformOptions;
}

/**
 * 替换构建上下文接口
 */
export interface ReplacementBuildContext<T extends t.Node> {
  isFullReplacement: boolean;
  originalValue: string;
  path: NodePath<T>;
  nodeType: string;
  attributeName?: t.JSXIdentifier | t.JSXNamespacedName;
}

/**
 * 嵌套处理结果接口
 */
export interface NestedProcessingResult {
  processedExpressions: t.Expression[];
  hasNestedMatches: boolean;
  extractedKeys: (string | number)[];
}

/**
 * 收集的节点信息接口
 */
export interface CollectedNodeInfo {
  path: NodePath<t.Node>;
  astNode: t.Node;
  nodeType: string;
  value: string;
  location: {
    filePath: string;
    line: number;
    column: number;
  };
  isTarget: boolean;
}

/**
 * 批量处理结果接口
 */
export interface BatchProcessingResult {
  node: CollectedNodeInfo;
  matches: RegExpMatchArray[];
  keys: (string | number | undefined)[];
  callExpressions: t.Expression[];
  replacementNode: t.Node | t.Node[];
}

/**
 * 替换信息接口
 */
export interface ReplacementInfo {
  originalNode: t.Node;
  replacementNode: t.Node | t.Node[];
  originalText?: string;
  isTopLevel: boolean;
}
