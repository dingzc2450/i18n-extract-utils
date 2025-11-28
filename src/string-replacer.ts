import type { ChangeDetail, ImportChange } from "./types";

/**
 * 字符串替换器 - 使用精确的位置信息进行字符串替换，避免AST重新生成导致的格式问题
 */
export class StringReplacer {
  /**
   * 基于ChangeDetail信息在原始代码中进行字符串替换
   * @param originalCode 原始源代码
   * @param changes 需要进行的替换操作列表
   * @returns 替换后的代码
   */
  static applyChanges(originalCode: string, changes: ChangeDetail[]): string {
    if (changes.length === 0) {
      return originalCode;
    }

    // 按照位置倒序排列，从后往前替换，避免位置偏移问题
    const sortedChanges = [...changes].sort((a, b) => {
      // 优先使用精确位置信息
      if (a.start !== undefined && b.start !== undefined) {
        return b.start - a.start;
      }
      // 如果没有精确位置，使用行列信息
      if (a.line !== b.line) {
        return b.line - a.line;
      }
      return b.column - a.column;
    });

    let result = originalCode;

    for (const change of sortedChanges) {
      try {
        if (change.start !== undefined && change.end !== undefined) {
          // 使用精确位置进行替换
          result = this.replaceByPosition(
            result,
            change.start,
            change.end,
            change.replacement
          );
        } else if (change.matchContext) {
          // 使用上下文匹配进行替换
          result = this.replaceByContext(result, change);
        }
      } catch (error) {
        console.error("Failed to apply change:", { change, error });
      }
    }
    return result;
  }

  /**
   * 应用导入变更
   */
  static applyImportChanges(
    originalCode: string,
    changes: ImportChange[]
  ): string {
    if (changes.length === 0) {
      return originalCode;
    }

    const sortedChanges = [...changes].sort((a, b) => b.start - a.start);

    let result = originalCode;

    for (const change of sortedChanges) {
      if (change.type === "replace") {
        result =
          result.slice(0, change.start) +
          change.text +
          result.slice(change.end);
      } else if (change.type === "insert") {
        result =
          result.slice(0, change.insertPosition) +
          change.text +
          result.slice(change.insertPosition);
      }
    }

    return result;
  }

  /**
   * 使用精确位置进行替换
   */
  private static replaceByPosition(
    code: string,
    start: number,
    end: number,
    replacement: string
  ): string {
    if (start < 0 || end > code.length || start > end) {
      throw new Error(
        `Invalid position: start=${start}, end=${end}, codeLength=${code.length}`
      );
    }

    const before = code.slice(0, start);
    const after = code.slice(end);
    // Trailing line comments inside expressions (e.g. within function arguments)
    // can break syntax like `ref(t(...) // comment);`. We detect that case and
    // move the comment to a safer spot after surrounding punctuation.
    const commentInfo = this.extractTrailingLineComment(replacement);
    if (!commentInfo) {
      return before + replacement + after;
    }

    const { codeWithoutComment, lineComment } = commentInfo;
    const combinedWithoutComment = before + codeWithoutComment + after;
    const insertionStart = before.length + codeWithoutComment.length;
    const placement = this.findLineCommentPlacement(
      combinedWithoutComment,
      insertionStart
    );

    if (!placement) {
      return before + replacement + after;
    }

    const { position, needsNewline } = placement;
    const upcomingChar = combinedWithoutComment[position] ?? "";
    const commentInsertion =
      " " +
      lineComment +
      (needsNewline && upcomingChar !== "\n" && upcomingChar !== "\r"
        ? "\n"
        : "");

    return (
      combinedWithoutComment.slice(0, position) +
      commentInsertion +
      combinedWithoutComment.slice(position)
    );
  }

