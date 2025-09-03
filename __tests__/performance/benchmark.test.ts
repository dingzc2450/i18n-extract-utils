/**
 * 性能基准测试
 * 测试 collectContextAwareReplacementInfo 函数的性能表现
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { parse } from '@babel/parser';
import type { File } from '@babel/types';
import { collectContextAwareReplacementInfo } from '../../src/context-aware-ast-replacer';
import { SmartImportManager } from '../../src/smart-import-manager';
import type { NormalizedTransformOptions } from '../../src/core/config-normalizer';
import { PerformanceTestUtils, type PerformanceBaseline } from './performance-utils';

// 性能基准线定义
const PERFORMANCE_BASELINES: PerformanceBaseline[] = [
  {
    functionName: 'collectContextAwareReplacementInfo',
    fileSize: '1KB',
    maxDuration: 50, // 50ms
    maxMemoryIncrease: 2 * 1024 * 1024, // 2MB
    minThroughput: 20 // 20 ops/sec
  },
  {
    functionName: 'collectContextAwareReplacementInfo',
    fileSize: '10KB',
    maxDuration: 200, // 200ms
    maxMemoryIncrease: 10 * 1024 * 1024, // 10MB
    minThroughput: 5 // 5 ops/sec
  },
  {
    functionName: 'collectContextAwareReplacementInfo',
    fileSize: '100KB',
    maxDuration: 1000, // 1000ms
    maxMemoryIncrease: 50 * 1024 * 1024, // 50MB
    minThroughput: 1 // 1 ops/sec
  }
];

describe('Performance Benchmark Tests', () => {
  let mockImportManager: SmartImportManager;
  let mockOptions: NormalizedTransformOptions;

  beforeAll(() => {
    // 创建模拟的 SmartImportManager
    mockImportManager = {
      getImportInfo: () => ({
        callName: 't',
        importPath: 'react-i18next',
        hookName: 'useTranslation'
      }),
      stringifyImport: () => 'import { useTranslation } from "react-i18next";'
    } as any;

    // 创建模拟的配置选项
    mockOptions = {
      pattern: '___(.+?)___',
      keyPrefix: 'key',
      keyGenerator: 'hash',
      extractComments: false,
      appendExtractedComment: false,
      extractedCommentType: 'block',
      targetFramework: 'react',
      importStyle: 'named'
    } as any;
  });

  const parseCode = (code: string): File => {
    return parse(code, {
      sourceType: 'module',
      plugins: [
        'jsx',
        'typescript',
        'decorators-legacy',
        'classProperties',
        'objectRestSpread',
        'asyncGenerators',
        'functionBind',
        'exportDefaultFrom',
        'exportNamespaceFrom',
        'dynamicImport'
      ]
    });
  };

  const runPerformanceTest = async (baseline: PerformanceBaseline) => {
    const testContent = PerformanceTestUtils.generateTestContent(baseline.fileSize);
    const ast = parseCode(testContent);
    
    const testFunction = async () => {
      return collectContextAwareReplacementInfo(
        ast,
        testContent,
        new Map(),
        [],
        [],
        mockImportManager,
        mockOptions,
        'test.tsx'
      );
    };

    const result = await PerformanceTestUtils.runBenchmark(
      baseline.functionName,
      testFunction,
      baseline,
      3 // warmup runs
    );

    return result;
  };

  // 为每个基准线创建测试用例
  PERFORMANCE_BASELINES.forEach(baseline => {
    it(`should meet performance baseline for ${baseline.fileSize} file`, async () => {
      console.log(`\n🚀 Running benchmark: ${baseline.functionName} with ${baseline.fileSize} file`);
      
      const result = await runPerformanceTest(baseline);
      
      console.log(PerformanceTestUtils.formatBenchmarkResult(result));

      // 断言性能要求
      expect(result.duration).toBeLessThanOrEqual(baseline.maxDuration);
      expect(result.memoryIncrease).toBeLessThanOrEqual(baseline.maxMemoryIncrease);
      expect(result.throughput).toBeGreaterThanOrEqual(baseline.minThroughput);
      expect(result.passed).toBe(true);
    }, 30000); // 30秒超时
  });

  it('should handle Vue components efficiently', async () => {
    const vueContent = PerformanceTestUtils.generateVueTestContent('10KB');
    
    // Vue 需要不同的解析配置，只取 script 部分
    const scriptMatch = vueContent.match(/<script>([\s\S]*?)<\/script>/);
    const jsContent = scriptMatch ? scriptMatch[1] : 'export default {};';
    
    const ast = parse(jsContent, {
      sourceType: 'module',
      plugins: ['objectRestSpread', 'asyncGenerators']
    });

    const testFunction = async () => {
      return collectContextAwareReplacementInfo(
        ast,
        jsContent,
        new Map(),
        [],
        [],
        mockImportManager,
        { ...mockOptions, targetFramework: 'vue' } as any,
        'test.vue'
      );
    };

    const baseline: PerformanceBaseline = {
      functionName: 'collectContextAwareReplacementInfo-Vue',
      fileSize: '10KB',
      maxDuration: 300,
      maxMemoryIncrease: 15 * 1024 * 1024,
      minThroughput: 3
    };

    const result = await PerformanceTestUtils.runBenchmark(
      'Vue Component Processing',
      testFunction,
      baseline
    );

    console.log('\n🔮 Vue Component Benchmark:');
    console.log(PerformanceTestUtils.formatBenchmarkResult(result));

    expect(result.passed).toBe(true);
  }, 30000);

  it('should maintain performance with repeated calls', async () => {
    const testContent = PerformanceTestUtils.generateTestContent('5KB');
    const ast = parseCode(testContent);
    
    const warmupIterations = 5; // 增加预热迭代次数
    const testIterations = 10;
    const results: number[] = [];

    console.log(`\n🔄 Testing performance consistency with ${warmupIterations} warmup + ${testIterations} test iterations...`);

    // 预热阶段 - 让JIT编译器充分优化代码
    console.log('\n🔥 Warmup phase...');
    for (let i = 0; i < warmupIterations; i++) {
      const start = performance.now();
      
      await collectContextAwareReplacementInfo(
        ast,
        testContent,
        new Map(),
        [],
        [],
        mockImportManager,
        mockOptions,
        `warmup-${i}.tsx`
      );
      
      const duration = performance.now() - start;
      process.stdout.write(`\r  Warmup ${i + 1}/${warmupIterations}: ${duration.toFixed(2)}ms`);
    }
    
    console.log('\n\n⚡ Performance measurement phase...');
    
    // 实际测试阶段
    for (let i = 0; i < testIterations; i++) {
      const start = performance.now();
      
      await collectContextAwareReplacementInfo(
        ast,
        testContent,
        new Map(),
        [],
        [],
        mockImportManager,
        mockOptions,
        `test-${i}.tsx`
      );
      
      const duration = performance.now() - start;
      results.push(duration);
      
      process.stdout.write(`\r  Iteration ${i + 1}/${testIterations}: ${duration.toFixed(2)}ms`);
    }

    console.log('\n');

    const avgDuration = results.reduce((a, b) => a + b, 0) / results.length;
    const maxDuration = Math.max(...results);
    const minDuration = Math.min(...results);
    const variance = results.reduce((acc, val) => acc + Math.pow(val - avgDuration, 2), 0) / results.length;
    const stdDev = Math.sqrt(variance);

    console.log(`📊 Performance Statistics (after warmup):`);
    console.log(`  Average: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Min: ${minDuration.toFixed(2)}ms`);
    console.log(`  Max: ${maxDuration.toFixed(2)}ms`);
    console.log(`  Std Dev: ${stdDev.toFixed(2)}ms`);
    console.log(`  Variance: ${(stdDev / avgDuration * 100).toFixed(1)}%`);

    // 性能一致性检查：经过预热后，标准差不应超过平均值的40%
    const variancePercent = stdDev / avgDuration;
    expect(variancePercent).toBeLessThan(0.4);
    
    // 没有性能退化：最大时间不应超过平均值的180%
    expect(maxDuration).toBeLessThan(avgDuration * 1.8);
    
    // 性能稳定性：最小值不应过小（避免异常快速执行）
    expect(minDuration).toBeGreaterThan(avgDuration * 0.3);
  }, 90000);

  it('should scale linearly with file size', async () => {
    const fileSizes = ['1KB', '5KB', '10KB', '20KB'];
    const results: Array<{ size: string; duration: number; throughput: number }> = [];

    console.log('\n📏 Testing performance scaling with file size...');

    for (const size of fileSizes) {
      const testContent = PerformanceTestUtils.generateTestContent(size);
      const ast = parseCode(testContent);
      
      const start = performance.now();
      const result = await collectContextAwareReplacementInfo(
        ast,
        testContent,
        new Map(),
        [],
        [],
        mockImportManager,
        mockOptions,
        `test-${size}.tsx`
      );
      const duration = performance.now() - start;
      
      const throughput = result.changes.length / duration * 1000; // changes per second
      
      results.push({ size, duration, throughput });
      
      console.log(`  ${size}: ${duration.toFixed(2)}ms (${result.changes.length} changes, ${throughput.toFixed(1)} changes/sec)`);
    }

    // 检查性能是否大致线性增长（允许一定的变化）
    for (let i = 1; i < results.length; i++) {
      const prevSize = parseInt(results[i-1].size);
      const currSize = parseInt(results[i].size);
      const prevDuration = results[i-1].duration;
      const currDuration = results[i].duration;
      
      const sizeRatio = currSize / prevSize;
      const durationRatio = currDuration / prevDuration;
      
      // 持续时间增长应该不超过文件大小增长的2倍（允许一些开销）
      expect(durationRatio).toBeLessThan(sizeRatio * 2);
    }
  }, 120000);
});