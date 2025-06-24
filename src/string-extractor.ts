import { ExtractedString, TransformOptions, UsedExistingKey } from "./types";

// 支持插值的正则
const DEFAULT_PATTERN = /___([\s\S]+?)___/g;

/**
 * Extracts strings matching a pattern from code.
 * @deprecated This function is deprecated and will be removed in future versions.
 * @param code The source code content.
 * @param filePath The path to the file being processed.
 * @param options Transformation options, including the pattern and optional key generator.
 * @param existingValueToKey Optional map of existing values to keys.
 * @param usedExistingKeysList Optional list to store used existing keys.
 * @returns An array of extracted strings with their locations and keys.
 */
export function extractStringsFromCode(
  code: string,
  filePath: string,
  options?: TransformOptions,
  existingValueToKey?: Map<string, string | number>
): {
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
} {
  const usedExistingKeysList: UsedExistingKey[] = [];
  const extractedStrings: ExtractedString[] = [];
  const pattern = options?.pattern
    ? new RegExp(options.pattern, "g")
    : new RegExp(DEFAULT_PATTERN.source, "g");

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const value = match[1];
    const startIndex = match.index;
    const upToMatch = code.slice(0, startIndex);
    const lines = upToMatch.split("\n");
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;

    let key: string | number;
    let extractedValue = value;
    // 生成key时将${...}替换为{argN}
    let argIndex = 1;
    const keyStr = value.replace(/\$\{[^\}]+\}/g, () => `{arg${argIndex++}}`);
    // value 也做同样的处理，保证和 key 一致
    extractedValue = keyStr;

    if (existingValueToKey && existingValueToKey.has(value)) {
      key = existingValueToKey.get(value)!;
      usedExistingKeysList?.push({
        filePath,
        line,
        column,
        key,
        value: extractedValue,
      });
    } else if (existingValueToKey && existingValueToKey.has(keyStr)) {
      key = existingValueToKey.get(keyStr)!;
      usedExistingKeysList?.push({
        filePath,
        line,
        column,
        key,
        value: extractedValue,
      });
    } else {
      key = options?.generateKey
        ? options.generateKey(keyStr, filePath)
        : keyStr;
    }

    extractedStrings.push({
      key,
      value: extractedValue,
      filePath,
      line,
      column,
    });
  }

  return { extractedStrings, usedExistingKeysList };
}

/**
 * Gets the default extraction pattern.
 * @returns The default regular expression pattern.
 */
export function getDefaultPattern(): RegExp {
  return new RegExp(DEFAULT_PATTERN.source, "g");
}
