/**
 * 性能测试工具类
 * 提供性能基准测试和内存监控功能
 */

import { PerformanceMonitor } from '../../src/performance';

export interface PerformanceBaseline {
  functionName: string;
  fileSize: string;
  maxDuration: number; // milliseconds
  maxMemoryIncrease: number; // bytes
  minThroughput: number; // items per second
}

export interface BenchmarkResult {
  duration: number;
  memoryIncrease: number;
  throughput: number;
  passed: boolean;
  baseline: PerformanceBaseline;
}

/**
 * 性能测试工具类
 */
export class PerformanceTestUtils {
  /**
   * 生成指定大小的测试内容
   */
  static generateTestContent(targetSize: string): string {
    const sizeInBytes = this.parseSize(targetSize);
    const basePattern = `
const TestComponent{INDEX} = () => {
  const message{INDEX} = "___Hello World {INDEX}___";
  const greeting{INDEX} = \`___Welcome to our site {INDEX}___ \${userName}\`;
  
  return (
    <div>
      <h1>___Page Title {INDEX}___</h1>
      <p>___Description text {INDEX}___</p>
      <button onClick={() => alert("___Click message {INDEX}___")}>
        ___Button Text {INDEX}___
      </button>
    </div>
  );
};

export default TestComponent{INDEX};
`;

    // 为第一个组件添加 React 导入
    let result = 'import React from "react";\n';
    
    // 计算需要重复多少次来接近目标大小
    const basePatternLength = basePattern.length;
    const availableSpace = sizeInBytes - result.length;
    const repeatCount = Math.max(1, Math.floor(availableSpace / basePatternLength));
    
    for (let i = 0; i < repeatCount; i++) {
      // 为每个重复添加唯一标识，避免重复模式和冲突
      const uniqueContent = basePattern
        .replace(/{INDEX}/g, i.toString());
      
      result += uniqueContent;
    }

    // 如果结果还没有达到目标大小，添加一些简单的注释来填充
    while (result.length < sizeInBytes) {
      const remaining = sizeInBytes - result.length;
      if (remaining < 50) {
        // 如果剩余空间很小，添加简单注释
        result += '\n// padding';
      } else {
        // 添加更长的注释
        result += '\n// This is padding content to reach target file size';
      }
    }

    // 确保生成的代码以完整的行结束，避免JSX截断问题
    const lines = result.split('\n');
    let validResult = '';
    for (const line of lines) {
      if (validResult.length + line.length + 1 <= sizeInBytes) {
        validResult += (validResult ? '\n' : '') + line;
      } else {
        break;
      }
    }

    return validResult || result.substring(0, Math.max(0, sizeInBytes - 10)) + '\n// end';
  }

  /**
   * 解析文件大小字符串
   */
  private static parseSize(sizeStr: string): number {
    const match = sizeStr.match(/^(\d+(?:\.\d+)?)(KB|MB|B)?$/i);
    if (!match) {
      throw new Error(`Invalid size format: ${sizeStr}`);
    }

    const value = parseFloat(match[1]);
    const unit = (match[2] || 'B').toLowerCase();

    switch (unit) {
      case 'b':
        return Math.floor(value);
      case 'kb':
        return Math.floor(value * 1024);
      case 'mb':
        return Math.floor(value * 1024 * 1024);
      default:
        throw new Error(`Unknown size unit: ${unit}`);
    }
  }

  /**
   * 生成Vue测试内容
   */
  static generateVueTestContent(targetSize: string): string {
    const sizeInBytes = this.parseSize(targetSize);
    const basePattern = `
<template>
  <div class="test-component{INDEX}">
    <h1>___Page Title {INDEX}___</h1>
    <p>___Description text {INDEX}___</p>
    <button @click="handleClick{INDEX}">___Button Text {INDEX}___</button>
    <input v-model="message{INDEX}" placeholder="___Input placeholder {INDEX}___" />
  </div>
</template>

<script>
export default {
  name: 'TestComponent{INDEX}',
  data() {
    return {
      message{INDEX}: '___Default message {INDEX}___',
      greeting{INDEX}: \`___Welcome {INDEX}___ \${this.userName}\`
    };
  },
  methods: {
    handleClick{INDEX}() {
      alert('___Click message {INDEX}___');
    }
  }
};
</script>
`;

    const basePatternLength = basePattern.length;
    const repeatCount = Math.max(1, Math.floor(sizeInBytes / basePatternLength));
    let result = '';
    
    for (let i = 0; i < repeatCount; i++) {
      const uniqueContent = basePattern.replace(/{INDEX}/g, i.toString());
      result += uniqueContent;
    }

    // 如果需要填充更多内容
    while (result.length < sizeInBytes) {
      const remaining = sizeInBytes - result.length;
      if (remaining < 50) {
        result += '\n<!-- padding -->';
      } else {
        result += '\n<!-- This is padding content to reach target file size -->';
      }
    }

    // 确保生成的代码以完整的行结束
    const lines = result.split('\n');
    let validResult = '';
    for (const line of lines) {
      if (validResult.length + line.length + 1 <= sizeInBytes) {
        validResult += (validResult ? '\n' : '') + line;
      } else {
        break;
      }
    }

    return validResult || result.substring(0, Math.max(0, sizeInBytes - 20)) + '\n<!-- end -->';
  }

