import * as t from "@babel/types";

/**
 * Creates a CallExpression node for the translation function.
 * e.g., t("key") or t("key", { arg1: value })
 *
 * @param methodName The name of the translation method (e.g., "t", "translate", or "default" which resolves to "t").
 * @param translationKey The key to use for translation (string or number).
 * @param interpolations Optional object expression for interpolation values.
 * @returns A Babel CallExpression node.
 */
export function createTranslationCall(
  methodName: string,
  translationKey: string | number,
  interpolations?: t.ObjectExpression // Optional parameter for interpolations
): t.CallExpression {
  // Resolve 'default' to 't', otherwise use the provided method name
  const effectiveMethodName = methodName === "default" ? "t" : methodName;

  // Prepare arguments array, starting with the key
  const args: (t.StringLiteral | t.NumericLiteral | t.ObjectExpression)[] = [
    typeof translationKey === "string"
      ? t.stringLiteral(translationKey)
      : t.numericLiteral(translationKey), // Handle numeric keys if generateKey produces them
  ];

  // Add interpolations object as the second argument if provided
  if (interpolations) {
    args.push(interpolations);
  }

  // Create and return the call expression node
  return t.callExpression(t.identifier(effectiveMethodName), args);
}

/**
 * 根据配置生成注释节点（注释内容仅为原始文本，无前缀）
 */
function createExtractedCommentNode(text: string, type: "block" | "line" = "block"): t.CommentBlock | t.CommentLine {
  if (type === "line") {
    return {
      type: "CommentLine",
      value: ` ${text} `,
    } as t.CommentLine;
  } else {
    return {
      type: "CommentBlock",
      value: ` ${text} `,
    } as t.CommentBlock;
  }
}

export function attachExtractedCommentToNode(node: t.Node, commentText: string, type: "block" | "line") {
  if (!node.trailingComments) node.trailingComments = [];
  node.trailingComments.push(createExtractedCommentNode(commentText, type));
}

/**
 * Parses placeholder expressions from JSX text and creates interpolation objects.
 * Supports both ${variable} (template literal style) and {variable} (JSX style) formats.
 * 
 * @param rawText The raw extracted text that may contain placeholders
 * @param scopeVariables An optional map of variable names to their AST expressions
 * @returns An object containing the canonical text and interpolation object, or null if no placeholders
 */
export function parseJSXTextPlaceholders(
  rawText: string,
  scopeVariables?: Map<string, t.Expression>
): { 
  canonicalText: string, 
  interpolationObject: t.ObjectExpression | null 
} | null {
  // Check if there are any placeholders in the text
  const hasTemplatePlaceholders = rawText.includes("${");
  const hasJSXPlaceholders = rawText.includes("{") && !rawText.includes("${");
  
  if (!hasTemplatePlaceholders && !hasJSXPlaceholders) {
    return null;
  }

  let canonicalText = rawText;
  const interpolationProperties: t.ObjectProperty[] = [];
  let argIndex = 1;

  // Process template literal placeholders ${variable}
  if (hasTemplatePlaceholders) {
    canonicalText = canonicalText.replace(/\$\{([^}]+)\}/g, (match, varName) => {
      const argKey = `arg${argIndex++}`;
      const varExpression = scopeVariables?.get(varName.trim()) || t.identifier(varName.trim());
      interpolationProperties.push(
        t.objectProperty(t.identifier(argKey), varExpression)
      );
      return `{${argKey}}`;
    });
  }

  // Process JSX-style placeholders {variable}
  if (hasJSXPlaceholders) {
    // Only process {variable} patterns that are not already in {argN} format
    canonicalText = canonicalText.replace(/\{(?!arg\d+\})([^}]+)\}/g, (match, varName) => {
      const argKey = `arg${argIndex++}`;
      const varExpression = scopeVariables?.get(varName.trim()) || t.identifier(varName.trim());
      interpolationProperties.push(
        t.objectProperty(t.identifier(argKey), varExpression)
      );
      return `{${argKey}}`;
    });
  }

  const interpolationObject = interpolationProperties.length > 0 
    ? t.objectExpression(interpolationProperties)
    : null;

  return { canonicalText, interpolationObject };
}

// Add other general AST utility functions here if needed in the future.