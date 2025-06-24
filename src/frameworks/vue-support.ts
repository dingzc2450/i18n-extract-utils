// vue-support.ts
// Vue 框架的多语言提取与替换实现

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { I18nTransformer, TransformOptions, ExtractedString, UsedExistingKey, ChangeDetail } from "../types";
import { formatGeneratedCode } from "../code-formatter";
import { fallbackTransform } from "../fallback-transform";
import { replaceStringsWithTCalls } from "../ast-replacer";

/**
 * Vue 框架的多语言提取与替换实现
 * 支持 Vue 3 Composition API 和 Vue 2 Options API
 */
export class VueTransformer implements I18nTransformer {
  extractAndReplace(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ) {
    const i18nConfig = options.i18nConfig || {};
    const i18nImportConfig = i18nConfig.i18nImport || {
      name: "t",
      importName: "useI18n",
      source: "vue-i18n"
    };
    
    const translationMethod = i18nImportConfig.name;
    const hookName = i18nImportConfig.importName || "useI18n";
    const hookImport = i18nImportConfig.source;
    
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];
    let changes: ChangeDetail[] = [];

    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"], // 添加 JSX 支持以处理混合代码
        errorRecovery: true,
      });

      // 1. 替换字符串为翻译调用
      const { modified, changes: replacementChanges } = replaceStringsWithTCalls(
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

      // 2. 检查是否需要添加 i18n 相关导入和设置
      const needsI18nSetup = modified || extractedStrings.length > 0;
      let importAdded = false;
      let setupAdded = false;

      if (needsI18nSetup) {
        const setupResult = this.addI18nSetup(ast, translationMethod, hookName, hookImport, code);
        importAdded = setupResult.importAdded;
        setupAdded = setupResult.setupAdded;
      }

      // 3. 生成代码
      let { code: generatedCode } = generate(ast, {
        retainLines: true,
        compact: false,
        comments: true,
        jsescOption: { minimal: true },
      });

      const transformedCode = formatGeneratedCode(generatedCode, {
        importAdded,
        hookCallAdded: setupAdded,
        hookName,
        hookImport,
        translationMethod: needsI18nSetup ? translationMethod : undefined,
      });

      return {
        code: transformedCode,
        extractedStrings,
        usedExistingKeysList,
        changes,
      };
    } catch (error) {
      console.error(`[${filePath}] Vue AST transformation error: ${error}`);
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

  /**
   * 为 Vue 组件添加 i18n 设置
   */
  private addI18nSetup(
    ast: t.File,
    translationMethod: string,
    hookName: string,
    hookImport: string,
    originalCode: string
  ): { importAdded: boolean; setupAdded: boolean } {
    let importAdded = false;
    let setupAdded = false;

    traverse(ast, {
      Program: {
        enter(path) {
          // 检查是否已有导入
          let importExists = false;
          path.node.body.forEach((node) => {
            if (
              t.isImportDeclaration(node) &&
              node.source.value === hookImport
            ) {
              node.specifiers.forEach((spec) => {
                if (
                  t.isImportSpecifier(spec) &&
                  t.isIdentifier(spec.imported) &&
                  spec.imported.name === hookName
                ) {
                  importExists = true;
                }
              });
            }
          });

          // 添加导入
          if (!importExists) {
            const importSpecifier = t.importSpecifier(
              t.identifier(hookName),
              t.identifier(hookName)
            );
            const importDeclaration = t.importDeclaration(
              [importSpecifier],
              t.stringLiteral(hookImport)
            );

            // 找到插入位置
            let insertIndex = 0;
            for (let i = 0; i < path.node.body.length; i++) {
              const node = path.node.body[i];
              if (t.isImportDeclaration(node)) {
                insertIndex = i + 1;
              }
            }

            path.node.body.splice(insertIndex, 0, importDeclaration);
            importAdded = true;
          }
        },
      },

      // 处理 Vue 3 Composition API
      "ObjectMethod|ObjectProperty": (path) => {
        if (
          (t.isObjectMethod(path.node) || t.isObjectProperty(path.node)) &&
          t.isIdentifier(path.node.key) &&
          path.node.key.name === "setup"
        ) {
          // 在 setup 函数中添加 useI18n
          this.addUseI18nToSetup(path, translationMethod, hookName);
          setupAdded = true;
        }
      },

      // 处理普通函数（可能是 setup 函数）
      "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": (path) => {
        // 检查是否有 t() 调用
        let hasTCall = false;
        path.traverse({
          CallExpression(callPath) {
            if (
              t.isIdentifier(callPath.node.callee) &&
              callPath.node.callee.name === translationMethod
            ) {
              hasTCall = true;
              callPath.stop();
            }
          },
        });

        if (hasTCall && 
            (t.isFunctionDeclaration(path.node) || 
             t.isFunctionExpression(path.node) || 
             t.isArrowFunctionExpression(path.node)) &&
            t.isBlockStatement(path.node.body)) {
          // 检查是否已有 i18n 设置
          let hasI18nSetup = false;
          path.node.body.body.forEach((stmt: t.Statement) => {
            if (t.isVariableDeclaration(stmt)) {
              stmt.declarations.forEach((decl) => {
                if (
                  t.isVariableDeclarator(decl) &&
                  t.isCallExpression(decl.init) &&
                  t.isIdentifier(decl.init.callee) &&
                  decl.init.callee.name === hookName
                ) {
                  hasI18nSetup = true;
                }
              });
            }
          });

          if (!hasI18nSetup) {
            // 添加 const { t } = useI18n()
            const callExpression = t.callExpression(t.identifier(hookName), []);
            const variableDeclarator = t.variableDeclarator(
              t.objectPattern([
                t.objectProperty(
                  t.identifier(translationMethod),
                  t.identifier(translationMethod),
                  false,
                  true
                ),
              ]),
              callExpression
            );
            const variableDeclaration = t.variableDeclaration("const", [
              variableDeclarator,
            ]);
            path.node.body.body.unshift(variableDeclaration);
            setupAdded = true;
          }
        }
      },
    });

    return { importAdded, setupAdded };
  }

  /**
   * 在 Vue setup 方法中添加 useI18n
   */
  private addUseI18nToSetup(
    path: any,
    translationMethod: string,
    hookName: string
  ): void {
    let setupBody: t.Statement[] = [];

    if (t.isObjectMethod(path.node) && t.isBlockStatement(path.node.body)) {
      setupBody = path.node.body.body;
    } else if (
      t.isObjectProperty(path.node) &&
      (t.isFunctionExpression(path.node.value) || t.isArrowFunctionExpression(path.node.value)) &&
      t.isBlockStatement(path.node.value.body)
    ) {
      setupBody = path.node.value.body.body;
    }

    if (setupBody.length > 0) {
      // 检查是否已有 useI18n
      let hasUseI18n = false;
      setupBody.forEach((stmt) => {
        if (t.isVariableDeclaration(stmt)) {
          stmt.declarations.forEach((decl) => {
            if (
              t.isVariableDeclarator(decl) &&
              t.isCallExpression(decl.init) &&
              t.isIdentifier(decl.init.callee) &&
              decl.init.callee.name === hookName
            ) {
              hasUseI18n = true;
            }
          });
        }
      });

      if (!hasUseI18n) {
        const callExpression = t.callExpression(t.identifier(hookName), []);
        const variableDeclarator = t.variableDeclarator(
          t.objectPattern([
            t.objectProperty(
              t.identifier(translationMethod),
              t.identifier(translationMethod),
              false,
              true
            ),
          ]),
          callExpression
        );
        const variableDeclaration = t.variableDeclaration("const", [
          variableDeclarator,
        ]);
        setupBody.unshift(variableDeclaration);
      }
    }
  }
}

/**
 * 检查代码中是否已存在 Vue i18n 相关的设置
 */
export function hasVueI18nSetup(
  code: string,
  hookName: string = "useI18n"
): boolean {
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    
    let hasSetup = false;
    traverse(ast, {
      CallExpression(path) {
        if (
          t.isIdentifier(path.node.callee) &&
          path.node.callee.name === hookName
        ) {
          hasSetup = true;
          path.stop();
        }
      },
    });
    
    return hasSetup;
  } catch (error) {
    console.error(`Error analyzing Vue code for i18n setup: ${error}`);
    return false;
  }
}

/**
 * Vue 组件类型判断工具
 */
export function isVueComponent(code: string): boolean {
  return (
    code.includes("export default") &&
    (code.includes("setup(") || 
     code.includes("setup:") || 
     code.includes("data()") || 
     code.includes("methods:"))
  );
}