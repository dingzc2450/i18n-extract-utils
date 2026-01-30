import type { NormalizedTransformOptions } from "./config-normalizer";
import type {
  ExtractedString,
  UsedExistingKey,
  ChangeDetail,
  ExistingValueToKeyMapType,
} from "../types";
import { ASTParserUtils } from "./utils";
import { StringReplacer } from "../string-replacer";
import { SmartImportManager } from "../smart-import-manager";
import { collectContextAwareReplacementInfo } from "../context-aware-ast-replacer";
import { parse } from "@babel/parser";
import type {
  FrameworkAdapter as NewFrameworkAdapter,
  AdapterContext,
} from "./framework-adapters/types";

/**
 * 框架适配器接口（精简版占位）
 * 负责：
 * - 构造国际化调用表达式文本（如 t('key') / this.$t('key')）
 * - 决定是否需要导入与上下文注入（导入/Hook）
 * @deprecated 使用 FrameworkAdapter from './framework-adapters/types' 代替
 */
export interface FrameworkAdapter {
  readonly name: string;
}

/**
 * 适配器类型可以是旧版或新版
 */
type AnyFrameworkAdapter = FrameworkAdapter | NewFrameworkAdapter;

/**
 * 检测适配器是否是新版适配器
 */
function isNewAdapter(
  adapter: AnyFrameworkAdapter
): adapter is NewFrameworkAdapter {
  return "getCallStrategy" in adapter && "getImportPolicy" in adapter;
}

export class CoreAstTransformer {
  constructor(private adapter: AnyFrameworkAdapter) {}

  /**
   * 获取适配器上下文
   */
  private createAdapterContext(
    code: string,
    filePath: string,
    options: NormalizedTransformOptions
  ): AdapterContext {
    return {
      code,
      filePath,
      options,
    };
  }

  /**
   * 统一 AST + 文本最小替换的入口（占位版本）
   * 目前返回原样，作为灰度开关接入占位，避免影响现有行为。
   */
  run(
    code: string,
    _filePath: string,
    _options: NormalizedTransformOptions,
    _existingValueToKeyMap?: ExistingValueToKeyMapType
  ): {
    code: string;
    extractedStrings: ExtractedString[];
    usedExistingKeysList: UsedExistingKey[];
    changes: ChangeDetail[];
  } {
    // 统一管线：解析 -> 规划 -> 最小替换
    const options = _options;
    const filePath = _filePath;
    const existingValueToKeyMap = _existingValueToKeyMap || new Map();

    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];

    // 解析AST（使用规范化配置，支持tsx/jsx/ts）
    const parserConfig = ASTParserUtils.getParserConfigFromOptions(
      filePath,
      options
    );
    const ast = parse(code, {
      ...parserConfig,
      sourceFilename: filePath,
      errorRecovery: true,
      ranges: true,
    });

    // 初始化导入管理（用于决定调用名等；导入注入不在此处执行）
    const importManager = new SmartImportManager(
      options.normalizedI18nConfig.i18nImport,
      options.normalizedI18nConfig.nonReactConfig
    );

    // 收集上下文感知的替换信息（最小化字符串替换）
    const { modified, changes } = collectContextAwareReplacementInfo(
      ast,
      code,
      existingValueToKeyMap,
      extractedStrings,
      usedExistingKeysList,
      importManager,
      options,
      filePath
    );

    const newCode = modified
      ? StringReplacer.applyChanges(code, changes)
      : code;

    return {
      code: newCode,
      extractedStrings,
      usedExistingKeysList,
      changes,
    };
  }
}
