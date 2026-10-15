import { expect, it, vi } from "vitest";
import { needsNativeImageRendering, imageOnlyResults } from "../client/native-media";
vi.mock("../client/grouped-renderers", () => ({ GroupedToolCallRenderer: () => null, GroupedReasoningRenderer: () => null }));
vi.mock("../client/image-result", () => ({ ImageResultRenderer: () => null }));
vi.mock("../client/settings-page", () => ({ BeautifulChatSettingsPage: () => null }));
vi.mock("../client/live-renderers", () => ({ LiveToolCallRenderer: () => null, LiveReasoningRenderer: () => null, LiveTodoRenderer: () => null, LiveUserMessageRenderer: () => null, LiveNoticeRenderer: () => null, LiveAssistantRenderer: () => null }));
vi.mock("../client/components/embed-fonts", () => ({ embedFonts: () => () => {} }));
vi.mock("../client/components/frosted", () => ({ installFrostedGlass: () => () => {} }));
vi.mock("../client/components/shimmer", () => ({ installShimmer: () => () => {} }));
vi.mock("../client/components/glow", () => ({ installPointerGlow: () => () => {} }));
vi.mock("../client/components/host-notice", () => ({ installHostNoticeStyle: () => () => {} }));
vi.mock("../client/components/chat-find", () => ({ installChatFind: () => () => {} }));
vi.mock("../client/web", () => ({ installNativePromptStyle: () => () => {} }));
import contribute from "../index.client";
import { getEnhancerPreferences, updateEnhancerPreferences } from "../client/preferences";
import type { PluginClientContext } from "@getpaseo/plugin/client";

it("preserves source image messages for Paseo's native image resolution and viewer", () => {
  for (const text of [
    "![Image](file:///var/folders/example/paseo-attachments/screenshot.jpg)",
    "Before\n\n![capture](file:///tmp/a%20b.png)\n\nAfter",
    "![remote](https://example.com/screenshot.png)",
    "![embedded](data:image/png;base64,AAAA)",
    "![screen][attachment]\n\n[attachment]: file:///tmp/image.png",
    "![Image](file:///still-streaming",
  ]) expect(needsNativeImageRendering(text)).toBe(true);
  expect(needsNativeImageRendering("A normal reply with [documentation](https://example.com)")).toBe(false);
});

it("the registered assistant transformer returns undefined for screenshots without dropping adjacent text", () => {
  const transforms = new Map<string, (input: any) => any>();
  const allowed = {
    addSettingsScreen: () => () => {},
    addTimelineRenderer: () => () => {},
    addTimelineTransformer: (value: any) => { transforms.set(value.query.itemType, value.transform); return () => {}; },
  };
  const context = new Proxy(allowed, { get(target, name) {
    if (!(name in target)) throw new Error(`Unexpected plugin action: ${String(name)}`);
    return target[name as keyof typeof allowed];
  } });
  const cleanup = contribute(context as unknown as PluginClientContext);
  const transform = transforms.get("assistant_message")!;
  const text = "Screenshot result\n\n![Image](file:///tmp/screenshot.jpg)\n\nFollowing explanation";
  const item = { type: "assistant_message", text };
  expect(transform({ item, phase: "complete" })).toBeUndefined();
  expect(item.text).toBe(text);
  expect(transform({ item: { type: "assistant_message", text: "Normal reply" }, phase: "complete" }).items[0].kind).toBe("omp-assistant");
  expect(transforms.has("tool_call")).toBe(true);
  expect(transform({ item: { type: "assistant_message", text: "![Image](file:///tmp/screenshot.jpg)" }, phase: "complete" }).items[0].kind).toBe("omp-image-result");
  cleanup();
});

it("preserves styled tool payloads with grouping enabled or disabled", () => {
  const transforms = new Map<string, (input: any) => any>();
  const cleanup = contribute({
    addSettingsScreen: () => () => {},
    addTimelineRenderer: () => () => {},
    addTimelineTransformer: (value: any) => { transforms.set(value.query.itemType, value.transform); return () => {}; },
  } as unknown as PluginClientContext);
  const transform = transforms.get("tool_call")!;
  const ordinary = { type: "tool_call", name: "exec_command", callId: "one", status: "completed", detail: { type: "shell", exitCode: 0, output: "done" } };
  expect(getEnhancerPreferences().groupToolCalls).toBe(true);
  expect(transform({ item: ordinary, phase: "complete" }).items[0].kind).toBe("omp-tool-call");
  expect(transform({ item: { ...ordinary, callId: "two", status: "running" }, phase: "streaming" }).items[0].data.status).toBe("running");
  const failed = { ...ordinary, status: "failed", error: "Denied" };
  expect(transform({ item: failed, phase: "complete" }).items[0].data.error).toBe("Denied");
  const question = { ...ordinary, name: "functions.request_user_input", status: "running" };
  expect(transform({ item: question, phase: "streaming" }).items[0].kind).toBe("omp-tool-call");
  try {
    updateEnhancerPreferences({ groupToolCalls: false });
    expect(transform({ item: ordinary, phase: "complete" }).items[0].data.detail).toBe(ordinary.detail);
  } finally {
    updateEnhancerPreferences({ groupToolCalls: true });
    cleanup();
  }
});


it("claims only complete supported image-only messages and preserves encoded paths", () => {
  expect(imageOnlyResults("![Image](file:///tmp/a%20b.png)\n\n![screen](https://example.com/b.png)")).toEqual([{ uri: "file:///tmp/a%20b.png", label: "截图", path: "/tmp/a b.png" }, { uri: "https://example.com/b.png", label: "screen" }]);
  for (const text of ["text ![Image](file:///tmp/a.png)", "![Image](file:///tmp/a.png) after", "![Image](file:///tmp/a.png", "![Image](file:///tmp/a.svg)", "![x][ref]", "![x](data:image/png;base64,AAAA)"]) expect(imageOnlyResults(text)).toBeNull();
});


it("preserves every user source because host projection omits attachment metadata",()=>{
 const transforms=new Map<string,(input:any)=>any>();
 const cleanup=contribute({addSettingsScreen:()=>()=>{},addTimelineRenderer:()=>()=>{},addTimelineTransformer:(value:any)=>{transforms.set(value.query.itemType,value.transform);return()=>{};}} as unknown as PluginClientContext);
 const transform=transforms.get("user_message")!;
 for(const item of [
  {type:"user_message",text:"这个是目前的数据样例",messageId:"csv"},
  {type:"user_message",text:"看这个图片",messageId:"screenshot"},
  {type:"user_message",text:"",messageId:"attachment-only"},
  {type:"user_message",text:"image and file",images:["file:///tmp/a.png"],attachments:[{type:"file",fileName:"sample.csv"}]},
 ]) expect(transform({item,phase:"complete"})).toBeUndefined();
 cleanup();
});
