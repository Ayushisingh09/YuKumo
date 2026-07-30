import type { Node } from "../node/Node.ts";
import { Queue } from "../queue/Queue.ts";
import { FilterChain } from "../filters/FilterChain.ts";
import type { TrackData, PlayerState } from "../types/protocol.ts";
import type { InternalVoiceState } from "../types/internal.ts";
import { PlayerNotConnectedError, PlayerError } from "../errors/index.ts";
import { EventDispatcher } from "../ws/EventDispatcher.ts";
import type { EventName, EventCallback } from "../types/internal.ts";

export type PlayerStatus = "idle" | "playing" | "paused" | "destroyed";

export interface PlayerOptions {
  guildId: string;
  node: Node;
  voiceChannelId: string;
  textChannelId?: string;
  selfDeaf?: boolean;
  selfMute?: boolean;
}

export class Player {
  public readonly guildId: string;
  public readonly queue: Queue<TrackData>;
  public readonly filters: FilterChain;
  public readonly events: EventDispatcher;

  private _node: Node;
  private _status: PlayerStatus = "idle";
  private _position: number = 0;
  private _volume: number = 100;
  private _voiceChannelId: string;
  private _textChannelId: string | null;
  private _voiceState: InternalVoiceState = {
    sessionId: null,
    channelId: null,
    endpoint: null,
    token: null,
  };
  private _paused: boolean = false;
  private _destroyed: boolean = false;

  public constructor(options: PlayerOptions) {
    this.guildId = options.guildId;
    this._node = options.node;
    this._voiceChannelId = options.voiceChannelId;
    this._textChannelId = options.textChannelId ?? null;
    this.queue = new Queue<TrackData>();
    this.filters = new FilterChain();
    this.events = new EventDispatcher();

    this.setupNodeListeners();
  }

  public get node(): Node {
    return this._node;
  }

  public get status(): PlayerStatus {
    return this._status;
  }

  public get position(): number {
    return this._position;
  }

  public get volume(): number {
    return this._volume;
  }

  public get paused(): boolean {
    return this._paused;
  }

  public get voiceChannelId(): string {
    return this._voiceChannelId;
  }

  public get textChannelId(): string | null {
    return this._textChannelId;
  }

  public get voiceState(): InternalVoiceState {
    return { ...this._voiceState };
  }

  public get currentTrack(): TrackData | null {
    return this.queue.currentTrack;
  }

  private setupNodeListeners(): void {
    this._node.ws.eventDispatcher.on("trackEnd", (guildId: string, track: TrackData, reason: string) => {
      if (guildId !== this.guildId) return;
      this.events.emit("trackEnd", guildId, track, reason);

      if (reason === "finished" || reason === "loadFailed") {
        this.handleTrackEnd(reason);
      }
    });

    this._node.ws.eventDispatcher.on("trackStart", (guildId: string, track: TrackData) => {
      if (guildId !== this.guildId) return;
      this._status = "playing";
      this._paused = false;
      this.events.emit("trackStart", guildId, track);
    });

    this._node.ws.eventDispatcher.on(
      "trackStuck",
      (guildId: string, track: TrackData, thresholdMs: number) => {
        if (guildId !== this.guildId) return;
        this.events.emit("trackStuck", guildId, track, thresholdMs);
        this.handleTrackEnd("stuck");
      },
    );

    this._node.ws.eventDispatcher.on("playerUpdate", (guildId: string, state: PlayerState) => {
      if (guildId !== this.guildId) return;
      this._position = state.position;
    });
  }

  private handleTrackEnd(_reason: string): void {
    if (this._destroyed) return;

    const nextTrack = this.queue.next();
    if (nextTrack != null) {
      this.playTrack(nextTrack).catch(() => {
        // auto-advance error
      });
    } else {
      this._status = "idle";
      this._paused = false;
      this.events.emit("queueEnd", this.guildId);
    }
  }

  public on<E extends EventName>(event: E, callback: EventCallback<E>): this {
    this.events.on(event, callback);
    return this;
  }

  public async setNode(node: Node): Promise<void> {
    this._node = node;
    this.setupNodeListeners();
  }

  public async play(): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const track = this.queue.currentTrack ?? this.queue.start();
    if (track == null) {
      throw new PlayerError("No tracks in queue", this.guildId);
    }

    await this.playTrack(track);
  }

  public async playTrack(track: TrackData): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const filterPayload = this.filters.toPayload();
    const hasFilterKeys = Object.keys(filterPayload).length > 0;

    try {
      const sessionId = this._node.rest.sessionId;
      if (sessionId == null) {
        throw new PlayerNotConnectedError(this.guildId);
      }

      await this._node.rest.updatePlayer(
        sessionId,
        this.guildId,
        {
          track: { encoded: track.encoded },
          volume: this._volume,
          paused: this._paused,
          filters: hasFilterKeys ? filterPayload : undefined,
          voice: {
            token: this._voiceState.token ?? "",
            endpoint: this._voiceState.endpoint ?? "",
            sessionId: this._voiceState.sessionId ?? "",
          },
        },
        false,
      );

      this._status = "playing";
    } catch (error) {
      this._status = "idle";
      throw error;
    }
  }

  public async stop(): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const sessionId = this._node.rest.sessionId;
    if (sessionId == null) return;

    await this._node.rest.updatePlayer(sessionId, this.guildId, {
      track: null,
    });

    this._status = "idle";
    this._paused = false;
    this._position = 0;
  }

  public async pause(): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const sessionId = this._node.rest.sessionId;
    if (sessionId == null) return;

    await this._node.rest.updatePlayer(sessionId, this.guildId, {
      paused: true,
    });

    this._paused = true;
    this._status = "paused";
  }

  public async resume(): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const sessionId = this._node.rest.sessionId;
    if (sessionId == null) return;

    await this._node.rest.updatePlayer(sessionId, this.guildId, {
      paused: false,
    });

    this._paused = false;
    this._status = "playing";
  }

  public async setVolume(volume: number): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const clamped = Math.max(0, Math.min(1000, volume));
    const sessionId = this._node.rest.sessionId;
    if (sessionId == null) return;

    await this._node.rest.updatePlayer(sessionId, this.guildId, {
      volume: clamped,
    });

    this._volume = clamped;
  }

  public async seek(position: number): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const sessionId = this._node.rest.sessionId;
    if (sessionId == null) return;

    await this._node.rest.updatePlayer(sessionId, this.guildId, {
      position,
    });
  }

  public async setVoiceChannel(
    channelId: string,
    _options?: { selfDeaf?: boolean; selfMute?: boolean },
  ): Promise<void> {
    this._voiceChannelId = channelId;
  }

  public setVoiceState(state: InternalVoiceState): void {
    this._voiceState = { ...state };
  }

  public updateVoiceState(partial: Partial<InternalVoiceState>): void {
    Object.assign(this._voiceState, partial);
  }

  public async destroy(): Promise<void> {
    this._destroyed = true;
    this._status = "destroyed";
    this.queue.clear();
    this.filters.clear();
    this.events.removeAllListeners();

    const sessionId = this._node.rest.sessionId;
    if (sessionId != null) {
      try {
        await this._node.rest.destroyPlayer(sessionId, this.guildId);
      } catch {
        // ignore destroy errors
      }
    }
  }

  public get destroyed(): boolean {
    return this._destroyed;
  }
}
