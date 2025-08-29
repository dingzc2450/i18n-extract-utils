import { ChangeDetail, ImportChange } from "./types";

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
          result = this.replaceByPosition(result, change.start, change.end, change.replacement);
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
  static applyImportChanges(originalCode: string, changes: ImportChange[]): string {
    if (changes.length === 0) {
      return originalCode;
    }

    const sortedChanges = [...changes].sort((a, b) => b.start - a.start);

    let result = originalCode;

    for (const change of sortedChanges) {
      if (change.type === 'replace') {
        result = result.slice(0, change.start) + change.text + result.slice(change.end);
      } else if (change.type === 'insert') {
        result = result.slice(0, change.insertPosition) + change.text + result.slice(change.insertPosition);
      }
    }

    return result;
  }

  /**
   * 使用精确位置进行替换
   */
  private static replaceByPosition(code: string, start: number, end: number, replacement: string): string {
    if (start < 0 || end > code.length || start > end) {
      throw new Error(`Invalid position: start=${start}, end=${end}, codeLength=${code.length}`);
    }
    return code.slice(0, start) + replacement + code.slice(end);
  }

  /**
   * 使用上下文信息进行替换
   */
  private static replaceByContext(code: string, change: ChangeDetail): string {
    if (!change.matchContext) {
      throw new Error("Missing match context for context-based replacement");
    }

    const { fullMatch, before, after } = change.matchContext;
    const matchIndex = code.indexOf(fullMatch);
    
    if (matchIndex === -1) {
      throw new Error(`Context match not found: ${fullMatch.substring(0, 50)}...`);
    }

    // 计算原始内容在fullMatch中的位置
    const originalInContext = fullMatch.indexOf(change.original);
    if (originalInContext === -1) {
      throw new Error(`Original string not found in context: ${change.original}`);
    }

    // 构建新的完整匹配字符串
    const beforeOriginal = fullMatch.substring(0, originalInContext);
    const afterOriginal = fullMatch.substring(originalInContext + change.original.length);
    const newFullMatch = beforeOriginal + change.replacement + afterOriginal;

    return code.slice(0, matchIndex) + newFullMatch + code.slice(matchIndex + fullMatch.length);
  }

  /**
   * 使用原始字符串进行模糊匹配替换（最后的回退方案）
   */
  private static replaceByOriginalString(code: string, change: ChangeDetail): string {
    // 尝试在指定行附近查找匹配的字符串
    const lines = code.split('\n');
    const targetLine = change.line - 1; // 转换为0基索引
    
    if (targetLine < 0 || targetLine >= lines.length) {
      throw new Error(`Invalid line number: ${change.line}`);
    }

    // 在目标行查找
    const line = lines[targetLine];
    const columnIndex = change.column;
    
    // 检查目标位置是否匹配
    if (line.substring(columnIndex, columnIndex + change.original.length) === change.original) {
      lines[targetLine] = line.substring(0, columnIndex) + 
                         change.replacement + 
                         line.substring(columnIndex + change.original.length);
      return lines.join('\n');
    }

    // 如果精确位置不匹配，尝试在该行内查找
    const indexInLine = line.indexOf(change.original);
    if (indexInLine !== -1) {
      lines[targetLine] = line.substring(0, indexInLine) + 
                         change.replacement + 
                         line.substring(indexInLine + change.original.length);
      return lines.join('\n');
    }

    // 最后尝试全局替换第一个匹配项
    const globalIndex = code.indexOf(change.original);
    if (globalIndex !== -1) {
      return code.substring(0, globalIndex) + 
             change.replacement + 
             code.substring(globalIndex + change.original.length);
    }

    throw new Error(`Could not find original string for replacement: ${change.original}`);
  }

  /**
   * 计算字符串在源代码中的精确位置
   * @param code 源代码
   * @param line 行号（1基索引）
   * @param column 列号（0基索引）
   * @param length 字符串长度
   * @returns 精确的起始和结束位置
   */
  static calculatePosition(code: string, line: number, column: number, length: number): { start: number; end: number } {
    const lines = code.split('\n');
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
    const { start, end } = this.calculatePosition(code, line, column, original.length);
    
    const beforeStart = Math.max(0, start - contextLength);
    const afterEnd = Math.min(code.length, end + contextLength);
    
    const before = code.substring(beforeStart, start);
    const after = code.substring(end, afterEnd);
    const fullMatch = code.substring(beforeStart, afterEnd);
    
    return { before, after, fullMatch };
  }
}
