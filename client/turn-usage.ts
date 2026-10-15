import { useEffect, useState } from "react";
import type { TurnUsage } from "./components/user-message";

const REFRESH_MS = 2000;
type UsageResult = { agent: { lastUsage?: TurnUsage | null } } | null | undefined;
type ReadHandle = { refresh(): Promise<UsageResult> };

// Recently mounted prompt rows share one read per host/agent/status. A final
// reading must not borrow a request started while the agent was still running.
const reads = new WeakMap<object, Map<string, { until: number; pending: boolean; value: Promise<UsageResult> }>>();

export function readUsage(owner: object, key: string, handle: ReadHandle): Promise<UsageResult> {
  let cache = reads.get(owner);
  if (!cache) reads.set(owner, (cache = new Map()));
  const previous = cache.get(key);
  if (previous && (previous.pending || previous.until > Date.now())) return previous.value;
  const entry = { until: Date.now() + REFRESH_MS, pending: true, value: Promise.resolve().then(() => handle.refresh()) };
  cache.set(key, entry);
  const settled = () => {
    entry.pending = false;
    if (cache.size > 256) {
      for (const [id, candidate] of cache) {
        if (!candidate.pending && id !== key) cache.delete(id);
        if (cache.size <= 256) break;
      }
    }
  };
  void entry.value.then(settled, settled);
  return entry.value;
}

/** Read-only decoration: never starts, sends to, cancels or stops an agent. */
export function useTurnUsage(owner: object, agentId: string, handle: ReadHandle, observedLive: boolean, running: boolean) {
  const [usage, setUsage] = useState<TurnUsage | null>(null);
  const [frozen, setFrozen] = useState(false);
  useEffect(() => {
    if (!observedLive || frozen) return;
    let cancelled = false;
    const refresh = () => {
      void readUsage(owner, `${agentId}:${running ? "running" : "settled"}`, handle).then((result) => {
        if (cancelled || !result) return;
        const next = result.agent.lastUsage;
        if (next) setUsage(next);
        if (next && !running) setFrozen(true);
      }).catch(() => {});
    };
    refresh();
    const timer = running ? setInterval(refresh, REFRESH_MS) : undefined;
    return () => {
      cancelled = true;
      if (timer !== undefined) clearInterval(timer);
    };
  }, [owner, agentId, handle, observedLive, frozen, running]);
  return { usage, frozen };
}
