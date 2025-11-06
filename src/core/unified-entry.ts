import { createProcessorWithDefaultPlugins } from "../plugins";
import type {
  TransformOptions,
  ExistingValueValueType,
  ExistingValueToKeyMapType,
} from "../types";
import type { ProcessingResult } from "./types";

/**
 * 统一处理架构入口
 * 提供一个稳定的、与框架无关的转换入口，内部基于 CoreProcessor + 默认插件集。
 * 建议所有调用方（CLI、插件内二次处理等）优先通过该入口调用，避免分散的直接耦合。
 */
export function runUnifiedTransform(
  code: string,
  filePath: string,
  options: TransformOptions = {},
  existingValueToKeyMap?: Map<string, ExistingValueValueType | string | number>
): ProcessingResult {
  const processor = createProcessorWithDefaultPlugins();
  // 规范化映射：允许调用方传入旧的 string/number 形式，内部做最小兼容
  let normalizedMap: ExistingValueToKeyMapType | undefined =
    existingValueToKeyMap as unknown as ExistingValueToKeyMapType;
  if (existingValueToKeyMap) {
    const tmp = new Map<string, ExistingValueValueType>();
    for (const [value, entry] of existingValueToKeyMap.entries()) {
      if (typeof entry === "string" || typeof entry === "number") {
        tmp.set(value, {
          primaryKey: entry,
          keyDetailList: [{ key: String(entry) }],
          keys: new Set([String(entry)]),
        });
      } else {
        tmp.set(value, entry);
      }
    }
    normalizedMap = tmp;
  }

  return processor.processCode(code, filePath, options, normalizedMap);
}
