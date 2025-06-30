// Vue框架专用的代码生成器，处理Vue单文件组件的完整解析和代码生成

import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
import {
  FrameworkCodeGenerator,
  TransformOptions,
  ExtractedString,
  UsedExistingKey,
  ChangeDetail,
} from "../types";
import { getKeyAndRecord } from "../key-manager";
import { getDefaultPattern } from "../string-extractor";
import { attachExtractedCommentToNode } from "../ast-utils";

/**
 * Vue专用代码生成器
 * 处理Vue单文件组件的模板、脚本、样式等部分
 */
export class VueCodeGenerator implements FrameworkCodeGenerator {
  name = "vue";


  canHandle(code: string, filePath: string): boolean {
    return (
      filePath.endsWith(".vue") ||
      code.includes("<template>") ||
      (code.includes("export default") &&
        (code.includes("setup()") ||
          code.includes("setup:") ||
          code.includes("data()") ||
          code.includes("methods:")))
    );
  }

  processCode(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ) {

    // 获取i18n配置
    const i18nConfig = options.i18nConfig || {};
    const i18nImportConfig = i18nConfig.i18nImport || {
      name: "t",
      importName: "useI18n",
      source: "vue-i18n",
    };


    // 检查是否为Vue单文件组件
    const isVueSFC =
      filePath.endsWith(".vue") ||
      code.includes("<template>") ||
      code.includes("<script");

    if (isVueSFC) {
      // 处理Vue单文件组件
      return this.processSFC(code, filePath, options, existingValueToKey);
    } else {
      // 处理纯JavaScript Vue组件
      return this.processJavaScriptVue(
        code,
        filePath,
        options,
        existingValueToKey
      );
    }
  }

  /**
   * 处理Vue单文件组件
   */
  private processSFC(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ) {
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];
    const changes: ChangeDetail[] = [];

    // 获取i18n配置
    const i18nConfig = options.i18nConfig || {};
    const i18nImportConfig = i18nConfig.i18nImport || {
      name: "t",
      importName: "useI18n",
      source: "vue-i18n",
    };

    const translationMethod = i18nImportConfig.name;
    const hookName = i18nImportConfig.importName || "useI18n";
    const hookImport = i18nImportConfig.source;

    // 解析Vue单文件组件
    const vueFile = this.parseVueFile(code);

    // 处理模板部分
    if (vueFile.template) {
      vueFile.template = this.processTemplate(
        vueFile.template,
        translationMethod,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKey || new Map(),
        filePath
      );
    }

    // 处理脚本部分
    if (vueFile.script) {
      const scriptResult = this.processScript(
        vueFile.script,
        translationMethod,
        hookName,
        hookImport,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKey || new Map(),
        filePath,
        vueFile.isSetupScript
      );
      vueFile.script = scriptResult.code;
    }

    // 重新组装Vue文件
    const processedCode = this.assembleVueFile(vueFile);

