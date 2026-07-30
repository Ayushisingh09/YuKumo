import { NodeManager } from "./node/NodeManager.ts";
import { PlayerManager } from "./player/PlayerManager.ts";
import { PluginManager } from "./plugins/PluginManager.ts";
import { EventDispatcher } from "./ws/EventDispatcher.ts";
import { MemoryStorage } from "./storage/MemoryStorage.ts";
import { VoiceStateTracker } from "./voice/VoiceStateTracker.ts";
import { PluginError } from "./errors/index.ts";
import type { Node } from "./node/Node.ts";
import type { Player } from "./player/Player.ts";
import type { Plugin } from "./plugins/Plugin.ts";
import type {
  NodeConfig,
  ManagerOptions,
  SearchOptions,
  SearchResult,
  StorageAdapter,
  VoiceStateUpdate,
  VoiceServerUpdate,
  EventName,
  EventCallback,
} from "./types/internal.ts";
import type { TrackData, LoadResult } from "./types/protocol.ts";

export interface YuKumoPlayerCreateOptions {
  guildId: string;
  voiceChannelId: string;
  textChannelId?: string;
  selfDeaf?: boolean;
  selfMute?: boolean;
  nodeId?: string;
}

function loadResultToSearchResult(result: LoadResult): SearchResult {
  switch (result.loadType) {
    case "track":
      return { loadType: "track", tracks: [result.data] };
    case "playlist":
      return {
        loadType: "playlist",
        tracks: result.data.tracks,
        playlistInfo: { name: result.data.info.name, selectedTrack: 0 },
      };
    case "search":
      return { loadType: "search", tracks: result.data };
    case "empty":
      return { loadType: "empty", tracks: [] };
    case "error":
      return {
        loadType: "error",
        tracks: [],
        exception: {
          message: result.data.message,
          severity: result.data.severity,
          cause: result.data.cause,
        },
      };
  }
}

function formatSourcePrefix(source: string): string {
  const lower = source.toLowerCase().trim();
  const map: Record<string, string> = {
    youtube: "ytsearch",
    yt: "ytsearch",
    youtubemusic: "ytmsearch",
    ytm: "ytmsearch",
    soundcloud: "scsearch",
    sc: "scsearch",
    spotify: "spsearch",
    sp: "spsearch",
    applemusic: "amsearch",
    am: "amsearch",
    deezer: "dzsearch",
    dz: "dzsearch",
    yandex: "ymsearch",
    ym: "ymsearch",
  };
  if (map[lower]) return map[lower];
  if (lower.endsWith("search")) return lower;
  return `${source}search`;
}

function buildIdentifier(query: string, source?: string, defaultSearchSource: string = "ytsearch"): string {
  if (/^https?:\/\//i.test(query)) {
    return query;
  }
  if (/^[a-zA-Z0-9]+:/.test(query)) {
    return query;
  }
  if (source != null && source.trim() !== "") {
    const prefix = formatSourcePrefix(source);
    return `${prefix}:${query}`;
  }
  const defaultPrefix = formatSourcePrefix(defaultSearchSource);
  return `${defaultPrefix}:${query}`;
}

export class YuKumo {
  public readonly nodes: NodeManager;
  public readonly players: PlayerManager;
  public readonly plugins: PluginManager;
  public readonly events: EventDispatcher;
  public readonly storage: StorageAdapter;
  public readonly voice: VoiceStateTracker;
  public defaultSearchSource: string;
  private _userId: string;

  public constructor(options: ManagerOptions) {
    this._userId = options.userId ?? "";
    this.defaultSearchSource = options.defaultSearchSource ?? "ytsearch";
    this.storage = options.storageAdapter ?? new MemoryStorage();
    this.events = new EventDispatcher();
    this.voice = new VoiceStateTracker(this.events);
    this.plugins = new PluginManager();
    this.players = new PlayerManager();
    this.nodes = new NodeManager(this._userId);

    this.registerNodes(options.nodes);
    this.registerPlugins(options.plugins);
  }

  public setUserId(userId: string): void {
    this._userId = userId;
    this.nodes.setUserId(userId);
  }

