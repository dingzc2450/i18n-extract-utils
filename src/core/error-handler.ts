/**
 * 错误处理模块
 * 提供统一的错误处理机制，包括错误类型、错误生成和格式化方法
 */

// 错误类别枚举
export enum ErrorCategory {
  CONFIG = "CONFIG", // 配置错误
  PARSING = "PARSING", // 解析错误
  TRANSFORMATION = "TRANSFORMATION", // 转换错误
  FILE_OPERATION = "FILE_OPERATION", // 文件操作错误
  PLUGIN = "PLUGIN", // 插件错误
  UNKNOWN = "UNKNOWN", // 未知错误
}

// 错误严重级别
export enum ErrorSeverity {
  WARNING = "WARNING", // 警告，不会中断处理
  ERROR = "ERROR", // 错误，可能中断当前文件处理
  FATAL = "FATAL", // 致命错误，中断整个处理流程
}

// 统一错误接口
export interface I18nError {
  code: string; // 错误代码，例如 CONFIG001
  category: ErrorCategory; // 错误类别
  message: string; // 错误信息
  details?: string; // 详细信息
  filePath?: string; // 相关文件路径
  line?: number; // 行号
  column?: number; // 列号
  severity: ErrorSeverity; // 严重级别
  suggestion?: string; // 修复建议
  originalError?: Error; // 原始错误
}

// 预定义错误代码和对应信息
interface ErrorDefinition {
  code: string;
  category: ErrorCategory;
  messageTemplate: string;
  severity: ErrorSeverity;
  suggestionTemplate?: string;
}

