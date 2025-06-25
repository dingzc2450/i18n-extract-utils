// 本文件集中管理与 React/JSX 相关的 AST 处理、hook 检查、类型判断等逻辑，便于后续扩展 Vue/低版本 React 支持。

import * as t from "@babel/types";
import { parse } from "@babel/parser";
import traverse from "@babel/traverse";

/**
 * 检查代码中是否已存在指定的 React 翻译 hook 调用（如 useTranslation）。
 */
export function hasTranslationHook(
  code: string,
  hookName: string = "useTranslation"
): boolean {
  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
    });
    let hasHook = false;
    traverse(ast, {
      CallExpression(path) {
        if (
          t.isIdentifier(path.node.callee) &&
          path.node.callee.name === hookName
        ) {
          const functionParent = path.getFunctionParent();
          if (functionParent && path.parentPath.isVariableDeclarator() && path.parentPath.parentPath.isVariableDeclaration() && path.parentPath.parentPath.parentPath.isBlockStatement() && path.parentPath.parentPath.parentPath.parentPath === functionParent) {
             hasHook = true;
             path.stop();
          } else if (functionParent && path.parentPath.isExpressionStatement() && path.parentPath.parentPath.isBlockStatement() && path.parentPath.parentPath.parentPath === functionParent) {
             hasHook = true;
             path.stop();
          }
        }
      },
    });
    return hasHook;
  } catch (error) {
    console.error(`Error analyzing code for hook: ${error}`);
    return false;
  }
}

// --- JSX/React 类型判断工具 ---
export function isJSXAttribute(node: t.Node | null | undefined): node is t.JSXAttribute {
  return t.isJSXAttribute(node);
}
export function isJSXExpressionContainer(node: t.Node | null | undefined): node is t.JSXExpressionContainer {
  return t.isJSXExpressionContainer(node);
}
export function isJSXText(node: t.Node | null | undefined): node is t.JSXText {
  return t.isJSXText(node);
}
export function isJSXElement(node: t.Node | null | undefined): node is t.JSXElement {
  return t.isJSXElement(node);
}
export function isJSXFragment(node: t.Node | null | undefined): node is t.JSXFragment {
  return t.isJSXFragment(node);
}

// 其它与 React/JSX 相关的辅助函数、常量、类型可继续在此扩展
