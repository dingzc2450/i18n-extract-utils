import { describe, test, expect, afterEach, vi } from "vitest"; // Import vi for spying
import { processFiles } from "../src/transformer";
import * as fs from "fs";
import * as path from "path";
import { tmpdir } from "os";

// Helper to create temporary test files and clean up
const tempFiles: string[] = [];
function createTempFile(content: string, ext = ".tsx"): string {
  const tempFile = path.join(
    tmpdir(),
    `test-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`
  );
  fs.writeFileSync(tempFile, content, "utf8");
  tempFiles.push(tempFile);
  return tempFile;
}
afterEach(() => {
  tempFiles.forEach((file) => {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  });
  tempFiles.length = 0;
  vi.restoreAllMocks(); // Restore any spied functions
});

describe("processFiles with existingTranslations", () => {
  test("should use existing JSON keys from FILE PATH and report usedExistingKeys", async () => {
    // 1. Create an existing JSON file
    const existingJsonPath = createTempFile(
      JSON.stringify({
        hello_key: "你好",
        world_key: "世界",
      }),
      ".json"
    );

    // 2. Create a TSX file with content matching the values
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

    // 3. Call processFiles with the file path
    const result = await processFiles(tsxPath, {
      translationMethod: "t",
      hookName: "useTranslation",
      existingTranslations: existingJsonPath, // Pass file path
    });

    // 4. Check usedExistingKeys
    expect(result.usedExistingKeys).toBeDefined();
    expect(result.usedExistingKeys!.length).toBe(2);
    expect(
      result.usedExistingKeys!.some(
        (k) => k.key === "hello_key" && k.value === "你好"
      )
    ).toBe(true);
    expect(
      result.usedExistingKeys!.some(
        (k) => k.key === "world_key" && k.value === "世界"
      )
    ).toBe(true);

    // 5. Check new content key
    expect(
      result.extractedStrings.some(
        (k) => k.value === "新内容" && k.key === "新内容"
      )
    ).toBe(true);

    // 6. Check code replacement
    const replaced = fs.readFileSync(tsxPath, "utf8");
    expect(replaced).toContain('t("hello_key")');
    expect(replaced).toContain('t("world_key")');
    expect(replaced).toContain('t("新内容")');
  });

  test("should use existing keys from OBJECT and report usedExistingKeys", async () => {
    // 1. Define the existing translations object
    const existingTranslationsObject = {
      greeting_key: "Hello",
      farewell_key: "Goodbye",
    };

    // 2. Create a TSX file with content matching the values
    const code = `
      function Demo() {
        return (
          <div>
            <span>___Hello___</span>
            <span>___Goodbye___</span>
            <span>___New Stuff___</span>
          </div>
        );
      }
    `;
    const tsxPath = createTempFile(code, ".tsx");

    // 3. Call processFiles with the object
    const result = await processFiles(tsxPath, {
      translationMethod: "t",
      hookName: "useTranslation",
      existingTranslations: existingTranslationsObject, // Pass object directly
    });

    // 4. Check usedExistingKeys
    expect(result.usedExistingKeys).toBeDefined();
    expect(result.usedExistingKeys!.length).toBe(2);
    expect(
      result.usedExistingKeys!.some(
        (k) => k.key === "greeting_key" && k.value === "Hello"
      )
    ).toBe(true);
    expect(
      result.usedExistingKeys!.some(
        (k) => k.key === "farewell_key" && k.value === "Goodbye"
      )
    ).toBe(true);

    // 5. Check new content key
    expect(
      result.extractedStrings.some(
        (k) => k.value === "New Stuff" && k.key === "New Stuff"
      )
    ).toBe(true);

    // 6. Check code replacement
    const replaced = fs.readFileSync(tsxPath, "utf8");
    expect(replaced).toContain('t("greeting_key")');
    expect(replaced).toContain('t("farewell_key")');
    expect(replaced).toContain('t("New Stuff")');
  });

  test("should handle non-existent existingTranslations file path gracefully", async () => {
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {}); // Spy on console.warn

    const nonExistentPath = "/path/to/non/existent/file.json";
    const code = `
      function Demo() {
        return <div>___Some Text___</div>;
      }
    `;
    const tsxPath = createTempFile(code, ".tsx");

    const result = await processFiles(tsxPath, {
      translationMethod: "t",
      existingTranslations: nonExistentPath,
    });

    // Check that a warning was logged
    expect(consoleWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Existing translations file not found: ${nonExistentPath}`)
    );

    // Check that no existing keys were used
    expect(result.usedExistingKeys).toBeDefined();
    expect(result.usedExistingKeys!.length).toBe(0);

    // Check that extraction and transformation still happened (using default key)
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].key).toBe("Some Text");
    const replaced = fs.readFileSync(tsxPath, "utf8");
    expect(replaced).toContain('t("Some Text")');

    consoleWarnSpy.mockRestore();
  });

   test("should handle invalid JSON in existingTranslations file path gracefully", async () => {
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {}); // Spy on console.error

    const invalidJsonPath = createTempFile("this is not valid json", ".json");
    const code = `
      function Demo() {
        return <div>___More Text___</div>;
      }
    `;
    const tsxPath = createTempFile(code, ".tsx");

    const result = await processFiles(tsxPath, {
      translationMethod: "t",
      existingTranslations: invalidJsonPath,
    });

    // Check that an error was logged
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(`Error parsing existing translations file: ${invalidJsonPath}`),
      expect.any(Error) // Expect an error object to be logged
    );

    // Check that no existing keys were used
    expect(result.usedExistingKeys).toBeDefined();
    expect(result.usedExistingKeys!.length).toBe(0);

    // Check that extraction and transformation still happened (using default key)
    expect(result.extractedStrings.length).toBe(1);
    expect(result.extractedStrings[0].key).toBe("More Text");
    const replaced = fs.readFileSync(tsxPath, "utf8");
    expect(replaced).toContain('t("More Text")');

    consoleErrorSpy.mockRestore();
  });
});