  public async init(): Promise<void> {
    await this.nodes.connectAll();
    await this.plugins.startAll();
  }

  public async destroy(): Promise<void> {
    await this.players.destroyAll();
    await this.nodes.destroyAll();
    await this.plugins.destroyAll();
    for (const guildId of this.voice.getAll().map((s) => s.guildId)) {
      this.voice.remove(guildId);
    }
    this.events.removeAllListeners();
  }

  public async search(queryOrOptions: string | SearchOptions, source?: string): Promise<SearchResult> {
    const resolved: SearchOptions =
      typeof queryOrOptions === "string" ? { query: queryOrOptions, source } : queryOrOptions;

    const hookResult = await this.plugins.runBeforeSearch(resolved.query, resolved.source);
    if (hookResult === null) {
      return { loadType: "empty", tracks: [] };
    }

    const nodeName = resolved.nodeName;
    const node = nodeName != null ? this.nodes.get(nodeName) : this.nodes.pick(resolved.query);
    if (node == null) {
      return { loadType: "empty", tracks: [] };
    }

    try {
      const identifier = buildIdentifier(hookResult.query, hookResult.source, this.defaultSearchSource);
      const result = await node.rest.loadTracks(identifier);
      const searchResult = loadResultToSearchResult(result);

      const afterResult = await this.plugins.runAfterSearch(searchResult);
      if (afterResult === null) {
        return { loadType: "empty", tracks: [] };
      }

      return afterResult;
    } catch (err: any) {
      return {
        loadType: "error",
        tracks: [],
        exception: {
          message: err?.message ?? "Failed to connect to Lavalink REST endpoint",
          severity: "fault",
          cause: String(err),
        },
      };
    }
  }

  public async createPlayer(options: YuKumoPlayerCreateOptions): Promise<Player> {
    const existing = this.players.get(options.guildId);
    if (existing != null) return existing;

    const hookResult = await this.plugins.runBeforeConnect(options.guildId, options.voiceChannelId);
    if (hookResult === null) {
      throw new PluginError(`Player creation for guild ${options.guildId} was cancelled by a plugin`, "YuKumo");
    }

    const nodeId = options.nodeId;
    const node = nodeId != null ? this.nodes.get(nodeId) : this.nodes.pick(options.guildId);
    if (node == null) {
      throw new Error("No available nodes to create player");
    }

    const player = this.players.create({
      guildId: hookResult.guildId,
      node,
      voiceChannelId: hookResult.channelId,
      textChannelId: options.textChannelId,
      selfDeaf: options.selfDeaf,
      selfMute: options.selfMute,
    });

    this.events.emit("playerCreate", options.guildId);
    await this.plugins.runAfterConnect(options.guildId, options.voiceChannelId);

    player.events.on("queueEnd", (guildId: string) => this.events.emit("queueEnd", guildId));

    return player;
  }

  public async play(guildId: string, track: TrackData): Promise<void> {
    const player = this.players.get(guildId);
    if (player == null) throw new Error(`No player found for guild ${guildId}`);

    const hookResult = await this.plugins.runBeforePlay(guildId, track);
    if (hookResult === null) return;

    player.queue.enqueue(hookResult);
    if (player.status === "idle") {
      await player.play();
    }

    await this.plugins.runAfterPlay(guildId, hookResult);
  }

  public async pause(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    if (player == null) throw new Error(`No player found for guild ${guildId}`);
    await player.pause();
  }

  public async resume(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    if (player == null) throw new Error(`No player found for guild ${guildId}`);
    await player.resume();
  }

  public async stop(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    if (player == null) throw new Error(`No player found for guild ${guildId}`);
    await player.stop();
  }

  public async skip(guildId: string): Promise<TrackData | null> {
    const player = this.players.get(guildId);
    if (player == null) throw new Error(`No player found for guild ${guildId}`);

    await player.stop();

    const next = player.queue.next();
    if (next != null) {
      await player.playTrack(next);
    } else {
      return null;
    }

    return next;
  }

