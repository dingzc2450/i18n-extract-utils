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
   * The path to the existing JSON file where translations are stored.
   * This is used to check for existing translations and avoid duplicates.
   * 
   * 现有JSON文件的路径，用于存储翻译。
   * 用于检查现有翻译并避免重复。
   */
  existingJsonPath?: string; // 新增：用户传递的已提取json路径

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