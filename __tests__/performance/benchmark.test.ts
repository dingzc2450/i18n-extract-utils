/**
 * 性能基准测试
 * 测试 collectContextAwareReplacementInfo 函数的性能表现
 */

import { describe, it, expect, beforeAll } from "vitest";
import { parse } from "@babel/parser";
import type { File } from "@babel/types";
import { collectContextAwareReplacementInfo } from "../../src/context-aware-ast-replacer";
import type { SmartImportManager } from "../../src/smart-import-manager";
import type { NormalizedTransformOptions } from "../../src/core/config-normalizer";
import {
  PerformanceTestUtils,
  type PerformanceBaseline,
} from "./performance-utils";

// 性能基准线定义
const PERFORMANCE_BASELINES: PerformanceBaseline[] = [
  {
    functionName: "collectContextAwareReplacementInfo",
    fileSize: "1KB",
    maxDuration: 50, // 50ms
    maxMemoryIncrease: 2 * 1024 * 1024, // 2MB
    minThroughput: 20, // 20 ops/sec
  },
  {
    functionName: "collectContextAwareReplacementInfo",
    fileSize: "10KB",
    maxDuration: 200, // 200ms
    maxMemoryIncrease: 10 * 1024 * 1024, // 10MB
    minThroughput: 5, // 5 ops/sec
  },
  {
    functionName: "collectContextAwareReplacementInfo",
    fileSize: "100KB",
    maxDuration: 1000, // 1000ms
    maxMemoryIncrease: 50 * 1024 * 1024, // 50MB
    minThroughput: 1, // 1 ops/sec
  },
];

