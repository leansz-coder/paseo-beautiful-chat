// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { installPointerGlow } from "../client/components/glow";
import { installPointerGlow as installOriginal } from "./fixtures/original-glow";

let cleanup: () => void;
let frames: Map<number, FrameRequestCallback>;
let nextFrame: number;
beforeEach(() => {
  frames = new Map(); nextFrame = 0;
  vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => { frames.set(++nextFrame, callback); return nextFrame; });
  vi.stubGlobal("cancelAnimationFrame", (id: number) => { frames.delete(id); });
  cleanup = installPointerGlow();
});
afterEach(() => {
  cleanup(); document.body.replaceChildren();
  document.documentElement.removeAttribute("data-bcglow-off");
  vi.unstubAllGlobals();
});
function card() {
  const element = document.createElement("div");
  element.setAttribute("data-bcglow", "dark");
  document.body.append(element);
  const measure = vi.spyOn(element, "getBoundingClientRect").mockReturnValue({ left: 10, top: 20 } as DOMRect);
  return { element, measure };
}
function move(element: Element, x = 25) {
  element.dispatchEvent(new MouseEvent("pointermove", { bubbles: true, clientX: x, clientY: 40 }));
}
function flush() {
  const scheduled = [...frames.values()]; frames.clear(); scheduled.forEach((callback) => callback(0));
}

it("coalesces 100 pointer moves into one layout read using the newest position", () => {
  const { element, measure } = card();
  for (let index = 0; index < 100; index++) move(element, index);
  expect(measure).not.toHaveBeenCalled();
  expect(frames.size).toBe(1);
  flush();
  expect(measure).toHaveBeenCalledTimes(1);
  expect(element.style.getPropertyValue("--bcgx")).toBe("89px");
});

it("reproduces the upstream baseline: 100 pointer moves perform 100 layout reads", () => {
  cleanup();
  cleanup = installOriginal();
  const { element, measure } = card();
  for (let index = 0; index < 100; index++) move(element, index);
  expect(measure).toHaveBeenCalledTimes(100);
  flush();
  expect(element.style.getPropertyValue("--bcgx")).toBe("89px");
});

it("does no layout work when disabled, and cleans pending work on leave and unload", () => {
  const { element, measure } = card();
  document.documentElement.setAttribute("data-bcglow-off", "");
  move(element);
  expect(frames.size).toBe(0);
  document.documentElement.removeAttribute("data-bcglow-off");
  move(element);
  document.dispatchEvent(new Event("pointerleave"));
  flush();
  expect(measure).not.toHaveBeenCalled();
  move(element);
  cleanup(); flush();
  expect(measure).not.toHaveBeenCalled();
  move(element);
  expect(frames.size).toBe(0);
});

it("does not touch a detached or newly disabled card after a tab switch", () => {
  const { element, measure } = card();
  move(element); element.remove(); flush();
  expect(measure).not.toHaveBeenCalled();
  document.body.append(element);
  move(element); document.documentElement.setAttribute("data-bcglow-off", ""); flush();
  expect(measure).not.toHaveBeenCalled();
});
