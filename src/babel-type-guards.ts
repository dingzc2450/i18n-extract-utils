import * as t from "@babel/types";

/**
 * Checks if a node is a StringLiteral.
 * 检查节点是否为 StringLiteral。
 * @param node The AST node to check.
 * @returns True if the node is a StringLiteral, false otherwise.
 */
export function isStringLiteral(node: t.Node | null | undefined): node is t.StringLiteral {
  return t.isStringLiteral(node);
}

/**
 * Checks if a node is a NumericLiteral.
 * 检查节点是否为 NumericLiteral。
 * @param node The AST node to check.
 * @returns True if the node is a NumericLiteral, false otherwise.
 */
export function isNumericLiteral(node: t.Node | null | undefined): node is t.NumericLiteral {
    return t.isNumericLiteral(node);
}

/**
 * Checks if a node is an Identifier.
 * 检查节点是否为 Identifier。
 * @param node The AST node to check.
 * @returns True if the node is an Identifier, false otherwise.
 */
export function isIdentifier(node: t.Node | null | undefined): node is t.Identifier {
  return t.isIdentifier(node);
}

/**
 * Checks if a node is a CallExpression.
 * 检查节点是否为 CallExpression。
 * @param node The AST node to check.
 * @returns True if the node is a CallExpression, false otherwise.
 */
export function isCallExpression(node: t.Node | null | undefined): node is t.CallExpression {
  return t.isCallExpression(node);
}

/**
 * Checks if a node is a TemplateLiteral.
 * 检查节点是否为 TemplateLiteral。
 * @param node The AST node to check.
 * @returns True if the node is a TemplateLiteral, false otherwise.
 */
export function isTemplateLiteral(node: t.Node | null | undefined): node is t.TemplateLiteral {
  return t.isTemplateLiteral(node);
}

/**
 * Checks if a node is a TaggedTemplateExpression.
 * 检查节点是否为 TaggedTemplateExpression。
 * @param node The AST node to check.
 * @returns True if the node is a TaggedTemplateExpression, false otherwise.
 */
export function isTaggedTemplateExpression(node: t.Node | null | undefined): node is t.TaggedTemplateExpression {
  return t.isTaggedTemplateExpression(node);
}

/**
 * Checks if a node is an ImportDeclaration.
 * 检查节点是否为 ImportDeclaration。
 * @param node The AST node to check.
 * @returns True if the node is an ImportDeclaration, false otherwise.
 */
export function isImportDeclaration(node: t.Node | null | undefined): node is t.ImportDeclaration {
  return t.isImportDeclaration(node);
}

/**
 * Checks if a node is an ExportDeclaration.
 * 检查节点是否为 ExportDeclaration。
 * @param node The AST node to check.
 * @returns True if the node is an ExportDeclaration, false otherwise.
 */
export function isExportDeclaration(node: t.Node | null | undefined): node is t.ExportDeclaration {
  return t.isExportDeclaration(node);
}

/**
 * Checks if a node is an ImportSpecifier.
 * 检查节点是否为 ImportSpecifier。
 * @param node The AST node to check.
 * @returns True if the node is an ImportSpecifier, false otherwise.
 */
export function isImportSpecifier(node: t.Node | null | undefined): node is t.ImportSpecifier {
    return t.isImportSpecifier(node);
}

/**
 * Checks if a node is an ExpressionStatement.
 * 检查节点是否为 ExpressionStatement。
 * @param node The AST node to check.
 * @returns True if the node is an ExpressionStatement, false otherwise.
 */
export function isExpressionStatement(node: t.Node | null | undefined): node is t.ExpressionStatement {
  return t.isExpressionStatement(node);
}

/**
 * Checks if a node is a Function (includes FunctionDeclaration, FunctionExpression, ArrowFunctionExpression).
 * 检查节点是否为函数（包括 FunctionDeclaration, FunctionExpression, ArrowFunctionExpression）。
 * @param node The AST node to check.
 * @returns True if the node is a Function, false otherwise.
 */
export function isFunction(node: t.Node | null | undefined): node is t.Function {
  return t.isFunction(node);
}

export function isFunctionDeclaration(node: t.Node | null | undefined): node is t.FunctionDeclaration {
  return t.isFunctionDeclaration(node);
}

export function isFunctionExpression(node: t.Node | null | undefined): node is t.FunctionExpression {
  return t.isFunctionExpression(node);
}

/**
 * Checks if a node is a BlockStatement.
 * 检查节点是否为 BlockStatement。
 * @param node The AST node to check.
 * @returns True if the node is a BlockStatement, false otherwise.
 */
export function isBlockStatement(node: t.Node | null | undefined): node is t.BlockStatement {
  return t.isBlockStatement(node);
}

/**
 * Checks if a node is a VariableDeclaration.
 * 检查节点是否为 VariableDeclaration。
 * @param node The AST node to check.
 * @returns True if the node is a VariableDeclaration, false otherwise.
 */
export function isVariableDeclaration(node: t.Node | null | undefined): node is t.VariableDeclaration {
  return t.isVariableDeclaration(node);
}

/**
 * Checks if a node is a VariableDeclarator.
 * 检查节点是否为 VariableDeclarator。
 * @param node The AST node to check.
 * @returns True if the node is a VariableDeclarator, false otherwise.
 */
export function isVariableDeclarator(node: t.Node | null | undefined): node is t.VariableDeclarator {
  return t.isVariableDeclarator(node);
}

/**
 * Checks if a node is an ObjectPattern.
 * 检查节点是否为 ObjectPattern。
 * @param node The AST node to check.
 * @returns True if the node is an ObjectPattern, false otherwise.
 */
export function isObjectPattern(node: t.Node | null | undefined): node is t.ObjectPattern {
  return t.isObjectPattern(node);
}

/**
 * Checks if a node is a ReturnStatement.
 * 检查节点是否为 ReturnStatement。
 * @param node The AST node to check.
 * @returns True if the node is a ReturnStatement, false otherwise.
 */
export function isReturnStatement(node: t.Node | null | undefined): node is t.ReturnStatement {
    return t.isReturnStatement(node);
}

/**
 * Checks if a node is a JSXAttribute.
 * 检查节点是否为 JSXAttribute。
 * @param node The AST node to check.
 * @returns True if the node is a JSXAttribute, false otherwise.
 */

/**
 * Checks if a node is a JSXExpressionContainer.
 * 检查节点是否为 JSXExpressionContainer。
 * @param node The AST node to check.
 * @returns True if the node is a JSXExpressionContainer, false otherwise.
 */

/**
 * Checks if a node is a JSXText.
 * 检查节点是否为 JSXText。
 * @param node The AST node to check.
 * @returns True if the node is a JSXText, false otherwise.
 */

/**
 * Checks if a node is a JSXElement.
 * 检查节点是否为 JSXElement。
 * @param node The AST node to check.
 * @returns True if the node is a JSXElement, false otherwise.
 */

/**
 * Checks if a node is a JSXFragment.
 * 检查节点是否为 JSXFragment。
 * @param node The AST node to check.
 * @returns True if the node is a JSXFragment, false otherwise.
 */
export { isJSXAttribute, isJSXExpressionContainer, isJSXText, isJSXElement, isJSXFragment } from './frameworks/react-support';