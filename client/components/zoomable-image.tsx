import React, { useState } from "react";
import { Image, Pressable, Text, View, useWindowDimensions, type ImageStyle, type StyleProp } from "react-native";
import { Modal, ScrollView } from "@getpaseo/plugin/client/react-native";
import type { ExtendedThemeTokens } from "./theme-tokens";

interface Props {
  uri: string;
  label: string;
  style: StyleProp<ImageStyle>;
  tokens: ExtendedThemeTokens;
  width?: number | null;
  height?: number | null;
}

/** Local presentation only: opening an image never sends anything to an agent. */
export function ZoomableImage(props: Props) {
  // Reset the viewer when a row is reused for a different image.
  return <ImageViewer key={props.uri} {...props} />;
}

function ImageViewer({ uri, label, style, tokens, width, height }: Props) {
  const window = useWindowDimensions();
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [viewport, setViewport] = useState(Math.min(560, Math.max(1, window.width - 48)));
  const [size, setSize] = useState({ width: width ?? 0, height: height ?? 0 });
  const [failed, setFailed] = useState(false);
  const valid = size.width > 0 && size.height > 0;
  const fit = valid ? Math.min(viewport / size.width, Math.max(120, window.height * 0.65) / size.height) : 1;
  const imageWidth = valid ? size.width * fit * zoom : viewport * zoom;
  const imageHeight = valid ? size.height * fit * zoom : 300 * zoom;
  const button = { padding: 10, borderRadius: 8, backgroundColor: tokens.surface2 };
  const close = (next: boolean) => { setOpen(next); if (!next) setZoom(1); };

  return <>
    <Pressable style={style} accessibilityRole="button" accessibilityLabel={`放大图片：${label}`} onPress={() => { setZoom(1); setOpen(true); }}>
      <Image source={{ uri }} style={{ width: "100%", height: "100%" }} resizeMode="contain" accessibilityLabel={label}
        onLoad={(event) => {
          const source = event.nativeEvent.source;
          if (source?.width > 0 && source.height > 0) setSize({ width: source.width, height: source.height });
          setFailed(false);
        }} onError={() => setFailed(true)} />
    </Pressable>
    {open && <Modal title={label} open={open} onOpenChange={close}>
      <Modal.Content contentContainerStyle={{ padding: 12, gap: 12 }} style={{ backgroundColor: tokens.surface0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <Pressable accessibilityRole="button" accessibilityLabel="缩小图片" disabled={zoom <= 1} onPress={() => setZoom(z => Math.max(1, z / 2))} style={button}><Text style={{ color: tokens.foreground }}>缩小</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="放大图片" disabled={zoom >= 8} onPress={() => setZoom(z => Math.min(8, z * 2))} style={button}><Text style={{ color: tokens.foreground }}>放大</Text></Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="图片适应窗口" onPress={() => setZoom(1)} style={button}><Text style={{ color: tokens.foreground }}>适应窗口</Text></Pressable>
          <Text style={{ color: tokens.foregroundMuted }}>{zoom}×</Text>
        </View>
        <View onLayout={event => { const next = event.nativeEvent.layout.width; if (next > 0) setViewport(next); }}>
          <ScrollView horizontal contentContainerStyle={{ minWidth: "100%", justifyContent: "center" }}>
            <Image source={{ uri }} style={{ width: imageWidth, height: imageHeight }} resizeMode="contain" accessibilityLabel={`${label}（放大预览）`} />
          </ScrollView>
        </View>
        {failed && <Text style={{ color: tokens.foregroundMuted }}>图片加载失败，请关闭后重试。</Text>}
      </Modal.Content>
    </Modal>}
  </>;
}
