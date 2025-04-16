import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import generate from '@babel/generator'; // <-- Import generator
import { ExtractedString, TransformOptions } from './types';
import fs from 'fs';

const DEFAULT_PATTERN = /___(.+?)___/g;

export function extractStringsFromCode(code: string, filePath: string, options?: TransformOptions): ExtractedString[] {
  const extractedStrings: ExtractedString[] = [];
  // Ensure pattern is created correctly for the loop
  const pattern = options?.pattern ? new RegExp(options.pattern, 'g') : new RegExp(DEFAULT_PATTERN.source, 'g');

  let match;
  while ((match = pattern.exec(code)) !== null) {
    const value = match[1];
    const startIndex = match.index;

    // 计算行和列
    const upToMatch = code.slice(0, startIndex);
    const lines = upToMatch.split('\n');
    const line = lines.length;
    const column = lines[lines.length - 1].length + 1;

    extractedStrings.push({
      value,
      filePath,
      line,
      column
    });
  }

  return extractedStrings;
}

export function hasTranslationHook(code: string, hookName: string = 'useTranslation'): boolean {
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript']
    });

    let hasHook = false;

    traverse(ast, {
      CallExpression(path) {
        if (t.isIdentifier(path.node.callee) && path.node.callee.name === hookName) {
          hasHook = true;
          path.stop();
        }
      }
    });

    return hasHook;
  } catch (error) {
    console.error(`Error analyzing code: ${error}`);
    return false;
  }
}

// ReplacementInfo is no longer needed
// interface ReplacementInfo { ... }

