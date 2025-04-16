import { ExtractedString, TransformOptions } from "./types";

const DEFAULT_PATTERN = /___(.+?)___/g;

/**
 * Extracts strings matching a pattern from code.
 * @param code The source code content.
 * @param filePath The path to the file being processed.
 * @param options Transformation options, including the pattern and optional key generator.
 * @returns An array of extracted strings with their locations and keys.
 */
export function extractStringsFromCode(
  code: string,
  filePath: string,
  options?: TransformOptions // Accept full options object
): ExtractedString[] {
  const extractedStrings: ExtractedString[] = [];
  // Ensure pattern is created correctly for the loop
  const pattern = options?.pattern
    ? new RegExp(options.pattern, "g")
    : new RegExp(DEFAULT_PATTERN.source, "g");

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const value = match[1]; // The actual string content
    const startIndex = match.index;

    // Generate the key using the provided function or default to the value
    const key = options?.generateKey
      ? options.generateKey(value, filePath)
      : value;

    // Calculate line and column
    const upToMatch = code.slice(0, startIndex);
    const lines = upToMatch.split("\n");
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1; // +1 for 1-based column

    extractedStrings.push({
      key, // Add the generated key
      value,
      filePath,
      line,
      column,
    });
  }

  return extractedStrings;
}

/**
 * Gets the default extraction pattern.
 * @returns The default regular expression pattern.
 */
export function getDefaultPattern(): RegExp {
    // Return a new instance to avoid state issues with the global flag
    return new RegExp(DEFAULT_PATTERN.source, 'g');
}