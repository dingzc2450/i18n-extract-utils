// Vue 框架的多语言提取与替换实现

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import { I18nTransformer, TransformOptions, ExtractedString, UsedExistingKey, ChangeDetail } from "../types";
import { formatGeneratedCode } from "../code-formatter";
import { vueFallbackTransform } from "./vue-fallback-transform";
import { replaceStringsWithTCalls } from "../ast-replacer";
import { getKeyAndRecord } from "../key-manager";

/**
 * 将提取的注释附加到 AST 节点。
 * @param node 要附加注释的节点。
 * @param commentText 注释的文本。
 */
function attachExtractedCommentToNode(node: t.Node, commentText: string) {
  if (!node) return;
  const comment: t.CommentLine = {
    type: "CommentLine",
    // 转义结束注释字符并添加填充
    value: ` ${commentText.replace(/\*\//g, "* /")} `,
  };

  const comments = (node.trailingComments || []) as t.Comment[];
  // 避免添加重复的注释
  if (!comments.some(c => c.value.trim() === commentText.trim())) {
    node.trailingComments = [...comments, comment];
  }
}

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
      // 检查是否是Vue SFC文件
      const isVueSFC = filePath.endsWith('.vue');
      let processedCode = code;
      
      // 如果是Vue文件，首先处理模板部分
      if (isVueSFC) {
        // 提取和处理模板部分（HTML）
        const templateMatch = code.match(/<template>([\s\S]*?)<\/template>/);
        if (templateMatch && templateMatch[1]) {
          const templateContent = templateMatch[1];
          const pattern = options?.pattern 
            ? new RegExp(options.pattern, 'g')
            : /___(.+?)___/g;
          
          // 替换模板中的文本并收集要添加注释的位置
          let processedTemplate = templateContent.replace(pattern, (match, extractedValue) => {
            if (!extractedValue) return match;
            
            // 获取或生成键值
            const key = getKeyAndRecord(
              match,
              { filePath, line: 0, column: 0 },
              existingValueToKey || new Map(),
              new Map(),
              extractedStrings,
              usedExistingKeysList,
              options
            );
            
            const replacement = `{{ t('${key}') }}`;
            
            if (options.appendExtractedComment) {
              // 直接返回带HTML注释的替换文本
              return `${replacement} <!-- ${extractedValue} -->`;
            }
            
            return replacement;
          });
          
          // 如果有替换，更新原始代码
          if (processedTemplate !== templateContent) {
            processedCode = code.replace(templateMatch[0], `<template>${processedTemplate}</template>`);
          }
        }
      }

      // 解析脚本部分的AST（提取script内容）
      let scriptContent = processedCode;
      const scriptMatch = processedCode.match(/<script[^>]*>([\s\S]*?)<\/script>/);
      if (isVueSFC && scriptMatch && scriptMatch[1]) {
        scriptContent = scriptMatch[1];
      } else if (isVueSFC) {
        // 如果没有script标签，创建一个空的script内容
        scriptContent = '';
      }

      const ast = parse(scriptContent || 'export default {}', {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
        errorRecovery: true,
      });

      // 继续处理JS/TS部分
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

      // 如果 options.appendExtractedComment 为 true，则添加注释
      if (options.appendExtractedComment && (extractedStrings.length > 0 || usedExistingKeysList.length > 0)) {
        const keyToValue = new Map<string | number, string>();
        extractedStrings.forEach(s => keyToValue.set(s.key, s.value));
        usedExistingKeysList.forEach(s => keyToValue.set(s.key, s.value));

        traverse(ast, {
          CallExpression(path) {
            if (
              t.isIdentifier(path.node.callee) &&
              path.node.callee.name === translationMethod &&
              path.node.arguments.length > 0 &&
              t.isStringLiteral(path.node.arguments[0])
            ) {
              const key = path.node.arguments[0].value;
              const originalValue = keyToValue.get(key);

              if (originalValue) {
                // 找到父级语句以附加注释
                const parentStatement = path.findParent((p) => p.isStatement());
                if (parentStatement) {
                  attachExtractedCommentToNode(parentStatement.node, originalValue);
                }
              }
            }
          },
        });
      }

      // 如果没有修改，直接返回处理后的代码
      if (!modified && extractedStrings.length === 0) {
        return { code: processedCode, extractedStrings, usedExistingKeysList, changes: [] };
      }

      // 2. 检查是否需要添加 i18n 相关导入和设置
      const needsI18nSetup = modified || extractedStrings.length > 0;
      let importAdded = false;
      let setupAdded = false;

      if (needsI18nSetup) {
        const setupResult = this.addI18nSetup(ast, translationMethod, hookName, hookImport, processedCode);
        importAdded = setupResult.importAdded;
        setupAdded = setupResult.setupAdded;
      }

      // 3. 生成代码
      let { code: generatedScriptCode } = generate(ast, {
        retainLines: true,
        compact: false,
        comments: true,
        jsescOption: { minimal: true },
      });

      // 如果是Vue SFC文件，需要重新组装完整的文件结构
      let finalCode: string;
      if (isVueSFC) {
        // 提取template、script、style部分
        const templateMatch = processedCode.match(/(<template[^>]*>[\s\S]*?<\/template>)/);
        const scriptMatch = processedCode.match(/<script[^>]*>([\s\S]*?)<\/script>/);
        const styleMatch = processedCode.match(/(<style[^>]*>[\s\S]*?<\/style>)/);
        
        let templatePart = templateMatch ? templateMatch[1] : '';
        let stylePart = styleMatch ? styleMatch[1] : '';
        
        // 重新组装，使用处理后的script内容
        const scriptTag = scriptMatch ? 
          `<script${scriptMatch[0].includes('setup') ? ' setup' : ''}>\n${generatedScriptCode}\n</script>` :
          `<script setup>\n${generatedScriptCode}\n</script>`;
          
        finalCode = [templatePart, scriptTag, stylePart].filter(part => part.trim()).join('\n\n');
      } else {
        finalCode = formatGeneratedCode(generatedScriptCode, {
          importAdded,
          hookCallAdded: setupAdded,
          hookName,
          hookImport,
          translationMethod: needsI18nSetup ? translationMethod : undefined,
        });
      }

      return {
        code: finalCode,
        extractedStrings,
        usedExistingKeysList,
        changes,
      };
    } catch (error) {
      console.error(`[${filePath}] Vue AST transformation error: ${error}`);
      if (error instanceof Error) {
        console.error(error.stack);
      }
      // Vue 兜底处理
      const transformedCode = vueFallbackTransform(code, extractedStrings, options);
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