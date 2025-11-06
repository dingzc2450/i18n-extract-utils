/**
 * 全局键缓存（按文件维度）
 * 统一管理在一次进程周期内的已生成键映射，避免重复 new Map 和跨模块不一致。
 * 注意：这里的缓存仅用于“本文件处理中的去重”（与 existingValueToKeyMap 的跨项目复用不同）。
 */

const fileGeneratedKeysCache = new Map<string, Map<string, string | number>>();

/**
 * 获取（或创建）指定文件的生成键缓存 Map
 */
export function getGeneratedKeysMapForFile(
  filePath: string
): Map<string, string | number> {
  let m = fileGeneratedKeysCache.get(filePath);
  if (!m) {
    m = new Map<string, string | number>();
    fileGeneratedKeysCache.set(filePath, m);
  }
  return m;
}

/**
 * 清理指定文件的缓存
 */
export function clearGeneratedKeysMapForFile(filePath: string): void {
  fileGeneratedKeysCache.delete(filePath);
}

/**
 * 重置全部缓存
 */
export function resetAllGeneratedKeysCaches(): void {
  fileGeneratedKeysCache.clear();
}
