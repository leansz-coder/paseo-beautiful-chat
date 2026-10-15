import { expect, it, vi } from "vitest";
import { WorkQueue } from "../client/work-queue";
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
it("limits concurrent work, shares duplicate requests and discards abandoned queued work", async () => {
  const queue = new WorkQueue<number>(2);
  const resolves: Array<(value: number) => void> = [];
  const run = vi.fn(() => new Promise<number>(resolve => resolves.push(resolve)));
  const a = queue.acquire("a", run); const duplicate = queue.acquire("a", run);
  const b = queue.acquire("b", run); const c = queue.acquire("c", run);
  const d = queue.acquire("d", run);
  await flush(); expect(run).toHaveBeenCalledTimes(2); expect(a.promise).toBe(duplicate.promise);
  c.release(); c.release(); expect(await c.promise).toBeUndefined();
  resolves[0]!(1); await flush(); expect(run).toHaveBeenCalledTimes(3);
  resolves[1]!(2); resolves[2]!(4);
  expect(await Promise.all([a.promise, duplicate.promise, b.promise, d.promise])).toEqual([1, 1, 2, 4]);
});
it("a failed or synchronously throwing request frees its slot", async () => {
  const queue = new WorkQueue<number>(1);
  const fail = queue.acquire("bad", () => { throw new Error("offline"); });
  const next = queue.acquire("next", async () => 2);
  await expect(fail.promise).rejects.toThrow("offline"); expect(await next.promise).toBe(2);
});
