/** Presentation-only grouping of mounted desktop/web rows. No session API. */
import { clearPresentationState, getGroupExpanded, setGroupExpanded } from "./presentation-state";
export interface ActivityMeta {
  scope: string;
  kind: "tool" | "reasoning" | "image";
  state: "completed" | "running" | "failed" | "canceled";
  interactive?: boolean;
  images?: number;
}
export interface ActivityCounts { tools: number; reasoning: number; images: number; running: number; failed: number; canceled: number }
export interface ActivityState {
  role: "single" | "leader" | "member";
  expanded: boolean;
  counts?: ActivityCounts;
}
export const SINGLE: ActivityState = { role: "single", expanded: true };
interface Entry { row: HTMLElement; meta: ActivityMeta; notify: (state: ActivityState) => void; state: ActivityState; leader?: HTMLElement }
const ROW = "data-history-row-id";
const HIDDEN = "data-bc-activity-hidden";

export function activityCounts(items: readonly ActivityMeta[]): ActivityCounts {
  const counts: ActivityCounts = { tools: 0, reasoning: 0, images: 0, running: 0, failed: 0, canceled: 0 };
  for (const item of items) {
    if (item.kind === "tool") counts.tools++;
    else if (item.kind === "reasoning") counts.reasoning++;
    else counts.images += item.images ?? 1;
    if (item.state === "running") counts.running++;
    if (item.state === "failed") counts.failed++;
    if (item.state === "canceled") counts.canceled++;
  }
  return counts;
}

export function activityLabel(counts: ActivityCounts): string {
  return [counts.tools && `调用 ${counts.tools} 次`, counts.reasoning && `思考 ${counts.reasoning} 段`, counts.images && `截图 ${counts.images} 张`].filter(Boolean).join(" · ");
}

/** One observer per mounted row container, one pass per structural/status frame. */
export class ActivityRows {
  private entries = new Map<HTMLElement, Entry>();
  private frame: number | null = null;
  private observer: MutationObserver;
  private disposed = false;
  constructor(private host: HTMLElement, private onEmpty: () => void = () => {}) {
    this.observer = new MutationObserver(records => {
      // Ignore text/output changes and our own hiding attributes. Grouping only
      // needs direct row order and virtualization transitions.
      if (records.some(r => r.target === host || (r.type === "attributes" && (r.target as Element).parentElement === host))) this.schedule();
    });
    this.observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-index"] });
  }
  register(row: HTMLElement, meta: ActivityMeta, notify: Entry["notify"]) {
    const entry: Entry = { row, meta, notify, state: SINGLE };
    this.entries.set(row, entry);
    this.schedule();
    return {
      update: (next: ActivityMeta) => {
        if (JSON.stringify(entry.meta) === JSON.stringify(next)) return;
        entry.meta = next; this.schedule();
      },
      toggle: () => {
        const leader = entry.leader;
        if (!leader) return;
        const key = leader.getAttribute(ROW)!;
        setGroupExpanded(entry.meta.scope, key, !getGroupExpanded(entry.meta.scope, key)); this.schedule();
      },
      remove: () => {
        if (this.entries.get(row) !== entry) return;
        this.entries.delete(row); row.removeAttribute(HIDDEN); this.schedule();
        if (!this.entries.size) { this.dispose(); this.onEmpty(); }
      },
    };
  }
  private schedule() {
    if (this.disposed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => { this.frame = null; this.rebuild(); });
  }
  private publish(entry: Entry, state: ActivityState, leader?: HTMLElement) {
    entry.leader = leader;
    const hidden = state.role === "member" && !state.expanded;
    if (hidden) entry.row.setAttribute(HIDDEN, "true");
    else entry.row.removeAttribute(HIDDEN);
    if (JSON.stringify(entry.state) !== JSON.stringify(state)) { entry.state = state; entry.notify(state); }
  }
  private rebuild() {
    let run: Entry[] = [];
    const visited = new Set<Entry>();
    const flush = () => {
      const first = run[0];
      if (!first) return;
      if (run.length === 1) this.publish(first, SINGLE);
      else {
        const key = first.row.getAttribute(ROW)!;
        const expanded = getGroupExpanded(first.meta.scope, key);
        const counts = activityCounts(run.map(e => e.meta));
        run.forEach((entry, index) => this.publish(entry, { role: index ? "member" : "leader", expanded, ...(index ? {} : { counts }) }, first.row));
      }
      run = [];
    };
    for (const child of Array.from(this.host.children)) {
      const entry = this.entries.get(child as HTMLElement);
      // Virtualized history is deliberately left alone: hiding an absolute
      // row would corrupt the host virtualizer's measurement/scroll estimates.
      if (!entry || child.hasAttribute("data-index") || entry.meta.interactive) {
        flush();
        if (entry) { visited.add(entry); this.publish(entry, SINGLE); }
        continue;
      }
      if (run.length && run[0]!.meta.scope !== entry.meta.scope) flush();
      // Loading older history must not absorb an existing group into a new
      // leader: that loses its expansion choice and shifts the reading row.
      if (run.length && entry.state.role === "leader" && run[0]!.leader !== entry.row) flush();
      visited.add(entry); run.push(entry);
    }
    flush();
    for (const entry of this.entries.values()) if (!visited.has(entry)) this.publish(entry, SINGLE);
  }
  dispose() {
    this.disposed = true; this.observer.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    for (const entry of this.entries.values()) this.publish(entry, SINGLE);
    this.entries.clear();
  }
}

const hosts = new Map<HTMLElement, ActivityRows>();
export function registerActivity(element: HTMLElement, meta: ActivityMeta, notify: Entry["notify"]) {
  const row = element.closest<HTMLElement>(`[${ROW}]`);
  const host = row?.parentElement;
  if (!row || !host || !row.closest('[data-testid="agent-chat-scroll"]')) return null;
  let rows = hosts.get(host);
  if (!rows) { rows = new ActivityRows(host, () => hosts.delete(host)); hosts.set(host, rows); }
  return rows.register(row, meta, notify);
}

export function installActivityGroups(): () => void {
  if (typeof document === "undefined") return () => {};
  const style = document.createElement("style");
  style.id = "bc-activity-groups";
  style.textContent = '[data-testid="agent-chat-scroll"] [data-history-row-id][data-bc-activity-hidden="true"] { display: none !important; }';
  document.head.append(style);
  return () => { for (const rows of hosts.values()) rows.dispose(); hosts.clear(); clearPresentationState(); style.remove(); };
}
