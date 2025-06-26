import { parse } from "@babel/parser";
import * as t from "@babel/types";
import {
  ExtractedString,
  TransformOptions,
  UsedExistingKey,
  ChangeDetail,
  FrameworkCodeGenerator,
} from "../types";
import { collectReplacementInfo } from "../enhanced-ast-replacer";
import { collectContextAwareReplacementInfo } from "../context-aware-ast-replacer";
import { StringReplacer } from "../string-replacer";
import { SmartImportManager } from "../smart-import-manager";
import {
  hasTranslationHook,
  isJSXElement,
  isJSXFragment,
} from "./react-support";

/**
 * 统一的 React 代码生成器
 * 自动选择使用上下文感知模式或传统模式
 */
export class UnifiedReactCodeGenerator implements FrameworkCodeGenerator {
  name = "react-unified";

  canHandle(code: string, filePath: string): boolean {
    // 支持所有 JS/TS 相关文件
    if (/\.(jsx|tsx|js|ts)$/.test(filePath)) {
      return true;
    }
    return false;
  }

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
  } {
    try {
      // 1. 解析 AST
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "decorators-legacy"],
        strictMode: false,
      });

      const extractedStrings: ExtractedString[] = [];
      const usedExistingKeysList: UsedExistingKey[] = [];

      // 2. 决定使用哪种模式
      const useContextAware = this.shouldUseContextAwareMode(options);

      let result;
      if (useContextAware) {
        // 使用上下文感知模式
        const importManager = new SmartImportManager(
          options.i18nConfig?.i18nImport,
          options.i18nConfig?.nonReactConfig
        );

        result = collectContextAwareReplacementInfo(
          ast,
          code,
          existingValueToKey || new Map(),
          extractedStrings,
          usedExistingKeysList,
          importManager,
          options,
          filePath
        );
      } else {
        // 使用传统增强模式
        const translationMethod = options.i18nConfig?.i18nImport?.name || options.translationMethod || "t";
        result = collectReplacementInfo(
          ast,
          code,
          existingValueToKey || new Map(),
          extractedStrings,
          usedExistingKeysList,
          translationMethod,
          options,
          filePath
        );
      }

      // 3. 如果没有任何修改，直接返回原代码
      if (!result.modified || result.changes.length === 0) {
        return {
          code,
          extractedStrings,
          usedExistingKeysList,
          changes: result.changes,
        };
      }

      // 4. 使用字符串替换应用修改
      let modifiedCode = StringReplacer.applyChanges(code, result.changes);

      // 5. 添加必要的导入（仅限上下文感知模式）
      if (useContextAware && 'requiredImports' in result) {
        modifiedCode = this.addImportsIfNeeded(
          modifiedCode,
          result.requiredImports as Set<string>,
          filePath
        );
      } else if (!useContextAware) {
        // 传统模式的 Hook 处理
        modifiedCode = this.addTraditionalHookIfNeeded(
          modifiedCode,
          options,
          filePath
        );
      }

      return {
        code: modifiedCode,
        extractedStrings,
        usedExistingKeysList,
        changes: result.changes,
      };
    } catch (error) {
      console.error(`Error processing React code in ${filePath}:`, error);
      // 返回原代码作为 fallback
      return {
        code,
        extractedStrings: [],
        usedExistingKeysList: [],
        changes: [],
      };
    }
  }

  /**
   * 判断是否应该使用上下文感知模式
   */
  private shouldUseContextAwareMode(options: TransformOptions): boolean {
    // 如果配置了 nonReactConfig，使用上下文感知模式
    return !!(options.i18nConfig?.nonReactConfig);
  }

  /**
   * 添加必要的导入和 Hook 调用（上下文感知模式）
   */
  private addImportsIfNeeded(
    code: string,
    requiredImports: Set<string>,
    filePath: string
  ): string {
    if (requiredImports.size === 0) {
      return code;
    }

    try {
      let modifiedCode = code;
      const addedImports = new Set<string>();

      for (const importInfoStr of requiredImports) {
        const parsedImport = JSON.parse(importInfoStr);
        
        // 根据导入类型创建唯一标识符
        const importKey = parsedImport.needsHook && parsedImport.hookImport
          ? `${parsedImport.hookImport.importName}-${parsedImport.hookImport.source}`
          : `${parsedImport.callName}-${parsedImport.importStatement}`;

        // 检查是否已经添加过相同的导入
        if (addedImports.has(importKey)) {
          continue;
        }

        // 检查代码中是否已经存在 import
        if (!this.hasExistingImport(modifiedCode, parsedImport)) {
          modifiedCode = this.addImportStatement(modifiedCode, parsedImport);
          addedImports.add(importKey);
        }

        // 如果需要 Hook 调用，添加 Hook 调用
        if (parsedImport.needsHook && parsedImport.hookImport) {
          modifiedCode = this.addHookCallIfNeeded(modifiedCode, parsedImport.hookImport);
        }
      }

      return modifiedCode;
    } catch (error) {
      console.warn(`Failed to add imports to ${filePath}:`, error);
      return code;
    }
  }

  /**
   * 传统模式的 Hook 处理
   */
  private addTraditionalHookIfNeeded(
    code: string,
    options: TransformOptions,
    filePath: string
  ): string {
    try {
      const hookName = options.i18nConfig?.i18nImport?.importName || options.hookName || "useTranslation";
      const hookImport = options.i18nConfig?.i18nImport?.source || options.hookImport || "react-i18next";
      const translationMethod = options.i18nConfig?.i18nImport?.name || options.translationMethod || "t";

      // 检查是否已经有 hook 导入
      if (!this.hasHookImport(code, hookName, hookImport)) {
        code = this.addHookImport(code, hookName, hookImport);
      }

      // 检查是否已经有 hook 调用
      if (!hasTranslationHook(code, hookName)) {
        code = this.addHookCall(code, hookName, translationMethod);
      }

      return code;
    } catch (error) {
      console.warn(`Failed to add traditional hook to ${filePath}:`, error);
      return code;
    }
  }

  /**
   * 检查是否已存在导入
   */
  private hasExistingImport(code: string, importInfo: any): boolean {
    if (importInfo.needsHook && importInfo.hookImport) {
      // 检查 Hook 导入
      const hookPattern = new RegExp(
        `import\\s+.*\\b${this.escapeRegex(importInfo.hookImport.importName)}\\b.*from\\s+['"]${this.escapeRegex(importInfo.hookImport.source)}['"]`
      );
      return hookPattern.test(code);
    } else {
      // 检查普通导入 - 使用导入语句直接匹配
      const normalizedStatement = importInfo.importStatement
        .replace(/\s+/g, ' ')
        .trim();
      
      // 从 import 语句中提取关键信息进行更精确的匹配
      const sourceMatch = normalizedStatement.match(/from\s+['"]([^'"]+)['"]/);
      const nameMatch = normalizedStatement.match(/import\s+(?:\{[^}]*\b(\w+)\b[^}]*\}|(\w+))/);
      
      if (sourceMatch && nameMatch) {
        const source = sourceMatch[1];
        const name = nameMatch[1] || nameMatch[2]; // 命名导入 或 默认导入
        
        const pattern = new RegExp(
          `import\\s+.*\\b${this.escapeRegex(name)}\\b.*from\\s+['"]${this.escapeRegex(source)}['"]`
        );
        return pattern.test(code);
      }
      
      // 回退检查：检查是否包含类似的导入语句
      return code.includes(normalizedStatement);
    }
  }

  /**
   * 检查是否已有 Hook 导入（传统模式）
   */
  private hasHookImport(code: string, hookName: string, source: string): boolean {
    const pattern = new RegExp(
      `import\\s+.*\\b${this.escapeRegex(hookName)}\\b.*from\\s+['"]${this.escapeRegex(source)}['"]`
    );
    return pattern.test(code);
  }

  /**
   * 添加导入语句
   */
  private addImportStatement(code: string, importInfo: any): string {
    const importStatement = importInfo.needsHook && importInfo.hookImport
      ? importInfo.hookImport.importStatement || importInfo.importStatement
      : importInfo.importStatement;

    return this.insertImportAtTop(code, importStatement);
  }

  /**
   * 添加 Hook 导入（传统模式）
   */
  private addHookImport(code: string, hookName: string, source: string): string {
    const importStatement = `import { ${hookName} } from '${source}';`;
    return this.insertImportAtTop(code, importStatement);
  }

  /**
   * 在代码顶部插入导入语句
   */
  private insertImportAtTop(code: string, importStatement: string): string {
    const lines = code.split("\n");
    let insertIndex = 0;

    // 跳过'use strict'或其他指令
    while (
      insertIndex < lines.length &&
      (lines[insertIndex].trim().startsWith('"use ') ||
        lines[insertIndex].trim().startsWith("'use ") ||
        lines[insertIndex].trim() === "")
    ) {
      insertIndex++;
    }

    // 找到最后一个import语句的位置
    let lastImportIndex = -1;
    for (let i = insertIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (
        line.startsWith("import ") &&
        !line.includes("//") &&
        !line.includes("/*")
      ) {
        lastImportIndex = i;
      } else if (line && !line.startsWith("//") && !line.startsWith("/*")) {
        break; // 遇到非import的实际代码行就停止
      }
    }

    // 在最后一个import后插入，或在文件开头插入
    const insertPosition =
      lastImportIndex >= 0 ? lastImportIndex + 1 : insertIndex;
    lines.splice(insertPosition, 0, importStatement);

    return lines.join("\n");
  }

  /**
   * 添加 Hook 调用（如果需要且不存在）
   */
  private addHookCallIfNeeded(code: string, hookInfo: any): string {
    const hookCall = hookInfo.hookCall;
    
    // 检查是否已经存在 Hook 调用
    if (code.includes(hookCall)) {
      return code;
    }

    // 查找 React 函数组件并添加 Hook 调用
    return this.addHookCallToComponents(code, hookCall);
  }

  /**
   * 添加 Hook 调用（传统模式）
   */
  private addHookCall(code: string, hookName: string, translationMethod: string): string {
    const hookCall = `const { ${translationMethod} } = ${hookName}();`;
    return this.addHookCallToComponents(code, hookCall);
  }

  /**
   * 向 React 组件添加 Hook 调用
   */
  private addHookCallToComponents(code: string, hookCall: string): string {
    // 查找函数组件
    const functionComponentPattern =
      /^(\s*)(export\s+default\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/gm;
    const arrowComponentPattern =
      /^(\s*)(export\s+default\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*[:=]\s*\([^)]*\)\s*=>\s*\{/gm;

    let match;
    let modifiedCode = code;

    // 尝试匹配函数组件
    functionComponentPattern.lastIndex = 0;
    match = functionComponentPattern.exec(code);
    if (match) {
      const indent = match[1];
      const insertIndex = match.index + match[0].length;
      modifiedCode =
        code.slice(0, insertIndex) +
        "\n" +
        indent +
        "  " +
        hookCall +
        "\n" +
        code.slice(insertIndex);
      return modifiedCode;
    }

    // 尝试匹配箭头函数组件
    arrowComponentPattern.lastIndex = 0;
    match = arrowComponentPattern.exec(code);
    if (match) {
      const indent = match[1];
      const insertIndex = match.index + match[0].length;
      modifiedCode =
        code.slice(0, insertIndex) +
        "\n" +
        indent +
        "  " +
        hookCall +
        "\n" +
        code.slice(insertIndex);
      return modifiedCode;
    }

    return code;
  }

  /**
   * 转义正则表达式特殊字符
   */
  private escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
}
