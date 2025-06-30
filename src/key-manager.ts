import { ExtractedString, TransformOptions, UsedExistingKey } from "./types";
import { getDefaultPattern } from "./string-extractor";

/**
 * Manages translation key lookup, generation, and recording.
 * Checks existing keys, generates new ones if needed, and records usage.
 *
 * @param originalMatchedValue The full string that matched the pattern (e.g., "___Hello___", "___Select ${label}___").
 * @param location Location info for the node.
 * @param existingValueToKey Map of canonical value -> key from pre-existing translations.
 * @param generatedKeysMap Map to track keys generated during the current file processing (canonical value -> key).
 * @param extractedStrings Array to add newly generated key/value pairs to.
 * @param usedExistingKeysList Array to record when an existing key is used.
 * @param options Transformation options, including the pattern and generateKey function.
 * @returns The translation key (string or number) if a match is found and processed, otherwise undefined.
 */
export function getKeyAndRecord(
  originalMatchedValue: string,
  location: { filePath: string; line: number; column: number },
  existingValueToKey: Map<string, string | number>,
  generatedKeysMap: Map<string, string | number>,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  options: TransformOptions
): string | number | undefined {
  // Use a non-global regex based on the options pattern to extract the content
  const pattern = options?.pattern
    ? new RegExp(options.pattern) // Non-global for single match test
    : new RegExp(getDefaultPattern().source); // Use non-global default

  const match = pattern.exec(originalMatchedValue);
  if (!match || match[1] === undefined) {
    console.warn(`[${location.filePath}] getKeyAndRecord called with non-matching value: ${originalMatchedValue}`);
    return undefined;
  }

  // The raw value extracted from the pattern (might contain ${...})
  const rawExtractedValue = match[1]; // e.g., "Hello" or "Select ${label}"

  // --- FIX: Determine the canonical value for key generation/lookup ---
  let canonicalValue = rawExtractedValue;
  // Only convert template literal expressions (${...}) to {argN} format.
  // DO NOT convert simple {variable} placeholders as they are user content.
  if (rawExtractedValue.includes("${")) {
      let argIndex = 1;
      // Only convert template literal placeholders like ${expr} to {argN}
      canonicalValue = rawExtractedValue.replace(/\$\{[^}]+\}/g, () => `{arg${argIndex++}}`);
      
      // Example: "Select ${label}" becomes "Select {arg1}"
      // Example: "Hi ${a}, ${b}" becomes "Hi {arg1}, {arg2}"
      // But "User: {userName}" stays as "User: {userName}" (no conversion)
  }
  // Now canonicalValue holds the version like "Select {arg1}" or preserves "User: {userName}"
  // --- End FIX ---


  // 1. Check existing translations using the canonical value
  if (existingValueToKey.has(canonicalValue)) {
    const key = existingValueToKey.get(canonicalValue)!;
    if (
      !usedExistingKeysList.some(
        (k) => k.key === key && k.value === canonicalValue && k.filePath === location.filePath
      )
    ) {
      usedExistingKeysList.push({ ...location, key, value: canonicalValue });
    }
    return key;
  }

  // 2. Check keys generated earlier in this file run using the canonical value
  if (generatedKeysMap.has(canonicalValue)) {
    return generatedKeysMap.get(canonicalValue)!;
  }

  // 3. Generate new key using the canonical value
  const newKey = options.generateKey
    ? options.generateKey(canonicalValue, location.filePath) // Pass the correct canonicalValue
    : canonicalValue; // Default: use the canonical value itself as the key

  // Store the generated key against the canonical value
  generatedKeysMap.set(canonicalValue, newKey);

  // 4. Record the newly extracted string using the canonical value
  if (
    !extractedStrings.some(
      (s) => s.key === newKey && s.value === canonicalValue
    )
  ) {
    // Store the canonical value (e.g., "Select {arg1}") in extractedStrings
    extractedStrings.push({ key: newKey, value: canonicalValue, ...location });
  }
  return newKey;
}