  /**
   * 运行性能基准测试
   */
  static async runBenchmark<T>(
    name: string,
    fn: () => Promise<T> | T,
    baseline: PerformanceBaseline,
    warmupRuns: number = 5 // 增加默认预热次数
  ): Promise<BenchmarkResult> {
    // 增强的预热运行 - 确保JIT充分优化
    for (let i = 0; i < warmupRuns; i++) {
      await fn();
      
      // 在预热阶段也进行垃圾回收
      if (global.gc) {
        global.gc();
      }
      
      // 预热阶段的短暂等待
      if (i < warmupRuns - 1) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }

    // 等待更长时间确保预热完成和垃圾回收
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // 最终垃圾回收确保内存基线准确
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 50));
    }

    const monitor = new PerformanceMonitor();
    const initialMemory = process.memoryUsage().heapUsed;

    monitor.startTiming('benchmark');
    const result = await fn();
    const duration = monitor.endTiming('benchmark');

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;

    // 计算吞吐量（假设处理了一个项目）
    const throughput = duration > 0 ? 1000 / duration : 0;

    const passed = 
      duration <= baseline.maxDuration &&
      memoryIncrease <= baseline.maxMemoryIncrease &&
      throughput >= baseline.minThroughput;

    return {
      duration,
      memoryIncrease,
      throughput,
      passed,
      baseline
    };
  }

  /**
   * 格式化性能结果
   */
  static formatBenchmarkResult(result: BenchmarkResult): string {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    const { duration, memoryIncrease, throughput, baseline } = result;

    return `
${status} ${baseline.functionName} (${baseline.fileSize})
  Duration: ${duration.toFixed(2)}ms (limit: ${baseline.maxDuration}ms)
  Memory: ${this.formatBytes(memoryIncrease)} (limit: ${this.formatBytes(baseline.maxMemoryIncrease)})
  Throughput: ${throughput.toFixed(2)} ops/sec (min: ${baseline.minThroughput} ops/sec)
    `;
  }

  /**
   * 格式化字节数
   */
  static formatBytes(bytes: number): string {
    if (bytes === 0) return '0 B';
    
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(Math.abs(bytes)) / Math.log(k));
    
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  }

  /**
   * 运行内存泄漏检测
   */
  static async detectMemoryLeaks<T>(
    name: string,
    fn: () => Promise<T> | T,
    iterations: number = 50,
    memoryThreshold: number = 50 * 1024 * 1024 // 50MB
  ): Promise<{
    hasLeak: boolean;
    initialMemory: number;
    finalMemory: number;
    peakMemory: number;
    iterations: number;
  }> {
    const initialMemory = process.memoryUsage().heapUsed;
    let peakMemory = initialMemory;

    console.log(`\n🔍 Running memory leak detection for ${name}...`);
    console.log(`Initial memory: ${this.formatBytes(initialMemory)}`);

    for (let i = 0; i < iterations; i++) {
      await fn();
      
      // 定期强制垃圾回收
      if (i % 10 === 0 && global.gc) {
        global.gc();
        await new Promise(resolve => setImmediate(resolve));
      }

      const currentMemory = process.memoryUsage().heapUsed;
      if (currentMemory > peakMemory) {
        peakMemory = currentMemory;
      }

      // 显示进度
      if (i % 10 === 0) {
        const progress = ((i + 1) / iterations * 100).toFixed(1);
        const currentFormatted = this.formatBytes(currentMemory);
        process.stdout.write(`\r Progress: ${progress}% | Current memory: ${currentFormatted}`);
      }
    }

    // 最终垃圾回收
    if (global.gc) {
      global.gc();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    const finalMemory = process.memoryUsage().heapUsed;
    const memoryIncrease = finalMemory - initialMemory;
    const hasLeak = memoryIncrease > memoryThreshold;

    console.log(`\n Final memory: ${this.formatBytes(finalMemory)}`);
    console.log(`Peak memory: ${this.formatBytes(peakMemory)}`);
    console.log(`Memory increase: ${this.formatBytes(memoryIncrease)}`);
    console.log(`Leak detected: ${hasLeak ? 'YES ❌' : 'NO ✅'}`);

    return {
      hasLeak,
      initialMemory,
      finalMemory,
      peakMemory,
      iterations
    };
  }
}