/**
 * React 框架插件
 * 负责React相关的处理逻辑，包括JSX组件检测、Hook导入等
 */

import * as tg from "../babel-type-guards";
import {
  FrameworkPlugin,
  ImportRequirement,
  HookRequirement,
  ProcessingContext,
} from "../core/types";
import { TransformOptions } from "../types";
import { NormalizedTransformOptions } from "../core/config-normalizer";
import * as t from "@babel/types";

/**
 * React 插件实现
 */
export class ReactPlugin implements FrameworkPlugin {
  name = "react";
  static readonly defaultTranslationMethod = "t";
  /**
   * 检测是否应该应用React插件
   */
  shouldApply(
    _code: string,
    _filePath: string,
    options: NormalizedTransformOptions
  ): boolean {
    // 只根据框架类型判断是否应用
    return options.normalizedI18nConfig.framework === "react";
  }

  /**
   * 检查代码中是否包含JSX元素
   */
  private hasJSXElements(code: string): boolean {
    return /<[A-Z][a-zA-Z0-9]*/.test(code) || /<[a-z]+/.test(code);
  }

  /**
   * 获取React解析器配置
   */
  getParserConfig(): object {
    return {
      plugins: ["jsx"],
    };
  }

  /**
   * 获取React所需的导入和Hook需求
   */
  getRequiredImportsAndHooks(
    options: TransformOptions,
    _context: ProcessingContext
  ): {
    imports: ImportRequirement[];
    hooks: HookRequirement[];
  } {
    // 检查是否有非React配置，如果有，则回退到上下文感知逻辑
    if (options.i18nConfig?.nonReactConfig) {
      return { imports: [], hooks: [] }; // 让上下文感知逻辑处理
    }

    const hookName = this.getHookName(options);
    const hookSource = this.getHookSource(options);
    const translationMethod = this.getTranslationMethod(options);

    const imports: ImportRequirement[] = [
      {
        source: hookSource,
        specifiers: [{ name: hookName }],
        isDefault: false,
      },
    ];

    const hooks: HookRequirement[] = [
      {
        hookName,
        variableName:
          translationMethod === "default"
            ? ReactPlugin.defaultTranslationMethod
            : translationMethod,
        isDestructured: translationMethod !== "default",
        callExpression: this.generateHookCallExpression(
          hookName,
          translationMethod
        ),
      },
    ];

    return { imports, hooks };
  }

  /**
   * React特定的后处理
   */
  postProcess(code: string): string {
    return code;
  }

  /**
   * 获取Hook名称
   */
  private getHookName(options: TransformOptions): string {
    return (
      options.i18nConfig?.i18nImport?.importName ||
      options.hookName ||
      "useTranslation"
    );
  }

  /**
   * 获取Hook来源
   */
  private getHookSource(options: TransformOptions): string {
    return (
      options.i18nConfig?.i18nImport?.source ||
      options.hookImport ||
      "react-i18next"
    );
  }

  /**
   * 获取翻译方法名称
   */
  private getTranslationMethod(options: TransformOptions): string {
    return (
      options.i18nConfig?.i18nImport?.name || options.translationMethod || "t"
    );
  }

  /**
   * 生成Hook调用表达式
   */
  private generateHookCallExpression(
    hookName: string,
    translationMethod: string
  ): string {
    if (translationMethod === "default") {
      return `const ${ReactPlugin.defaultTranslationMethod} = ${hookName}();`;
    } else {
      return `const { ${translationMethod} } = ${hookName}();`;
    }
  }
}

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
      let isCustomHook = false;

      // 检查函数名
      if (
        tg.isFunction(path.node) &&
        (tg.isFunctionDeclaration(path.node) ||
          tg.isFunctionExpression(path.node)) &&
        path.node.id &&
        /^use[A-Z\d_]/.test(path.node.id.name)
      ) {
        isCustomHook = true;
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
