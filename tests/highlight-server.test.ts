import { expect, it } from "vitest";
import contribute from "../index.server";
import { highlightRpc, type HighlightLine } from "../shared/highlight-rpc";
import type { PluginServerContext } from "@getpaseo/plugin/server";
it("never returns another block's text when two sources collide under the old hash", async () => {
  const handlers = new Map<unknown, (input: unknown) => Promise<{ lines: HighlightLine[]; language: string | null }>>();
  const context = new Proxy({ handle: (contract: unknown, callback: any) => { handlers.set(contract, callback); } }, {
    get(target, key) { if (key !== "handle") throw new Error(`Unexpected server operation: ${String(key)}`); return target.handle; },
  });
  const dispose = contribute(context as unknown as PluginServerContext);
  const handler = handlers.get(highlightRpc)!;
  // Both produce 2388170705 under upstream's FNV-1a implementation.
  for (const code of ["sample_1g0wgl1", "sample_1f02b4h", "sample_1g0wgl1"]) {
    const result = await handler({ code, dark: true, language: "javascript" });
    expect(result.language).not.toBeNull();
    expect(result.lines.map(line => line.map(token => token.text).join("")).join("\n")).toBe(code);
  }
  dispose();
});
