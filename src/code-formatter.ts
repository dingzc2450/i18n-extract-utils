/**
 * Applies post-processing formatting fixes to the generated code.
 * Focuses on ensuring imports and hook calls have proper spacing and newlines.
 * @param code The generated code string.
 * @param importAdded Whether a new import statement was added.
 * @param hookCallAdded Whether a new hook call was added.
 * @returns The formatted code string.
 */
export function formatGeneratedCode(code: string, importAdded: boolean, hookCallAdded: boolean): string {
  if (!importAdded && !hookCallAdded) {
    return code; // No formatting needed if nothing was added
  }

  let formattedCode = code;

  // Fix potential formatting issues with hook calls and imports
  formattedCode = formattedCode
    // Handle import directly following non-whitespace/non-semicolon character
    .replace(
      /([^;\s])(import\s+[^;]+;)/g,
      "$1\n$2"
    )
    // Ensure import declarations have their own line (handles cases with preceding newline already)
    .replace(
      /(\S)(\nimport\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];)/g, // More specific import pattern
      "$1\n$2"
    )
    // Ensure import declarations have a following newline if followed by non-import code
    .replace(
      /(import\s*\{[^}]+\}\s*from\s*['"][^'"]+['"];)(\s*)(\S)/g, // Capture whitespace
      (match, importStatement, whitespace, nextChar) => {
          // Only add newline if the next char isn't part of another import and whitespace isn't already sufficient
          if (nextChar && !match.startsWith('import', importStatement.length + whitespace.length) && !whitespace.includes('\n\n')) {
              return `${importStatement}\n${nextChar}`;
          }
          return match; // Otherwise, return original match
      }
    )
    // Ensure a blank line between consecutive import statements if not already present
    .replace(
      /(import\s*[^;]+;)(\s*\n)(\s*import)/g, // Look for single newline between imports
       (match, imp1, whitespace, imp2) => {
           if (!whitespace.includes('\n\n')) { // Check if there isn't already a blank line
               return `${imp1}\n\n${imp2}`;
           }
           return match;
       }
    )
    // Ensure hook declarations have their own line with proper indentation
    .replace(
      /(\{|\;)\s*(const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\);)/g, // Assuming 't' and 'useTranslation' for simplicity, adjust if needed
      "$1\n  $2" // Add newline and standard 2-space indent
    )
     // Ensure correct spacing after hook declaration if followed by other code
    .replace(
      /(const\s*\{\s*t\s*\}\s*=\s*useTranslation\(\);)(\s*)(\S)/g, // Capture whitespace
      (match, hookCall, whitespace, nextChar) => {
          if (nextChar && nextChar !== '}' && !whitespace.includes('\n\n')) { // Avoid adding extra lines before closing brace
             return `${hookCall}\n\n  ${nextChar}`; // Add blank line and indent next line
          }
           if (nextChar === '}' && !whitespace.includes('\n')) {
               return `${hookCall}\n${nextChar}`; // Ensure at least one newline before closing brace
           }
          return match;
      }
    );

  return formattedCode;
}