/**
 * Configuration options for the transformation process.
 * 转换过程的配置选项。
 */
export interface TransformOptions {
  /**
   * The pattern used to match text for extraction.
   * Default is "___(.+)___".
   * 用于匹配要提取文本的模式。
   * 默认值为 "___(.+)___"。
   */
  pattern?: string;

  /**
   * The output path where extracted translations will be saved.
   * 提取的多语言文件的输出路径。
   */
  outputPath?: string;

  /**
   * The name of the translation method to use when replacing matched patterns.
   * Default is "t".
   * 替换匹配模式时使用的翻译方法名称。
   * 默认值为 "t"。
   */
  translationMethod?: string;

  /**
   * The name of the hook to be added for translation functionality.
   * Default is "useTranslation".
   * 添加用于翻译功能的hook名称。
   * 默认值为 "useTranslation"。
   */
  hookName?: string;

  /**
   * The import path for the translation hook.
   * Default is 'react-i18next'.
   * 翻译hook的导入路径。
   * 默认值为 'react-i18next'。
   */
  hookImport?: string;

  /**
   * A function to generate a unique key for a given string value.
   * If not provided, the string value itself is used as the key.
   *
   * 用于为给定字符串值生成唯一键的函数。
   * 如果未提供，则使用字符串值本身作为键。
   *
   * @param value - The extracted string value that needs a key.
   * @param filePath - The path of the file where the string was found.
   * @returns - The generated key (string or number) to use in the translation file.
   */
  generateKey?: (value: string, filePath: string) => string | number;
  
  /**
   * Existing translations, either as a path to a JSON file or a direct object.
   * This is used to check for existing translations and reuse keys.
   * The expected format (for both file and object) is { key: value }.
   *
   * 现有的翻译内容，可以是JSON文件的路径，也可以是直接的对象。
   * 用于检查现有翻译并复用键。
   * 预期的格式（文件和对象相同）为 { key: value }。
   */
  existingTranslations?: string | Record<string, string | number>; // Renamed and updated type
}

export interface ExtractedString {
  key: string | number; // Updated type to match generateKey return type
  value: string;
  filePath: string;
  line: number;
  column: number;
}

export interface UsedExistingKey {
  filePath: string;
  line: number;
  column: number;
  key: string | number;
  value: string;
}

/**
 * Represents the location (start/end line and column) of a code segment.
 */
export interface CodeLocation {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

/**
 * Details about a single replacement made in the code.
 * 关于在代码中所做的单个替换的详细信息。
 */
export interface ChangeDetail {
  /** The absolute path to the file where the change occurred. 文件路径 */
  filePath: string;
  /** The generated code string of the original node that was replaced. 原始节点的代码字符串 */
  original: string;
  /** The generated code string of the node that replaced the original one. 替换节点的代码字符串 */
  replacement: string;
  /** The starting line number of the original node. 原始节点的起始行号 */
  line: number;
  /** The starting column number of the original node. 原始节点的起始列号 */
  column: number;
  /** The ending line number of the original node. 原始节点的结束行号 */
  endLine: number;
  /** The ending column number of the original node. 原始节点的结束列号 */
  endColumn: number;
}

/**
 * Represents a record of a file that was modified, including details of the changes.
 * 表示已修改文件的记录，包括更改的详细信息。
 */
export interface FileModificationRecord {
  /** The absolute path to the modified file. 修改文件的绝对路径 */
  filePath: string;
  /** An array detailing each replacement made in the file. 文件中每次替换的详细信息数组 */
  changes: ChangeDetail[];
  /** The full content of the file after all transformations. 所有转换后文件的完整内容 */
  newContent: string;
}


