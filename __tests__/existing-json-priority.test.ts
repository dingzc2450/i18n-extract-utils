import { describe, test, expect, afterEach } from "vitest";
import { processFiles } from "../src/transformer";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";

// Helper to create temporary test files and clean up
const tempFiles: string[] = [];
function createTempFile(content: string, ext = ".tsx"): string {
  const tempFile = path.join(tmpdir(), `test-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  fs.writeFileSync(tempFile, content, "utf8");
  tempFiles.push(tempFile);
  return tempFile;
}
afterEach(() => {
  tempFiles.forEach((file) => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  tempFiles.length = 0;
});

describe("processFiles with existingJsonPath", () => {
  test("should use existing JSON keys and report usedExistingKeys", async () => {
    // 1. 先写一个已有的 JSON 文件
    const existingJsonPath = createTempFile(
      JSON.stringify({
        hello_key: "你好",
        world_key: "世界"
      }),
      ".json"
    );

    // 2. 写一个待处理的 tsx 文件，内容包含已有 value
    const code = `
      function Demo() {
        return (
          <div>
            <span>___你好___</span>
            <span>___世界___</span>
            <span>___新内容___</span>
          </div>
        );
      }
    `;
    const tsxPath = createTempFile(code, ".tsx");

    // 3. 调用 processFiles
    const result = await processFiles(tsxPath, {
      translationMethod: "t",
      hookName: "useTranslation",
      existingJsonPath
    });

    // 4. 检查用到 existingJsonPath 的 key
    expect(result.usedExistingKeys).toBeDefined();
    expect(result.usedExistingKeys!.length).toBe(2);
    expect(result.usedExistingKeys!.some(k => k.key === "hello_key" && k.value === "你好")).toBe(true);
    expect(result.usedExistingKeys!.some(k => k.key === "world_key" && k.value === "世界")).toBe(true);

    // 5. 检查新内容未用已有 key
    expect(result.extractedStrings.some(k => k.value === "新内容" && k.key === "新内容")).toBe(true);

    // 6. 检查代码替换结果
    const replaced = fs.readFileSync(tsxPath, "utf8");
    expect(replaced).toContain('t("hello_key")');
    expect(replaced).toContain('t("world_key")');
    expect(replaced).toContain('t("新内容")');
  });
});