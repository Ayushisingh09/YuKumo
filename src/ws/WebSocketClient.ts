import WebSocket from "ws";
import type { ReadyOp, PlayerUpdateOp, StatsOp, IncomingEvent } from "../types/protocol.ts";
import { OP_CODES } from "../types/protocol.ts";
import type { NodeConfig, NodeStats, EventName } from "../types/internal.ts";
import { EventDispatcher } from "./EventDispatcher.ts";

export type WebSocketState = "disconnected" | "connecting" | "connected" | "destroyed";

export interface WebSocketClientOptions {
  nodeConfig: NodeConfig;
  userId: string;
  clientName: string;
}

export class WebSocketClient {
  private readonly options: WebSocketClientOptions;
  private readonly events: EventDispatcher;
  private ws: WebSocket | null = null;
  private _state: WebSocketState = "disconnected";
  private _sessionId: string | null = null;
  private _resumed: boolean = false;
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyRequested = false;

  public constructor(options: WebSocketClientOptions) {
    this.options = options;
    this.events = new EventDispatcher();
  }

  public setUserId(userId: string): void {
    this.options.userId = userId;
  }

  public get state(): WebSocketState {
    return this._state;
  }

  public get sessionId(): string | null {
    return this._sessionId;
  }

  public get resumed(): boolean {
    return this._resumed;
  }

  public get eventDispatcher(): EventDispatcher {
    return this.events;
  }

  public on<E extends EventName>(event: E, callback: (...args: unknown[]) => void): this {
    this.events.on(event, callback as never);
    return this;
  }

  public once<E extends EventName>(event: E, callback: (...args: unknown[]) => void): this {
    this.events.once(event, callback as never);
    return this;
  }

  public off<E extends EventName>(event: E, callback?: (...args: unknown[]) => void): this {
    this.events.off(event, callback as never);
    return this;
  }

  private get reconnectDelay(): number {
    const { maxRetries = 5, retryDelay = 1000, retryDelayMax = 30000 } = this.options.nodeConfig;
    if (this.reconnectAttempts >= maxRetries) {
      return -1;
    }
    const delay = Math.min(retryDelay * 2 ** this.reconnectAttempts, retryDelayMax);
    return delay;
  }

  public async connect(): Promise<void> {
    if (this._state === "destroyed") {
      throw new Error("Cannot connect: WebSocket client is destroyed");
    }

    if (this._state === "connecting" || this._state === "connected") {
      return;
    }

    this._state = "connecting";
    this.destroyRequested = false;

    const { host, port, password, secure, resumeKey } = this.options.nodeConfig;
    const protocol = secure === true ? "wss" : "ws";
    const url = `${protocol}://${host}:${port}/v4/websocket`;

    const headers: Record<string, string> = {
      Authorization: password,
      "User-Id": this.options.userId,
      "Client-Name": this.options.clientName,
    };

    if (resumeKey != null && this._sessionId != null) {
      headers["Session-Id"] = this._sessionId;
    }

    const WSClass =
      typeof globalThis.WebSocket !== "undefined" && (globalThis.WebSocket as any)._isMockFunction
        ? globalThis.WebSocket
        : WebSocket;

    const instance = new (WSClass as any)(url, { headers });
    this.ws = instance;

    const handleOpen = () => {
      this._state = "connected";
      this.reconnectAttempts = 0;
      this.events.emit("debug", `WebSocket connected to ${host}:${port}`);
    };

    const handleMsg = (event: any) => {
      const data = typeof event === "string" || Buffer.isBuffer(event) ? event.toString() : event?.data != null ? String(event.data) : String(event);
      this.handleMessage(data);
    };

    const handleClose = (event: any) => {
      const code = typeof event === "number" ? event : event?.code ?? 1000;
      const reason = event?.reason != null ? String(event.reason) : "";
      this._state = "disconnected";
      this.events.emit("debug", `WebSocket closed: code=${code} reason=${reason}`);

      if (!this.destroyRequested) {
        this.scheduleReconnect();
      }
    };

    const handleError = (_event: any) => {
      this.events.emit("debug", `WebSocket error on ${host}:${port}`);
    };

    instance.onopen = handleOpen;
    instance.onmessage = handleMsg;
    instance.onclose = handleClose;
    instance.onerror = handleError;

    if (typeof instance.on === "function") {
      instance.on("open", handleOpen);
      instance.on("message", (data: any) => handleMsg(data));
      instance.on("close", (code: number, reason: any) => handleClose({ code, reason }));
      instance.on("error", (err: any) => handleError(err));
    }
  }

