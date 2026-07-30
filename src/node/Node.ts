import { WebSocketClient } from "../ws/WebSocketClient.ts";
import { RestClient } from "../rest/RestClient.ts";
import type { NodeConfig, NodeState, NodeStats } from "../types/internal.ts";
import { EventDispatcher } from "../ws/EventDispatcher.ts";
import type { EventName, EventCallback } from "../types/internal.ts";

export type { NodeState };

export interface PenaltyScore {
  total: number;
  playerPenalty: number;
  cpuPenalty: number;
  deficitPenalty: number;
  nullPenalty: number;
}

export class Node {
  public readonly config: NodeConfig;
  public readonly ws: WebSocketClient;
  public readonly rest: RestClient;
  private readonly events: EventDispatcher;
  private _state: NodeState = "disconnected";
  private _stats: NodeStats | null = null;
  private _penalties: PenaltyScore = {
    total: 0,
    playerPenalty: 0,
    cpuPenalty: 0,
    deficitPenalty: 0,
    nullPenalty: 0,
  };
  private _playerCount: number = 0;

  public constructor(config: NodeConfig, userId: string) {
    this.config = config;
    this.events = new EventDispatcher();

    this.rest = new RestClient({
      host: config.host,
      port: config.port,
      password: config.password,
      secure: config.secure,
      sessionId: config.resumeKey,
      retryOptions: {
        maxRetries: config.maxRetries ?? 3,
        baseDelay: config.retryDelay ?? 1000,
        maxDelay: config.retryDelayMax ?? 15000,
      },
    });

    this.ws = new WebSocketClient({
      nodeConfig: config,
      userId,
      clientName: "YuKumo/0.0.1",
    });

    this.ws.eventDispatcher.on("stats", (_nodeId: string, stats: NodeStats) => {
      this._stats = stats;
      this.updatePenalties();
    });

    this.ws.eventDispatcher.on("debug", (message: string) => {
      this.events.emit("debug", message);
    });
  }

  public get id(): string {
    return this.config.name ?? `${this.config.host}:${this.config.port}`;
  }

  public setUserId(userId: string): void {
    this.ws.setUserId(userId);
  }

  public get state(): NodeState {
    return this._state;
  }

  public get stats(): NodeStats | null {
    return this._stats;
  }

  public get penalties(): PenaltyScore {
    return this._penalties;
  }

  public get playerCount(): number {
    return this._playerCount;
  }

  public set playerCount(count: number) {
    this._playerCount = count;
  }

  public get eventDispatcher(): EventDispatcher {
    return this.events;
  }

  public on<E extends EventName>(event: E, callback: EventCallback<E>): this {
    this.events.on(event, callback);
    return this;
  }

  private updatePenalties(): void {
    const stats = this._stats;
    if (stats === null) {
      this._penalties = { total: 0, playerPenalty: 0, cpuPenalty: 0, deficitPenalty: 0, nullPenalty: 0 };
      return;
    }

    const playerPenalty = stats.players;
    const cpuPenalty = Math.round(Math.pow(1.05, stats.cpu.lavalinkLoad * 100) * 10 - 10);
    const deficitPenalty =
      stats.frameStats != null ? Math.round(Math.pow(1.03, stats.frameStats.deficit) * 10 - 10) * 2 : 0;
    const nullPenalty =
      stats.frameStats != null ? Math.round(Math.pow(1.03, stats.frameStats.nulled) * 10 - 10) * 3 : 0;

    this._penalties = {
      total: playerPenalty + cpuPenalty + deficitPenalty + nullPenalty,
      playerPenalty,
      cpuPenalty,
      deficitPenalty,
      nullPenalty,
    };
  }

  public async connect(): Promise<void> {
    this._state = "connecting";
    try {
      await this.ws.connect();
      this._state = "connected";
    } catch (error) {
      this._state = "disconnected";
      throw error;
    }
  }

  public async close(): Promise<void> {
    this._state = "disconnected";
    await this.ws.close();
  }

  public destroy(): void {
    this._state = "destroyed";
    this.ws.destroy();
    this.events.removeAllListeners();
  }
}
