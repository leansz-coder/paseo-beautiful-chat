import React, { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { ActivityRow } from "./grouped-renderers";
import type { ActivityMeta } from "./activity-groups";
import type { ImageResult } from "./native-media";
import { useEnhancerPreferences } from "./preferences";
import { buildThemeTokens, type ExtendedThemeTokens } from "./components/theme-tokens";
import { useImageFile } from "./image-file";
import { ImagePreview } from "./components/image-preview";
import { ZoomableImage } from "./components/zoomable-image";
import { Glyph } from "./components/glyph";

function LocalImage({ image, tokens }: { image: ImageResult; tokens: ExtendedThemeTokens }) {
  const file = useImageFile(image.path, null);
  return <ImagePreview path={image.path!} file={file} tokens={tokens} />;
}
export function ImageResultCard({ images, tokens }: { images: ImageResult[]; tokens: ExtendedThemeTokens }) {
  const [open, setOpen] = useState(false);
  return <View style={{ gap: 8 }}>
    <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${open ? "收起" : "查看"}截图 ${images.length} 张`} onPress={() => setOpen(v => !v)}
      style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, backgroundColor: tokens.accentBg, alignSelf: "flex-start" }}>
      <Glyph name="Image" size={15} color={tokens.accent} />
      <Text style={{ fontSize: 12, fontFamily: tokens.fontUi, color: tokens.accent }}>截图 {images.length} 张</Text>
      <Text style={{ fontSize: 11, color: tokens.foregroundMuted }}>{open ? "收起" : "点击查看"}</Text>
    </Pressable>
    {open && images.map((image, i) => image.path ? <LocalImage key={`${image.uri}/${i}`} image={image} tokens={tokens} /> :
      <ZoomableImage key={`${image.uri}/${i}`} uri={image.uri} label={image.label} tokens={tokens} style={{ width: "100%", height: 240 }} />)}
  </View>;
}
export function ImageResultRenderer(props: PluginTimelineItemProps<{ images: ImageResult[] }>) {
  const preferences = useEnhancerPreferences();
  const tokens = useMemo(() => buildThemeTokens(props.theme.colors, preferences), [props.theme.colors, preferences]);
  const meta = useMemo<ActivityMeta>(() => ({ scope: `${props.host.id}/${props.agentId}`, kind: "image", state: "completed", images: props.item.data.images.length }), [props.host.id, props.agentId, props.item.data.images.length]);
  return <ActivityRow {...props} meta={meta}><ImageResultCard images={props.item.data.images} tokens={tokens} /></ActivityRow>;
}
