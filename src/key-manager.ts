import type {
  ExistingValueToKeyMapType,
  ExtractedString,
  UsedExistingKey,
} from "./types";
import type { NormalizedTransformOptions } from "./core/config-normalizer";
import { RegexCache } from "./performance";

/**
 * Manages translation key lookup, generation, and recording.
 * Checks existing keys, generates new ones if needed, and records usage.
 *
 * @param originalMatchedValue The full string that matched the pattern (e.g., "___Hello___", "___Select ${label}___").
 * @param location Location info for the node.
 * @param existingValueToKeyMap Map of canonical value -> key from pre-existing translations.
 * @param generatedKeysMap Map to track keys generated during the current file processing (canonical value -> key).
 * @param extractedStrings Array to add newly generated key/value pairs to.
 * @param usedExistingKeysList Array to record when an existing key is used.
 * @param options Transformation options, including the pattern and generateKey function.
 * @returns The translation key (string or number) if a match is found and processed, otherwise undefined.
 */
export function getKeyAndRecord(
  originalMatchedValue: string,
  location: { filePath: string; line: number; column: number },
  existingValueToKeyMap: ExistingValueToKeyMapType,
  generatedKeysMap: Map<string, string | number>,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  options: Pick<
    NormalizedTransformOptions,
    "pattern" | "generateKey" | "keyConflictResolver"
  >
): string | number | undefined {
  // Use a non-global regex based on the options pattern to extract the content
  const pattern = RegexCache.getSingleMatchRegex(options.pattern);

  const match = pattern.exec(originalMatchedValue);
  if (!match || match[1] === undefined) {
    console.warn(
      `[${location.filePath}] getKeyAndRecord called with non-matching value: ${originalMatchedValue}`
    );
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
    canonicalValue = rawExtractedValue.replace(
      /\$\{[^}]+\}/g,
      () => `{arg${argIndex++}}`
    );

    // Example: "Select ${label}" becomes "Select {arg1}"
    // Example: "Hi ${a}, ${b}" becomes "Hi {arg1}, {arg2}"
    // But "User: {userName}" stays as "User: {userName}" (no conversion)
  }
  // Now canonicalValue holds the version like "Select {arg1}" or preserves "User: {userName}"
  // --- End FIX ---

  // 1. Check if we've already generated a key for this canonical value in the current file
  if (generatedKeysMap.has(canonicalValue)) {
    return generatedKeysMap.get(canonicalValue)!;
  }

  // 2. Handle key conflict resolution logic
  const existingKeyEntry = existingValueToKeyMap.get(canonicalValue);
  let resolvedKey: string | number | null | undefined = undefined;

  // If we have an existing key, handle conflict resolution
  if (existingKeyEntry !== undefined) {
    // Use the primaryKey from the entry
    const existingKey = existingKeyEntry.primaryKey;
    const keySet = existingKeyEntry.keys;
    // Handle different keyConflictResolver configurations
    if (typeof options.keyConflictResolver === "function") {
      // Custom resolver function
      const context = {
        filePath: location.filePath,
        line: location.line,
        column: location.column,
        sameValueKeys: Array.from(existingKeyEntry.keys),
      };

      resolvedKey = options.keyConflictResolver(
        existingKey,
        canonicalValue,
        context
      );
    } else if (options.keyConflictResolver === true) {
      // Always generate new keys - do nothing, proceed to key generation
    } else {
      // Default behavior (keyConflictResolver is false/null/undefined)
      // Reuse the existing key
      resolvedKey = existingKey;
    }
    if (resolvedKey === null) {
      resolvedKey = existingKey;
    }
    // If we resolved to use an existing key, record it and return
    if (resolvedKey && keySet.has(resolvedKey!)) {
      // Check if we've already recorded this key usage to avoid duplicates
      if (
        !usedExistingKeysList.some(
          k =>
            k.key === resolvedKey &&
            k.value === canonicalValue &&
            k.filePath === location.filePath
        )
      ) {
        usedExistingKeysList.push({
          ...location,
          key: resolvedKey,
          value: canonicalValue,
        });
      }
      return resolvedKey;
    }
  }

  // 3. Generate or use the resolved key
  const newKey =
    resolvedKey !== undefined && resolvedKey !== null
      ? resolvedKey // Use the key resolved by the custom function
      : options.generateKey
        ? options.generateKey(canonicalValue, location.filePath)
        : canonicalValue; // Default: use the canonical value itself as the key

  // 4. Record the key in our maps and lists
  generatedKeysMap.set(canonicalValue, newKey);

  // Add to extracted strings if not already present
  if (
    !extractedStrings.some(s => s.key === newKey && s.value === canonicalValue)
  ) {
    extractedStrings.push({
      key: newKey,
      value: canonicalValue,
      ...location,
    });
  }

  return newKey;
}
