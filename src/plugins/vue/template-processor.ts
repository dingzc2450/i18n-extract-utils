import * as t from "@babel/types";
import generate from "@babel/generator";
import type {
  ExtractedString,
  UsedExistingKey,
  ExistingValueToKeyMapType,
} from "../../types";
import type { NormalizedTransformOptions } from "../../core/config-normalizer";
import { getKeyAndRecord } from "../../key-manager";
import { getVueCompilerManager } from "../vue/compiler-manager";

// Lightweight Vue AST types used only within template processing
interface VueASTLocation {
  start: { line: number; column: number; offset: number };
  end: { line: number; column: number; offset: number };
}

interface VueASTProps {
  type: number; // 6: Attribute, 7: Directive
  name: string;
  value?: { content: string };
  arg?: { content: string; type: number };
  exp?: { content: string; type: number; loc?: VueASTLocation };
  loc: VueASTLocation;
}

interface VueASTNode {
  type: number; // 1: Element, 2: Text, 5: Interpolation etc.
  content?:
    | string
    | {
        content: string;
        type: number;
        loc?: VueASTLocation;
        // dynamic nested js ast node (best-effort typing)
        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-ignore
        ast?: VueNestedASTNode;
      };
  children?: VueASTNode[];
  props?: Array<VueASTProps>;
  loc: VueASTLocation;
}

interface VueNestedASTNode {
  type: string;
  value?: string;
  test?: VueNestedASTNode;
  consequent?: VueNestedASTNode;
  alternate?: VueNestedASTNode;
  quasis?: Array<{ value: { raw: string } }>;
  expressions?: VueNestedASTNode[];
  name?: string;
  object?: VueNestedASTNode;
  property?: VueNestedASTNode;
  start?: number;
  end?: number;
  extra?: { parenStart?: number; [key: string]: unknown };
  callee?: VueNestedASTNode;
  arguments?: VueNestedASTNode[];
  operator?: string;
  left?: VueNestedASTNode;
  right?: VueNestedASTNode;
}

import {
  applyTemplateReplacements,
  reconstructExpression,
} from "../../core/shared-utils";
import type { Replacement } from "../../core/shared-utils";

export function processVueTemplate(
  template: string,
  translationMethod: string,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  options: NormalizedTransformOptions,
  existingValueToKeyMap: ExistingValueToKeyMapType,
  filePath: string,
  generatedKeysMap: Map<string, string | number>
): string {
  const mode = options.vueTemplateMode;

  // quick pre-scan to skip heavy parsing
  const quickRegex = new RegExp(options.pattern);
  if (!quickRegex.test(template)) {
    return template;
  }

  // prefer regex if requested or compiler not available
  if (mode === "regex" || !getVueCompilerManager().hasLoadedCompiler("vue3")) {
    if (mode === "ast") {
      if (options.disabledFallback) {
        console.warn(
          "Vue template AST mode requested, but compiler not available. Fallback disabled; returning original template."
        );
        return template;
      }
      // fall through to regex when fallback is allowed
    }
    return processTemplateWithRegex(
      template,
      translationMethod,
      extractedStrings,
      usedExistingKeysList,
      options,
      existingValueToKeyMap,
      filePath,
      generatedKeysMap
    );
  }

  try {
    const compiler = getVueCompilerManager().getLoadedCompiler("vue3");
    const parsed = compiler.parse(`<template>${template}</template>`);
    if (!parsed.descriptor || !parsed.descriptor.template) {
      throw new Error("Failed to parse template");
    }
    const { ast } = parsed.descriptor.template;
    if (!ast) throw new Error("Failed to generate AST from template");

    const replacements = collectTemplateReplacements(ast as VueASTNode, {
      translationMethod,
      options,
      existingValueToKeyMap,
      extractedStrings,
      usedExistingKeysList,
      filePath,
      generatedKeysMap,
    });

    return applyTemplateReplacements(template, replacements);
  } catch (error) {
    if (options.disabledFallback) {
      console.warn(
        `Vue template AST processing failed and fallback is disabled: ${String(
          error
        )}`
      );
      return template;
    }
    return processTemplateWithRegex(
      template,
      translationMethod,
      extractedStrings,
      usedExistingKeysList,
      options,
      existingValueToKeyMap,
      filePath,
      generatedKeysMap
    );
  }
}

