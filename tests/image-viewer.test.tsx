import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { expect, it, vi } from "vitest";
vi.mock("react-native", () => ({
  Image: "Image", Pressable: "Pressable", Text: "Text", View: "View",
  useWindowDimensions: () => ({ width: 1200, height: 900 }),
}));
vi.mock("@getpaseo/plugin/client/react-native", () => {
  const Modal = Object.assign(({ children, ...props }: any) => React.createElement("Dialog", props, children), { Content: "DialogContent" });
  return { Modal, ScrollView: "ScrollView" };
});
import { ZoomableImage } from "../client/components/zoomable-image";
import { buildThemeTokens } from "../client/components/theme-tokens";
import type { PluginSurfaceColors } from "../client/components/theme-tokens";
const tokens = buildThemeTokens({ surface0: "#111111", foreground: "#eeeeee", accent: "#eeeeee", foregroundMuted: "#999999", accentForeground: "#111111", statusDanger: "#ee5555" } as PluginSurfaceColors);
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const props = { label: "截图", style: { width: 300, height: 200 }, tokens, width: 2000, height: 1000 };

it("opens only on click, zooms, resets on dismissal and follows the current image", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ZoomableImage {...props} uri="data:image/png;base64,first" />); });
  expect(renderer.root.findAllByType("Dialog" as any)).toHaveLength(0);
  await act(async () => { renderer.root.findByProps({ accessibilityLabel: "放大图片：截图" }).props.onPress(); });
  let preview = renderer.root.findByProps({ accessibilityLabel: "截图（放大预览）" });
  expect(preview.props.source.uri).toBe("data:image/png;base64,first");
  const fitWidth = preview.props.style.width;
  expect(fitWidth).toBeGreaterThan(1000);
  await act(async () => { renderer.root.findByProps({ accessibilityLabel: "放大图片" }).props.onPress(); });
  expect(renderer.root.findByProps({ accessibilityLabel: "截图（放大预览）" }).props.style.width).toBe(fitWidth * 2);
  await act(async () => { renderer.root.findByType("Dialog" as any).props.onOpenChange(false); });
  expect(renderer.root.findAllByType("Dialog" as any)).toHaveLength(0);
  await act(async () => { renderer.root.findByProps({ accessibilityLabel: "放大图片：截图" }).props.onPress(); });
  expect(renderer.root.findByProps({ accessibilityLabel: "截图（放大预览）" }).props.style.width).toBe(fitWidth);
  await act(async () => { renderer.update(<ZoomableImage {...props} uri="data:image/png;base64,second" />); });
  expect(renderer.root.findAllByType("Dialog" as any)).toHaveLength(0);
  await act(async () => { renderer.unmount(); });
});

it("uses loaded dimensions and viewport measurements for tall screenshots", async () => {
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<ZoomableImage {...props} width={null} height={null} uri="data:image/png;base64,tall" />); });
  await act(async () => { renderer.root.findByType("Image" as any).props.onLoad({ nativeEvent: { source: { width: 500, height: 4000 } } }); renderer.root.findByProps({ accessibilityLabel: "放大图片：截图" }).props.onPress(); });
  const preview = renderer.root.findByProps({ accessibilityLabel: "截图（放大预览）" });
  expect(preview.props.style.width / preview.props.style.height).toBe(0.125);
  expect(preview.props.style.height).toBeLessThanOrEqual(900 * 0.92 - 150);
  await act(async () => { renderer.unmount(); });
});
