import React, { createContext, useCallback, useContext, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";

/** Small UI values only, scoped by host / agent / source row. Never message bodies. */
class PresentationStates {
  private values = new Map<string, unknown>();
  private listeners = new Map<string, Set<() => void>>();
  get(key: string) { return this.values.get(key); }
  set(key: string, value: unknown) {
    if (this.values.has(key) && Object.is(this.values.get(key), value)) return;
    this.values.delete(key); this.values.set(key, value);
    for (const notify of this.listeners.get(key) ?? []) notify();
    if (this.values.size > 2048) for (const candidate of this.values.keys()) {
      if (!this.listeners.has(candidate)) this.values.delete(candidate);
      if (this.values.size <= 2048) break;
    }
  }
  subscribe(key: string, notify: () => void) {
    let listeners = this.listeners.get(key);
    if (!listeners) this.listeners.set(key, listeners = new Set());
    listeners.add(notify);
    return () => { listeners.delete(notify); if (!listeners.size) this.listeners.delete(key); };
  }
  clear() {
    this.values.clear();
    for (const listeners of this.listeners.values()) for (const notify of listeners) notify();
  }
}
const states = new PresentationStates();
export function clearPresentationState() { states.clear(); }
export function getGroupExpanded(scope: string, row: string): boolean {
  return states.get(JSON.stringify(["group", scope, row])) === true;
}
export function setGroupExpanded(scope: string, row: string, expanded: boolean) {
  states.set(JSON.stringify(["group", scope, row]), expanded);
}
const Scope = createContext<string | null>(null);
export const PresentationScope = Scope.Provider;

/** Restores before paint when a virtual row mounts again. No disk persistence. */
export function usePresentationState<T>(slot: string, initial: T): [T, (next: T | ((previous: T) => T)) => void] {
  const scope = useContext(Scope);
  const key = scope ? JSON.stringify([scope, slot]) : null;
  const [local, setLocal] = useState(initial);
  const fallback = useMemo(() => initial, [key]);
  const get = useCallback(() => key ? (states.get(key) as T | undefined) ?? fallback : local, [key, fallback, local]);
  const subscribe = useCallback((notify: () => void) => key ? states.subscribe(key, notify) : () => {}, [key]);
  const value = useSyncExternalStore(subscribe, get, get);
  useLayoutEffect(() => { if (key && states.get(key) === undefined) states.set(key, fallback); }, [key, fallback]);
  const set = useCallback((next: T | ((previous: T) => T)) => {
    const resolved = typeof next === "function" ? (next as (previous: T) => T)(get()) : next;
    if (key) states.set(key, resolved); else setLocal(resolved);
  }, [key, get]);
  return [value, set];
}
