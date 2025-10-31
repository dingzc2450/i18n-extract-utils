/**
 * Vue编译器管理器
 * 负责Vue编译器的生命周期管理和资源共享
 */

import type { VueCompiler, CompilerVersion } from "./compiler-types";
import {
  BatchError,
  CompilerLoadError,
  VersionMismatchError,
} from "./compiler-errors";

interface CompilerInstance {
  compiler: VueCompiler;
  usageCount: number;
  lastUsed: number;
}

interface BatchContext {
  id: string;
  compilerVersion: CompilerVersion;
  startTime: number;
}

/**
 * Vue编译器管理器
 * 使用单例模式确保全局只有一个实例
 */
export class VueCompilerManager {
  private static instance: VueCompilerManager;
  private compilerInstances: Map<string, CompilerInstance> = new Map();
  private batchStack: BatchContext[] = [];
  private customPaths: string[] = [];

  private constructor() {
    // 私有构造函数，防止外部实例化
  }

  /**
   * 获取单例实例
   */
  public static getInstance(): VueCompilerManager {
    if (!VueCompilerManager.instance) {
      VueCompilerManager.instance = new VueCompilerManager();
    }
    return VueCompilerManager.instance;
  }

  /**
   * 设置自定义依赖路径
   */
  public setCustomPaths(paths: string[]): void {
    this.customPaths = paths;
  }

  /**
   * 开始新的批次处理
   * 支持批次的嵌套，新的批次会被推入批次栈中
   */
  public startBatch(
    batchId: string,
    compilerVersion: CompilerVersion = "vue3"
  ): void {
    // 如果栈不为空，检查版本兼容性
    if (this.batchStack.length > 0) {
      const currentBatch = this.batchStack[this.batchStack.length - 1];
      if (currentBatch.compilerVersion !== compilerVersion) {
        throw new Error("Nested batch must use the same compiler version");
      }
    }

    this.batchStack.push({
      id: batchId,
      compilerVersion,
      startTime: Date.now(),
    });
  }

  /**
   * 结束当前批次处理
   */
  public endBatch(): void {
    if (this.batchStack.length === 0) {
      return;
    }

    this.batchStack.pop();

    // 当所有批次都结束时，清理未使用的编译器实例
    if (this.batchStack.length === 0) {
      this.cleanup();
    }
  }

  /**
   * 检查编译器是否已加载
   */
  public hasLoadedCompiler(version: CompilerVersion = "vue3"): boolean {
    const instance = this.compilerInstances.get(version);
    return instance !== undefined;
  }

  /**
   * 获取已加载的编译器实例
   * 如果编译器未加载，将抛出错误
   */
  public getLoadedCompiler(version: CompilerVersion = "vue3"): VueCompiler {
    const instance = this.compilerInstances.get(version);
    if (!instance) {
      throw new CompilerLoadError(`Compiler ${version} is not loaded`);
    }
    instance.usageCount++;
    instance.lastUsed = Date.now();
    return instance.compiler;
  }

  /**
   * 获取编译器实例
   * 如果需要，会尝试加载编译器
   */
  public async getCompiler(
    version: CompilerVersion = "vue3"
  ): Promise<VueCompiler> {
    // 检查是否有活动的批次
    if (this.batchStack.length === 0) {
      throw new CompilerLoadError("No active batch");
    }

    const currentBatch = this.batchStack[this.batchStack.length - 1];

    // 确保版本匹配当前批次
    if (version !== currentBatch.compilerVersion) {
      throw new VersionMismatchError(currentBatch.compilerVersion, version);
    }

    // 检查缓存
    const cached = this.compilerInstances.get(version);
    if (cached) {
      cached.usageCount++;
      cached.lastUsed = Date.now();
      return cached.compiler;
    }

    // 尝试加载编译器
    try {
      const compiler = await this.loadCompiler(version);
      this.compilerInstances.set(version, {
        compiler,
        usageCount: 1,
        lastUsed: Date.now(),
      });
      return compiler;
    } catch (error: unknown) {
      if (error instanceof Error) {
        throw new CompilerLoadError(
          `Failed to load Vue compiler (${version}): ${error.message}`
        );
      }
      throw new CompilerLoadError(
        `Failed to load Vue compiler (${version}): Unknown error`
      );
    }
  }

  /**
   * 动态加载编译器
   */
  private async loadCompiler(version: CompilerVersion): Promise<VueCompiler> {
    const possiblePaths = [...this.customPaths, process.cwd(), __dirname];
    const errors: Error[] = [];

    for (const basePath of possiblePaths) {
      try {
        if (version === "vue3") {
          const compiler = await import(
            require.resolve("@vue/compiler-sfc", { paths: [basePath] })
          );
          return compiler;
        } else {
          throw new Error("Unsupported Vue version");
        }
      } catch (error) {
        if (error instanceof Error) {
          errors.push(error);
        } else {
          errors.push(new Error("Unknown error occurred"));
        }
        continue;
      }
    }

    throw new BatchError(
      `Failed to load Vue compiler from all paths: ${errors.map(e => e.message).join(", ")}`
    );
  }

  /**
   * 清理未使用的编译器实例
   */
  private cleanup(): void {
    const now = Date.now();
    const MAX_IDLE_TIME = 5 * 60 * 1000; // 5分钟

    for (const [version, instance] of this.compilerInstances.entries()) {
      if (now - instance.lastUsed > MAX_IDLE_TIME) {
        this.compilerInstances.delete(version);
      }
    }
  }

  /**
   * 获取编译器统计信息
   */
  public getStats(): {
    version: string;
    usageCount: number;
    lastUsed: number;
  }[] {
    return Array.from(this.compilerInstances.entries()).map(
      ([version, instance]) => ({
        version,
        usageCount: instance.usageCount,
        lastUsed: instance.lastUsed,
      })
    );
  }
}

/**
 * 导出单例实例的获取方法
 */
export const getVueCompilerManager = VueCompilerManager.getInstance;