// 错误定义集
const errorDefinitions: Record<string, ErrorDefinition> = {
  // 配置错误
  CONFIG001: {
    code: "CONFIG001",
    category: ErrorCategory.CONFIG,
    messageTemplate: "配置无效: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate: "请检查配置格式是否正确，特别是 {0} 字段",
  },
  CONFIG002: {
    code: "CONFIG002",
    category: ErrorCategory.CONFIG,
    messageTemplate: "找不到指定的配置文件: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate: "请确认配置文件路径是否正确或创建默认配置文件",
  },
  CONFIG003: {
    code: "CONFIG003",
    category: ErrorCategory.CONFIG,
    messageTemplate: "多语言配置错误: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请检查 i18nConfig 配置，确保 framework 和 i18nImport 设置正确",
  },

  // 解析错误
  PARSING001: {
    code: "PARSING001",
    category: ErrorCategory.PARSING,
    messageTemplate: "解析文件失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请检查文件语法是否正确，特别是第 {1} 行附近。可能是语法错误或不支持的语法特性导致",
  },
  PARSING002: {
    code: "PARSING002",
    category: ErrorCategory.PARSING,
    messageTemplate: "不支持的文件类型: {0}",
    severity: ErrorSeverity.WARNING,
    suggestionTemplate:
      "目前支持的文件类型有: .js, .jsx, .ts, .tsx, .vue。如需支持其他类型，请在配置中明确指定框架类型",
  },
  PARSING003: {
    code: "PARSING003",
    category: ErrorCategory.PARSING,
    messageTemplate: "AST解析失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "文件可能包含复杂或实验性语法，尝试使用 preserveFormatting: true 选项或简化代码结构",
  },

  // 转换错误
  TRANSFORM001: {
    code: "TRANSFORM001",
    category: ErrorCategory.TRANSFORMATION,
    messageTemplate: "代码转换失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "转换过程中出现错误，可能是由于复杂的代码结构导致，请简化相关代码或检查语法",
  },
  TRANSFORM002: {
    code: "TRANSFORM002",
    category: ErrorCategory.TRANSFORMATION,
    messageTemplate: "无法找到匹配的字符串: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请确认要替换的字符串存在且格式正确，如果是动态生成的字符串可能需要手动处理",
  },
  TRANSFORM003: {
    code: "TRANSFORM003",
    category: ErrorCategory.TRANSFORMATION,
    messageTemplate: "字符串替换位置无效: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "字符串替换位置计算错误，请尝试使用 contextAware: false 选项或使用 AST 转换模式",
  },
  TRANSFORM004: {
    code: "TRANSFORM004",
    category: ErrorCategory.TRANSFORMATION,
    messageTemplate: "提取模式不匹配: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请检查提取模式(pattern)配置是否正确，或者代码中的标记格式是否符合期望",
  },

  // 文件操作错误
  FILE001: {
    code: "FILE001",
    category: ErrorCategory.FILE_OPERATION,
    messageTemplate: "读取文件失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate: "请确认文件存在且有读取权限，检查文件路径是否正确",
  },
  FILE002: {
    code: "FILE002",
    category: ErrorCategory.FILE_OPERATION,
    messageTemplate: "写入文件失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate: "请确认目标目录存在且有写入权限，检查磁盘空间是否足够",
  },
  FILE003: {
    code: "FILE003",
    category: ErrorCategory.FILE_OPERATION,
    messageTemplate: "文件路径无效: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请提供有效的文件路径，确保路径格式正确且不包含非法字符",
  },

  // 插件错误
  PLUGIN001: {
    code: "PLUGIN001",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "插件执行错误: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "插件 {1} 在处理过程中出错，请检查插件配置或相关代码结构是否符合插件要求",
  },
  PLUGIN002: {
    code: "PLUGIN002",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "未找到适用的插件处理文件: {0}",
    severity: ErrorSeverity.WARNING,
    suggestionTemplate:
      "请在配置中明确指定框架类型(framework)，或确保文件内容符合自动检测标准",
  },
  PLUGIN003: {
    code: "PLUGIN003",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "插件兼容性问题: {0}",
    severity: ErrorSeverity.WARNING,
    suggestionTemplate:
      "当前插件可能不完全支持所使用的框架版本，请尝试更新插件或调整配置",
  },

  // Vue 特定错误
  VUE001: {
    code: "VUE001",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "Vue 组件解析失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请确认 Vue 组件格式正确，包含有效的 template/script/style 块，检查是否有语法错误",
  },
  VUE002: {
    code: "VUE002",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "Vue script 处理失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请检查 Vue 组件中的 script 部分语法是否正确，特别是 setup 语法的使用",
  },
  VUE003: {
    code: "VUE003",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "Vue template 解析失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请检查模板语法是否正确，确保模板表达式格式有效且闭合正确",
  },
  VUE004: {
    code: "VUE004",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "Vue setup 语法处理失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "script setup 语法需要正确配置，请确认Vue版本兼容性并检查语法正确性",
  },

  // React 特定错误
  REACT001: {
    code: "REACT001",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "React 组件处理失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请检查 React 组件语法是否正确，特别是 JSX 部分和组件结构",
  },
  REACT002: {
    code: "REACT002",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "React 钩子使用错误: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "检查钩子使用是否符合规则，例如是否在组件顶层调用，是否有条件执行钩子等",
  },
  REACT003: {
    code: "REACT003",
    category: ErrorCategory.PLUGIN,
    messageTemplate: "JSX 解析失败: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate: "检查 JSX 语法是否正确，确保标签正确闭合且属性格式有效",
  },

  // 通用错误
  GENERAL001: {
    code: "GENERAL001",
    category: ErrorCategory.UNKNOWN,
    messageTemplate: "未知错误: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate:
      "请尝试简化代码或检查语法错误，如果问题持续存在，请提交问题报告",
  },
  GENERAL002: {
    code: "GENERAL002",
    category: ErrorCategory.UNKNOWN,
    messageTemplate: "执行超时: {0}",
    severity: ErrorSeverity.WARNING,
    suggestionTemplate:
      "处理过程耗时过长，可能是由于文件过大或代码过于复杂，尝试分解文件或优化代码结构",
  },
  GENERAL003: {
    code: "GENERAL003",
    category: ErrorCategory.UNKNOWN,
    messageTemplate: "不支持的操作: {0}",
    severity: ErrorSeverity.ERROR,
    suggestionTemplate: "当前操作不受支持，请查阅文档了解支持的特性和使用方法",
  },
};

/**
 * 创建格式化的错误对象
 */
