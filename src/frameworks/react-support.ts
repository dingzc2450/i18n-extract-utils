/**
 * React 框架插件
 * 负责React相关的处理逻辑，包括JSX组件检测、Hook导入等
 */

import * as tg from "../babel-type-guards";

import {
  ExtractedString,
  TransformOptions,
} from "../types";

// 添加 ReactTransformer 相关的导入
import generate from "@babel/generator";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import { replaceStringsWithTCalls } from "./ast-replacer";
import { formatGeneratedCode } from "../code-formatter";
import { fallbackTransform } from "../fallback-transform";
import {
  ChangeDetail,
  I18nTransformer,
  UsedExistingKey,
} from "../types";
import { isJSXElement, isJSXFragment } from "../babel-type-guards";


/**
 * Traverses the AST to add the translation hook import and call if necessary.
 * @param ast The Babel AST root node.
 * @param translationMethod The name of the translation function (or 'default').
 * @param hookName The name of the translation hook.
 * @param hookImport The import source for the hook.
 * @returns { importAdded: boolean, hookCallAdded: boolean } Flags indicating additions.
 */
function addHookAndImport(
  ast: t.File,
  translationMethod: string,
  hookName: string,
  hookImport: string
): { importAdded: boolean; hookCallAdded: boolean } {
  let importAdded = false;
  let hookCallAdded = false;

  traverse(ast, {
    Program: {
      enter(path) {
        // Check if import already exists
        let importExists = false;
        path.node.body.forEach((node) => {
          if (
            tg.isImportDeclaration(node) &&
            node.source.value === hookImport
          ) {
            node.specifiers.forEach((spec) => {
              if (
                tg.isImportSpecifier(spec) &&
                tg.isIdentifier(spec.imported) &&
                spec.imported.name === hookName
              ) {
                importExists = true;
              }
            });
          }
        });

        // Add import if it doesn't exist
        if (!importExists) {
          const importSpecifier = t.importSpecifier(
            t.identifier(hookName),
            t.identifier(hookName)
          );
          const importDeclaration = t.importDeclaration(
            [importSpecifier],
            t.stringLiteral(hookImport)
          );

          // Find the correct insertion point (after directives and other imports)
          let lastDirectiveIndex = -1;
          let lastImportIndex = -1;
          for (let i = 0; i < path.node.body.length; i++) {
            const node = path.node.body[i];
            if (
              tg.isExpressionStatement(node) &&
              tg.isStringLiteral(node.expression) &&
              path.node.directives?.some(
                (dir) =>
                  dir.value.value ===
                  (tg.isStringLiteral(node.expression)
                    ? node.expression.value
                    : "")
              )
            ) {
              lastDirectiveIndex = i;
            } else if (tg.isImportDeclaration(node)) {
              lastImportIndex = i;
            }
          }
          let insertIndex = 0;
          if (lastImportIndex !== -1) {
            insertIndex = lastImportIndex + 1;
          } else if (lastDirectiveIndex !== -1) {
            insertIndex = lastDirectiveIndex + 1;
          }
          path.node.body.splice(insertIndex, 0, importDeclaration);
          importAdded = true;
        }
      },
    },
    "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": (
      path
    ) => {
      // 跳过嵌套函数
      if (path.findParent((p) => tg.isFunction(p.node))) {
        return;
      }

      // 检查是否为组件（返回JSX）或自定义hook（函数名以use开头）
      let returnsJSX = false;

      // 检查函数名
      if (
        tg.isFunction(path.node) &&
        (tg.isFunctionDeclaration(path.node) ||
          tg.isFunctionExpression(path.node)) &&
        path.node.id &&
        /^use[A-Z\d_]/.test(path.node.id.name)
      ) {
      }

      // 检查是否返回JSX
      path.traverse({
        ReturnStatement(returnPath) {
          if (
            returnPath.node.argument &&
            (isJSXElement(returnPath.node.argument) ||
              isJSXFragment(returnPath.node.argument))
          ) {
            returnsJSX = true;
            returnPath.stop();
          }
        },
      });

      // 检查函数体内是否有翻译函数调用
      let hasTCall = false;
      path.traverse({
        CallExpression(callPath) {
          if (
            tg.isIdentifier(callPath.node.callee) &&
            callPath.node.callee.name === translationMethod
          ) {
            hasTCall = true;
            callPath.stop();
          }
        },
      });

      // 只有当组件返回JSX并且实际使用了翻译函数时，才插入hook
      if (
        returnsJSX &&
        hasTCall &&
        tg.isFunction(path.node) &&
        path.node.body &&
        tg.isBlockStatement(path.node.body)
      ) {
        // Check if the hook call already exists
        let callExists = false;
        path.node.body.body.forEach((stmt) => {
          if (tg.isVariableDeclaration(stmt)) {
            stmt.declarations.forEach((decl) => {
              if (
                tg.isVariableDeclarator(decl) &&
                tg.isCallExpression(decl.init) &&
                tg.isIdentifier(decl.init.callee) &&
                decl.init.callee.name === hookName
              ) {
                if (tg.isIdentifier(decl.id) || tg.isObjectPattern(decl.id)) {
                  callExists = true;
                }
              }
            });
          }
        });

        // Add hook call if it doesn't exist
        if (!callExists) {
          const callExpression = t.callExpression(t.identifier(hookName), []);
          let variableDeclarator;

          if (translationMethod === "default") {
            variableDeclarator = t.variableDeclarator(
              t.identifier("t"),
              callExpression
            );
          } else {
            const hookIdentifier = t.identifier(translationMethod);
            const objectPattern = t.objectPattern([
              t.objectProperty(hookIdentifier, hookIdentifier, false, true),
            ]);
            variableDeclarator = t.variableDeclarator(
              objectPattern,
              callExpression
            );
          }

          const variableDeclaration = t.variableDeclaration("const", [
            variableDeclarator,
          ]);
          path.node.body.body.unshift(variableDeclaration);
          hookCallAdded = true;
        }
      }
    },
  });

  return { importAdded, hookCallAdded };
}

