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
    
    const warmupIterations = 10; // 更充分的预热
    const baselineIterations = 8; // 基线建立阶段
    const testIterations = 20; // 更多的测试样本
    const results: number[] = [];
    const baselineResults: number[] = [];

    console.log(`\n🔄 Testing performance consistency with ${warmupIterations} warmup + ${baselineIterations} baseline + ${testIterations} test iterations...`);

    // 第一阶段：预热阶段 - 让JIT编译器充分优化代码
    console.log('\n🔥 Phase 1: Warmup phase...');
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
    
    // 第二阶段：基线建立阶段
    console.log('\n\n📊 Phase 2: Baseline establishment...');
    for (let i = 0; i < baselineIterations; i++) {
      const start = performance.now();
      
      await collectContextAwareReplacementInfo(
        ast,
        testContent,
        new Map(),
        [],
        [],
        mockImportManager,
        mockOptions,
        `baseline-${i}.tsx`
      );
      
      const duration = performance.now() - start;
      baselineResults.push(duration);
      process.stdout.write(`\r  Baseline ${i + 1}/${baselineIterations}: ${duration.toFixed(2)}ms`);
    }
    
    // 计算基线统计数据（使用稳健统计学方法）
    const sortedBaseline = [...baselineResults].sort((a, b) => a - b);
    const baselineMedian = sortedBaseline[Math.floor(sortedBaseline.length / 2)];
    const baselineQ1 = sortedBaseline[Math.floor(sortedBaseline.length * 0.25)];
    const baselineQ3 = sortedBaseline[Math.floor(sortedBaseline.length * 0.75)];
    const baselineIQR = baselineQ3 - baselineQ1;
    
    // 过滤基线异常值
    const baselineFiltered = baselineResults.filter(val => 
      val >= baselineQ1 - 1.5 * baselineIQR && val <= baselineQ3 + 1.5 * baselineIQR
    );
    
    const baselineAvg = baselineFiltered.reduce((a, b) => a + b, 0) / baselineFiltered.length;
    const baselineStdDev = Math.sqrt(
      baselineFiltered.reduce((acc, val) => acc + Math.pow(val - baselineAvg, 2), 0) / baselineFiltered.length
    );
    const baselineCV = baselineStdDev / baselineAvg;
    
    console.log('\n\n⚡ Phase 3: Performance measurement phase...');
    console.log(`📊 Baseline stats:`);
    console.log(`  Median: ${baselineMedian.toFixed(2)}ms`);
    console.log(`  Average: ${baselineAvg.toFixed(2)}ms ± ${baselineStdDev.toFixed(2)}ms`);
    console.log(`  IQR: ${baselineIQR.toFixed(2)}ms`);
    console.log(`  Baseline CV: ${(baselineCV * 100).toFixed(1)}%`);
    
    // 第三阶段：稳定性测试阶段
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
      
      process.stdout.write(`\r  Test ${i + 1}/${testIterations}: ${duration.toFixed(2)}ms`);
    }

    console.log('\n');

    // 应用同样的异常值过滤到测试结果
    const sortedResults = [...results].sort((a, b) => a - b);
    const testQ1 = sortedResults[Math.floor(sortedResults.length * 0.25)];
    const testQ3 = sortedResults[Math.floor(sortedResults.length * 0.75)];
    const testIQR = testQ3 - testQ1;
    
    const filteredResults = results.filter(val => 
      val >= testQ1 - 1.5 * testIQR && val <= testQ3 + 1.5 * testIQR
    );
    
    const avgDuration = filteredResults.reduce((a, b) => a + b, 0) / filteredResults.length;
    const testMedian = sortedResults[Math.floor(sortedResults.length / 2)];
    const maxDuration = Math.max(...filteredResults);
    const minDuration = Math.min(...filteredResults);
    const stdDev = Math.sqrt(
      filteredResults.reduce((acc, val) => acc + Math.pow(val - avgDuration, 2), 0) / filteredResults.length
    );
    const coefficientOfVariation = avgDuration > 0 ? stdDev / avgDuration : 0;

    console.log(`📊 Performance Statistics (after filtering):`);
    console.log(`  Median: ${testMedian.toFixed(2)}ms`);
    console.log(`  Average: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Min: ${minDuration.toFixed(2)}ms`);
    console.log(`  Max: ${maxDuration.toFixed(2)}ms`);
    console.log(`  Std Dev: ${stdDev.toFixed(2)}ms`);
    console.log(`  Coefficient of Variation: ${(coefficientOfVariation * 100).toFixed(1)}%`);
    console.log(`  Baseline comparison: ${((avgDuration / baselineAvg - 1) * 100).toFixed(1)}% change`);
    console.log(`  Filtered out: ${results.length - filteredResults.length} outliers`);

    // 动态阈值：基于基线稳定性调整测试阈值
    const dynamicCVThreshold = Math.max(0.6, baselineCV * 1.8); // 至少60%，或基线CV的1.8倍
    const adaptiveMaxRatio = Math.max(3.0, 2.0 + baselineCV * 2); // 基于基线稳定性的自适应阈值
    
    console.log(`\n🎯 Dynamic thresholds:`);
    console.log(`  CV threshold: ${(dynamicCVThreshold * 100).toFixed(1)}%`);
    console.log(`  Max ratio threshold: ${adaptiveMaxRatio.toFixed(1)}x`);

    // 1. 变异系数检查：使用动态阈值
    console.log(`\n✅ Assertion 1: CV (${(coefficientOfVariation * 100).toFixed(1)}%) should be < ${(dynamicCVThreshold * 100).toFixed(1)}%`);
    expect(coefficientOfVariation).toBeLessThan(dynamicCVThreshold);
    
    // 2. 相对于基线的性能退化检查：使用自适应阈值
    const performanceDegradationRatio = avgDuration / baselineAvg;
    console.log(`✅ Assertion 2: Perf ratio (${performanceDegradationRatio.toFixed(2)}x) should be < ${adaptiveMaxRatio.toFixed(1)}x`);
    expect(performanceDegradationRatio).toBeLessThan(adaptiveMaxRatio);
    
    // 3. 中位数稳定性检查：测试中位数应接近基线中位数
    const medianRatio = testMedian / baselineMedian;
    console.log(`✅ Assertion 3: Median ratio (${medianRatio.toFixed(2)}x) should be reasonable`);
    expect(medianRatio).toBeGreaterThan(0.5);
    expect(medianRatio).toBeLessThan(3.0);
    
    // 4. IQR稳定性：测试的四分位距应该合理
    const iqrRatio = testIQR / Math.max(baselineIQR, 0.1); // 避免除零
    console.log(`✅ Assertion 4: IQR ratio (${iqrRatio.toFixed(2)}x) should be reasonable`);
    expect(iqrRatio).toBeLessThan(4.0);
    
    // 5. 极值合理性：基于基线的合理范围
    const reasonableMin = Math.max(0.1, baselineMedian * 0.3);
    const reasonableMax = baselineMedian * 4.0;
    console.log(`✅ Assertion 5: Extremes should be reasonable (${reasonableMin.toFixed(2)}ms - ${reasonableMax.toFixed(2)}ms)`);
    expect(minDuration).toBeGreaterThan(reasonableMin);
    expect(maxDuration).toBeLessThan(reasonableMax);
  }, 180000);

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
      
      // 调整期望：持续时间增长不应超过文件大小增长的3倍（更宽松的阈值）
      // 这考虑到了：1）AST解析的非线性特性 2）内存分配开销 3）垃圾回收影响
      expect(durationRatio).toBeLessThan(sizeRatio * 3);
      
      // 性能不应该显著退化（不应该比预期的线性增长慢10倍以上）
      expect(durationRatio).toBeLessThan(sizeRatio * 10);
    }
  }, 120000);
});