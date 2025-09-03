/**
 * 代码位置计算器 - 优化代码解析和位置计算性能
 * 通过预计算和缓存避免重复的字符串分割和位置计算操作
 */

export interface LocationInfo {
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface PositionInfo {
  start: number;
  end: number;
  text: string;
  matchContext: {
    before: string;
    after: string;
    fullMatch: string;
  };
}

/**
 * 高性能的代码位置计算器
 * 预计算行起始位置，避免重复字符串分割操作
 */
export class CodePositionCalculator {
  private readonly code: string;
  private readonly lines: string[];
  private readonly lineStartPositions: number[];

  constructor(code: string) {
    this.code = code;
    this.lines = code.split("\n");
    this.lineStartPositions = this.calculateLineStartPositions();
  }

  /**
   * 预计算每行的起始位置
   * 这样可以避免在每次位置计算时重复分割字符串
   */
  private calculateLineStartPositions(): number[] {
    const positions = [0];
    let position = 0;

    for (let i = 0; i < this.lines.length - 1; i++) {
      position += this.lines[i].length + 1; // +1 for newline
      positions.push(position);
    }

    return positions;
  }

  /**
   * 批量计算多个位置信息
   * 批量处理可以减少函数调用开销
   */
  batchCalculatePositions(locations: LocationInfo[]): PositionInfo[] {
    return locations.map(location => this.calculatePosition(location));
  }

  /**
   * 计算单个位置信息
   * 使用预计算的行起始位置，避免重复字符串分割
   */
  calculatePosition(location: LocationInfo): PositionInfo {
    const { startLine, startColumn, endLine, endColumn } = location;

    // 使用预计算的行起始位置
    const start = this.lineStartPositions[startLine - 1] + startColumn;
    const end = this.lineStartPositions[endLine - 1] + endColumn;

    const text = this.extractText(startLine, startColumn, endLine, endColumn);
    const matchContext = this.generateMatchContext(
      startLine,
      startColumn,
      text
    );

    return { start, end, text, matchContext };
  }

  /**
   * 高效的文本提取
   * 使用预分割的行数组，避免重复分割
   */
  extractText(
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
  ): string {
    if (startLine === endLine) {
      // 单行情况
      return this.lines[startLine - 1].substring(startColumn, endColumn);
    } else {
      // 多行情况
      let result = "";
      for (let i = startLine - 1; i < endLine; i++) {
        if (i === startLine - 1) {
          // 第一行：从startColumn开始
          result += this.lines[i].substring(startColumn);
        } else if (i === endLine - 1) {
          // 最后一行：到endColumn结束
          result += "\n" + this.lines[i].substring(0, endColumn);
        } else {
          // 中间行：完整行
          result += "\n" + this.lines[i];
        }
      }
      return result;
    }
  }

  /**
   * 生成匹配上下文
   * 使用预计算的位置信息，提高性能
   */
  generateMatchContext(
    startLine: number,
    startColumn: number,
    text: string,
    contextLength: number = 20
  ): { before: string; after: string; fullMatch: string } {
    const start = this.lineStartPositions[startLine - 1] + startColumn;
    const end = start + text.length;

    const beforeStart = Math.max(0, start - contextLength);
    const afterEnd = Math.min(this.code.length, end + contextLength);

    const before = this.code.substring(beforeStart, start);
    const after = this.code.substring(end, afterEnd);
    const fullMatch = this.code.substring(beforeStart, afterEnd);

    return { before, after, fullMatch };
  }

  /**
   * 批量提取文本
   * 用于优化多个文本提取操作
   */
  batchExtractTexts(
    locations: Array<{
      startLine: number;
      startColumn: number;
      endLine: number;
      endColumn: number;
    }>
  ): string[] {
    return locations.map(loc =>
      this.extractText(
        loc.startLine,
        loc.startColumn,
        loc.endLine,
        loc.endColumn
      )
    );
  }

  /**
   * 获取行数
   */
  getLineCount(): number {
    return this.lines.length;
  }

  /**
   * 获取代码总长度
   */
  getCodeLength(): number {
    return this.code.length;
  }
}
