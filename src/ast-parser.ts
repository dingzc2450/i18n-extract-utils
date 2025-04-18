import { parse } from "@babel/parser";
import traverse from "@babel/traverse";
import * as t from "@babel/types";
import generate from "@babel/generator";
// Import ChangeDetail
import { ExtractedString, TransformOptions, UsedExistingKey, ChangeDetail } from "./types";
import fs from "fs";
import {  getDefaultPattern } from "./string-extractor";
import { hasTranslationHook } from "./hook-utils";
import { formatGeneratedCode } from "./code-formatter";
import * as tg from "./babel-type-guards"; // 引入类型辅助工具
import { fallbackTransform } from "./fallback-transform"; // 新增

// Helper function to create the replacement CallExpression node
function createTranslationCall(
  methodName: string,
  translationKey: string | number
): t.CallExpression {
  // If the user specified 'default' as the method, assume the actual function is 't'
  const effectiveMethodName = methodName === "default" ? "t" : methodName;
  return t.callExpression(t.identifier(effectiveMethodName), [
    typeof translationKey === "string"
      ? t.stringLiteral(translationKey)
      : t.numericLiteral(translationKey),
  ]);
}

/**
 * 工具函数：尝试将字符串节点替换为 t(key) 调用
 * @param nodeValue 原始字符串
 * @param pattern 匹配正则
 * @param valueToKeyMap value->key映射
 * @returns 匹配到则返回 {textToTranslate, translationKey}，否则 undefined
 */
function getTranslationMatch(
  nodeValue: string,
  pattern: RegExp,
  valueToKeyMap: Map<string, string | number>
): { textToTranslate: string; translationKey: string | number } | undefined {
  const match = pattern.exec(nodeValue);
  if (match && match[1] !== undefined) {
    const textToTranslate = match[1];
    const translationKey = valueToKeyMap.get(textToTranslate);
    if (translationKey !== undefined) {
      return { textToTranslate, translationKey };
    }
  }
  return undefined;
}

/**
 * 工具函数：警告未找到 key 的情况
 */
function warnNoKey(filePath: string, text: string, context: string) {
  console.warn(
    `[${filePath}] Warning: Found match "${text}" in ${context} but no key in valueToKeyMap.`
  );
}

/**
 * Traverses the AST to replace matched strings with translation function calls.
 * @returns { modified: boolean, changes: ChangeDetail[] } Indicates if replacements were made and details of changes.
 */