function processTemplateWithRegex(
  template: string,
  translationMethod: string,
  extractedStrings: ExtractedString[],
  usedExistingKeysList: UsedExistingKey[],
  options: NormalizedTransformOptions,
  existingValueToKeyMap: ExistingValueToKeyMapType,
  filePath: string,
  generatedKeysMap: Map<string, string | number>
): string {
  const patternRegex = new RegExp(options.pattern, "g");

  const processExpressions = (
    text: string,
    inInterpolation = false
  ): string => {
    const ternaryRegex =
      /([^?:]+)\s*\?\s*(?:(?:`|['"])(___[^'"`]+(?:\${[^}]+}[^'"`]*)?___)(?:`|['"])|`(___[^`]+\${[^}]+}[^`]*___)`)(?:\s*:\s*)(?:(?:`|['"])(___[^'"`]+(?:\${[^}]+}[^'"`]*)?___)(?:`|['"])|`(___[^`]+\${[^}]+}[^`]*___)`)|\?(?:`|['"])(___[^'"`]+___)/g;

    let processedText = text.replace(
      ternaryRegex,
      (match, condition, trueStr, trueTempl, falseStr) => {
        const trueText = trueTempl || trueStr;
        const trueKey = getKeyAndRecord(
          trueText,
          { filePath, line: 0, column: 0 },
          existingValueToKeyMap,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        const trueCallExpr = t.callExpression(t.identifier(translationMethod), [
          t.stringLiteral(String(trueKey)),
        ]);
        const { code: trueCall } = generate(trueCallExpr, {
          compact: true,
          jsescOption: { minimal: true },
        });

        const falseText = falseStr;
        const falseKey = falseText
          ? getKeyAndRecord(
              falseText,
              { filePath, line: 0, column: 0 },
              existingValueToKeyMap,
              generatedKeysMap,
              extractedStrings,
              usedExistingKeysList,
              options
            )
          : null;

        let falseCall = "";
        if (falseKey !== null) {
          const falseCallExpr = t.callExpression(
            t.identifier(translationMethod),
            [t.stringLiteral(String(falseKey))]
          );
          const { code } = generate(falseCallExpr, {
            compact: true,
            jsescOption: { minimal: true },
          });
          falseCall = code;
        }

        return falseCall
          ? `${condition.trim()} ? ${trueCall} : ${falseCall}`
          : `${condition.trim()} ? ${trueCall} : ""`;
      }
    );

    processedText = processedText.replace(
      patternRegex,
      (fullMatch, extractedValue) => {
        if (!extractedValue) return fullMatch;

        const key = getKeyAndRecord(
          fullMatch,
          { filePath, line: 0, column: 0 },
          existingValueToKeyMap,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        const callExpr = t.callExpression(t.identifier(translationMethod), [
          t.stringLiteral(String(key)),
        ]);
        const { code: callCode } = generate(callExpr, {
          compact: true,
          jsescOption: { minimal: true },
        });

        if (inInterpolation) {
          return options.appendExtractedComment
            ? `${callCode} /* ${extractedValue} */`
            : callCode;
        } else {
          return options.appendExtractedComment
            ? `{{ ${callCode} }} <!-- ${extractedValue} -->`
            : `{{ ${callCode} }}`;
        }
      }
    );

    const templateLiteralRegex = /`(___[^`]+(?:\${[^}]+}[^`]*)?___)`/g;
    processedText = processedText.replace(
      templateLiteralRegex,
      (_match, templateStr) => {
        const key = getKeyAndRecord(
          templateStr,
          { filePath, line: 0, column: 0 },
          existingValueToKeyMap,
          generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        const callExpr = t.callExpression(t.identifier(translationMethod), [
          t.stringLiteral(String(key)),
        ]);
        const { code: callCode } = generate(callExpr, {
          compact: true,
          jsescOption: { minimal: true },
        });
        return inInterpolation ? callCode : `{{ ${callCode} }}`;
      }
    );

    return processedText;
  };

  const interpolationRegex = /{{([^}]+)}}/g;
  let lastIndex = 0;
  let result = "";
  let match: RegExpExecArray | null;

  while ((match = interpolationRegex.exec(template)) !== null) {
    const beforeText = template.slice(lastIndex, match.index);
    if (beforeText) {
      result += processExpressions(beforeText);
    }

    const fullMatch = match[0];
    const expr = match[1];
    let processedExpr = processExpressions(expr, true).trim();
    if (
      (processedExpr.startsWith("'") && processedExpr.endsWith("'")) ||
      (processedExpr.startsWith('"') && processedExpr.endsWith('"'))
    ) {
      processedExpr = processedExpr.substring(1, processedExpr.length - 1);
    }
    result += `{{ ${processedExpr} }}`;

    lastIndex = match.index + fullMatch.length;
  }

  if (lastIndex < template.length) {
    result += processExpressions(template.slice(lastIndex));
  }

  return result;
}