describe("Performance Benchmark Tests", () => {
  let mockImportManager: SmartImportManager;
  let mockOptions: NormalizedTransformOptions;

  beforeAll(() => {
    // 创建模拟的 SmartImportManager
    mockImportManager = {
      getImportInfo: () => ({
        callName: "t",
        importPath: "react-i18next",
        hookName: "useTranslation",
      }),
      stringifyImport: () => 'import { useTranslation } from "react-i18next";',
    } as any;

    // 创建模拟的配置选项
    mockOptions = {
      pattern: "___(.+?)___",
      keyPrefix: "key",
      keyGenerator: "hash",
      extractComments: false,
      appendExtractedComment: false,
      extractedCommentType: "block",
      targetFramework: "react",
      importStyle: "named",
    } as any;
  });

  const parseCode = (code: string): File => {
    return parse(code, {
      sourceType: "module",
      plugins: [
        "jsx",
        "typescript",
        "decorators-legacy",
        "classProperties",
        "objectRestSpread",
        "asyncGenerators",
        "functionBind",
        "exportDefaultFrom",
        "exportNamespaceFrom",
        "dynamicImport",
      ],
    });
  };

  const runPerformanceTest = async (baseline: PerformanceBaseline) => {
    const testContent = PerformanceTestUtils.generateTestContent(
      baseline.fileSize
    );
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
        "test.tsx"
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
      console.log(
        `\n🚀 Running benchmark: ${baseline.functionName} with ${baseline.fileSize} file`
      );

      const result = await runPerformanceTest(baseline);

      console.log(PerformanceTestUtils.formatBenchmarkResult(result));

      // 断言性能要求
      expect(result.duration).toBeLessThanOrEqual(baseline.maxDuration);
      expect(result.memoryIncrease).toBeLessThanOrEqual(
        baseline.maxMemoryIncrease
      );
      expect(result.throughput).toBeGreaterThanOrEqual(baseline.minThroughput);
      expect(result.passed).toBe(true);
    }, 30000); // 30秒超时
  });

  it("should handle Vue components efficiently", async () => {
    const vueContent = PerformanceTestUtils.generateVueTestContent("10KB");

    // Vue 需要不同的解析配置，只取 script 部分
    const scriptMatch = vueContent.match(/<script>([\s\S]*?)<\/script>/);
    const jsContent = scriptMatch ? scriptMatch[1] : "export default {};";

    const ast = parse(jsContent, {
      sourceType: "module",
      plugins: ["objectRestSpread", "asyncGenerators"],
    });

    const testFunction = async () => {
      return collectContextAwareReplacementInfo(
        ast,
        jsContent,
        new Map(),
        [],
        [],
        mockImportManager,
        { ...mockOptions, targetFramework: "vue" } as any,
        "test.vue"
      );
    };

    const baseline: PerformanceBaseline = {
      functionName: "collectContextAwareReplacementInfo-Vue",
      fileSize: "10KB",
      maxDuration: 300,
      maxMemoryIncrease: 15 * 1024 * 1024,
      minThroughput: 3,
    };

    const result = await PerformanceTestUtils.runBenchmark(
      "Vue Component Processing",
      testFunction,
      baseline
    );

    console.log("\n🔮 Vue Component Benchmark:");
    console.log(PerformanceTestUtils.formatBenchmarkResult(result));

    expect(result.passed).toBe(true);
  }, 30000);

  it("should maintain performance with repeated calls", async () => {
    const testContent = PerformanceTestUtils.generateTestContent("5KB");
    const ast = parseCode(testContent);

    const warmupIterations = 10; // 更充分的预热
    const baselineIterations = 8; // 基线建立阶段
    const testIterations = 20; // 更多的测试样本
    const results: number[] = [];
    const baselineResults: number[] = [];

    console.log(
      `\n🔄 Testing performance consistency with ${warmupIterations} warmup + ${baselineIterations} baseline + ${testIterations} test iterations...`
    );

    // 第一阶段：预热阶段 - 让JIT编译器充分优化代码
    console.log("\n🔥 Phase 1: Warmup phase...");
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
      process.stdout.write(
        `\r  Warmup ${i + 1}/${warmupIterations}: ${duration.toFixed(2)}ms`
      );
    }

    // 第二阶段：基线建立阶段
    console.log("\n\n📊 Phase 2: Baseline establishment...");
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
      process.stdout.write(
        `\r  Baseline ${i + 1}/${baselineIterations}: ${duration.toFixed(2)}ms`
      );
    }

    // 计算基线统计数据（使用稳健统计学方法）
    const sortedBaseline = [...baselineResults].sort((a, b) => a - b);
    const baselineMedian =
      sortedBaseline[Math.floor(sortedBaseline.length / 2)];
    const baselineQ1 = sortedBaseline[Math.floor(sortedBaseline.length * 0.25)];
    const baselineQ3 = sortedBaseline[Math.floor(sortedBaseline.length * 0.75)];
    const baselineIQR = baselineQ3 - baselineQ1;

    // 过滤基线异常值
    const baselineFiltered = baselineResults.filter(
      val =>
        val >= baselineQ1 - 1.5 * baselineIQR &&
        val <= baselineQ3 + 1.5 * baselineIQR
    );

    const baselineAvg =
      baselineFiltered.reduce((a, b) => a + b, 0) / baselineFiltered.length;
    const baselineStdDev = Math.sqrt(
      baselineFiltered.reduce(
        (acc, val) => acc + Math.pow(val - baselineAvg, 2),
        0
      ) / baselineFiltered.length
    );
    const baselineCV = baselineStdDev / baselineAvg;

    console.log("\n\n⚡ Phase 3: Performance measurement phase...");
    console.log(`📊 Baseline stats:`);
    console.log(`  Median: ${baselineMedian.toFixed(2)}ms`);
    console.log(
      `  Average: ${baselineAvg.toFixed(2)}ms ± ${baselineStdDev.toFixed(2)}ms`
    );
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

      process.stdout.write(
        `\r  Test ${i + 1}/${testIterations}: ${duration.toFixed(2)}ms`
      );
    }

    console.log("\n");

    // 应用同样的异常值过滤到测试结果
    const sortedResults = [...results].sort((a, b) => a - b);
    const testQ1 = sortedResults[Math.floor(sortedResults.length * 0.25)];
    const testQ3 = sortedResults[Math.floor(sortedResults.length * 0.75)];
    const testIQR = testQ3 - testQ1;

    const filteredResults = results.filter(
      val => val >= testQ1 - 1.5 * testIQR && val <= testQ3 + 1.5 * testIQR
    );

    const avgDuration =
      filteredResults.reduce((a, b) => a + b, 0) / filteredResults.length;
    const testMedian = sortedResults[Math.floor(sortedResults.length / 2)];
    const maxDuration = Math.max(...filteredResults);
    const minDuration = Math.min(...filteredResults);
    const stdDev = Math.sqrt(
      filteredResults.reduce(
        (acc, val) => acc + Math.pow(val - avgDuration, 2),
        0
      ) / filteredResults.length
    );
    const coefficientOfVariation = avgDuration > 0 ? stdDev / avgDuration : 0;

    console.log(`📊 Performance Statistics (after filtering):`);
    console.log(`  Median: ${testMedian.toFixed(2)}ms`);
    console.log(`  Average: ${avgDuration.toFixed(2)}ms`);
    console.log(`  Min: ${minDuration.toFixed(2)}ms`);
    console.log(`  Max: ${maxDuration.toFixed(2)}ms`);
    console.log(`  Std Dev: ${stdDev.toFixed(2)}ms`);
    console.log(
      `  Coefficient of Variation: ${(coefficientOfVariation * 100).toFixed(1)}%`
    );
    console.log(
      `  Baseline comparison: ${((avgDuration / baselineAvg - 1) * 100).toFixed(1)}% change`
    );
    console.log(
      `  Filtered out: ${results.length - filteredResults.length} outliers`
    );

    // 动态阈值：基于基线稳定性调整测试阈值
    const dynamicCVThreshold = Math.max(0.6, baselineCV * 1.8); // 至少60%，或基线CV的1.8倍
    const adaptiveMaxRatio = Math.max(3.0, 2.0 + baselineCV * 2); // 基于基线稳定性的自适应阈值

    console.log(`\n🎯 Dynamic thresholds:`);
    console.log(`  CV threshold: ${(dynamicCVThreshold * 100).toFixed(1)}%`);
    console.log(`  Max ratio threshold: ${adaptiveMaxRatio.toFixed(1)}x`);

    // 1. 变异系数检查：使用动态阈值
    console.log(
      `\n✅ Assertion 1: CV (${(coefficientOfVariation * 100).toFixed(1)}%) should be < ${(dynamicCVThreshold * 100).toFixed(1)}%`
    );
    expect(coefficientOfVariation).toBeLessThan(dynamicCVThreshold);

    // 2. 相对于基线的性能退化检查：使用自适应阈值
    const performanceDegradationRatio = avgDuration / baselineAvg;
    console.log(
      `✅ Assertion 2: Perf ratio (${performanceDegradationRatio.toFixed(2)}x) should be < ${adaptiveMaxRatio.toFixed(1)}x`
    );
    expect(performanceDegradationRatio).toBeLessThan(adaptiveMaxRatio);

    // 3. 中位数稳定性检查：测试中位数应接近基线中位数
    const medianRatio = testMedian / baselineMedian;
    console.log(
      `✅ Assertion 3: Median ratio (${medianRatio.toFixed(2)}x) should be reasonable`
    );
    expect(medianRatio).toBeGreaterThan(0.5);
    expect(medianRatio).toBeLessThan(3.0);

    // 4. IQR稳定性：测试的四分位距应该合理
    const iqrRatio = testIQR / Math.max(baselineIQR, 0.1); // 避免除零
    console.log(
      `✅ Assertion 4: IQR ratio (${iqrRatio.toFixed(2)}x) should be reasonable`
    );
    expect(iqrRatio).toBeLessThan(4.0);

    // 5. 极值合理性：基于基线的合理范围
    const reasonableMin = Math.max(0.1, baselineMedian * 0.3);
    const reasonableMax = baselineMedian * 4.0;
    console.log(
      `✅ Assertion 5: Extremes should be reasonable (${reasonableMin.toFixed(2)}ms - ${reasonableMax.toFixed(2)}ms)`
    );
    expect(minDuration).toBeGreaterThan(reasonableMin);
    expect(maxDuration).toBeLessThan(reasonableMax);
  }, 180000);

  it("should scale reasonably with file size", async () => {
    const fileSizes = ["1KB", "5KB", "10KB", "20KB"];
    const results: Array<{
      size: string;
      duration: number;
      throughput: number;
      medianDuration: number;
      changes: number;
      rawDurations: number[];
    }> = [];

    console.log("\n📏 Testing performance scaling with file size...");
    console.log(
      "Using robust statistical methodology with warmup and multiple samples"
    );

    for (const size of fileSizes) {
      const testContent = PerformanceTestUtils.generateTestContent(size);
      const ast = parseCode(testContent);

      const warmupRuns = 10;
      const testRuns = 8;
      const durations: number[] = [];
      let finalResult: any;

      console.log(
        `\n🔥 Testing ${size} file (${warmupRuns} warmup + ${testRuns} measurement runs)`
      );

      // 预热阶段 - 让JIT编译器充分优化
      console.log(`  Warmup phase...`);
      for (let i = 0; i < warmupRuns; i++) {
        await collectContextAwareReplacementInfo(
          ast,
          testContent,
          new Map(),
          [],
          [],
          mockImportManager,
          mockOptions,
          `warmup-${size}-${i}.tsx`
        );
        process.stdout.write(`\r    Warmup: ${i + 1}/${warmupRuns}`);
      }

      // 短暂等待，确保JIT优化完成
      await new Promise(resolve => setTimeout(resolve, 100));
      if (global.gc) {
        global.gc();
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      // 测试阶段 - 收集性能数据
      console.log(`\n  Measurement phase...`);
      for (let i = 0; i < testRuns; i++) {
        const start = performance.now();
        const result = await collectContextAwareReplacementInfo(
          ast,
          testContent,
          new Map(),
          [],
          [],
          mockImportManager,
          mockOptions,
          `test-${size}-${i}.tsx`
        );
        const duration = performance.now() - start;
        durations.push(duration);
        finalResult = result;

        process.stdout.write(
          `\r    Test: ${i + 1}/${testRuns} (${duration.toFixed(2)}ms)`
        );
      }

      // 统计分析 - 使用更严格的IQR方法过滤异常值
      const sortedDurations = [...durations].sort((a, b) => a - b);
      const q1 = sortedDurations[Math.floor(sortedDurations.length * 0.25)];
      const q3 = sortedDurations[Math.floor(sortedDurations.length * 0.75)];
      const iqr = q3 - q1;

      // 使用更严格的异常值过滤（1.0倍IQR而不是1.5倍）
      const filteredDurations = durations.filter(
        d => d >= q1 - 1.0 * iqr && d <= q3 + 1.0 * iqr
      );

      // 如果过滤后样本太少，使用原始数据但记录警告
      const finalDurations =
        filteredDurations.length >= 4 ? filteredDurations : durations;
      const outlierCount = durations.length - finalDurations.length;

      const medianDuration =
        sortedDurations[Math.floor(sortedDurations.length / 2)];
      const avgDuration =
        finalDurations.reduce((a, b) => a + b, 0) / finalDurations.length;
      const throughput = (finalResult.changes.length / avgDuration) * 1000;

      // 计算变异系数 - 使用过滤后的数据
      const currCV =
        finalDurations.length > 1
          ? Math.sqrt(
              finalDurations.reduce(
                (acc, val) => acc + Math.pow(val - avgDuration, 2),
                0
              ) / finalDurations.length
            ) / avgDuration
          : 0;

      results.push({
        size,
        duration: avgDuration,
        throughput,
        medianDuration,
        changes: finalResult.changes.length,
        rawDurations: finalDurations, // 使用过滤后的数据
      });

      const outlierWarning =
        outlierCount > 0 ? ` (⚠️ filtered ${outlierCount} outliers)` : "";
      console.log(
        `\n  Results: median=${medianDuration.toFixed(2)}ms, avg=${avgDuration.toFixed(2)}ms, changes=${finalResult.changes.length}${outlierWarning}`
      );
      console.log(
        `  Throughput=${throughput.toFixed(1)} changes/sec, samples used=${finalDurations.length}/${durations.length}`
      );
    }

    console.log("\n📊 Performance scaling analysis:");

    // 基于AST处理复杂性的合理期望检查
    for (let i = 1; i < results.length; i++) {
      const prevSize = parseInt(results[i - 1].size);
      const currSize = parseInt(results[i].size);
      const prevMedian = results[i - 1].medianDuration;
      const currMedian = results[i].medianDuration;
      const prevThroughput = results[i - 1].throughput;
      const currThroughput = results[i].throughput;

      const sizeRatio = currSize / prevSize;
      const durationRatio = currMedian / prevMedian;
      const throughputRatio = prevThroughput / currThroughput;

      // 基于AST处理特性的动态阈值计算
      // 考虑: 1)非线性解析复杂度 2)固定初始化开销 3)内存分配模式
      const nonLinearFactor = Math.pow(sizeRatio, 1.2); // AST处理的非线性特性
      const fixedOverheadFactor = Math.max(1.5, sizeRatio * 0.5); // 固定开销的影响
      const adaptiveThreshold = Math.min(
        nonLinearFactor * fixedOverheadFactor,
        sizeRatio * 8
      );

      // 吞吐量衰减的合理阈值
      const maxThroughputDecline = Math.min(sizeRatio * 1.5, 6.0);

      console.log(`\n  ${results[i - 1].size} → ${results[i].size}:`);
      console.log(`    Size ratio: ${sizeRatio.toFixed(1)}x`);
      console.log(
        `    Duration ratio: ${durationRatio.toFixed(2)}x (threshold: ${adaptiveThreshold.toFixed(2)}x)`
      );
      console.log(
        `    Throughput decline: ${throughputRatio.toFixed(2)}x (threshold: ${maxThroughputDecline.toFixed(1)}x)`
      );

      // 核心性能验证 - 使用动态阈值
      expect(durationRatio).toBeLessThan(adaptiveThreshold);

      // 吞吐量不应过度衰减
      expect(throughputRatio).toBeLessThan(maxThroughputDecline);

      // 基本合理性检查 - 避免异常的性能崩溃
      expect(durationRatio).toBeGreaterThan(0.1); // 避免异常快速的执行
      expect(durationRatio).toBeLessThan(sizeRatio * 15); // 绝对上限

      // 确保测试结果的稳定性 - 使用该次测试的变异系数
      // 从结果中获取变异系数（在测试阶段计算）
      const currCV =
        results[i].rawDurations.length > 1
          ? Math.sqrt(
              results[i].rawDurations.reduce(
                (acc, val) => acc + Math.pow(val - results[i].duration, 2),
                0
              ) / results[i].rawDurations.length
            ) / results[i].duration
          : 0;

      console.log(`    CV: ${(currCV * 100).toFixed(1)}% (should be < 150%)`);
      // 使用更宽松的变异系数阈值，考虑AST处理的复杂性
      expect(currCV).toBeLessThan(1.5); // 150%的变异系数
    }

    // 整体性能检查 - 确保没有异常的性能退化
    const firstResult = results[0];
    const lastResult = results[results.length - 1];
    const overallSizeRatio =
      parseInt(lastResult.size) / parseInt(firstResult.size);
    const overallDurationRatio =
      lastResult.medianDuration / firstResult.medianDuration;

    console.log(
      `\n📈 Overall scaling (${firstResult.size} → ${lastResult.size}):`
    );
    console.log(`  Size increase: ${overallSizeRatio}x`);
    console.log(`  Duration increase: ${overallDurationRatio.toFixed(2)}x`);
    console.log(
      `  Expected upper bound: ${(overallSizeRatio * 6).toFixed(1)}x`
    );

    // 整体性能不应该有指数级退化
    expect(overallDurationRatio).toBeLessThan(overallSizeRatio * 6);

    console.log(`\n✅ Performance scaling test completed successfully`);
  }, 180000);
});
