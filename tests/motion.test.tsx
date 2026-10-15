import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";

const animation = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn(), timing: vi.fn() }));
vi.mock("react-native", () => ({
  Platform: { OS: "web" },
  View: "View",
  Easing: { out: (value: unknown) => value, cubic: "cubic" },
  Animated: {
    Value: class { interpolate() { return "0deg"; } },
    View: "AnimatedView",
    timing: (...args: unknown[]) => { animation.timing(...args); return animation; },
  },
}));
import { Rotate } from "../client/components/motion";
import { Rotate as OriginalRotate } from "./fixtures/original-motion";
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it("does not animate 100 historical rows on mount, but animates a real toggle and stops on unmount", async () => {
  vi.clearAllMocks();
  let renderer!: ReactTestRenderer;
  const rows = (active: boolean) => <>{Array.from({ length: 100 }, (_, index) => <Rotate key={index} active={index === 0 && active}>arrow</Rotate>)}</>;
  await act(async () => { renderer = create(rows(false)); });
  expect(animation.timing).not.toHaveBeenCalled();
  await act(async () => { renderer.update(rows(true)); });
  expect(animation.timing).toHaveBeenCalledTimes(1);
  expect(animation.timing.mock.calls[0]?.[1]).toMatchObject({ toValue: 1, isInteraction: false });
  await act(async () => { renderer.unmount(); });
  expect(animation.stop).toHaveBeenCalledTimes(1);
});

it("reproduces the upstream baseline: 100 collapsed history rows start 100 animations", async () => {
  vi.clearAllMocks();
  let renderer!: ReactTestRenderer;
  await act(async () => {
    renderer = create(<>{Array.from({ length: 100 }, (_, index) => <OriginalRotate key={index} active={false}>arrow</OriginalRotate>)}</>);
  });
  expect(animation.timing).toHaveBeenCalledTimes(100);
  await act(async () => { renderer.unmount(); });
});
