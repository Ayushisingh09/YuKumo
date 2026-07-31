import type { LoadResult, TrackData } from "./protocol.ts";

export interface NodeConfig {
  host: string;
  port: number;
  password: string;
  name?: string;
  secure?: boolean;
  region?: string;
  resumeTimeout?: number;
  resumeKey?: string;
  maxRetries?: number;
  retryDelay?: number;
  retryDelayMax?: number;
}

export interface NodeStats {
  players: number;
  playingPlayers: number;
  uptime: number;
  memory: {
    free: number;
    used: number;
    allocated: number;
    reservable: number;
  };
  cpu: {
    cores: number;
    systemLoad: number;
    lavalinkLoad: number;
  };
  frameStats: {
    sent: number;
    nulled: number;
    deficit: number;
  } | null;
}

export type NodeState = "disconnected" | "connecting" | "connected" | "destroyed";

export interface ManagerOptions {
  nodes: NodeConfig[];
  userId?: string;
  defaultSearchSource?: string;
  defaultNodeSelector?: {
    pick: (
      nodes: Array<{ id: string; state: NodeState; penalties: { total: number }; playerCount: number }>,
      guildId: string,
    ) => { id: string } | null;
  };
  storageAdapter?: StorageAdapter;
  plugins?: Array<{
    name: string;
    version: string;
    init?(manager: unknown): void | Promise<void>;
    start?(): void | Promise<void>;
    destroy?(): void | Promise<void>;
  }>;
}

export type RepeatMode = "none" | "track" | "queue";

export interface InternalVoiceState {
  sessionId: string | null;
  channelId: string | null;
  endpoint: string | null;
  token: string | null;
}

export interface VoiceServerUpdate {
  token: string;
  endpoint: string;
}

export interface VoiceStateUpdate {
  sessionId: string;
  channelId: string | null;
  guildId: string;
  userId: string;
}

export interface SearchOptions {
  query: string;
  source?: string;
  nodeName?: string;
  requester?: unknown;
}

export interface SearchResult {
  loadType: LoadResult["loadType"];
  tracks: TrackData[];
  playlistInfo?: {
    name: string;
    selectedTrack: number;
  };
  exception?: {
    message: string | null;
    severity: string;
    cause: string;
  } | null;
  pluginInfo?: Record<string, unknown>;
}

export interface StorageAdapter {
  get(key: string): Promise<unknown | null>;
  set(key: string, value: unknown): Promise<void>;
  delete(key: string): Promise<boolean>;
  has(key: string): Promise<boolean>;
  clear(): Promise<void>;
}

export type EventMap = {
  nodeReady: (nodeId: string) => void;
  nodeDisconnected: (nodeId: string, code: number, reason: string) => void;
  nodeReconnected: (nodeId: string) => void;
  nodeError: (nodeId: string, error: Error) => void;
  playerCreate: (guildId: string) => void;
  playerDestroy: (guildId: string) => void;
  playerMove: (guildId: string, fromNode: string, toNode: string) => void;
  trackStart: (guildId: string, track: TrackData) => void;
  trackEnd: (guildId: string, track: TrackData, reason: string) => void;
  trackStuck: (guildId: string, track: TrackData, thresholdMs: number) => void;
  trackException: (guildId: string, track: TrackData, exception: unknown) => void;
  queueEnd: (guildId: string) => void;
  playerUpdate: (
    guildId: string,
    state: { time: number; position: number; connected: boolean; ping: number },
  ) => void;
  stats: (nodeId: string, stats: NodeStats) => void;
  debug: (message: string) => void;
  voiceReady: (guildId: string) => void;
  voiceDisconnected: (guildId: string) => void;
  voiceReconnecting: (guildId: string) => void;
};

export type EventName = keyof EventMap;

export type EventCallback<E extends EventName> = EventMap[E];
