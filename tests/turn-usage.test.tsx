import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readUsage, useTurnUsage } from "../client/turn-usage";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("read-only usage decoration", () => {
  it("coalesces a burst of prompt mounts and never crosses hosts or completion status", async () => {
    const owner = {};
    const handle = { refresh: vi.fn(async () => ({ agent: { lastUsage: { inputTokens: 1 } } })) };
    await Promise.all(Array.from({ length: 100 }, () => readUsage(owner, "A:running", handle)));
    expect(handle.refresh).toHaveBeenCalledTimes(1);
    await readUsage(owner, "A:settled", handle);
    await readUsage({}, "A:running", handle);
    expect(handle.refresh).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(2000);
    await readUsage(owner, "A:running", handle);
    expect(handle.refresh).toHaveBeenCalledTimes(4);
  });

  it("shares slow in-flight calls even after the refresh interval and retries failures later", async () => {
    const owner = {};
    let reject!: (error: Error) => void;
    const handle = { refresh: vi.fn(() => new Promise<null>((_, no) => { reject = no; })) };
    const first = readUsage(owner, "A", handle);
    await Promise.resolve();
    vi.advanceTimersByTime(10000);
    expect(readUsage(owner, "A", handle)).toBe(first);
    const failed = expect(first).rejects.toThrow("offline");
    reject(new Error("offline"));
    await failed;
    handle.refresh.mockImplementation(async () => null);
    await readUsage(owner, "A", handle);
    expect(handle.refresh).toHaveBeenCalledTimes(2);
  });

  it("stops polling on unmount, ignores late responses, and cannot call agent control methods", async () => {
    const owner = {};
    const calls: string[] = [];
    let resolve!: (value: { agent: { lastUsage: { inputTokens: number } } }) => void;
    const handle = new Proxy({ refresh: () => new Promise<{ agent: { lastUsage: { inputTokens: number } } }>((yes) => { resolve = yes; }) }, {
      get(target, key) {
        calls.push(String(key));
        if (key !== "refresh") throw new Error(`Forbidden agent operation: ${String(key)}`);
        return target[key];
      },
    });
    function Row() { useTurnUsage(owner, "A", handle, true, true); return null; }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Row />); });
    expect(calls).toEqual(["refresh"]);
    await act(async () => { renderer.unmount(); });
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { resolve({ agent: { lastUsage: { inputTokens: 10 } } }); });
    await vi.advanceTimersByTimeAsync(10000);
    expect(calls).toEqual(["refresh"]);
  });

  it("does not read historical rows; on completion obtains and freezes a final sample", async () => {
    const owner = {};
    const handle = { refresh: vi.fn(async () => ({ agent: { lastUsage: { inputTokens: 7 } } })) };
    let result: ReturnType<typeof useTurnUsage>;
    function Row({ live, running }: { live: boolean; running: boolean }) {
      result = useTurnUsage(owner, "A", handle, live, running);
      return null;
    }
    let renderer!: ReactTestRenderer;
    await act(async () => { renderer = create(<Row live={false} running />); });
    expect(handle.refresh).not.toHaveBeenCalled();
    await act(async () => { renderer.update(<Row live running />); });
    expect(handle.refresh).toHaveBeenCalledTimes(1);
    await act(async () => { renderer.update(<Row live running={false} />); });
    expect(handle.refresh).toHaveBeenCalledTimes(2);
    expect(result!.frozen).toBe(true);
    expect(result!.usage?.inputTokens).toBe(7);
    expect(vi.getTimerCount()).toBe(0);
    await act(async () => { renderer.unmount(); });
  });
});