function collectTemplateReplacements(
  node: VueASTNode,
  ctx: {
    translationMethod: string;
    options: NormalizedTransformOptions;
    existingValueToKeyMap: ExistingValueToKeyMapType;
    extractedStrings: ExtractedString[];
    usedExistingKeysList: UsedExistingKey[];
    filePath: string;
    generatedKeysMap: Map<string, string | number>;
  }
): Replacement[] {
  const {
    translationMethod,
    options,
    existingValueToKeyMap,
    extractedStrings,
    usedExistingKeysList,
    filePath,
  } = ctx;

  const replacements: Replacement[] = [];

  const visit = (n: VueASTNode): void => {
    if (n.type === 2 && typeof n.content === "string") {
      const matches = n.content.match(options.pattern);
      if (matches) {
        const key = getKeyAndRecord(
          n.content,
          { filePath, line: n.loc.start.line, column: n.loc.start.column },
          existingValueToKeyMap,
          ctx.generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );

        replacements.push({
          start: n.loc.start.offset,
          end: n.loc.end.offset,
          newText: `{{ ${translationMethod}('${key}') }}`,
        });
      }
    }

    if (n.type === 5 && n.content && typeof n.content === "object") {
      const contentObj = n.content as {
        content: string;
        type: number;
        loc?: VueASTLocation;
        ast?: VueNestedASTNode;
      };

      if (contentObj.type === 4 && contentObj.ast) {
        const newText = processNestedExpression(contentObj, n.loc, ctx);
        if (contentObj.loc) {
          replacements.push({
            start: contentObj.loc.start.offset,
            end: contentObj.loc.end.offset,
            newText,
          });
        }
      } else {
        const expressionContent = contentObj.content;
        if (
          typeof expressionContent === "string" &&
          expressionContent.match(options.pattern) &&
          contentObj.loc
        ) {
          const key = getKeyAndRecord(
            expressionContent,
            { filePath, line: n.loc.start.line, column: n.loc.start.column },
            existingValueToKeyMap,
            ctx.generatedKeysMap,
            extractedStrings,
            usedExistingKeysList,
            options
          );

          replacements.push({
            start: contentObj.loc.start.offset,
            end: contentObj.loc.end.offset,
            newText: `${translationMethod}('${key}')`,
          });
        }
      }
    }

    if (n.props) {
      n.props.forEach(prop => {
        if (
          prop.type === 6 &&
          prop.value?.content &&
          prop.value.content.match(options.pattern)
        ) {
          const key = getKeyAndRecord(
            prop.value.content,
            {
              filePath,
              line: prop.loc.start.line,
              column: prop.loc.start.column,
            },
            existingValueToKeyMap,
            ctx.generatedKeysMap,
            extractedStrings,
            usedExistingKeysList,
            options
          );

          replacements.push({
            start: prop.loc.start.offset,
            end: prop.loc.end.offset,
            newText: `:${prop.name}="${translationMethod}('${key}')"`,
          });
        }

        if (
          prop.type === 7 &&
          prop.exp &&
          typeof prop.exp.content === "string" &&
          prop.exp.content.match(options.pattern) &&
          prop.exp.loc
        ) {
          const key = getKeyAndRecord(
            prop.exp.content,
            {
              filePath,
              line: prop.loc.start.line,
              column: prop.loc.start.column,
            },
            existingValueToKeyMap,
            ctx.generatedKeysMap,
            extractedStrings,
            usedExistingKeysList,
            options
          );

          replacements.push({
            start: prop.exp.loc.start.offset,
            end: prop.exp.loc.end.offset,
            newText: `${translationMethod}('${key}')`,
          });
        }
      });
    }

    if (n.children) {
      n.children.forEach(c => visit(c));
    }
  };

  visit(node);
  return replacements;
}

