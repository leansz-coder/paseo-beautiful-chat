// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ActivityRows, SINGLE, activityLabel, installActivityGroups, type ActivityMeta, type ActivityState } from "../client/activity-groups";
let host: HTMLElement, rows: ActivityRows, frames: Map<number, FrameRequestCallback>, next: number, cleanup: () => void;
const meta: ActivityMeta = { scope: "host/agent", kind: "tool", state: "completed" };
beforeEach(() => {
  frames = new Map(); next = 0;
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => { frames.set(++next, cb); return next; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => frames.delete(id));
  document.body.innerHTML = '<div data-testid="agent-chat-scroll"><div id="rows"></div></div>';
  host = document.getElementById("rows")!; rows = new ActivityRows(host); cleanup = installActivityGroups();
});
afterEach(() => { rows.dispose(); cleanup(); document.body.replaceChildren(); vi.unstubAllGlobals(); });
function flush() { const callbacks = [...frames.values()]; frames.clear(); callbacks.forEach(cb => cb(0)); }
function row(id: string, data: ActivityMeta = meta) {
  const element = document.createElement("div"); element.setAttribute("data-history-row-id", id); host.append(element);
  let state: ActivityState = SINGLE;
  const notify = vi.fn((next: ActivityState) => { state = next; });
  const handle = rows.register(element, data, notify);
  return { element, handle, notify, get state() { return state; } };
}
it("folds tools, reasoning and screenshots together, counts failures, expands and collapses all members", () => {
  const a = row("a"); const b = row("b", { ...meta, kind: "reasoning" }); const c = row("c", { ...meta, state: "failed" }); const d = row("d", { ...meta, kind: "image", images: 2 });
  flush();
  expect(a.state.counts).toEqual({ tools: 2, reasoning: 1, images: 2, failed: 1, canceled: 0, running: 0 });
  expect(activityLabel(a.state.counts!)).toBe("调用 2 次 · 思考 1 段 · 截图 2 张");
  expect(getComputedStyle(c.element).display).toBe("none");
  a.handle.toggle(); flush();
  expect([a, b, c, d].every(x => x.state.expanded)).toBe(true);
  expect(getComputedStyle(c.element).display).not.toBe("none");
  a.handle.toggle(); flush(); expect(c.state.expanded).toBe(false);
});
it("does not cross native text/images, questions, host/agent boundaries or virtualized rows", () => {
  const a = row("a"); host.append(document.createElement("div")); const b = row("b");
  const q = row("q", { ...meta, interactive: true }); const c = row("c", { ...meta, scope: "other/agent" });
  const v = row("v"); v.element.setAttribute("data-index", "5"); const z = row("z");
  flush(); expect([a,b,q,c,v,z].every(x => x.state.role === "single")).toBe(true);
});
it("preserves a user's expansion on live append and failure, and coalesces repeated status updates", () => {
  const a = row("a"); const b = row("b", { ...meta, state: "running" }); flush();
  a.handle.toggle(); flush();
  const c = row("c");
  for (let i=0;i<100;i++) b.handle.update({ ...meta, state: "failed" });
  expect(frames.size).toBe(1); flush();
  expect(a.state.expanded).toBe(true); expect(a.state.counts?.failed).toBe(1); expect(a.state.counts?.tools).toBe(3);
  a.handle.toggle(); flush();
  c.handle.update({ ...meta, state: "canceled" }); flush();
  expect(a.state.expanded).toBe(false); expect(a.state.counts?.canceled).toBe(1);
});
it("reacts to direct native boundary insertion but ignores streaming output changes", async () => {
  const a = row("a"), b = row("b"); flush(); await Promise.resolve(); flush();
  a.element.textContent = "stream output"; await Promise.resolve(); expect(frames.size).toBe(0);
  host.insertBefore(document.createElement("div"), b.element); await Promise.resolve(); flush();
  expect(a.state.role).toBe("single"); expect(b.state.role).toBe("single");
});
it("restores hidden rows and cancels scheduled work on teardown", () => {
  const a = row("a"), b = row("b"); flush(); a.handle.toggle();
  expect(frames.size).toBe(1); rows.dispose();
  expect(frames.size).toBe(0); expect(b.element.hasAttribute("data-bc-activity-hidden")).toBe(false);
  expect(a.state.role).toBe("single");
});
