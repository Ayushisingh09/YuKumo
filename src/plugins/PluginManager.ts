import type { Plugin, LifecycleHookPipeline } from "./Plugin.ts";
import type { TrackData } from "../types/protocol.ts";
import type { SearchResult } from "../types/internal.ts";
import { PluginError } from "../errors/index.ts";

export class PluginManager {
  private readonly plugins: Map<string, Plugin> = new Map();
  private readonly hookHandlers: {
    [K in keyof Required<LifecycleHookPipeline>]: NonNullable<LifecycleHookPipeline[K]>[];
  } = {
    beforeSearch: [],
    afterSearch: [],
    beforeConnect: [],
    afterConnect: [],
    beforePlay: [],
    afterPlay: [],
    beforeDestroy: [],
    afterDestroy: [],
    onNodeSelect: [],
  };

  public register(plugin: Plugin): void {
    if (this.plugins.has(plugin.name)) {
      throw new PluginError(`Plugin "${plugin.name}" is already registered`, plugin.name);
    }

    this.plugins.set(plugin.name, plugin);

    if (plugin.init != null) {
      this.callInit(plugin);
    }
  }

  public unregister(name: string): boolean {
    const plugin = this.plugins.get(name);
    if (plugin === undefined) return false;

    if (plugin.destroy != null) {
      this.callDestroy(plugin);
    }

    this.plugins.delete(name);
    return true;
  }

  public get(name: string): Plugin | undefined {
    return this.plugins.get(name);
  }

  public getAll(): Plugin[] {
    return Array.from(this.plugins.values());
  }

  public async startAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.start != null) {
        try {
          await plugin.start();
        } catch (error) {
          throw new PluginError(
            `Plugin "${plugin.name}" failed to start: ${(error as Error).message}`,
            plugin.name,
          );
        }
      }
    }
  }

  public async destroyAll(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      if (plugin.destroy != null) {
        try {
          await plugin.destroy();
        } catch {
          // ignore destroy errors
        }
      }
    }
    this.plugins.clear();
  }

  public addHook<K extends keyof LifecycleHookPipeline>(
    hook: K,
    handler: NonNullable<LifecycleHookPipeline[K]>,
  ): void {
    const handlers = this.hookHandlers[hook] as NonNullable<LifecycleHookPipeline[K]>[];
    handlers.push(handler);
  }

  public removeHook<K extends keyof LifecycleHookPipeline>(
    hook: K,
    handler: NonNullable<LifecycleHookPipeline[K]>,
  ): void {
    const handlers = this.hookHandlers[hook] as NonNullable<LifecycleHookPipeline[K]>[];
    const index = handlers.indexOf(handler);
    if (index >= 0) {
      handlers.splice(index, 1);
    }
  }

  public async runBeforeSearch(
    query: string,
    source?: string,
  ): Promise<{ query: string; source?: string } | null> {
    let current: { query: string; source?: string } = { query, source };
    for (const handler of this.hookHandlers.beforeSearch) {
      const result = await handler(current.query, current.source);
      if (result === null) return null;
      current = result;
    }
    return current;
  }

  public async runAfterSearch(result: SearchResult): Promise<SearchResult | null> {
    let current = result;
    for (const handler of this.hookHandlers.afterSearch) {
      const modified = await handler(current);
      if (modified === null) return null;
      current = modified;
    }
    return current;
  }

  public async runBeforeConnect(
    guildId: string,
    channelId: string,
  ): Promise<{ guildId: string; channelId: string } | null> {
    let current = { guildId, channelId };
    for (const handler of this.hookHandlers.beforeConnect) {
      const result = await handler(current.guildId, current.channelId);
      if (result === null) return null;
      current = result;
    }
    return current;
  }

  public async runAfterConnect(guildId: string, channelId: string): Promise<void> {
    for (const handler of this.hookHandlers.afterConnect) {
      await handler(guildId, channelId);
    }
  }

  public async runBeforePlay(guildId: string, track: TrackData): Promise<TrackData | null> {
    let current = track;
    for (const handler of this.hookHandlers.beforePlay) {
      const result = await handler(guildId, current);
      if (result === null) return null;
      current = result;
    }
    return current;
  }

  public async runAfterPlay(guildId: string, track: TrackData): Promise<void> {
    for (const handler of this.hookHandlers.afterPlay) {
      await handler(guildId, track);
    }
  }

  public async runBeforeDestroy(guildId: string): Promise<boolean> {
    for (const handler of this.hookHandlers.beforeDestroy) {
      const shouldContinue = await handler(guildId);
      if (!shouldContinue) return false;
    }
    return true;
  }

  public async runAfterDestroy(guildId: string): Promise<void> {
    for (const handler of this.hookHandlers.afterDestroy) {
      await handler(guildId);
    }
  }

  public async runOnNodeSelect(guildId: string, availableNodes: string[]): Promise<string | null> {
    for (const handler of this.hookHandlers.onNodeSelect) {
      const result = await handler(guildId, availableNodes);
      if (result != null) return result;
    }
    return null;
  }

  private async callInit(plugin: Plugin): Promise<void> {
    try {
      await plugin.init!();
    } catch (error) {
      throw new PluginError(
        `Plugin "${plugin.name}" failed to initialize: ${(error as Error).message}`,
        plugin.name,
      );
    }
  }

  private async callDestroy(plugin: Plugin): Promise<void> {
    try {
      await plugin.destroy!();
    } catch {
      // ignore destroy errors
    }
  }
}
