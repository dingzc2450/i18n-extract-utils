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

// Add other general AST utility functions here if needed in the future.