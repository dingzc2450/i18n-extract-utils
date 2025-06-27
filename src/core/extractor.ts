/**
 * 核心提取器 - 抽离的通用提取逻辑
 * 供各个插件复用的核心字符串提取和替换功能
 */

import traverse, { NodePath } from "@babel/traverse";
import * as t from "@babel/types";
import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
} from "../types";
import { getKeyAndRecord } from "../key-manager";
import {
  createTranslationCall,
  attachExtractedCommentToNode,
  parseJSXTextPlaceholders,
} from "../ast-utils";
import { getDefaultPattern } from "../string-extractor";
import * as tg from "../babel-type-guards";
import { isJSXAttribute } from "../frameworks/react-support";
import { detectCodeContext, ContextInfo } from "../context-detector";
import { SmartImportManager, ImportInfo } from "../smart-import-manager";
import { ExtractionResult } from "./types";

/**
 * 通用字符串提取器 - 核心逻辑
 */
export class CoreExtractor {
  private contextCache = new Map<NodePath<t.Node>, ContextInfo>();
  private coveredNodes = new Set<t.Node>();
  private pendingReplacements = new Map<NodePath<t.Node>, {
    originalNode: t.Node;
    replacementNode: t.Node | t.Node[];
    originalText?: string;
    isTopLevel: boolean;
  }>();

  /**
   * 提取和替换字符串的主方法
   */
  extractAndReplace(
    ast: t.File,
    originalCode: string,
    existingValueToKey: Map<string, string | number>,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    importManager: SmartImportManager,
    options: TransformOptions,
    filePath: string
  ): ExtractionResult {
    let modified = false;
    const changes: ChangeDetail[] = [];
    const generatedKeysMap = new Map<string, string | number>();
    const requiredImports = new Set<string>();

    // 重置内部状态
    this.resetState();

    const patternRegex = options?.pattern
      ? new RegExp(options.pattern, "g")
      : new RegExp(getDefaultPattern().source, "g");

    // 智能调用工厂函数
    const smartCallFactory = this.createSmartCallFactory(options);

    // 遍历AST进行提取
    traverse(ast, {
      StringLiteral: (path) => {
        this.handleStringLiteral(
          path,
          patternRegex,
          originalCode,
          existingValueToKey,
          extractedStrings,
          usedExistingKeysList,
          generatedKeysMap,
          importManager,
          requiredImports,
          smartCallFactory,
          options,
          filePath
        );
      },
      TemplateLiteral: (path) => {
        this.handleTemplateLiteral(
          path,
          patternRegex,
          originalCode,
          existingValueToKey,
          extractedStrings,
          usedExistingKeysList,
          generatedKeysMap,
          importManager,
          requiredImports,
          smartCallFactory,
          options,
          filePath
        );
      },
      JSXText: (path) => {
        this.handleJSXText(
          path,
          patternRegex,
          originalCode,
          existingValueToKey,
          extractedStrings,
          usedExistingKeysList,
          generatedKeysMap,
          importManager,
          requiredImports,
          smartCallFactory,
          options,
          filePath
        );
      }
    });

    // 处理嵌套替换
    this.processNestedReplacements();

    // 生成最终的变更列表
    const finalChanges = this.generateChanges(originalCode);
    changes.push(...finalChanges);

    if (changes.length > 0) {
      modified = true;
    }

    return {
      extractedStrings,
      usedExistingKeysList,
      changes,
      modified,
      requiredImports,
    };
  }

  /**
   * 重置内部状态
   */
  private resetState(): void {
    this.contextCache.clear();
    this.coveredNodes.clear();
    this.pendingReplacements.clear();
  }

  /**
   * 创建智能调用工厂
   */
  private createSmartCallFactory(options: TransformOptions) {
    return (callName: string, key: string | number, rawText: string, interpolations?: t.ObjectExpression) => {
      if (options.i18nConfig && options.i18nConfig.i18nCall) {
        // 使用自定义的 i18nCall，只传递原来的3个参数
        return options.i18nConfig.i18nCall(callName, key, rawText);
      } else {
        // 使用默认的 createTranslationCall，支持 interpolations
        return createTranslationCall(callName, key, interpolations);
      }
    };
  }

  /**
   * 获取代码上下文信息（带缓存）
   */
  private getContextInfo(path: NodePath<t.Node>): ContextInfo {
    if (this.contextCache.has(path)) {
      return this.contextCache.get(path)!;
    }

    const context = detectCodeContext(path);
    this.contextCache.set(path, context);
    return context;
  }

  /**
   * 获取导入信息并添加到required imports
   */
  private getImportInfoForContext(
    context: ContextInfo,
    importManager: SmartImportManager,
    requiredImports: Set<string>
  ): ImportInfo {
    const importInfo = importManager.getImportInfo(context);
    // 序列化导入信息以便后续处理
    requiredImports.add(JSON.stringify(importInfo));
    return importInfo;
  }