function processNestedExpression(
  typedContent: {
    content: string;
    type: number;
    loc?: VueASTLocation;
    ast?: VueNestedASTNode;
  },
  nodeLoc: VueASTLocation,
  ctx: {
    translationMethod: string;
    options: NormalizedTransformOptions;
    existingValueToKeyMap: ExistingValueToKeyMapType;
    extractedStrings: ExtractedString[];
    usedExistingKeysList: UsedExistingKey[];
    filePath: string;
    generatedKeysMap: Map<string, string | number>;
  }
): string {
  const {
    translationMethod,
    options,
    existingValueToKeyMap,
    extractedStrings,
    usedExistingKeysList,
    filePath,
  } = ctx;

  if (!typedContent.ast) return typedContent.content;

  const indexOffset = typedContent.ast.extra?.parenStart !== undefined ? 1 : 0;

  const recur = (astNode?: VueNestedASTNode, offset = indexOffset): string => {
    if (!astNode) return "";

    if (astNode.type === "StringLiteral") {
      const str = astNode.value;
      if (str && str.match(options.pattern)) {
        const key = getKeyAndRecord(
          str,
          { filePath, line: nodeLoc.start.line, column: nodeLoc.start.column },
          existingValueToKeyMap,
          ctx.generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );
        return `${translationMethod}('${key}')`;
      }
      return str ? `'${str}'` : "";
    }

    if (
      astNode.type === "ConditionalExpression" &&
      astNode.test &&
      astNode.consequent &&
      astNode.alternate
    ) {
      const testStart = (astNode.test.start ?? 0) - offset;
      const testEnd = (astNode.test.end ?? 0) - offset;
      const test =
        testStart >= 0 &&
        testEnd <= typedContent.content.length &&
        astNode.test.start !== undefined &&
        astNode.test.end !== undefined
          ? typedContent.content.substring(testStart, testEnd)
          : reconstructExpression(astNode.test, typedContent.content);
      const consequent = recur(astNode.consequent, offset);
      const alternate = recur(astNode.alternate, offset);
      return test && consequent && alternate
        ? `${test} ? ${consequent} : ${alternate}`
        : typedContent.content;
    }

    if (astNode.type === "TemplateLiteral") {
      const quasis = astNode.quasis || [];
      const expressions = astNode.expressions || [];
      let rawString = "";
      const expressionNames: string[] = [];
      expressions.forEach(expr => {
        if (expr.type === "Identifier") {
          expressionNames.push(expr.name || "type");
        } else if (expr.type === "MemberExpression") {
          const obj = expr.object?.name || "";
          const prop = expr.property?.name || "";
          expressionNames.push(obj && prop ? `${obj}.${prop}` : "type");
        } else {
          expressionNames.push("type");
        }
      });
      for (let i = 0; i < quasis.length; i++) {
        rawString += quasis[i].value.raw;
        if (i < expressions.length) {
          rawString += "${" + expressionNames[i] + "}";
        }
      }
      if (rawString.match(options.pattern)) {
        const translationKey = getKeyAndRecord(
          rawString,
          { filePath, line: nodeLoc.start.line, column: nodeLoc.start.column },
          existingValueToKeyMap,
          ctx.generatedKeysMap,
          extractedStrings,
          usedExistingKeysList,
          options
        );
        return `${translationMethod}('${translationKey}')`;
      }
      return rawString ? `\`${rawString}\`` : "";
    }

    if (astNode.type === "Identifier") {
      return astNode.name || typedContent.content;
    }
    if (astNode.type === "MemberExpression") {
      const obj = recur(astNode.object, offset);
      const prop = recur(astNode.property, offset);
      return obj && prop ? `${obj}.${prop}` : typedContent.content;
    }

    return typedContent.content;
  };

  return recur(typedContent.ast);
}

// `reconstructExpression` is provided by shared-utils; no local definition here.
