/**
 * Vue编译器特定错误类型
 */

export class VueCompilerError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = "VueCompilerError";
  }
}

export class CompilerLoadError extends VueCompilerError {
  constructor(version: string, details?: unknown) {
    super(
      `Failed to load Vue compiler ${version}`,
      "VUE_COMPILER_LOAD_ERROR",
      details
    );
    this.name = "CompilerLoadError";
  }
}

export class BatchError extends VueCompilerError {
  constructor(message: string) {
    super(message, "VUE_COMPILER_BATCH_ERROR");
    this.name = "BatchError";
  }
}

export class VersionMismatchError extends VueCompilerError {
  constructor(expected: string, got: string) {
    super(
      `Version mismatch: batch expects ${expected} but got ${got}`,
      "VUE_COMPILER_VERSION_MISMATCH"
    );
    this.name = "VersionMismatchError";
  }
}
