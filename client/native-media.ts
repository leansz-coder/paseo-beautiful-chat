/**
 * The plugin's Markdown subset has no image node. Paseo owns attachment/file
 * resolution and its image viewer, so preserve the entire source message when
 * it contains image syntax (including reference images and streaming prefixes).
 * Conservative matches inside code examples are harmless: native Markdown can
 * still render the code. Never turn file: URLs into externally opened links.
 */
export function needsNativeImageRendering(text: string): boolean {
  return text.includes("![");
}

export interface ImageResult { uri: string; label: string; path?: string }
/** Claim only complete image-only messages we can display. Mixed/partial Markdown stays native. */
export function imageOnlyResults(text: string): ImageResult[] | null {
  const pattern = /!\[([^\]]*)\]\((file:\/\/\/[^\s)]+|https?:\/\/[^\s)]+)\)/g;
  const results: ImageResult[] = [];
  let end = 0;
  for (const match of text.matchAll(pattern)) {
    if (text.slice(end, match.index).trim()) return null;
    try {
      const uri = new URL(match[2]!);
      const path = uri.protocol === "file:" ? decodeURIComponent(uri.pathname) : undefined;
      if (path && !/\.(png|jpe?g|gif|webp|avif|bmp|ico)$/i.test(path)) return null;
      results.push({ uri: uri.href, label: match[1] === "Image" || !match[1] ? "截图" : match[1], ...(path ? { path } : {}) });
    } catch { return null; }
    end = match.index! + match[0].length;
  }
  return results.length && !text.slice(end).trim() ? results : null;
}
