import { useCallback, useSyncExternalStore } from "react";
import { TimelineTails } from "./timeline-tails";

const tails = new TimelineTails();

export function noteTimelineItem(agentId: string, key: string, at: number): void {
  tails.note(agentId, key, at);
}

export function getTimelineTail(agentId: string): string | null {
  return tails.get(agentId);
}

export function useIsTimelineTail(agentId: string, key: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => tails.subscribe(agentId, key, listener),
    [agentId, key],
  );
  const getSnapshot = useCallback(() => tails.get(agentId) === key, [agentId, key]);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
