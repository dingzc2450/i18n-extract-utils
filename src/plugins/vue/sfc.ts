/**
 * 轻量 SFC 解析与组装工具
 * 从 VuePlugin 提取：parseVueFile / extractBlock / assembleVueFile / stripOuterNewlines
 */

export function extractBlock(
  code: string,
  sectionName: string
): { inner: string; attrs: string } | undefined {
  const startTag = new RegExp(`<${sectionName}([^>]*)>`, "i");

  const startMatch = code.match(startTag);
  if (!startMatch) return undefined;

  const attrs = startMatch[1] || ""; // 包含前导空格
  const startIndex = startMatch.index! + startMatch[0].length;
  let depth = 1;
  let currentIndex = startIndex;

  // 使用标签计数来正确处理嵌套标签
  while (currentIndex < code.length && depth > 0) {
    const nextStart = code.indexOf(`<${sectionName}`, currentIndex);
    const nextEnd = code.indexOf(`</${sectionName}>`, currentIndex);

    if (nextEnd === -1) {
      // 没有找到结束标签
      break;
    }

    if (nextStart !== -1 && nextStart < nextEnd) {
      // 找到嵌套的开始标签
      depth++;
      currentIndex = nextStart + 1;
    } else {
      // 找到结束标签
      depth--;
      if (depth === 0) {
        // 找到最外层结束标签
        return { inner: code.substring(startIndex, nextEnd), attrs };
      }
      currentIndex = nextEnd + 1;
    }
  }

  // 如果没有匹配到完整标签，返回到文件结束
  return { inner: code.substring(startIndex), attrs };
}

export function parseVueFile(code: string): {
  template?: string;
  templateAttrs?: string;
  script?: string;
  scriptAttrs?: string;
  style?: string;
  styleAttrs?: string;
  isSetupScript: boolean;
} {
  const tplBlock = extractBlock(code, "template");
  const scriptBlock = extractBlock(code, "script");
  const styleBlock = extractBlock(code, "style");

  const isSetupScript = (scriptBlock?.attrs || "").includes("setup");

  return {
    template: tplBlock?.inner,
    templateAttrs: tplBlock?.attrs,
    script: scriptBlock?.inner,
    scriptAttrs: scriptBlock?.attrs,
    style: styleBlock?.inner,
    styleAttrs: styleBlock?.attrs,
    isSetupScript,
  };
}

export function stripOuterNewlines(content: string): string {
  let out = content;
  if (out.startsWith("\r\n")) {
    out = out.slice(2);
  } else if (out.startsWith("\n")) {
    out = out.slice(1);
  }

  if (out.endsWith("\r\n")) {
    out = out.slice(0, -2);
  } else if (out.endsWith("\n")) {
    out = out.slice(0, -1);
  }
  return out;
}

export function assembleVueFile(vueFile: {
  template?: string;
  templateAttrs?: string;
  script?: string;
  scriptAttrs?: string;
  style?: string;
  styleAttrs?: string;
  isSetupScript: boolean;
}): string {
  let result = "";

  if (vueFile.template) {
    const inner = stripOuterNewlines(vueFile.template);
    const attrs = vueFile.templateAttrs || "";
    result += `<template${attrs}>\n${inner}\n</template>\n\n`;
  }

  if (vueFile.script) {
    const attrs =
      vueFile.scriptAttrs || (vueFile.isSetupScript ? " setup" : "");
    const scriptTag = `<script${attrs}>`;
    const inner = stripOuterNewlines(vueFile.script);
    result += `${scriptTag}\n${inner}\n</script>\n\n`;
  }

  if (vueFile.style) {
    const inner = stripOuterNewlines(vueFile.style);
    const attrs = vueFile.styleAttrs || "";
    result += `<style${attrs}>\n${inner}\n</style>\n`;
  }

  return result.trim();
}