    return {
      code: processedCode,
      extractedStrings,
      usedExistingKeysList,
      changes,
    };
  }

  /**
   * 处理纯JavaScript Vue组件
   */
  private processJavaScriptVue(
    code: string,
    filePath: string,
    options: TransformOptions,
    existingValueToKey?: Map<string, string | number>
  ) {
    const extractedStrings: ExtractedString[] = [];
    const usedExistingKeysList: UsedExistingKey[] = [];
    const changes: ChangeDetail[] = [];

    // 获取i18n配置
    const i18nConfig = options.i18nConfig || {};
    const i18nImportConfig = i18nConfig.i18nImport || {
      name: "t",
      importName: "useI18n",
      source: "vue-i18n",
    };

    const translationMethod = i18nImportConfig.name;
    const hookName = i18nImportConfig.importName || "useI18n";
    const hookImport = i18nImportConfig.source;

    try {
      const ast = parse(code, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
        errorRecovery: true,
      });

      // 处理JavaScript中的字符串
      this.processScriptStrings(
        ast,
        translationMethod,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKey || new Map(),
        filePath
      );

      // 添加必要的导入和setup
      this.addI18nSetupToScript(
        ast,
        translationMethod,
        hookName,
        hookImport,
        false, // 不是setup script
        extractedStrings.length > 0 || usedExistingKeysList.length > 0
      );

      const { code: processedCode } = generate(ast, {
        retainLines: true,
        compact: false,
      });

      return {
        code: processedCode,
        extractedStrings,
        usedExistingKeysList,
        changes,
      };
    } catch (error) {
      console.error(`Error processing Vue JavaScript: ${error}`);
      return {
        code,
        extractedStrings: [],
        usedExistingKeysList: [],
        changes: [],
      };
    }
  }

  /**
   * 解析Vue单文件组件
   */
  private parseVueFile(code: string): {
    template?: string;
    script?: string;
    style?: string;
    isSetupScript: boolean;
  } {
    // 使用更智能的解析方式来处理嵌套的template标签
    const template = this.extractSection(code, "template");
    const script = this.extractSection(code, "script");
    const style = this.extractSection(code, "style");

    const isSetupScript = code.includes("<script setup");

    return {
      template,
      script,
      style,
      isSetupScript,
    };
  }

  /**
   * 提取Vue文件中的特定section（template、script、style）
   */
  private extractSection(
    code: string,
    sectionName: string
  ): string | undefined {
    const startTag = new RegExp(`<${sectionName}[^>]*>`, "i");

    const startMatch = code.match(startTag);
    if (!startMatch) return undefined;

    const startIndex = startMatch.index! + startMatch[0].length;
    let depth = 1;
    let currentIndex = startIndex;

    // 使用标签计数来正确处理嵌套标签
    while (currentIndex < code.length && depth > 0) {
      const nextStart = code.indexOf(`<${sectionName}`, currentIndex);
      const nextEnd = code.indexOf(`</${sectionName}>`, currentIndex);

      if (nextEnd === -1) {
        // 没有找到结束标签
        break;
      }

      if (nextStart !== -1 && nextStart < nextEnd) {
        // 找到嵌套的开始标签
        depth++;
        currentIndex = nextStart + sectionName.length + 1;
      } else {
        // 找到结束标签
        depth--;
        if (depth === 0) {
          // 找到匹配的结束标签
          return code.substring(startIndex, nextEnd);
        }
        currentIndex = nextEnd + sectionName.length + 3;
      }
    }

    return undefined;
  }

  /**
   * 处理Vue模板部分
   */
  private processTemplate(
    template: string,
    translationMethod: string,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    options: TransformOptions,
    existingValueToKey: Map<string, string | number>,
    filePath: string
  ): string {
    const patternRegex = options?.pattern
      ? new RegExp(options.pattern, "g")
      : new RegExp(getDefaultPattern().source, "g");

    let processedTemplate = template;

    // 查找所有匹配的字符串并替换
    processedTemplate = processedTemplate.replace(
      patternRegex,
      (fullMatch, extractedValue) => {
        if (!extractedValue) return fullMatch;

        // 获取或生成键值
        const key = getKeyAndRecord(
          fullMatch,
          {
            filePath,
            line: 0,
            column: 0,
          },
          existingValueToKey,
          new Map(),
          extractedStrings,
          usedExistingKeysList,
          options
        );

        // 在Vue模板中，需要用{{}}包裹函数调用
        // 使用 Babel AST 生成 {{ t("key") }} 结构
        const callExpr = t.callExpression(t.identifier(translationMethod), [
          t.stringLiteral(String(key)),
        ]);
        // 生成 t("key") 的代码
        const { code: callCode } = generate(callExpr, {
          compact: true,
          jsescOption: { minimal: true, quotes: "double" },
        });
        const replacement = `{{ ${callCode} }}`;
        if (options.appendExtractedComment) {
          return `${replacement} <!-- ${extractedValue} -->`;
        }
        return replacement;
      }
    );

    return processedTemplate;
  }

  /**
   * 处理Vue脚本部分
   */
  private processScript(
    script: string,
    translationMethod: string,
    hookName: string,
    hookImport: string,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    options: TransformOptions,
    existingValueToKey: Map<string, string | number>,
    filePath: string,
    isSetupScript: boolean
  ): { code: string } {
    try {
      const ast = parse(script, {
        sourceType: "module",
        plugins: ["typescript", "jsx"],
        errorRecovery: true,
      });

      // 处理脚本中的字符串
      this.processScriptStrings(
        ast,
        translationMethod,
        extractedStrings,
        usedExistingKeysList,
        options,
        existingValueToKey,
        filePath
      );

      // 添加必要的导入和setup
      this.addI18nSetupToScript(
        ast,
        translationMethod,
        hookName,
        hookImport,
        isSetupScript,
        extractedStrings.length > 0 || usedExistingKeysList.length > 0
      );

      const { code } = generate(ast, {
        retainLines: true,
        compact: false,
      });

      return { code };
    } catch (error) {
      console.error(`Error processing Vue script: ${error}`);
      return { code: script };
    }
  }

  /**
   * 处理脚本中的字符串文字
   */
  private processScriptStrings(
    ast: t.File,
    translationMethod: string,
    extractedStrings: ExtractedString[],
    usedExistingKeysList: UsedExistingKey[],
    options: TransformOptions,
    existingValueToKey: Map<string, string | number>,
    filePath: string
  ) {
    const pattern = options?.pattern
      ? new RegExp(options.pattern)
      : new RegExp(getDefaultPattern().source); // 移除'g'标志用于match()

    traverse(ast, {
      StringLiteral(path) {
        // 不处理导入/导出语句中的字符串
        if (
          t.isImportDeclaration(path.parent) ||
          t.isExportDeclaration(path.parent)
        ) {
          return;
        }

        const originalValue = path.node.value;
        const match = originalValue.match(pattern);

        if (match && match[1]) {
          const valueToTranslate = match[1];
          const fullMatch = match[0];

          const key = getKeyAndRecord(
            fullMatch, // 与 processTemplate 保持一致
            {
              filePath,
              line: path.node.loc?.start.line || 0,
              column: path.node.loc?.start.column || 0,
            },
            existingValueToKey,
            new Map(),
            extractedStrings,
            usedExistingKeysList,
            options
          );

          const callExpression = t.callExpression(
            t.identifier(translationMethod),
            [t.stringLiteral(String(key))]
          );

          path.replaceWith(callExpression);

          // 添加注释（如果启用）
          if (options.appendExtractedComment) {
            const commentType = options.extractedCommentType || "line";
            const statement = path.findParent((p) => p.isStatement());
            if (statement) {
              attachExtractedCommentToNode(
                statement.node,
                valueToTranslate,
                commentType
              );
            } else {
              attachExtractedCommentToNode(
                callExpression,
                valueToTranslate,
                commentType
              );
            }
          }
        }
      },
    });
  }

  /**
   * 添加Vue i18n设置到脚本
   */
  private addI18nSetupToScript(
    ast: t.File,
    translationMethod: string,
    hookName: string,
    hookImport: string,
    isSetupScript: boolean,
    needsI18n: boolean
  ) {
    if (!needsI18n) return;

    let hasSetupMethod = false;
    let hasExportDefault = false;
    let exportDefaultPath: any = null;

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
            path.node.body.unshift(importDeclaration);
          }
        },
      },

      // 记录export default位置
      ExportDefaultDeclaration: (path) => {
        hasExportDefault = true;
        exportDefaultPath = path;
      },

      // 处理setup函数或setup script
      ObjectMethod: (path) => {
        if (
          t.isIdentifier(path.node.key) &&
          path.node.key.name === "setup" &&
          !isSetupScript
        ) {
          hasSetupMethod = true;
          this.addUseI18nToSetupMethod(path, translationMethod, hookName);
        }
      },

      ObjectProperty: (path) => {
        if (
          t.isIdentifier(path.node.key) &&
          path.node.key.name === "setup" &&
          !isSetupScript
        ) {
          hasSetupMethod = true;
          this.addUseI18nToSetupProperty(path, translationMethod, hookName);
        }
      },
    });

    // 如果是setup script，需要直接在顶层添加useI18n调用
    if (isSetupScript) {
      this.addUseI18nToSetupScript(ast, translationMethod, hookName);
    }
    // 如果没有setup方法但有export default，则创建setup方法
    else if (!hasSetupMethod && hasExportDefault && exportDefaultPath) {
      this.addSetupMethodToOptionsAPI(
        exportDefaultPath,
        translationMethod,
        hookName
      );
    }
    // 如果既没有setup方法也没有export default，可能是React函数组件被强制设置为Vue
    // 在这种情况下，需要在函数组件内部添加useI18n调用
    else if (!hasSetupMethod && !hasExportDefault) {
      this.addUseI18nToReactComponents(ast, translationMethod, hookName);
    }
  }

  private addUseI18nToSetupMethod(
    path: any,
    translationMethod: string,
    hookName: string
  ) {
    if (t.isBlockStatement(path.node.body)) {
      const setupBody = path.node.body.body;

      // 检查是否已有useI18n调用
      let hasUseI18n = false;
      setupBody.forEach((stmt: t.Statement) => {
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

  private addUseI18nToSetupProperty(
    path: any,
    translationMethod: string,
    hookName: string
  ) {
    if (
      (t.isFunctionExpression(path.node.value) ||
        t.isArrowFunctionExpression(path.node.value)) &&
      t.isBlockStatement(path.node.value.body)
    ) {
      const setupBody = path.node.value.body.body;

      // 类似于setupMethod的处理
      let hasUseI18n = false;
      setupBody.forEach((stmt: t.Statement) => {
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

  private addUseI18nToSetupScript(
    ast: t.File,
    translationMethod: string,
    hookName: string
  ) {
    traverse(ast, {
      Program: {
        enter(path) {
          // 检查是否已有useI18n调用
          let hasUseI18n = false;
          path.node.body.forEach((stmt) => {
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
            // 找到插入位置（在导入之后）
            let insertIndex = 0;
            for (let i = 0; i < path.node.body.length; i++) {
              if (t.isImportDeclaration(path.node.body[i])) {
                insertIndex = i + 1;
              } else {
                break;
              }
            }

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

            path.node.body.splice(insertIndex, 0, variableDeclaration);
          }
        },
      },
    });
  }

  /**
   * 为Options API组件添加setup方法
   */
  private addSetupMethodToOptionsAPI(
    exportDefaultPath: any,
    translationMethod: string,
    hookName: string
  ) {
    if (
      exportDefaultPath &&
      t.isObjectExpression(exportDefaultPath.node.declaration)
    ) {
      const objectExpression = exportDefaultPath.node.declaration;

      // 创建setup方法
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

      const returnStatement = t.returnStatement(
        t.objectExpression([
          t.objectProperty(
            t.identifier(translationMethod),
            t.identifier(translationMethod),
            false,
            true
          ),
        ])
      );

      const setupMethod = t.objectMethod(
        "method",
        t.identifier("setup"),
        [],
        t.blockStatement([variableDeclaration, returnStatement])
      );

      // 将setup方法添加到对象的开头
      objectExpression.properties.unshift(setupMethod);
    }
  }

  /**
   * 为React函数组件添加Vue的useI18n调用
   * 当React代码被强制设置为Vue框架时使用
   */
  private addUseI18nToReactComponents(
    ast: t.File,
    translationMethod: string,
    hookName: string
  ) {
    traverse(ast, {
      FunctionDeclaration: (path) => {
        // 检查是否为React函数组件（大写开头）
        if (
          path.node.id &&
          t.isIdentifier(path.node.id) &&
          /^[A-Z]/.test(path.node.id.name)
        ) {
          this.addUseI18nToFunctionBody(path.node.body, translationMethod, hookName);
        }
      },
      
      VariableDeclarator: (path) => {
        // 检查箭头函数组件
        if (
          t.isIdentifier(path.node.id) &&
          /^[A-Z]/.test(path.node.id.name) &&
          (t.isArrowFunctionExpression(path.node.init) || t.isFunctionExpression(path.node.init))
        ) {
          const func = path.node.init as t.ArrowFunctionExpression | t.FunctionExpression;
          if (t.isBlockStatement(func.body)) {
            this.addUseI18nToFunctionBody(func.body, translationMethod, hookName);
          }
        }
      }
    });
  }

  /**
   * 在函数体中添加useI18n调用
   */
  private addUseI18nToFunctionBody(
    body: t.BlockStatement,
    translationMethod: string,
    hookName: string
  ) {
    // 检查是否已有useI18n调用
    let hasUseI18n = false;
    body.body.forEach((stmt) => {
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
      
      // 在函数体开头添加useI18n调用
      body.body.unshift(variableDeclaration);
    }
  }

  /**
   * 重新组装Vue文件
   */
  private assembleVueFile(vueFile: {
    template?: string;
    script?: string;
    style?: string;
    isSetupScript: boolean;
  }): string {
    let result = "";

    if (vueFile.template) {
      result += `<template>\n${vueFile.template}\n</template>\n\n`;
    }

    if (vueFile.script) {
      const scriptTag = vueFile.isSetupScript ? "<script setup>" : "<script>";
      result += `${scriptTag}\n${vueFile.script}\n</script>\n\n`;
    }

    if (vueFile.style) {
      result += `<style>\n${vueFile.style}\n</style>\n`;
    }

    return result.trim();
  }
}
