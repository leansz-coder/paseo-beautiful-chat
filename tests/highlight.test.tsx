import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { beforeEach, afterEach, expect, it, vi } from "vitest";
const { call } = vi.hoisted(() => ({ call: vi.fn() }));
vi.mock("@getpaseo/plugin/client", () => ({ useRpc: () => call }));
import { useHighlightedLines, type HighlightResponse } from "../client/highlight";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let result: HighlightResponse;
function Row({ code }: { code: string }) { result = useHighlightedLines({ code, language: "js", dark: true }); return null; }
beforeEach(() => {
  vi.useFakeTimers(); call.mockReset();
  call.mockImplementation(async ({ code }: { code: string }) => ({ language: "js", lines: [[{ text: code, color: "red" }]] }));
});
afterEach(() => vi.useRealTimers());
it("coalesces changing text until stable and does not request anything after unmount", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<Row code="stream-start" />); });
  for (let i = 0; i < 30; i++) {
    await act(async () => { await vi.advanceTimersByTimeAsync(20); renderer.update(<Row code={`stream-${i}`} />); });
  }
  expect(call).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(call).toHaveBeenCalledTimes(1); expect(call.mock.calls[0]![0].code).toBe("stream-29");
  expect(result.lines?.[0]?.[0]?.text).toBe("stream-29");
  await act(async () => { renderer.update(<Row code="never-load-me" />); });
  await act(async () => { renderer.unmount(); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(call).toHaveBeenCalledTimes(1);
});
it("does not poison the cache on a temporary failure; remount retries", async () => {
  call.mockRejectedValueOnce(new Error("offline"));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<Row code="retry-code" />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  await act(async () => { renderer.unmount(); });
  await act(async () => { renderer = create(<Row code="retry-code" />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(call).toHaveBeenCalledTimes(2); expect(result.lines?.[0]?.[0]?.text).toBe("retry-code");
  await act(async () => { renderer.unmount(); });
});
it("ignores stale responses after the displayed code changes", async () => {
  let resolve!: (value: unknown) => void;
  call.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<Row code="old-code" />); });
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  await act(async () => { renderer.update(<Row code="new-code" />); });
  await act(async () => { resolve({ language: "js", lines: [[{ text: "old-code", color: null }]] }); });
  expect(result.lines).toBeNull();
  await act(async () => { await vi.advanceTimersByTimeAsync(250); });
  expect(result.lines?.[0]?.[0]?.text).toBe("new-code");
  await act(async () => { renderer.unmount(); });
});
it("keeps different sources separate even if their old 32-bit hashes collide", async () => {
  let renderer!: ReactTestRenderer;
  for (const code of ["sample_1g0wgl1", "sample_1f02b4h"]) {
    await act(async () => { renderer = create(<Row code={code} />); });
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    expect(result.lines?.[0]?.[0]?.text).toBe(code);
    await act(async () => { renderer.unmount(); });
  }
  expect(call).toHaveBeenCalledTimes(2);
});