  /**
   * 提取原始文本
   */
  private extractOriginalText(
    code: string,
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
  ): string {
    const lines = code.split('\n');
    
    if (startLine === endLine) {
      // 单行情况
      return lines[startLine - 1].substring(startColumn, endColumn);
    } else {
      // 多行情况
      let result = '';
      for (let i = startLine - 1; i < endLine; i++) {
        if (i === startLine - 1) {
          // 第一行：从startColumn开始
          result += lines[i].substring(startColumn);
        } else if (i === endLine - 1) {
          // 最后一行：到endColumn结束
          result += '\n' + lines[i].substring(0, endColumn);
        } else {
          // 中间行：完整行
          result += '\n' + lines[i];
        }
      }
      return result;
    }
  }

  /**
   * 构建模板字面量
   */
  private buildTemplateLiteral(
    parts: string[],
    expressions: t.Expression[]
  ): t.TemplateLiteral {
    const quasis = parts.map((part, index) =>
      t.templateElement({ raw: part, cooked: part }, index === parts.length - 1)
    );
    return t.templateLiteral(quasis, expressions);
  }

  /**
   * 记录待替换节点
   */
  private recordPendingReplacement(
    path: NodePath<t.Node>,
    originalNode: t.Node,
    replacementNode: t.Node | t.Node[],
    originalText?: string
  ): void {
    this.pendingReplacements.set(path, {
      originalNode,
      replacementNode,
      originalText,
      isTopLevel: true // 先假设是顶级，后面会调整
    });
  }

  /**
   * 处理字符串字面量
   */
  private handleStringLiteral(
    path: NodePath<t.StringLiteral>,
    patternRegex: RegExp,
    originalCode: string,
    existingValueToKey: Map<string, string | number>,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    generatedKeysMap: Map<string, string | number>,
    importManager: SmartImportManager,
    requiredImports: Set<string>,
    smartCallFactory: Function,
    options: TransformOptions,
    filePath: string
  ): void {
    // 检查是否被覆盖
    if (this.coveredNodes.has(path.node)) {
      return;
    }

    const context = this.getContextInfo(path);
    const importInfo = this.getImportInfoForContext(context, importManager, requiredImports);

    // 处理具体的字符串替换逻辑
    // ... 这里包含原有的StringLiteral处理逻辑 ...
  }

  /**
   * 处理模板字面量
   */
  private handleTemplateLiteral(
    path: NodePath<t.TemplateLiteral>,
    patternRegex: RegExp,
    originalCode: string,
    existingValueToKey: Map<string, string | number>,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    generatedKeysMap: Map<string, string | number>,
    importManager: SmartImportManager,
    requiredImports: Set<string>,
    smartCallFactory: Function,
    options: TransformOptions,
    filePath: string
  ): void {
    // 处理模板字面量的逻辑
    // ... 这里包含原有的TemplateLiteral处理逻辑 ...
  }

  /**
   * 处理JSX文本
   */
  private handleJSXText(
    path: NodePath<t.JSXText>,
    patternRegex: RegExp,
    originalCode: string,
    existingValueToKey: Map<string, string | number>,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    generatedKeysMap: Map<string, string | number>,
    importManager: SmartImportManager,
    requiredImports: Set<string>,
    smartCallFactory: Function,
    options: TransformOptions,
    filePath: string
  ): void {
    // 处理JSX文本的逻辑
    // ... 这里包含原有的JSXText处理逻辑 ...
  }

  /**
   * 处理嵌套替换
   */
  private processNestedReplacements(): void {
    // 标记嵌套节点
    for (const [parentPath, parentReplacement] of this.pendingReplacements) {
      for (const [childPath, childReplacement] of this.pendingReplacements) {
        if (parentPath !== childPath && this.isDescendant(parentPath, childPath)) {
          childReplacement.isTopLevel = false;
          this.coveredNodes.add(childPath.node);
        }
      }
    }
  }

  /**
   * 检查是否为后代节点
   */
  private isDescendant(parentPath: NodePath<t.Node>, childPath: NodePath<t.Node>): boolean {
    let current = childPath.parentPath;
    while (current) {
      if (current === parentPath) {
        return true;
      }
      current = current.parentPath;
    }
    return false;
  }

  /**
   * 生成最终的变更列表
   */
  private generateChanges(originalCode: string): ChangeDetail[] {
    const changes: ChangeDetail[] = [];

    for (const [path, replacement] of this.pendingReplacements) {
      if (!replacement.isTopLevel) {
        continue; // 跳过非顶级替换
      }

      const node = path.node;
      if (node.start === null || node.start === undefined || 
          node.end === null || node.end === undefined) {
        continue;
      }

      // 生成新代码
      const newCode = this.generateReplacementCode(replacement.replacementNode);
      
      // 计算行列信息
      const lines = originalCode.substring(0, node.start).split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length;
      
      const endLines = originalCode.substring(0, node.end).split('\n');
      const endLine = endLines.length;
      const endColumn = endLines[endLines.length - 1].length;

      changes.push({
        filePath: "", // 需要从外部传入
        original: replacement.originalText || originalCode.slice(node.start, node.end),
        replacement: newCode,
        line,
        column,
        endLine,
        endColumn,
        start: node.start,
        end: node.end,
      });
    }

    return changes.sort((a, b) => (a.start || 0) - (b.start || 0));
  }

  /**
   * 生成替换代码
   */
  private generateReplacementCode(replacementNode: t.Node | t.Node[]): string {
    // 这里需要实现代码生成逻辑
    // 可以使用 @babel/generator 或者自定义生成器
    return ""; // 临时返回
  }
}
