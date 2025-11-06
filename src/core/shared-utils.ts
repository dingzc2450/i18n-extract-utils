export interface Replacement {
  start: number;
  end: number;
  newText: string;
}

/**
 * Apply multiple replacements to a template string.
 * Replacements must use offsets relative to a surrounding `<template>` tag
 * (this mirrors how Vue compiler reports offsets).
 */
export function applyTemplateReplacements(
  template: string,
  replacements: Replacement[]
): string {
  if (replacements.length === 0) return template;
  const sorted = [...replacements].sort((a, b) => b.start - a.start);
  let result = template;
  const templateTagLength = "<template>".length;
  for (const { start, end, newText } of sorted) {
    result =
      result.slice(0, start - templateTagLength) +
      newText +
      result.slice(end - templateTagLength);
  }
  return result;
}

/**
 * Reconstruct a source snippet from a (partial) AST node that may include
 * start/end offsets. Falls back to heuristic reconstruction for a few node types.
 */
export function reconstructExpression(
  astNode: unknown,
  originalContent: string
): string {
  if (!astNode) return "";
  if (typeof astNode === "object" && astNode !== null) {
    const obj = astNode as Record<string, unknown>;
    if (
      typeof obj.start === "number" &&
      typeof obj.end === "number" &&
      originalContent
    ) {
      return originalContent.substring(obj.start as number, obj.end as number);
    }
  }

  if (typeof astNode === "object" && astNode !== null) {
    const obj = astNode as Record<string, unknown>;
    const type = obj.type as string | undefined;
    if (type === "BinaryExpression") {
      const left = reconstructExpression(obj.left, originalContent);
      const right = reconstructExpression(obj.right, originalContent);
      const op =
        typeof obj.operator === "string" ? (obj.operator as string) : "+";
      return `${left} ${op} ${right}`;
    }
    if (type === "Identifier") {
      return typeof obj.name === "string" ? (obj.name as string) : "";
    }
    if (type === "StringLiteral") {
      return `'${typeof obj.value === "string" ? (obj.value as string) : ""}'`;
    }
    if (type === "MemberExpression") {
      const o = reconstructExpression(obj.object, originalContent);
      const p = reconstructExpression(obj.property, originalContent);
      return `${o}.${p}`;
    }
    if (type === "CallExpression") {
      const callee = reconstructExpression(obj.callee, originalContent);
      const argsArr = Array.isArray(obj.arguments)
        ? (obj.arguments as unknown[])
        : [];
      const args = argsArr
        .map(a => reconstructExpression(a, originalContent))
        .join(", ");
      return `${callee}(${args})`;
    }
  }
  return "";
}

// Generic code change applier for back-to-front replacements
import type { ChangeDetail } from "../types";

export function applyCodeChanges(
  code: string,
  changes: Array<Pick<ChangeDetail, "start" | "end" | "replacement">>
): string {
  const sorted = [...changes].sort((a, b) => (b.start ?? 0) - (a.start ?? 0));
  let result = code;
  for (const c of sorted) {
    const start = c.start ?? 0;
    const end = c.end ?? start;
    result = result.slice(0, start) + c.replacement + result.slice(end);
  }
  return result;
}
