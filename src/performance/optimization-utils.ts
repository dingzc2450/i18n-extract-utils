/**
 * 正则表达式缓存和对象池
 * 避免重复编译正则表达式和频繁对象创建
 */

/**
 * 正则表达式缓存
 * 避免重复编译相同的正则表达式模式
 */
export class RegexCache {
  private static cache = new Map<string, RegExp>();
  private static maxCacheSize = 100; // 防止内存泄漏

  /**
   * 获取编译后的正则表达式
   */
  static getCompiledRegex(pattern: string, flags?: string): RegExp {
    const key = `${pattern}|${flags || ""}`;

    if (this.cache.has(key)) {
      return this.cache.get(key)!;
    }

    // 检查缓存大小，防止内存泄漏
    if (this.cache.size >= this.maxCacheSize) {
      // 删除最旧的条目（FIFO策略）
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    const regex = new RegExp(pattern, flags);
    this.cache.set(key, regex);
    return regex;
  }

  /**
   * 创建全局匹配的正则表达式
   */
  static getGlobalRegex(pattern: string): RegExp {
    return this.getCompiledRegex(pattern, "g");
  }

  /**
   * 创建单次匹配的正则表达式
   */
  static getSingleMatchRegex(pattern: string): RegExp {
    return this.getCompiledRegex(pattern);
  }

  /**
   * 清除缓存
   */
  static clearCache(): void {
    this.cache.clear();
  }

  /**
   * 获取缓存大小
   */
  static getCacheSize(): number {
    return this.cache.size;
  }

  /**
   * 设置最大缓存大小
   */
  static setMaxCacheSize(size: number): void {
    this.maxCacheSize = size;
  }
}

/**
 * 对象池 - 减少对象创建和垃圾回收开销
 */
export class ObjectPool<T> {
  private pool: T[] = [];
  private createFn: () => T;
  private resetFn: (obj: T) => void;
  private maxSize: number;

  constructor(
    createFn: () => T,
    resetFn: (obj: T) => void,
    maxSize: number = 50
  ) {
    this.createFn = createFn;
    this.resetFn = resetFn;
    this.maxSize = maxSize;
  }

  /**
   * 获取对象实例
   */
  acquire(): T {
    return this.pool.pop() || this.createFn();
  }

  /**
   * 释放对象实例回池中
   */
  release(obj: T): void {
    if (this.pool.length < this.maxSize) {
      this.resetFn(obj);
      this.pool.push(obj);
    }
    // 如果池已满，直接丢弃对象让GC处理
  }

  /**
   * 获取池中对象数量
   */
  getPoolSize(): number {
    return this.pool.length;
  }

  /**
   * 清空对象池
   */
  clear(): void {
    this.pool.length = 0;
  }
}

/**
 * 分块处理器 - 优化大量数据的处理性能
 */
export class ChunkedProcessor {
  private static readonly DEFAULT_CHUNK_SIZE = 100;

  /**
   * 分块处理数组
   * 在处理大量数据时，分块处理可以让出执行权，避免阻塞事件循环
   */
  static async processInChunks<T, R>(
    items: T[],
    processor: (chunk: T[]) => R[] | Promise<R[]>,
    chunkSize: number = ChunkedProcessor.DEFAULT_CHUNK_SIZE
  ): Promise<R[]> {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const chunkResults = await processor(chunk);
      results.push(...chunkResults);

      // 在非最后一块时让出执行权
      if (i + chunkSize < items.length) {
        await new Promise(resolve => setImmediate(resolve));
      }
    }

    return results;
  }

  /**
   * 同步分块处理（不让出执行权）
   */
  static processInChunksSync<T, R>(
    items: T[],
    processor: (chunk: T[]) => R[],
    chunkSize: number = ChunkedProcessor.DEFAULT_CHUNK_SIZE
  ): R[] {
    const results: R[] = [];

    for (let i = 0; i < items.length; i += chunkSize) {
      const chunk = items.slice(i, i + chunkSize);
      const chunkResults = processor(chunk);
      results.push(...chunkResults);
    }

    return results;
  }
}

/**
 * 缓存装饰器工厂
 * 为函数添加结果缓存功能
 */
export function createCachedFunction<Args extends unknown[], Return>(
  fn: (...args: Args) => Return,
  keyGenerator?: (...args: Args) => string,
  maxCacheSize: number = 1000
): (...args: Args) => Return {
  const cache = new Map<string, Return>();

  const defaultKeyGenerator = (...args: Args): string => {
    return JSON.stringify(args);
  };

  const generateKey = keyGenerator || defaultKeyGenerator;

  return (...args: Args): Return => {
    const key = generateKey(...args);

    if (cache.has(key)) {
      return cache.get(key)!;
    }

    // 检查缓存大小
    if (cache.size >= maxCacheSize) {
      // 删除最旧的条目
      const firstKey = cache.keys().next().value;
      if (firstKey) {
        cache.delete(firstKey);
      }
    }

    const result = fn(...args);
    cache.set(key, result);
    return result;
  };
}

/**
 * 字符串常量池
 * 避免重复创建相同的字符串
 */
export class StringPool {
  private static pool = new Map<string, string>();
  private static maxSize = 1000;

  /**
   * 获取字符串（如果不存在则创建）
   */
  static intern(str: string): string {
    if (this.pool.has(str)) {
      return this.pool.get(str)!;
    }

    if (this.pool.size >= this.maxSize) {
      // 删除最旧的条目
      const firstKey = this.pool.keys().next().value;
      if (firstKey) {
        this.pool.delete(firstKey);
      }
    }

    this.pool.set(str, str);
    return str;
  }

  /**
   * 清除池
   */
  static clear(): void {
    this.pool.clear();
  }

  /**
   * 获取池大小
   */
  static getSize(): number {
    return this.pool.size;
  }
}