export function transformCode(filePath: string, options: TransformOptions): { code: string, extractedStrings: ExtractedString[] } {
  const code = fs.readFileSync(filePath, 'utf8');
  // Extract strings first, as the AST modification will change the code structure
  const extractedStrings = extractStringsFromCode(code, filePath, options);

  const translationMethod = options.translationMethod || 't';
  const hookName = options.hookName || 'useTranslation';
  const hookImport = options.hookImport || 'react-i18next';

  // 如果没有需要翻译的字符串，直接返回原代码
  if (extractedStrings.length === 0) {
    return { code, extractedStrings };
  }

  // 使用 AST 来进行更精确的替换
  try {
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['jsx', 'typescript'],
      // tokens and ranges might not be strictly necessary for direct modification + generation
      // tokens: true,
      // ranges: true,
    });

    // No longer need replacements array
    // const replacements: ReplacementInfo[] = [];

    let modified = false; // Track if any modifications were made

    traverse(ast, {
      // 处理 JSX 属性中的国际化文本
      JSXAttribute(path) {
        if (path.node.value && t.isStringLiteral(path.node.value)) {
          const value = path.node.value.value;
          // Create a new RegExp instance each time
          const pattern = options?.pattern ? new RegExp(options.pattern) : new RegExp(DEFAULT_PATTERN.source);
          const match = pattern.exec(value);

          if (match) {
            const textToTranslate = match[1];
            // Directly replace the StringLiteral value with a JSXExpressionContainer
            path.node.value = t.jsxExpressionContainer(
              t.callExpression(
                t.identifier(translationMethod),
                [t.stringLiteral(textToTranslate)] // Use original text for translation key
              )
            );
            modified = true;
            // No need to push to replacements
          }
        }
      },

      // 处理字符串字面量中的国际化文本
      StringLiteral(path) {
        // Skip if it's part of a JSXAttribute (already handled) or ImportDeclaration
        if (path.parentPath.isJSXAttribute() || path.parentPath.isImportDeclaration()) {
          return;
        }

        const value = path.node.value;
        // Create a new RegExp instance each time
        const pattern = options?.pattern ? new RegExp(options.pattern) : new RegExp(DEFAULT_PATTERN.source);
        const match = pattern.exec(value);

        if (match) {
          const textToTranslate = match[1];
          // Replace the StringLiteral node with a CallExpression node
          path.replaceWith(
            t.callExpression(
              t.identifier(translationMethod),
              [t.stringLiteral(textToTranslate)] // Use original text for translation key
            )
          );
          modified = true;
          // No need to push to replacements
        }
      },

      // 处理 JSX 文本中的国际化文本
      JSXText(path) {
        const value = path.node.value;
        // Use the global pattern for multiple matches
        const pattern = options?.pattern ? new RegExp(options.pattern, 'g') : new RegExp(DEFAULT_PATTERN.source, 'g');
        let match;
        let lastIndex = 0;
        const newNodes: (t.JSXText | t.JSXExpressionContainer)[] = [];

        while ((match = pattern.exec(value)) !== null) {
          const textToTranslate = match[1];
          const matchStart = match.index;
          const matchEnd = matchStart + match[0].length;

          // Add preceding text if any
          if (matchStart > lastIndex) {
            const textNode = t.jsxText(value.substring(lastIndex, matchStart));
            if (textNode.value.trim()) newNodes.push(textNode); // Avoid empty text nodes
          }

          // Add the translation expression
          newNodes.push(
            t.jsxExpressionContainer(
              t.callExpression(
                t.identifier(translationMethod),
                [t.stringLiteral(textToTranslate)] // Use original text for translation key
              )
            )
          );

          lastIndex = matchEnd;
        }

        // Add remaining text if any
        if (lastIndex < value.length) {
           const textNode = t.jsxText(value.substring(lastIndex));
           if (textNode.value.trim()) newNodes.push(textNode); // Avoid empty text nodes
        }

        // Replace the original JSXText node if modifications were made
        if (newNodes.length > 0 && (newNodes.length > 1 || !t.isJSXText(newNodes[0]) || newNodes[0].value !== value)) {
           // Only replace if there's actually a change
           path.replaceWithMultiple(newNodes);
           modified = true;
        }
        // No need to push to replacements
      },

      // 处理模板字符串中的国际化文本
      TemplateLiteral(path) {
         // Skip if it's part of a TaggedTemplateExpression (like styled-components)
         if (path.parentPath.isTaggedTemplateExpression()) {
             return;
         }
        // For simple template literals (no expressions)
        if (path.node.quasis.length === 1 && path.node.expressions.length === 0) {
          const value = path.node.quasis[0].value.raw;
          // Create a new RegExp instance each time
          const pattern = options?.pattern ? new RegExp(options.pattern) : new RegExp(DEFAULT_PATTERN.source);
          const match = pattern.exec(value);

          if (match) {
            const textToTranslate = match[1];
            // Replace the TemplateLiteral node with a CallExpression node
            path.replaceWith(
              t.callExpression(
                t.identifier(translationMethod),
                [t.stringLiteral(textToTranslate)] // Use original text for translation key
              )
            );
            modified = true;
            // No need to push to replacements
          }
        }
        // Complex template literals with expressions are harder to handle reliably without potentially breaking logic.
        // Could add logic here to split them if needed, similar to JSXText.
      },
    });

    // If no modifications were made to the AST, return original code
    if (!modified) {
        return { code, extractedStrings };
    }

    // --- AST-based Hook Insertion ---
    // Check if hook needs to be added
    const needsHook = !hasTranslationHook(code, hookName) && modified;
    let importAdded = false;
    let hookCallAdded = false;

    if (needsHook) {
        traverse(ast, {
            Program: {
                enter(path) {
                    // Check for existing import
                    let importExists = false;
                    path.node.body.forEach(node => {
                        if (t.isImportDeclaration(node) && node.source.value === hookImport) {
                            node.specifiers.forEach(spec => {
                                if (t.isImportSpecifier(spec) && t.isIdentifier(spec.imported) && spec.imported.name === hookName) {
                                    importExists = true;
                                }
                            });
                        }
                    });

                    // Add import if it doesn't exist
                    if (!importExists) {
                        const importSpecifier = t.importSpecifier(t.identifier(hookName), t.identifier(hookName));
                        const importDeclaration = t.importDeclaration([importSpecifier], t.stringLiteral(hookImport));
                        // Add import to the top
                        path.unshiftContainer('body', importDeclaration);
                        importAdded = true;
                    }
                }
            },
            // Find the first suitable function body to insert the hook call
            'FunctionDeclaration|FunctionExpression|ArrowFunctionExpression': (path) => {
                // Only add hook call once, and only if needed
                if (!needsHook || hookCallAdded) return;

                // Basic check: assume the first function is the component
                // More robust checks could verify if it returns JSX, etc.
                if (path.node.body && t.isBlockStatement(path.node.body)) {
                    // Check if hook call already exists in this scope (less likely if hasTranslationHook was false, but good practice)
                    let callExists = false;
                    path.node.body.body.forEach(stmt => {
                        if (t.isVariableDeclaration(stmt)) {
                            stmt.declarations.forEach(decl => {
                                if (t.isVariableDeclarator(decl) &&
                                    t.isObjectPattern(decl.id) && // Check for const { t }
                                    t.isCallExpression(decl.init) &&
                                    t.isIdentifier(decl.init.callee) &&
                                    decl.init.callee.name === hookName) {
                                    callExists = true;
                                }
                            });
                        }
                    });

                    if (!callExists) {
                        // Create const { t } = useTranslation();
                        const hookIdentifier = t.identifier(translationMethod);
                        const objectPattern = t.objectPattern([
                            t.objectProperty(hookIdentifier, hookIdentifier, false, true) // { t } or { translationMethod }
                        ]);
                        const callExpression = t.callExpression(t.identifier(hookName), []);
                        const variableDeclarator = t.variableDeclarator(objectPattern, callExpression);
                        const variableDeclaration = t.variableDeclaration('const', [variableDeclarator]);

                        // Add hook call to the beginning of the function body
                        path.get('body').unshiftContainer('body', variableDeclaration);
                        hookCallAdded = true; // Mark as added
                    }
                }
                // Stop searching for function bodies after adding the hook once
                if (hookCallAdded) {
                    path.stop(); // Optional: Stop traversal early if hook is added
                }
            }
        });
    }


    // Generate code from the modified AST, preserving formatting where possible
    let { code: transformedCode } = generate(ast, {
        retainLines: true, // Attempt to keep original line breaks
        compact: false,    // Avoid compacting the code
        comments: true,    // Keep comments
        jsescOption: { minimal: true } // Keep this for minimal escaping
    });


    return { code: transformedCode, extractedStrings };

  } catch (error) {
    // ... (keep existing fallback logic) ...
    console.error(`Error performing AST-based transformation: ${error}`);
    // Fallback logic remains the same
    console.error('Falling back to simple regex replacement');
    let transformedCode = code;
    const fallbackPattern = options?.pattern ? new RegExp(options.pattern, 'g') : DEFAULT_PATTERN;
    transformedCode = transformedCode.replace(fallbackPattern, (match, p1) => `${translationMethod}("${p1.replace(/"/g, '\\"')}")`); // Basic fallback escaping

    // Fallback hook insertion (simplified) - Keep this as a safety net
    const hasHookAlready = hasTranslationHook(code, hookName);
    if (!hasHookAlready && extractedStrings.length > 0) {
        if (!transformedCode.includes(`import { ${hookName} } from '${hookImport}'`)) {
             transformedCode = `import { ${hookName} } from '${hookImport}';\n${transformedCode}`;
        }
         const functionComponentRegex = /(function\s+\w+\s*\(.*?\)\s*\{|const\s+\w+\s*=\s*\(.*?\)\s*=>\s*\{)/;
         if (!transformedCode.includes(`const { ${translationMethod} } = ${hookName}()`)) {
             transformedCode = transformedCode.replace(
                 functionComponentRegex,
                 `$1\n  const { ${translationMethod} } = ${hookName}();`
             );
         }
    }
    return { code: transformedCode, extractedStrings };
  }
}