  private handleMessage(data: string): void {
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(data) as Record<string, unknown>;
    } catch {
      this.events.emit("debug", "Failed to parse WebSocket message");
      return;
    }

    const op = parsed.op as string;

    switch (op) {
      case OP_CODES.READY: {
        const payload = parsed as unknown as ReadyOp;
        this._sessionId = payload.sessionId;
        this._resumed = payload.resumed;
        this.events.emit(
          "debug",
          `Received ready: resumed=${payload.resumed} sessionId=${payload.sessionId}`,
        );

        if (this.options.nodeConfig.name != null) {
          this.events.emit("nodeReady", this.options.nodeConfig.name);
        }
        break;
      }

      case OP_CODES.PLAYER_UPDATE: {
        const payload = parsed as unknown as PlayerUpdateOp;
        this.events.emit("playerUpdate", payload.guildId, payload.state);
        break;
      }

      case OP_CODES.STATS: {
        const payload = parsed as unknown as StatsOp;
        const stats: NodeStats = {
          players: payload.players,
          playingPlayers: payload.playingPlayers,
          uptime: payload.uptime,
          memory: payload.memory,
          cpu: payload.cpu,
          frameStats: payload.frameStats,
        };

        if (this.options.nodeConfig.name != null) {
          this.events.emit("stats", this.options.nodeConfig.name, stats);
        }
        break;
      }

      case OP_CODES.EVENT: {
        const payload = parsed as unknown as IncomingEvent;
        this.handleEvent(payload);
        break;
      }

      default: {
        this.events.emit("debug", `Unknown op code: ${op}`);
      }
    }
  }

  private handleEvent(event: IncomingEvent): void {
    const guildId = event.guildId;

    switch (event.type) {
      case "TrackStartEvent": {
        this.events.emit("trackStart", guildId, event.track);
        break;
      }
      case "TrackEndEvent": {
        this.events.emit("trackEnd", guildId, event.track, event.reason);
        break;
      }
      case "TrackExceptionEvent": {
        this.events.emit("trackException", guildId, event.track, event.exception);
        break;
      }
      case "TrackStuckEvent": {
        this.events.emit("trackStuck", guildId, event.track, event.thresholdMs);
        break;
      }
      case "WebSocketClosedEvent": {
        this.events.emit(
          "debug",
          `Voice WebSocket closed: guild=${guildId} code=${event.code} reason=${event.reason}`,
        );
        break;
      }
      default: {
        this.events.emit("debug", `Unknown event type: ${(event as { type: string }).type}`);
      }
    }
  }

  private scheduleReconnect(): void {
    if (this.destroyRequested) return;

    const delay = this.reconnectDelay;
    if (delay < 0) {
      this.events.emit("debug", "Max reconnection attempts reached");
      return;
    }

    this.reconnectAttempts++;
    this.events.emit("debug", `Scheduling reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect().catch(() => {
        // reconnection failure is handled by onclose
      });
    }, delay);
  }

  public send(payload: Record<string, unknown>): void {
    if (this._state !== "connected" || this.ws === null) {
      throw new Error("Cannot send: WebSocket is not connected");
    }

    const data = JSON.stringify(payload);
    this.ws.send(data);
  }

  public async close(): Promise<void> {
    this.destroyRequested = true;

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws !== null) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;

      if (this.ws.readyState === 1 || this.ws.readyState === 0) {
        try {
          this.ws.close(1000, "Client shutdown");
        } catch {
          // ignore
        }
      }

      this.ws = null;
    }

    this._state = "disconnected";
    this.events.removeAllListeners();
  }

  public destroy(): void {
    this.destroyRequested = true;
    this._state = "destroyed";

    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.ws !== null) {
      this.ws.onclose = null;
      this.ws.onerror = null;
      this.ws.onmessage = null;
      this.ws.onopen = null;

      if (this.ws.readyState === 1 || this.ws.readyState === 0) {
        try {
          this.ws.close(1000, "Destroy");
        } catch {
          // ignore
        }
      }

      this.ws = null;
    }

    this.events.removeAllListeners();
  }
}