  public async setVolume(guildId: string, volume: number): Promise<void> {
    const player = this.players.get(guildId);
    if (player == null) throw new Error(`No player found for guild ${guildId}`);
    await player.setVolume(volume);
  }

  public async destroyPlayer(guildId: string): Promise<boolean> {
    const shouldDestroy = await this.plugins.runBeforeDestroy(guildId);
    if (!shouldDestroy) return false;

    const result = await this.players.destroy(guildId);
    if (result) {
      this.events.emit("playerDestroy", guildId);
      await this.plugins.runAfterDestroy(guildId);
    }
    return result;
  }

  public async handleVoiceStateUpdate(data: VoiceStateUpdate): Promise<void> {
    this.voice.handleVoiceStateUpdate(data);

    const player = this.players.get(data.guildId);
    if (player == null) return;

    if (data.channelId == null) {
      await this.destroyPlayer(data.guildId);
      return;
    }

    if (data.userId == null) return;

    player.updateVoiceState({ sessionId: data.sessionId, channelId: data.channelId });
  }

  public async handleVoiceServerUpdate(guildId: string, data: VoiceServerUpdate): Promise<void> {
    this.voice.handleVoiceServerUpdate(guildId, data);

    const player = this.players.get(guildId);
    if (player == null) return;

    player.updateVoiceState({ token: data.token, endpoint: data.endpoint });
  }

  public getPlayer(guildId: string): Player | undefined {
    return this.players.get(guildId);
  }

  public getPlayers(): Player[] {
    return this.players.getAll();
  }

  public hasPlayer(guildId: string): boolean {
    return this.players.has(guildId);
  }

  public getNode(id: string): Node | undefined {
    return this.nodes.get(id);
  }

  public getNodes(): Node[] {
    return this.nodes.getAll();
  }

  public on<E extends EventName>(event: E, callback: EventCallback<E>): this {
    this.events.on(event, callback);
    return this;
  }

  private registerNodes(configs: NodeConfig[]): void {
    for (const config of configs) {
      const node = this.nodes.add(config);
      this.bindNodeEvents(node);
    }
  }

  private bindNodeEvents(node: Node): void {
    const ws = node.ws.eventDispatcher;
    ws.on("nodeReady", (nodeId: string) => this.events.emit("nodeReady", nodeId));
    ws.on("nodeDisconnected", (nodeId: string, code: number, reason: string) =>
      this.events.emit("nodeDisconnected", nodeId, code, reason)
    );
    ws.on("nodeReconnected", (nodeId: string) => this.events.emit("nodeReconnected", nodeId));
    ws.on("nodeError", (nodeId: string, error: Error) => this.events.emit("nodeError", nodeId, error));
    ws.on("stats", (nodeId: string, stats: any) => this.events.emit("stats", nodeId, stats));
    ws.on("debug", (msg: string) => this.events.emit("debug", msg));
    ws.on("trackStart", (guildId: string, track: TrackData) => this.events.emit("trackStart", guildId, track));
    ws.on("trackEnd", (guildId: string, track: TrackData, reason: string) =>
      this.events.emit("trackEnd", guildId, track, reason)
    );
    ws.on("trackStuck", (guildId: string, track: TrackData, thresholdMs: number) =>
      this.events.emit("trackStuck", guildId, track, thresholdMs)
    );
    ws.on("trackException", (guildId: string, track: TrackData, exception: unknown) =>
      this.events.emit("trackException", guildId, track, exception)
    );
    ws.on("playerUpdate", (guildId: string, state: { time: number; position: number; connected: boolean; ping: number }) =>
      this.events.emit("playerUpdate", guildId, state)
    );
  }

  private registerPlugins(
    pluginDefs?: Array<{
      name: string;
      version: string;
      init?(manager: unknown): void | Promise<void>;
      start?(): void | Promise<void>;
      destroy?(): void | Promise<void>;
    }>,
  ): void {
    if (pluginDefs == null) return;

    for (const def of pluginDefs) {
      const plugin: Plugin = {
        name: def.name,
        version: def.version,
        start: def.start,
        destroy: def.destroy,
      };
      this.plugins.register(plugin);
    }
  }
}
