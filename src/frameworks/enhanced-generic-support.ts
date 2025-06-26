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

/**
 * 通用的增强代码生成器 - 处理普通的JS/TS文件
 * 使用字符串替换而非AST重新生成，保持原始代码格式
 */
export class EnhancedGenericCodeGenerator implements FrameworkCodeGenerator {
  name = "generic-enhanced";

  canHandle(code: string, filePath: string): boolean {
    // 处理所有JS/TS文件，但优先级较低
    return /\.(ts|js|mts|cts|mjs|cjs)$/.test(filePath);
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
        plugins: ["typescript", "decorators-legacy"],
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

      // 5. 对于普通JS/TS文件，我们不添加React hooks
      // 只是进行字符串替换，假设翻译函数已经可用
      
      return {
        code: modifiedCode,
        extractedStrings,
        usedExistingKeysList,
        changes: result.changes,
      };
    } catch (error) {
      console.error(`Error processing generic code in ${filePath}:`, error);
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
}
