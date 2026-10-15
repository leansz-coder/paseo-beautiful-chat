import { describe, expect, it, vi } from "vitest";
import { TimelineTails } from "../client/timeline-tails";

describe("conversation tails", () => {
  it("does not let a newer conversation steal an older conversation's footer", () => {
    const tails = new TimelineTails();
    tails.note("A", "a1", 10);
    tails.note("B", "b1", 100);
    expect(tails.get("A")).toBe("a1");
    expect(tails.get("B")).toBe("b1");
    tails.note("A", "old", 1);
    tails.note("A", "tie", 10);
    expect(tails.get("A")).toBe("a1");
  });

  it("notifies only the previous and new tail among 500 mounted rows", () => {
    const tails = new TimelineTails();
    const callbacks = Array.from({ length: 500 }, () => vi.fn());
    const unsubscribes = callbacks.map((callback, index) => tails.subscribe("A", String(index), callback));
    const other = vi.fn();
    tails.subscribe("B", "499", other);
    for (let index = 0; index < 500; index++) tails.note("A", String(index), index);
    expect(callbacks.reduce((sum, callback) => sum + callback.mock.calls.length, 0)).toBe(999);
    expect(other).not.toHaveBeenCalled();
    callbacks.forEach((callback) => callback.mockClear());
    unsubscribes.forEach((unsubscribe) => unsubscribe());
    tails.note("A", "next", 501);
    callbacks.forEach((callback) => expect(callback).not.toHaveBeenCalled());
  });

  it("retains mounted conversations while bounding dormant history", () => {
    const tails = new TimelineTails();
    tails.subscribe("open", "row", vi.fn());
    tails.note("open", "row", 1);
    for (let index = 0; index < 1000; index++) tails.note(String(index), "row", index);
    expect(tails.get("open")).toBe("row");
    expect(tails.get("0")).toBeNull();
  });
});
