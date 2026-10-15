/** Tail state is local to a conversation. Only the old and new tail can change. */
export class TimelineTails {
  private tails = new Map<string, { key: string; at: number }>();
  private listeners = new Map<string, Map<string, Set<() => void>>>();

  get(agentId: string): string | null {
    return this.tails.get(agentId)?.key ?? null;
  }

  note(agentId: string, key: string, at: number): void {
    const previous = this.tails.get(agentId);
    if (previous && (at < previous.at || (at === previous.at && key !== previous.key))) return;
    if (previous?.key === key && previous.at === at) return;
    this.tails.set(agentId, { key, at });
    if (previous?.key !== key) {
      if (previous) this.publish(agentId, previous.key);
      this.publish(agentId, key);
    }
    // Retain a bounded history for remounts, but never evict a mounted conversation.
    if (this.tails.size > 256) {
      for (const id of this.tails.keys()) {
        if (!this.listeners.has(id)) this.tails.delete(id);
        if (this.tails.size <= 256) break;
      }
    }
  }

  subscribe(agentId: string, key: string, listener: () => void): () => void {
    let agent = this.listeners.get(agentId);
    if (!agent) this.listeners.set(agentId, (agent = new Map()));
    let listeners = agent.get(key);
    if (!listeners) agent.set(key, (listeners = new Set()));
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) agent.delete(key);
      if (agent.size === 0) this.listeners.delete(agentId);
    };
  }

  private publish(agentId: string, key: string): void {
    for (const listener of this.listeners.get(agentId)?.get(key) ?? []) listener();
  }
}