export function createI18nError(
  errorCode: string,
  params: string[] = [],
  options: {
    filePath?: string;
    line?: number;
    column?: number;
    originalError?: Error;
  } = {}
): I18nError {
  const definition = errorDefinitions[errorCode] || errorDefinitions.GENERAL001;

  // 替换消息模板中的参数
  let message = definition.messageTemplate;
  let suggestion = definition.suggestionTemplate || "";

  params.forEach((param, index) => {
    message = message.replace(`{${index}}`, String(param));
    suggestion = suggestion.replace(`{${index}}`, String(param));
  });

  // 从原始错误中提取位置信息（如果有）
  let line = options.line;
  let column = options.column;

  if (options.originalError && !line && !column) {
    // 尝试从不同格式的错误消息中提取位置信息
    const babelMatch = options.originalError.message.match(/\((\d+):(\d+)\)/);
    const lineMatch = options.originalError.message.match(/line\s+(\d+)/i);
    const colMatch = options.originalError.message.match(/column\s+(\d+)/i);

    if (babelMatch) {
      line = parseInt(babelMatch[1], 10);
      column = parseInt(babelMatch[2], 10);
    } else if (lineMatch) {
      line = parseInt(lineMatch[1], 10);
      if (colMatch) {
        column = parseInt(colMatch[1], 10);
      }
    }
  }

  // 从原始错误中提取更详细的信息
  const details = options.originalError
    ? options.originalError.message
    : undefined;

  return {
    code: definition.code,
    category: definition.category,
    message,
    details,
    filePath: options.filePath,
    line,
    column,
    severity: definition.severity,
    suggestion,
    originalError: options.originalError,
  };
}

/**
 * 格式化错误为用户友好的消息
 */
export function formatError(error: I18nError): string {
  let formattedMessage = `[${error.code}] ${error.message}`;

  if (error.filePath) {
    formattedMessage += `\n文件: ${error.filePath}`;
    if (error.line) {
      formattedMessage += `:${error.line}`;
      if (error.column) {
        formattedMessage += `:${error.column}`;
      }
    }
  }

  if (error.details && error.details !== error.message) {
    formattedMessage += `\n详情: ${error.details}`;
  }

  if (error.suggestion) {
    formattedMessage += `\n建议: ${error.suggestion}`;
  }

  return formattedMessage;
}

/**
 * 记录错误
 */
export function logError(error: I18nError): void {
  const formattedError = formatError(error);

  if (error.severity === ErrorSeverity.WARNING) {
    console.warn(formattedError);
  } else {
    console.error(formattedError);
  }
}

/**
 * 提供给最终用户的错误格式化方法
 * 返回简化的、更友好的错误消息
 */
export function formatErrorForUser(error: I18nError): string {
  let message = `错误(${error.code}): ${error.message}`;

  if (error.filePath) {
    message += `\n文件位置: ${error.filePath}`;
    if (error.line) {
      message += ` 第 ${error.line} 行`;
      if (error.column) {
        message += ` 第 ${error.column} 列`;
      }
    }
  }

  if (error.suggestion) {
    message += `\n\n修复建议:\n${error.suggestion}`;
  }

  // 添加文档链接
  message +=
    "\n\n更多信息请参考错误代码文档: https://github.com/your-org/i18n-extract-utils/wiki/error-codes";

  return message;
}

/**
 * 检测并处理特定类型的错误，返回更具体的错误代码和建议
 */
export function enhanceError(error: Error, filePath?: string): I18nError {
  const errorMessage = error.message;
  let errorCode = "GENERAL001";
  let params = [errorMessage];

  // 解析错误
  if (
    errorMessage.includes("Unexpected token") ||
    errorMessage.includes("BABEL_PARSER_SYNTAX_ERROR")
  ) {
    errorCode = "PARSING001";
    params = [errorMessage];

    // 提取行列信息
    const lineMatch = errorMessage.match(/\((\d+):(\d+)\)/);
    if (lineMatch) {
      params.push(lineMatch[1]); // 行号作为第二个参数
    }
  }
  // 文件错误
  else if (
    errorMessage.includes("ENOENT") ||
    errorMessage.includes("no such file")
  ) {
    errorCode = "FILE001";
    params = [filePath || errorMessage];
  }
  // 插件错误
  else if (errorMessage.includes("No plugin found")) {
    errorCode = "PLUGIN002";
    params = [filePath || ""];
  }
  // Vue 特定错误
  else if (errorMessage.includes("Vue") || errorMessage.includes(".vue")) {
    if (errorMessage.includes("template")) {
      errorCode = "VUE003";
    } else if (errorMessage.includes("script setup")) {
      errorCode = "VUE004";
    } else if (errorMessage.includes("script")) {
      errorCode = "VUE002";
    } else {
      errorCode = "VUE001";
    }
    params = [errorMessage];
  }
  // React 特定错误
  else if (errorMessage.includes("React") || errorMessage.includes("JSX")) {
    if (errorMessage.includes("Hook")) {
      errorCode = "REACT002";
    } else if (errorMessage.includes("JSX")) {
      errorCode = "REACT003";
    } else {
      errorCode = "REACT001";
    }
    params = [errorMessage];
  }

  return createI18nError(errorCode, params, {
    filePath,
    originalError: error,
  });
}