function replaceStringsWithTCalls(
  ast: t.File,
  existingValueToKey: Map<string, string | number>, // Pre-built from existing translations
  extractedStrings: ExtractedString[], // To be populated
  usedExistingKeysList: UsedExistingKey[], // To be populated
  translationMethod: string,
  options: TransformOptions,
  filePath: string
): { modified: boolean; changes: ChangeDetail[] } { // Updated return type
  let modified = false;
  const changes: ChangeDetail[] = []; // Initialize changes array
  const generatedKeysMap = new Map<string, string | number>(); // Track keys generated in this file run

  // 确定实际使用的翻译函数名，因为 'default' 会映射到 't'
  const effectiveMethodName =
    translationMethod === "default" ? "t" : translationMethod;

  // --- 获取全局匹配模式 ---
  const globalPattern = options?.pattern
    ? new RegExp(options.pattern, "g") // 确保是全局模式
    : new RegExp(getDefaultPattern().source, "g"); // 确保是全局模式

  traverse(ast, {
    // --- StringLiteral Visitor ---
    StringLiteral(path) {
      // --- 新增的检查 ---
      // 检查父节点是否为我们正在使用的翻译函数的调用表达式
      if (
        tg.isCallExpression(path.parent) &&
        tg.isIdentifier(path.parent.callee) &&
        path.parent.callee.name === effectiveMethodName && // 使用实际的函数名比较
        path.listKey === "arguments" // 确保是参数部分
      ) {
        // 如果这个 StringLiteral 是 t(...) 的参数，直接跳过，不处理
        return;
      }
      // --- 检查结束 ---

      // --- 原有的检查 ---
      if (
        tg.isJSXAttribute(path.parent) ||
        tg.isImportDeclaration(path.parent) ||
        tg.isExportDeclaration(path.parent)
      ) {
        return; // 跳过 JSX 属性、导入/导出声明
      }
      // --- 原有检查结束 ---

      const nodeValue = path.node.value;
      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      const translationKey = getKeyAndRecord(
        nodeValue, // Pass the original value for pattern matching
        location,
        existingValueToKey,
        generatedKeysMap,
        extractedStrings,
        usedExistingKeysList,
        options
      );

      if (translationKey !== undefined) {
        const originalNode = path.node;
        const replacementNode = createTranslationCall(translationMethod, translationKey);
        // Record change before replacement
        if (originalNode.loc) {
          changes.push({
            filePath,
            original: generate(originalNode).code, // Use generator for consistent quoting
            replacement: generate(replacementNode).code,
            line: originalNode.loc.start.line,
            column: originalNode.loc.start.column,
            endLine: originalNode.loc.end.line,
            endColumn: originalNode.loc.end.column,
          });
        }
        path.replaceWith(replacementNode);
        modified = true;
      }
    },

    // --- JSXAttribute Visitor ---
    JSXAttribute(path) {
      if (path.node.value && tg.isStringLiteral(path.node.value)) {
        const nodeValue = path.node.value.value;
        const location = {
          filePath,
          line: path.node.loc?.start.line ?? 0,
          column: path.node.loc?.start.column ?? 0,
        };

        const translationKey = getKeyAndRecord(
          nodeValue, // Pass original value
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (translationKey !== undefined) {
          const originalNode = path.node.value; // The StringLiteral node
          const replacementNode = t.jsxExpressionContainer(
            createTranslationCall(translationMethod, translationKey)
          );
          // Record change before replacement
          if (originalNode.loc) {
             changes.push({
               filePath,
               original: generate(originalNode).code,
               replacement: generate(replacementNode).code,
               line: originalNode.loc.start.line,
               column: originalNode.loc.start.column,
               endLine: originalNode.loc.end.line,
               endColumn: originalNode.loc.end.column,
             });
          }
          path.node.value = replacementNode;
          modified = true;
        }
      }
    },

    // --- JSXText Visitor ---
    JSXText(path) {
      const nodeValue = path.node.value;
      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0, // 列可能需要更精确计算
      };

      // 重置全局正则表达式的 lastIndex
      globalPattern.lastIndex = 0;

      // 检查是否包含需要翻译的模式
      if (!globalPattern.test(nodeValue)) {
        return; // 如果完全不包含模式，直接跳过
      }

      // 重置 lastIndex 以便重新开始匹配
      globalPattern.lastIndex = 0;

      const newNodes: (t.JSXText | t.JSXExpressionContainer)[] = [];
      let lastIndex = 0;
      let match;
      let madeChangeInJSXText = false; // Track if any replacement happened within this JSXText

      // 循环查找所有匹配项
      while ((match = globalPattern.exec(nodeValue)) !== null) {
        const matchStartIndex = match.index;
        const matchedTextWithDelimiters = match[0]; // e.g., "___Hello___"
        const textToTranslate = match[1]; // e.g., "Hello"

        // 1. 添加匹配项之前的文本（如果存在）
        if (matchStartIndex > lastIndex) {
          const textBefore = nodeValue.slice(lastIndex, matchStartIndex);
          if (/\S/.test(textBefore)) { // 仅添加非纯空白文本
            newNodes.push(t.jsxText(textBefore));
          }
        }

        // 2. 处理匹配项，获取 key 并创建 JSXExpressionContainer
        // 注意：这里我们用 textToTranslate (内部文本) 去获取 key
        const translationKey = getKeyAndRecord(
          matchedTextWithDelimiters, // 传递原始匹配项给 getKeyAndRecord 进行模式确认和提取
          { ...location, column: location.column + matchStartIndex }, // 调整列号
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        if (translationKey !== undefined) {
          newNodes.push(
            t.jsxExpressionContainer(
              createTranslationCall(translationMethod, translationKey)
            )
          );
          madeChangeInJSXText = true; // Mark change occurred
          modified = true; // 标记发生了修改
        } else {
          // 如果 getKeyAndRecord 返回 undefined (理论上不应发生，因为 globalPattern 已匹配)
          // 则将原始匹配文本添加回去，避免丢失
           if (/\S/.test(matchedTextWithDelimiters)) {
               newNodes.push(t.jsxText(matchedTextWithDelimiters));
           }
        }

        // 更新 lastIndex 到当前匹配项之后
        lastIndex = globalPattern.lastIndex;
      }

      // 3. 添加最后一个匹配项之后的文本（如果存在）
      if (lastIndex < nodeValue.length) {
        const textAfter = nodeValue.slice(lastIndex);
         if (/\S/.test(textAfter)) { // 仅添加非纯空白文本
            newNodes.push(t.jsxText(textAfter));
         }
      }

      // 4. 如果生成了新节点，则替换原节点
      if (newNodes.length > 0 && madeChangeInJSXText) { // Only replace if a change was made
        const originalNode = path.node;
        // Record one change for the entire JSXText replacement
        if (originalNode.loc) {
            const replacementCode = newNodes.map(n => generate(n).code).join('');
            changes.push({
                filePath,
                original: originalNode.value, // Original text content
                replacement: replacementCode, // Generated code for new nodes
                line: originalNode.loc.start.line,
                column: originalNode.loc.start.column,
                endLine: originalNode.loc.end.line,
                endColumn: originalNode.loc.end.column,
            });
        }
        path.replaceWithMultiple(newNodes);
        modified = true; // Mark overall modification
      }
    }, // --- JSXText Visitor 结束 ---

    // --- TemplateLiteral Visitor ---
    TemplateLiteral(path) {
      if (tg.isTaggedTemplateExpression(path.parent)) return;
      const node = path.node;
      const location = {
        filePath,
        line: path.node.loc?.start.line ?? 0,
        column: path.node.loc?.start.column ?? 0,
      };

      // --- 处理没有插值的模板字符串 ---
      if (node.expressions.length === 0) {
        // 1. 获取原始的、包含 ___ 的字符串值
        const originalRawString = node.quasis.map((q) => q.value.raw).join(""); // e.g., "___Error occurred___"

        // 2. 使用 getKeyAndRecord 来处理：它会匹配模式、提取内部内容、查找/生成 key
        const translationKey = getKeyAndRecord(
          originalRawString, // 传递原始字符串给 getKeyAndRecord
          location,
          existingValueToKey,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        // 3. 如果 getKeyAndRecord 成功找到了 key（说明模式匹配且 key 已处理）
        if (translationKey !== undefined) {
          const originalNode = path.node;
          const replacementNode = createTranslationCall(translationMethod, translationKey);
          // Record change
          if (originalNode.loc) {
            changes.push({
              filePath,
              original: generate(originalNode).code,
              replacement: generate(replacementNode).code,
              line: originalNode.loc.start.line,
              column: originalNode.loc.start.column,
              endLine: originalNode.loc.end.line,
              endColumn: originalNode.loc.end.column,
            });
          }
          path.replaceWith(replacementNode);
          modified = true;
        }
        // 如果 translationKey 是 undefined，说明原始字符串不匹配 ___...___ 模式，不做任何事
        return; // 处理完毕，退出此节点的访问
      }

      // --- 处理带有插值的模板字符串 (修改后) ---
      else {
        // 1. 重构原始字符串结构，用于模式匹配 (例如 "___Select ${...}___")
        let originalRawStringForPatternCheck = "";
        node.quasis.forEach((quasi, i) => {
          originalRawStringForPatternCheck += quasi.value.raw;
          if (i < node.expressions.length) {
            // 使用一个简单的、不会与真实代码冲突的占位符进行结构匹配
            originalRawStringForPatternCheck += "${...}";
          }
        });

        const pattern = options?.pattern
          ? new RegExp(options.pattern)
          : new RegExp(getDefaultPattern().source); // 非全局，用于单次匹配

        // 2. 对原始结构进行模式匹配
        const match = pattern.exec(originalRawStringForPatternCheck);

        // 3. 检查是否匹配成功，并且捕获组 match[1] 存在
        if (match && match[1] !== undefined) {
          // 模式匹配成功！

          // 4. 从 match[1] 获取 *内部* 内容结构 (例如 "Select ${...}")
          const matchedContentStructure = match[1];

          // 5. 将内部内容结构转换为标准的 canonicalValue (例如 "Select {arg1}")
          //    这才是用于 key 查找/生成 和 存储到 extractedStrings 的值
          let argIndex = 1;
          const canonicalValue = matchedContentStructure.replace(
            /\$\{\.\.\.\}/g, // 替换掉之前用于结构匹配的简单占位符
            () => `{arg${argIndex++}}`
          ); // 得到 "Select {arg1}"

          // 6. 使用这个正确的 canonicalValue 进行 key 查找或生成
          let translationKey: string | number | undefined;

          if (existingValueToKey.has(canonicalValue)) {
            // 查找现有 key
            translationKey = existingValueToKey.get(canonicalValue)!;
            // 记录使用情况 (如果需要)
            if (!usedExistingKeysList.some((k) => k.key === translationKey && k.value === canonicalValue)) {
              usedExistingKeysList.push({ ...location, key: translationKey, value: canonicalValue });
            }
          } else if (generatedKeysMap.has(canonicalValue)) {
            // 复用本次运行中已生成的 key
            translationKey = generatedKeysMap.get(canonicalValue)!;
          } else {
            // 生成新 key
            translationKey = options.generateKey
              ? options.generateKey(canonicalValue, location.filePath) // 使用正确的 canonicalValue 生成
              : canonicalValue;
            generatedKeysMap.set(canonicalValue, translationKey);
            // 将带有 *正确* canonicalValue 的记录添加到 extractedStrings
            if (!extractedStrings.some((s) => s.key === translationKey && s.value === canonicalValue)) {
              extractedStrings.push({ key: translationKey, value: canonicalValue, ...location });
            }
          }

          // 7. 使用找到或生成的 translationKey 执行代码替换
          const properties = node.expressions.map((expr, i) =>
            t.objectProperty(t.identifier(`arg${i + 1}`), expr as t.Expression)
          );
          const originalNode = path.node;
          const replacementNode = t.callExpression(
            t.identifier(
              translationMethod === "default" ? "t" : translationMethod
            ),
            [
              typeof translationKey === "string"
                ? t.stringLiteral(translationKey)
                : t.numericLiteral(translationKey),
              t.objectExpression(properties),
            ]
          );
          // Record change
          if (originalNode.loc) {
             changes.push({
               filePath,
               original: generate(originalNode).code,
               replacement: generate(replacementNode).code,
               line: originalNode.loc.start.line,
               column: originalNode.loc.start.column,
               endLine: originalNode.loc.end.line,
               endColumn: originalNode.loc.end.column,
             });
          }
          path.replaceWith(replacementNode);
          modified = true;
        }
        // 如果原始结构不匹配模式，则不进行任何操作
        // Babel 会继续遍历插值表达式内部
      }
    }, // --- TemplateLiteral Visitor 结束 ---
  });

  return { modified, changes }; // Return collected changes
}

// Helper function to manage key lookup and recording
function getKeyAndRecord(
  originalNodeValue: string, // The raw value from the AST node (e.g., "___Hello___")
  location: { filePath: string; line: number; column: number },
  existingValueToKey: Map<string, string | number>,
  generatedKeysMap: Map<string, string | number>, // Map for keys generated in *this* run
  extractedStrings: ExtractedString[], // Array to add newly generated keys to
  usedExistingKeysList: UsedExistingKey[], // Array to record usage of existing keys
  options: TransformOptions
): string | number | undefined {
  // Return undefined if pattern doesn't match
  const pattern = options?.pattern
    ? new RegExp(options.pattern)
    : new RegExp(getDefaultPattern().source); // Use non-global for single match test

  const match = pattern.exec(originalNodeValue); // Test the original node value
  if (!match || match[1] === undefined) {
    return undefined; // Not a match for our pattern
  }

  // *** FIX: Derive the canonical value from the match ***
  const canonicalValue = match[1]; // e.g., "Hello" or "Select {arg1}" (if pattern matches template literal structure)

  // Now use canonicalValue for lookups and generation
  if (existingValueToKey.has(canonicalValue)) {
    const key = existingValueToKey.get(canonicalValue)!;
    // Record usage if not already recorded for this specific key-value pair
    if (
      !usedExistingKeysList.some(
        (k) => k.key === key && k.value === canonicalValue
      )
    ) {
      usedExistingKeysList.push({ ...location, key, value: canonicalValue });
    }
    return key;
  }

  if (generatedKeysMap.has(canonicalValue)) {
    return generatedKeysMap.get(canonicalValue)!; // Reuse key generated earlier in this file
  }

  // Generate new key using canonicalValue
  const newKey = options.generateKey
    ? options.generateKey(canonicalValue, location.filePath)
    : canonicalValue;
  generatedKeysMap.set(canonicalValue, newKey);

  // Add to extractedStrings if it's the first time seeing this value/key in this file
  if (
    !extractedStrings.some(
      (s) => s.key === newKey && s.value === canonicalValue
    )
  ) {
    extractedStrings.push({ key: newKey, value: canonicalValue, ...location });
  }
  return newKey;
}

/**
 * Traverses the AST to add the translation hook import and call if necessary.
 * @param ast The Babel AST root node.
 * @param translationMethod The name of the translation function (or 'default').
 * @param hookName The name of the translation hook.
 * @param hookImport The import source for the hook.
 * @returns { importAdded: boolean, hookCallAdded: boolean } Flags indicating additions.
 */
function addHookAndImport(
  ast: t.File,
  translationMethod: string,
  hookName: string,
  hookImport: string
): { importAdded: boolean; hookCallAdded: boolean } {
  let importAdded = false;
  let hookCallAdded = false;

  traverse(ast, {
    Program: {
      enter(path) {
        // Check if import already exists
        let importExists = false;
        path.node.body.forEach((node) => {
          if (
            tg.isImportDeclaration(node) &&
            node.source.value === hookImport
          ) {
            node.specifiers.forEach((spec) => {
              if (
                tg.isImportSpecifier(spec) &&
                tg.isIdentifier(spec.imported) &&
                spec.imported.name === hookName
              ) {
                importExists = true;
              }
            });
          }
        });

        // Add import if it doesn't exist
        if (!importExists) {
          const importSpecifier = t.importSpecifier(
            t.identifier(hookName),
            t.identifier(hookName)
          );
          const importDeclaration = t.importDeclaration(
            [importSpecifier],
            t.stringLiteral(hookImport)
          );

          // Find the correct insertion point (after directives and other imports)
          let lastDirectiveIndex = -1;
          let lastImportIndex = -1;
          for (let i = 0; i < path.node.body.length; i++) {
            const node = path.node.body[i];
            if (
              tg.isExpressionStatement(node) &&
              tg.isStringLiteral(node.expression) &&
              path.node.directives?.some(
                (dir) =>
                  dir.value.value ===
                  (tg.isStringLiteral(node.expression)
                    ? node.expression.value
                    : "")
              )
            ) {
              lastDirectiveIndex = i;
            } else if (tg.isImportDeclaration(node)) {
              lastImportIndex = i;
            }
          }
          let insertIndex = 0;
          if (lastImportIndex !== -1) {
            insertIndex = lastImportIndex + 1;
          } else if (lastDirectiveIndex !== -1) {
            insertIndex = lastDirectiveIndex + 1;
          }
          path.node.body.splice(insertIndex, 0, importDeclaration);
          importAdded = true;
        }
      },
    },
    "FunctionDeclaration|FunctionExpression|ArrowFunctionExpression": (
      path
    ) => {
      // 跳过嵌套函数
      if (path.findParent((p) => tg.isFunction(p.node))) {
        return;
      }

      // 检查是否为组件（返回JSX）或自定义hook（函数名以use开头）
      let returnsJSX = false;
      let isCustomHook = false;

      // 检查函数名
      if (
        tg.isFunction(path.node) &&
        (tg.isFunctionDeclaration(path.node) ||
          tg.isFunctionExpression(path.node)) &&
        path.node.id &&
        /^use[A-Z\d_]/.test(path.node.id.name)
      ) {
        isCustomHook = true;
      }

      // 检查是否返回JSX
      path.traverse({
        ReturnStatement(returnPath) {
          if (
            returnPath.node.argument &&
            (tg.isJSXElement(returnPath.node.argument) ||
              tg.isJSXFragment(returnPath.node.argument))
          ) {
            returnsJSX = true;
            returnPath.stop();
          }
        },
      });

      // 检查函数体内是否有 t(...) 调用
      let hasTCall = false;
      path.traverse({
        CallExpression(callPath) {
          if (
            tg.isIdentifier(callPath.node.callee) &&
            callPath.node.callee.name === "t"
          ) {
            hasTCall = true;
            callPath.stop();
          }
        },
      });

      // 组件 或 自定义hook且用到t()，都插入hook语句
      if (
        (returnsJSX || (isCustomHook && hasTCall)) &&
        tg.isFunction(path.node) &&
        path.node.body &&
        tg.isBlockStatement(path.node.body)
      ) {
        // Check if the hook call already exists
        let callExists = false;
        path.node.body.body.forEach((stmt) => {
          if (tg.isVariableDeclaration(stmt)) {
            stmt.declarations.forEach((decl) => {
              if (
                tg.isVariableDeclarator(decl) &&
                tg.isCallExpression(decl.init) &&
                tg.isIdentifier(decl.init.callee) &&
                decl.init.callee.name === hookName
              ) {
                if (tg.isIdentifier(decl.id) || tg.isObjectPattern(decl.id)) {
                  callExists = true;
                }
              }
            });
          }
        });

        // Add hook call if it doesn't exist
        if (!callExists) {
          const callExpression = t.callExpression(t.identifier(hookName), []);
          let variableDeclarator;

          if (translationMethod === "default") {
            variableDeclarator = t.variableDeclarator(
              t.identifier("t"),
              callExpression
            );
          } else {
            const hookIdentifier = t.identifier(translationMethod);
            const objectPattern = t.objectPattern([
              t.objectProperty(hookIdentifier, hookIdentifier, false, true),
            ]);
            variableDeclarator = t.variableDeclarator(
              objectPattern,
              callExpression
            );
          }

          const variableDeclaration = t.variableDeclaration("const", [
            variableDeclarator,
          ]);
          path.node.body.body.unshift(variableDeclaration);
          hookCallAdded = true;
        }
      }
    },
  });

  return { importAdded, hookCallAdded };
}

export function transformCode(
  filePath: string,
  options: TransformOptions,
  // Renamed parameter for clarity: this map comes *only* from pre-existing translations
  existingValueToKey?: Map<string, string | number>
): {
  code: string;
  extractedStrings: ExtractedString[];
  usedExistingKeysList: UsedExistingKey[];
  changes: ChangeDetail[]; // Add changes to return type
} {
  const code = fs.readFileSync(filePath, "utf8");
  const translationMethod = options.translationMethod || "t";
  const hookName = options.hookName || "useTranslation";
  const hookImport = options.hookImport || "react-i18next";

  // Initialize lists to be populated during traversal
  const extractedStrings: ExtractedString[] = [];
  const usedExistingKeysList: UsedExistingKey[] = [];
  let changes: ChangeDetail[] = []; // Initialize changes array

  try {
    const ast = parse(code, {
      sourceType: "module",
      plugins: ["jsx", "typescript"],
      errorRecovery: true, // Enable error recovery
    });

    // --- Step 1: Traverse, Extract, Replace, and Collect Changes ---
    const { modified, changes: replacementChanges } = replaceStringsWithTCalls(
      ast,
      existingValueToKey || new Map(), // Pass existing map or empty map
      extractedStrings, // Pass array to be filled
      usedExistingKeysList, // Pass array to be filled
      translationMethod,
      options,
      filePath
    );
    changes = replacementChanges; // Assign collected changes

    // If no strings were extracted/modified, return original code
    if (!modified && extractedStrings.length === 0) {
      // Check modified flag as well, in case only existing keys were used
      return { code, extractedStrings, usedExistingKeysList, changes: [] };
    }

    // --- Step 2: Add Hook and Import if needed ---
    // Check if hook needs to be added based on whether *any* modification happened
    // or if strings were extracted (even if only existing keys were used, hook might be needed)
    const hookAlreadyExists = hasTranslationHook(code, hookName);
    const needsHook =
      !hookAlreadyExists && (modified || extractedStrings.length > 0);
    let importAdded = false;
    let hookCallAdded = false;

    if (needsHook) {
      const addResult = addHookAndImport(
        ast,
        translationMethod,
        hookName,
        hookImport
      );
      importAdded = addResult.importAdded;
      hookCallAdded = addResult.hookCallAdded;
    }

    // --- Step 3: Generate Final Code ---
    let { code: generatedCode } = generate(ast, {
      retainLines: true,
      compact: false,
      comments: true,
      jsescOption: { minimal: true },
    });

    // --- Step 4: Format Generated Code ---
    // Pass necessary info for formatting
    const transformedCode = formatGeneratedCode(generatedCode, {
      importAdded,
      hookCallAdded,
      hookName,
      hookImport,
      translationMethod: needsHook ? translationMethod : undefined,
    });

    return { code: transformedCode, extractedStrings, usedExistingKeysList, changes };

  } catch (error) {
    console.error(`[${filePath}] Error during AST transformation: ${error}`);
    if (error instanceof Error) {
      console.error(error.stack);
    }
    console.error(
      `[${filePath}] Falling back to simple regex replacement (key generation/reuse might be inaccurate in fallback)`
    );
    // Fallback needs adjustment as it relied on pre-extracted strings
    // For now, return original code on error to avoid incorrect fallback
    // TODO: Improve fallback to work without pre-extraction if needed
    // const transformedCode = fallbackTransform(code, extractedStrings, options); // This won't work correctly anymore
    return { code, extractedStrings: [], usedExistingKeysList: [], changes: [] }; // Return original code on error
  }
}
