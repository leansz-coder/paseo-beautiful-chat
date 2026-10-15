import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { type ViewProps, Platform, Pressable, Text, View } from "react-native";
import type { PluginTimelineItemProps } from "@getpaseo/plugin/client";
import { activityLabel, registerActivity, SINGLE, type ActivityMeta, type ActivityState } from "./activity-groups";
import { useEnhancerPreferences } from "./preferences";
import { buildThemeTokens, withAlpha } from "./components/theme-tokens";
import { Glyph } from "./components/glyph";
import { LiveToolCallRenderer, LiveReasoningRenderer, type LiveToolCallPayload, type LiveReasoningPayload } from "./live-renderers";
import { isInteractiveTool, toolActivityState } from "./tool-grouping";
import { PresentationScope } from "./presentation-state";
import { presentationScopeForRow } from "./web";

export function ActivityRow({ meta, children, ...props }: PluginTimelineItemProps<unknown> & { meta: ActivityMeta; children: React.ReactNode }) {
  const preferences = useEnhancerPreferences();
  const tokens = useMemo(() => buildThemeTokens(props.theme.colors, preferences), [props.theme.colors, preferences]);
  const enabled = preferences.groupToolCalls && Platform.OS === "web" && typeof document !== "undefined";
  const element = useRef<View>(null);
  const registration = useRef<ReturnType<typeof registerActivity>>(null);
  const [state, setState] = useState<ActivityState>(SINGLE);
  const [presentationScope, setPresentationScope] = useState<string | null>(null);
  useLayoutEffect(() => {
    setPresentationScope(presentationScopeForRow(element.current, props.host.id, props.agentId));
  }, [props.host.id, props.agentId]);
  useLayoutEffect(() => {
    const node = element.current;
    if (!enabled || !(node instanceof HTMLElement)) { setState(SINGLE); return; }
    registration.current = registerActivity(node, meta, setState);
    return () => { registration.current?.remove(); registration.current = null; };
  }, [enabled, meta.scope]);
  useLayoutEffect(() => { registration.current?.update(meta); }, [meta]);
  const visibleState = enabled ? state : SINGLE;
  const counts = visibleState.counts;
  const expanded = visibleState.expanded;
  const label = counts ? activityLabel(counts) : "";
  const badges = counts ? [counts.running ? `${counts.running} 进行中` : "", counts.failed ? `${counts.failed} 失败` : "", counts.canceled ? `${counts.canceled} 已取消` : ""].filter(Boolean).join(" · ") : "";
  return <View ref={element} {...({ dataSet: { bcActivity: "true" } } as unknown as ViewProps)}>
    {visibleState.role === "leader" && counts && <Pressable accessibilityRole="button" accessibilityLabel={`${expanded ? "收起" : "展开"}执行过程：${label}${badges ? ` · ${badges}` : ""}`} accessibilityState={{ expanded }} onPress={() => registration.current?.toggle()}
      style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", paddingHorizontal: 13, paddingVertical: 11, borderRadius: 11, borderWidth: 1, borderColor: withAlpha(tokens.accent, .16), backgroundColor: withAlpha(tokens.accent, tokens.isDark ? .055 : .04) }}>
      <Glyph name="Layers" size={16} color={tokens.accent} />
      <Text style={{ color: tokens.foreground, fontFamily: tokens.fontUi, fontSize: 13, flexShrink: 1 }}>{label}</Text>
      <View style={{ flex: 1 }} />
      {counts.running > 0 && <Text style={{ color: tokens.accent, fontSize: 11 }}>{counts.running} 进行中</Text>}
      {counts.failed > 0 && <Text style={{ color: tokens.danger, backgroundColor: tokens.dangerBg, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 6, fontSize: 11 }}>{counts.failed} 失败</Text>}
      {counts.canceled > 0 && <Text style={{ color: tokens.warning, fontSize: 11 }}>{counts.canceled} 已取消</Text>}
      <Glyph name={expanded ? "ChevronUp" : "ChevronDown"} size={14} color={tokens.foregroundMuted} />
    </Pressable>}
    {expanded && <PresentationScope value={presentationScope}><View style={visibleState.role === "leader" ? { marginTop: 10 } : undefined}>{children}</View></PresentationScope>}
  </View>;
}

export function GroupedToolCallRenderer(props: PluginTimelineItemProps<LiveToolCallPayload>) {
  const data = props.item.data;
  const meta = useMemo<ActivityMeta>(() => ({ scope: `${props.host.id}/${props.agentId}`, kind: "tool", state: toolActivityState(data), interactive: isInteractiveTool(data) }), [props.host.id, props.agentId, data]);
  return <ActivityRow {...props} meta={meta}><LiveToolCallRenderer {...props} /></ActivityRow>;
}

export function GroupedReasoningRenderer(props: PluginTimelineItemProps<LiveReasoningPayload>) {
  const meta = useMemo<ActivityMeta>(() => ({ scope: `${props.host.id}/${props.agentId}`, kind: "reasoning", state: props.item.data.phase === "streaming" ? "running" : "completed" }), [props.host.id, props.agentId, props.item.data.phase]);
  return <ActivityRow {...props} meta={meta}><LiveReasoningRenderer {...props} /></ActivityRow>;
}
