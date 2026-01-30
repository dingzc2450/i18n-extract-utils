/**
 * 框架适配器统一类型定义
 * 定义所有框架适配器共享的接口和类型
 */

import type { Framework } from "../../types";
import type { NormalizedTransformOptions } from "../config-normalizer";

/**
 * 调用表达式风格枚举
 */
export enum CallStyle {
  /** t('key') - 直接函数调用 */
  FUNCTION = "function",
  /** this.$t('key') - this方法调用 */
  THIS_METHOD = "this-method",
  /** i18n.t('key') - 命名空间调用 */
  NAMESPACE = "namespace",
}

/**
 * 导入类型枚举
 */
export enum ImportType {
  /** 无需导入 (全局可用或this访问) */
  NONE = "none",
  /** 直接命名导入 import { t } from 'xxx' */
  NAMED = "named",
  /** 需要Hook import { useXxx } from 'xxx'; const { t } = useXxx(); */
  HOOK = "hook",
  /** 默认导入 import t from 'xxx' */
  DEFAULT = "default",
}

/**
 * 导入编辑操作
 */
export interface ImportEdit {
  type: "insert" | "replace";
  start: number;
  end: number;
  text: string;
}

/**
 * Hook编辑操作
 */
export interface HookEdit {
  /** 插入位置 */
  position: number;
  /** 文本内容 */
  text: string;
}

/**
 * 调用表达式构建策略接口
 */
export interface CallExpressionStrategy {
  /** 调用风格 */
  style: CallStyle;
  /** 基础函数名 (t / $t / i18n.t) */
  functionName: string;

  /**
   * 构建调用表达式文本
   * @param key - 翻译键
   * @param interpolations - 插值对象 { name: 'value' }
   * @returns 调用表达式字符串，如 t('key', { name })
   */
  buildCall(
    key: string | number,
    interpolations?: Record<string, string>
  ): string;

  /**
   * 构建带原文注释的调用表达式
   * @param key - 翻译键
   * @param rawText - 原始文本
   * @param interpolations - 插值对象
   * @param commentType - 注释类型
   */
  buildCallWithComment?(
    key: string | number,
    rawText: string,
    interpolations?: Record<string, string>,
    commentType?: "block" | "line"
  ): string;
}

/**
 * 导入策略接口
 */
export interface ImportPolicy {
  /** 导入类型 */
  type: ImportType;

  /**
   * 判断是否需要添加导入
   */
  shouldAddImport(
    hasReplacements: boolean,
    existingImports?: string[]
  ): boolean;

  /**
   * 获取导入语句
   */
  getImportStatement(): string | null;

  /**
   * 获取Hook调用语句 (仅Hook类型需要)
   */
  getHookStatement(): string | null;

  /**
   * 规划导入位置编辑
   */
  planImportEdits(code: string, hasExistingImport: boolean): ImportEdit[];

  /**
   * 规划Hook位置编辑
   */
  planHookEdits(code: string, hasExistingHook: boolean): HookEdit[];
}

/**
 * 适配器上下文信息
 */
export interface AdapterContext {
  /** 文件路径 */
  filePath: string;
  /** 源代码 */
  code: string;
  /** 规范化配置 */
  options: NormalizedTransformOptions;
  /** 是否在React组件内 */
  isReactComponent?: boolean;
  /** 是否在Vue组件内 */
  isVueComponent?: boolean;
  /** 是否是script setup */
  isScriptSetup?: boolean;
  /** 是否使用Options API */
  isOptionsAPI?: boolean;
  /** 是否是自定义Hook */
  isCustomHook?: boolean;
  /** 是否在类组件内 */
  isClassComponent?: boolean;
  /** 函数/组件名称 */
  functionName?: string;
}

/**
 * 框架适配器接口 - 统一抽象层
 */
export interface FrameworkAdapter {
  /** 适配器名称 */
  readonly name: string;

  /** 框架标识 */
  readonly framework: Framework;

  /**
   * 获取调用表达式策略
   */
  getCallStrategy(context?: AdapterContext): CallExpressionStrategy;

  /**
   * 获取导入策略
   */
  getImportPolicy(context?: AdapterContext): ImportPolicy;

  /**
   * 检测是否匹配当前上下文
   */
  matchesContext(context: AdapterContext): boolean;

  /**
   * 判断在当前上下文是否需要Hook
   */
  needsHookInContext(context: AdapterContext): boolean;
}

/**
 * 适配器工厂函数类型
 */
export type AdapterFactory = (
  options: NormalizedTransformOptions
) => FrameworkAdapter;

/**
 * 导入信息 (兼容现有SmartImportManager)
 */
export interface AdapterImportInfo {
  /** 导入语句 */
  importStatement: string;
  /** 调用函数名 */
  callName: string;
  /** 是否需要Hook */
  needsHook: boolean;
  /** Hook调用语句 */
  hookCall?: string;
  /** 是否禁用导入 */
  noImport?: boolean;
}
