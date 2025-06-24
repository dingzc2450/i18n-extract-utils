import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { I18nTransformer, TransformOptions, ExtractedString, UsedExistingKey, ChangeDetail } from "../types";
import { formatGeneratedCode } from "../code-formatter";
import { fallbackTransform } from "../fallback-transform";
import { replaceStringsWithTCalls } from "../ast-replacer";

/**
 * React 15 版本的多语言提取与替换实现（无 hook，仅全局函数调用）
 */
export class React15Transformer implements I18nTransformer {
  extractAndReplace(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ) {
    // 全局国际化函数名和导入路径，可通过 options 配置
    // 1. 解析多语言配置
    const i18nConfig = options.i18nConfig || {};
    const i18nImportConfig = i18nConfig.i18nImport || { name: "t", source: "i18n-lib" };
    const i18nFuncName = i18nImportConfig.name;
    const i18nImport = i18nImportConfig.source;
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];
    let changes: ChangeDetail[] = [];
    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
        errorRecovery: true,
      });
      // 1. 替换文本为 t('key')，支持自定义调用生成
      const callFactory = i18nConfig.i18nCall || ((callName, key) => t.callExpression(t.identifier(callName), [t.stringLiteral(String(key))]));
      const { modified, changes: replacementChanges } = replaceStringsWithTCalls(
        ast,
        existingValueToKey || new Map(),
        extractedStrings,
        usedExistingKeysList,
        i18nFuncName,
        options,
        filePath
      );
      changes = replacementChanges;
      // 2. 检查是否已导入 t
      let importExists = false;
      traverse(ast, {
        ImportDeclaration(path) {
          if (
            path.node.source.value === i18nImport &&
            path.node.specifiers.some(
              (spec) =>
                t.isImportSpecifier(spec) &&
                t.isIdentifier(spec.imported) &&
                spec.imported.name === (i18nImportConfig.importName || i18nFuncName)
            )
          ) {
            importExists = true;
            path.stop();
          }
        },
      });
      // 3. 如无导入则插入 import 语句，支持自定义
      if (!importExists) {
        const program = ast.program;
        let lastImportIndex = -1;
        for (let i = 0; i < program.body.length; i++) {
          if (t.isImportDeclaration(program.body[i])) {
            lastImportIndex = i;
          }
        }
        if (i18nImportConfig.custom) {
          const importAst = parse(i18nImportConfig.custom, { sourceType: "module" });
          const importNode = importAst.program.body[0];
          program.body.splice(lastImportIndex + 1, 0, importNode);
        } else {
          const importSpecifier = t.importSpecifier(
            t.identifier(i18nImportConfig.importName || i18nFuncName),
            t.identifier(i18nFuncName)
          );
          const importDeclaration = t.importDeclaration(
            [importSpecifier],
            t.stringLiteral(i18nImport)
          );
          program.body.splice(lastImportIndex + 1, 0, importDeclaration);
        }
      }
      // 4. 生成代码
      let { code: generatedCode } = generate(ast, {
        retainLines: true,
        compact: false,
        comments: true,
        jsescOption: { minimal: true },
      });
      const transformedCode = formatGeneratedCode(generatedCode, {
        importAdded: !importExists,
        hookCallAdded: false,
        hookName: i18nImportConfig.importName || i18nFuncName,
        hookImport: i18nImport,
        translationMethod: i18nFuncName,
      });
      return {
        code: transformedCode,
        extractedStrings,
        usedExistingKeysList,
        changes,
      };
    } catch (error) {
      console.error(`[${filePath}] React15 AST transformation error: ${error}`);
      if (error instanceof Error) {
        console.error(error.stack);
      }
      const transformedCode = fallbackTransform(code, extractedStrings, options);
      return {
        code: transformedCode,
        extractedStrings: [],
        usedExistingKeysList: [],
        changes: [],
      };
    }
  }
}