/**
 * React 框架多语言提取与替换实现
 */
export class ReactTransformer implements I18nTransformer {
  extractAndReplace(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ) {
    const translationMethod =
      options.i18nConfig?.i18nImport?.name || options.translationMethod || "t"; // 已废弃，建议通过 options 传递框架配置
    const hookName =
      options.i18nConfig?.i18nImport?.importName ||
      options.hookName ||
      "useTranslation"; // 已废弃
    const hookImport =
      options.i18nConfig?.i18nImport?.source ||
      options.hookImport ||
      "react-i18next"; // 已废弃
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];
    let changes: ChangeDetail[] = [];
    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["jsx", "typescript"],
        errorRecovery: true,
      });
      const { modified, changes: replacementChanges } =
        replaceStringsWithTCalls(
          ast,
          existingValueToKey || new Map(),
          extractedStrings,
          usedExistingKeysList,
          translationMethod,
          options,
          filePath
        );
      changes = replacementChanges;
      // 如果没有修改，直接返回原始代码
      if (!modified && extractedStrings.length === 0) {
        return { code, extractedStrings, usedExistingKeysList, changes: [] };
      }
      // hook 相关逻辑
      // addHookAndImport 函数足够智能，可以按组件处理现有的 hook，
      // 因此只要有修改，我们就会调用它。
      const { importAdded, hookCallAdded } = addHookAndImport(
        ast,
        translationMethod,
        hookName,
        hookImport
      );

      let { code: generatedCode } = generate(ast, {
        retainLines: true,
        compact: false,
        comments: true,
        jsescOption: { minimal: true },
      });
      const transformedCode = formatGeneratedCode(generatedCode, {
        importAdded,
        hookCallAdded,
        hookName,
        hookImport,
        // 仅在实际添加了 hook 时才传递 translationMethod，
        // 以避免在所有组件都已有 hook 的情况下添加未使用的变量。
        translationMethod: hookCallAdded ? translationMethod : undefined,
      });
      return {
        code: transformedCode,
        extractedStrings,
        usedExistingKeysList,
        changes,
      };
    } catch (error) {
      console.error(`[${filePath}] Error during AST transformation: ${error}`);
      if (error instanceof Error) {
        console.error(error.stack);
      }
      console.error(
        `[${filePath}] Falling back to simple regex replacement (key generation/reuse might be inaccurate in fallback)`
      );
      const transformedCode = fallbackTransform(
        code,
        extractedStrings,
        options
      );
      return {
        code: transformedCode,
        extractedStrings: [],
        usedExistingKeysList: [],
        changes: [],
      };
    }
  }
}