  private static extractTrailingLineComment(
    replacement: string
  ): { codeWithoutComment: string; lineComment: string } | null {
    const match = replacement.match(/^(.*?)(\s*\/\/[^\r\n]*)(\s*)$/s);
    if (!match) {
      return null;
    }

    const [, beforeComment, commentPart] = match;

    if (commentPart.includes("\n") || commentPart.includes("\r")) {
      return null;
    }

    return {
      codeWithoutComment: beforeComment.replace(/\s+$/, ""),
      lineComment: commentPart.trimStart(),
    };
  }

  private static findLineCommentPlacement(
    code: string,
    startIndex: number
  ): { position: number; needsNewline: boolean } | null {
    let index = startIndex;
    const length = code.length;

    while (index < length) {
      const char = code[index];

      if (char === " " || char === "\t") {
        index++;
        continue;
      }

      if (char === ")" || char === "]" || char === "}") {
        index++;
        continue;
      }

      if (char === ";") {
        index++;
        continue;
      }

      if (char === "\n" || char === "\r") {
        return { position: index, needsNewline: false };
      }

      if (char === ",") {
        let insertPos = index + 1;
        while (
          insertPos < length &&
          (code[insertPos] === " " || code[insertPos] === "\t")
        ) {
          insertPos++;
        }

        const nextChar = code[insertPos];
        const needsNewline = !["\n", "\r"].includes(nextChar ?? "");
        return { position: insertPos, needsNewline };
      }

      return null;
    }

    return { position: length, needsNewline: false };
  }

  /**
   * 使用上下文信息进行替换
   */
  private static replaceByContext(code: string, change: ChangeDetail): string {
    if (!change.matchContext) {
      throw new Error("Missing match context for context-based replacement");
    }

    const { fullMatch } = change.matchContext;
    const matchIndex = code.indexOf(fullMatch);

    if (matchIndex === -1) {
      throw new Error(
        `Context match not found: ${fullMatch.substring(0, 50)}...`
      );
    }

    // 计算原始内容在fullMatch中的位置
    const originalInContext = fullMatch.indexOf(change.original);
    if (originalInContext === -1) {
      throw new Error(
        `Original string not found in context: ${change.original}`
      );
    }

    // 构建新的完整匹配字符串
    const beforeOriginal = fullMatch.substring(0, originalInContext);
    const afterOriginal = fullMatch.substring(
      originalInContext + change.original.length
    );
    const newFullMatch = beforeOriginal + change.replacement + afterOriginal;

    return (
      code.slice(0, matchIndex) +
      newFullMatch +
      code.slice(matchIndex + fullMatch.length)
    );
  }

  /**
   * 计算字符串在源代码中的精确位置
   * @param code 源代码
   * @param line 行号（1基索引）
   * @param column 列号（0基索引）
   * @param length 字符串长度
   * @returns 精确的起始和结束位置
   */
  static calculatePosition(
    code: string,
    line: number,
    column: number,
    length: number
  ): { start: number; end: number } {
    const lines = code.split("\n");
    let position = 0;

    // 累加到目标行之前的所有字符数（包括换行符）
    for (let i = 0; i < line - 1; i++) {
      if (i < lines.length) {
        position += lines[i].length + 1; // +1 for the newline character
      }
    }

    // 加上目标行内的列偏移
    const start = position + column;
    const end = start + length;

    return { start, end };
  }

  /**
   * 生成上下文匹配信息
   * @param code 源代码
   * @param line 行号（1基索引）
   * @param column 列号（0基索引）
   * @param original 原始字符串
   * @param contextLength 上下文长度
   * @returns 上下文匹配信息
   */
  static generateMatchContext(
    code: string,
    line: number,
    column: number,
    original: string,
    contextLength: number = 20
  ): { before: string; after: string; fullMatch: string } {
    const { start, end } = this.calculatePosition(
      code,
      line,
      column,
      original.length
    );

    const beforeStart = Math.max(0, start - contextLength);
    const afterEnd = Math.min(code.length, end + contextLength);

    const before = code.substring(beforeStart, start);
    const after = code.substring(end, afterEnd);
    const fullMatch = code.substring(beforeStart, afterEnd);

    return { before, after, fullMatch };
  }
}
