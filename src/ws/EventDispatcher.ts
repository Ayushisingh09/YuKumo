import type { EventName, EventCallback } from "../types/internal.ts";

type ListenerEntry = {
  callback: EventCallback<EventName>;
  once: boolean;
};

export class EventDispatcher {
  private readonly listeners = new Map<string, ListenerEntry[]>();

  /**
   * Called when a listener throws or returns a rejecting promise.
   * One bad listener still can't break the others, but the failure is
   * surfaced here instead of vanishing (or becoming an unhandled rejection).
   */
  public onListenerError?: (event: string, error: unknown) => void;

  public on<E extends EventName>(event: E, callback: EventCallback<E>): this {
    const entries = this.listeners.get(event) ?? [];
    entries.push({ callback: callback as EventCallback<EventName>, once: false });
    this.listeners.set(event, entries);
    return this;
  }

  public once<E extends EventName>(event: E, callback: EventCallback<E>): this {
    const entries = this.listeners.get(event) ?? [];
    entries.push({ callback: callback as EventCallback<EventName>, once: true });
    this.listeners.set(event, entries);
    return this;
  }

  public off<E extends EventName>(event: E, callback?: EventCallback<E>): this {
    if (callback === undefined) {
      this.listeners.delete(event);
      return this;
    }

    const entries = this.listeners.get(event);
    if (entries === undefined) return this;

    const filtered = entries.filter((e) => e.callback !== callback);
    if (filtered.length === 0) {
      this.listeners.delete(event);
    } else {
      this.listeners.set(event, filtered);
    }

    return this;
  }

  public emit<E extends EventName>(event: E, ...args: Parameters<EventCallback<E>>): void {
    const entries = this.listeners.get(event);
    if (entries === undefined) return;

    const toRemove: ListenerEntry[] = [];

    for (const entry of entries) {
      try {
        const result = (entry.callback as (...a: unknown[]) => unknown)(...args);
        if (result != null && typeof (result as Promise<unknown>).then === "function") {
          (result as Promise<unknown>).then(undefined, (error: unknown) => {
            this.onListenerError?.(event, error);
          });
        }
      } catch (error) {
        this.onListenerError?.(event, error);
      }

      if (entry.once) {
        toRemove.push(entry);
      }
    }

    if (toRemove.length > 0) {
      const remaining = entries.filter((e) => !toRemove.includes(e));
      if (remaining.length === 0) {
        this.listeners.delete(event);
      } else {
        this.listeners.set(event, remaining);
      }
    }
  }

  public removeAllListeners(): void {
    this.listeners.clear();
  }

  public listenerCount(event: EventName): number {
    return this.listeners.get(event)?.length ?? 0;
  }
}
