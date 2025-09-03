/**
 * 性能监控器 - 监控函数执行时间、内存使用和缓存命中率
 */

export interface MemoryInfo {
  heapUsed: number;
  heapTotal: number;
  external: number;
  rss: number;
}

export interface TimingInfo {
  label: string;
  duration: number;
  timestamp: number;
  startTime: number;
  endTime: number;
}

export interface CacheStats {
  hits: number;
  misses: number;
  hitRate: number;
}

export interface PerformanceReport {
  totalDuration: number;
  stages: TimingInfo[];
  memoryUsage: {
    initial: MemoryInfo;
    final: MemoryInfo;
    peak: MemoryInfo;
    difference: Partial<MemoryInfo>;
  };
  cacheStats: Map<string, CacheStats>;
  processedItems: number;
  throughput: number; // items per second
}

/**
 * 高性能监控器，用于追踪代码优化效果
 */
export class PerformanceMonitor {
  private timings = new Map<string, number>();
  private stages: TimingInfo[] = [];
  private cacheStats = new Map<string, { hits: number; misses: number }>();
  private initialMemory: MemoryInfo;
  private peakMemory: MemoryInfo;
  private processedItems = 0;
  private startTimestamp: number;

  constructor() {
    this.initialMemory = this.getMemoryUsage();
    this.peakMemory = { ...this.initialMemory };
    this.startTimestamp = Date.now();
  }

  /**
   * 开始计时
   */
  startTiming(label: string): void {
    this.timings.set(label, performance.now());
  }

  /**
   * 结束计时并返回耗时
   */
  endTiming(label: string): number {
    const startTime = this.timings.get(label);
    if (startTime === undefined) {
      throw new Error(`No timing started for label: ${label}`);
    }

    const endTime = performance.now();
    const duration = endTime - startTime;

    this.stages.push({
      label,
      duration,
      timestamp: Date.now(),
      startTime,
      endTime,
    });

    this.timings.delete(label);

    // 更新峰值内存使用
    this.updatePeakMemory();

    return duration;
  }

  /**
   * 记录缓存命中
   */
  recordCacheHit(cacheType: string): void {
    const stats = this.cacheStats.get(cacheType) || { hits: 0, misses: 0 };
    stats.hits++;
    this.cacheStats.set(cacheType, stats);
  }

  /**
   * 记录缓存未命中
   */
  recordCacheMiss(cacheType: string): void {
    const stats = this.cacheStats.get(cacheType) || { hits: 0, misses: 0 };
    stats.misses++;
    this.cacheStats.set(cacheType, stats);
  }

  /**
   * 增加处理项数
   */
  incrementProcessedItems(count: number = 1): void {
    this.processedItems += count;
  }

  /**
   * 获取当前内存使用情况
   */
  getMemoryUsage(): MemoryInfo {
    const usage = process.memoryUsage();
    return {
      heapUsed: usage.heapUsed,
      heapTotal: usage.heapTotal,
      external: usage.external,
      rss: usage.rss,
    };
  }

  /**
   * 更新峰值内存使用
   */
  private updatePeakMemory(): void {
    const current = this.getMemoryUsage();
    if (current.heapUsed > this.peakMemory.heapUsed) {
      this.peakMemory = current;
    }
  }

  /**
   * 生成性能报告
   */
  generateReport(): PerformanceReport {
    const finalMemory = this.getMemoryUsage();
    const totalDuration = Date.now() - this.startTimestamp;

    // 计算内存差异
    const memoryDifference = {
      heapUsed: finalMemory.heapUsed - this.initialMemory.heapUsed,
      heapTotal: finalMemory.heapTotal - this.initialMemory.heapTotal,
      external: finalMemory.external - this.initialMemory.external,
      rss: finalMemory.rss - this.initialMemory.rss,
    };

    // 计算缓存统计
    const cacheStatsMap = new Map<string, CacheStats>();
    for (const [type, stats] of this.cacheStats) {
      const total = stats.hits + stats.misses;
      cacheStatsMap.set(type, {
        hits: stats.hits,
        misses: stats.misses,
        hitRate: total > 0 ? stats.hits / total : 0,
      });
    }

    // 计算吞吐量
    const throughput =
      totalDuration > 0 ? (this.processedItems * 1000) / totalDuration : 0;

    return {
      totalDuration,
      stages: [...this.stages],
      memoryUsage: {
        initial: this.initialMemory,
        final: finalMemory,
        peak: this.peakMemory,
        difference: memoryDifference,
      },
      cacheStats: cacheStatsMap,
      processedItems: this.processedItems,
      throughput,
    };
  }

  /**
   * 打印性能报告
   */
  printReport(): void {
    const report = this.generateReport();

    console.log("\n=== Performance Report ===");
    console.log(`Total Duration: ${report.totalDuration}ms`);
    console.log(`Processed Items: ${report.processedItems}`);
    console.log(`Throughput: ${report.throughput.toFixed(2)} items/sec`);

    console.log("\n--- Stage Timings ---");
    report.stages.forEach(stage => {
      console.log(`${stage.label}: ${stage.duration.toFixed(2)}ms`);
    });

    console.log("\n--- Memory Usage ---");
    console.log(
      `Initial Heap: ${this.formatBytes(report.memoryUsage.initial.heapUsed)}`
    );
    console.log(
      `Final Heap: ${this.formatBytes(report.memoryUsage.final.heapUsed)}`
    );
    console.log(
      `Peak Heap: ${this.formatBytes(report.memoryUsage.peak.heapUsed)}`
    );
    console.log(
      `Memory Difference: ${this.formatBytes(report.memoryUsage.difference.heapUsed || 0)}`
    );

    if (report.cacheStats.size > 0) {
      console.log("\n--- Cache Statistics ---");
      for (const [type, stats] of report.cacheStats) {
        console.log(
          `${type}: ${stats.hits} hits, ${stats.misses} misses, ${(stats.hitRate * 100).toFixed(1)}% hit rate`
        );
      }
    }

    console.log("========================\n");
  }

  /**
   * 格式化字节数
   */
  private formatBytes(bytes: number): string {
    if (bytes === 0) return "0 Bytes";

    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));

    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  }

  /**
   * 执行并监控函数
   */
  async monitor<T>(
    label: string,
    fn: () => T | Promise<T>,
    itemCount: number = 1
  ): Promise<T> {
    this.startTiming(label);

    try {
      const result = await fn();
      this.incrementProcessedItems(itemCount);
      return result;
    } finally {
      this.endTiming(label);
    }
  }

  /**
   * 重置所有统计数据
   */
  reset(): void {
    this.timings.clear();
    this.stages.length = 0;
    this.cacheStats.clear();
    this.processedItems = 0;
    this.initialMemory = this.getMemoryUsage();
    this.peakMemory = { ...this.initialMemory };
    this.startTimestamp = Date.now();
  }
}
