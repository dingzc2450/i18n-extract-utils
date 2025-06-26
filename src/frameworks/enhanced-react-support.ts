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
import { StringReplacer } from "../string-replacer";
import {
  hasTranslationHook,
  isJSXElement,
  isJSXFragment,
} from "./react-support";

/**
 * 增强的React代码生成器 - 使用字符串替换而非AST重新生成
 * 保持原始代码格式，避免格式化问题
 */
export class EnhancedReactCodeGenerator implements FrameworkCodeGenerator {
  name = "react-enhanced";

  canHandle(code: string, filePath: string): boolean {
    // 检查是否为JSX/TSX文件或包含React相关代码
    const isReactFile = /\.(jsx|tsx)$/.test(filePath) || 
                       code.includes("from 'react'") ||
                       code.includes("from \"react\"") ||
                       code.includes("React.") ||
                       /<[A-Z]/.test(code) ||
                       code.includes("jsx") ||
                       code.includes("JSX");
    
    return isReactFile;
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
      // 1. 解析AST
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript", "decorators-legacy"],
        strictMode: false,
      });

      // 2. 收集替换信息而不修改AST
      const extractedStrings: ExtractedString[] = [];
      const usedExistingKeysList: UsedExistingKey[] = [];
      
      const translationMethod = this.getTranslationMethod(options);
      
      const result = collectReplacementInfo(
        ast,
        code,
        existingValueToKey || new Map(),
        extractedStrings,
        usedExistingKeysList,
        translationMethod,
        options,
        filePath
      );

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

      // 5. 检查是否需要添加hook和import
      const needsHookAndImport = extractedStrings.length > 0 || usedExistingKeysList.length > 0;
      if (needsHookAndImport) {
        modifiedCode = this.addHookAndImportIfNeeded(
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
      // 返回原代码作为fallback
      return {
        code,
        extractedStrings: [],
        usedExistingKeysList: [],
        changes: [],
      };
    }
  }

  private getTranslationMethod(options: TransformOptions): string {
    if (options.i18nConfig?.i18nImport?.name) {
      return options.i18nConfig.i18nImport.name;
    }
    if (options.translationMethod) {
      return options.translationMethod;
    }
    return "t";
  }

  private addHookAndImportIfNeeded(
    code: string,
    options: TransformOptions,
    filePath: string
  ): string {
    try {
      // 获取配置信息
      const hookName = options.i18nConfig?.i18nImport?.importName || 
                      options.hookName || 
                      "useTranslation";
      const hookImport = options.i18nConfig?.i18nImport?.source || 
                        options.hookImport || 
                        "react-i18next";

      // 检查是否已经存在hook
      if (hasTranslationHook(code, hookName)) {
        return code;
      }

      // 使用字符串操作添加import和hook调用
      return this.addImportAndHookWithStringOps(code, hookName, hookImport, options);
    } catch (error) {
      console.warn(`Failed to add hook and import to ${filePath}:`, error);
      return code;
    }
  }

  private addImportAndHookWithStringOps(
    code: string,
    hookName: string,
    hookImport: string,
    options: TransformOptions
  ): string {
    let modifiedCode = code;

    // 1. 添加import（如果不存在）
    if (!this.hasImport(code, hookImport, hookName)) {
      modifiedCode = this.addImportStatement(modifiedCode, hookName, hookImport);
    }

    // 2. 添加hook调用（如果不存在）
    if (!hasTranslationHook(modifiedCode, hookName)) {
      modifiedCode = this.addHookCall(modifiedCode, hookName, options);
    }

    return modifiedCode;
  }

  private hasImport(code: string, source: string, importName: string): boolean {
    // 检查是否已有相应的import语句
    const importPattern = new RegExp(
      `import\\s+.*\\b${importName}\\b.*from\\s+['"]${source.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"]`,
      'g'
    );
    return importPattern.test(code);
  }

  private addImportStatement(code: string, hookName: string, hookImport: string): string {
    const importStatement = `import { ${hookName} } from '${hookImport}';`;
    
    // 查找合适的插入位置
    const lines = code.split('\n');
    let insertIndex = 0;
    
    // 跳过'use strict'或其他指令
    while (insertIndex < lines.length && 
           (lines[insertIndex].trim().startsWith('"use ') || 
            lines[insertIndex].trim().startsWith("'use ") ||
            lines[insertIndex].trim() === '')) {
      insertIndex++;
    }
    
    // 找到最后一个import语句的位置
    let lastImportIndex = -1;
    for (let i = insertIndex; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('import ') && !line.includes('//') && !line.includes('/*')) {
        lastImportIndex = i;
      } else if (line && !line.startsWith('//') && !line.startsWith('/*')) {
        break; // 遇到非import的实际代码行就停止
      }
    }
    
    // 在最后一个import后插入，或在文件开头插入
    const insertPosition = lastImportIndex >= 0 ? lastImportIndex + 1 : insertIndex;
    lines.splice(insertPosition, 0, importStatement);
    
    return lines.join('\n');
  }

  private addHookCall(code: string, hookName: string, options: TransformOptions): string {
    const translationMethod = this.getTranslationMethod(options);
    const hookCall = `const { ${translationMethod} } = ${hookName}();`;
    
    // 查找React函数组件
    const functionComponentPattern = /^(\s*)(export\s+default\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\([^)]*\)\s*\{/gm;
    const arrowComponentPattern = /^(\s*)(export\s+default\s+)?const\s+([A-Z][a-zA-Z0-9]*)\s*[:=]\s*\([^)]*\)\s*=>\s*\{/gm;
    
    let match;
    let modifiedCode = code;
    
    // 尝试匹配函数组件
    functionComponentPattern.lastIndex = 0;
    match = functionComponentPattern.exec(code);
    if (match) {
      const indent = match[1];
      const insertIndex = match.index + match[0].length;
      // 添加适当的缩进和换行
      modifiedCode = code.slice(0, insertIndex) + '\n' + indent + '  ' + hookCall + '\n' + code.slice(insertIndex);
      return modifiedCode;
    }
    
    // 尝试匹配箭头函数组件
    arrowComponentPattern.lastIndex = 0;
    match = arrowComponentPattern.exec(code);
    if (match) {
      const indent = match[1];
      const insertIndex = match.index + match[0].length;
      modifiedCode = code.slice(0, insertIndex) + '\n' + indent + '  ' + hookCall + '\n' + code.slice(insertIndex);
      return modifiedCode;
    }
    
    // 如果找不到合适的位置，尝试在第一个return语句前插入
    const returnPattern = /^(\s*)return\s+/gm;
    match = returnPattern.exec(code);
    if (match) {
      const indent = match[1];
      const insertIndex = match.index;
      modifiedCode = code.slice(0, insertIndex) + indent + hookCall + '\n' + code.slice(insertIndex);
      return modifiedCode;
    }
    
    console.warn('Could not find suitable location to add hook call');
    return code;
  }
}

/**
 * 工厂函数 - 创建增强的React代码生成器
 */
export function createEnhancedReactCodeGenerator(): EnhancedReactCodeGenerator {
  return new EnhancedReactCodeGenerator();
}
