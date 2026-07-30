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
  /** Target Discord Guild ID */
  guildId: string;
  /** Active Lavalink Node connection */
  node: Node;
  /** Discord Voice Channel ID */
  voiceChannelId: string;
  /** Optional Discord Text Channel ID */
  textChannelId?: string;
  /** Initial self deaf status */
  selfDeaf?: boolean;
  /** Initial self mute status */
  selfMute?: boolean;
}

/**
 * Manages audio playback, filters, and voice state for a single Discord Guild.
 */
export class Player<TTrack extends TrackData = TrackData> {
  public readonly guildId: string;
  public readonly queue: Queue<TTrack>;
  public readonly filters: FilterChain;
  public readonly events: EventDispatcher;

  /** Whether autoplay is enabled when queue ends */
  public autoplay: boolean = false;
  /** Custom autoplay recommendation fetcher hook */
  public autoplayFetcher?: (lastTrack: TTrack) => Promise<TTrack | null>;

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

  private readonly boundOnTrackEnd = (guildId: string, track: TrackData, reason: string) => {
    if (guildId !== this.guildId) return;
    this.events.emit("trackEnd", guildId, track, reason);
    if (reason === "finished" || reason === "loadFailed") {
      this.handleTrackEnd(track as TTrack, reason);
    }
  };

  private readonly boundOnTrackStart = (guildId: string, track: TrackData) => {
    if (guildId !== this.guildId) return;
    this._status = "playing";
    this._paused = false;
    this.events.emit("trackStart", guildId, track);
  };

  private readonly boundOnTrackStuck = (guildId: string, track: TrackData, thresholdMs: number) => {
    if (guildId !== this.guildId) return;
    this.events.emit("trackStuck", guildId, track, thresholdMs);
    this.handleTrackEnd(track as TTrack, "stuck");
  };

  private readonly boundOnPlayerUpdate = (guildId: string, state: PlayerState) => {
    if (guildId !== this.guildId) return;
    this._position = state.position;
  };

  public constructor(options: PlayerOptions) {
    this.guildId = options.guildId;
    this._node = options.node;
    this._voiceChannelId = options.voiceChannelId;
    this._textChannelId = options.textChannelId ?? null;
    this.queue = new Queue<TTrack>();
    this.filters = new FilterChain();
    this.events = new EventDispatcher();

    this.setupNodeListeners();
  }

  /** Gets active Lavalink Node */
  public get node(): Node {
    return this._node;
  }

  /** Gets current player status ("idle" | "playing" | "paused" | "destroyed") */
  public get status(): PlayerStatus {
    return this._status;
  }

  /** Gets current playback position in milliseconds */
  public get position(): number {
    return this._position;
  }

  /** Gets current player volume (0 to 1000) */
  public get volume(): number {
    return this._volume;
  }

  /** Gets whether playback is paused */
  public get paused(): boolean {
    return this._paused;
  }

  /** Gets active voice channel ID */
  public get voiceChannelId(): string {
    return this._voiceChannelId;
  }

  /** Gets active text channel ID */
  public get textChannelId(): string | null {
    return this._textChannelId;
  }

  /** Gets current voice connection parameters */
  public get voiceState(): InternalVoiceState {
    return { ...this._voiceState };
  }

  /** Gets currently playing track object or null */
  public get currentTrack(): TTrack | null {
    return this.queue.currentTrack;
  }

  private setupNodeListeners(): void {
    const ws = this._node.ws.eventDispatcher;
    ws.on("trackEnd", this.boundOnTrackEnd as never);
    ws.on("trackStart", this.boundOnTrackStart as never);
    ws.on("trackStuck", this.boundOnTrackStuck as never);
    ws.on("playerUpdate", this.boundOnPlayerUpdate as never);
  }

  private removeNodeListeners(): void {
    const ws = this._node.ws.eventDispatcher;
    ws.off("trackEnd", this.boundOnTrackEnd as never);
    ws.off("trackStart", this.boundOnTrackStart as never);
    ws.off("trackStuck", this.boundOnTrackStuck as never);
    ws.off("playerUpdate", this.boundOnPlayerUpdate as never);
  }

  private async handleTrackEnd(lastTrack: TTrack, _reason: string): Promise<void> {
    if (this._destroyed) return;

    const nextTrack = this.queue.next();
    if (nextTrack != null) {
      try {
        await this.playTrack(nextTrack);
      } catch {
        // advance failure
      }
      return;
    }

    if (this.autoplay && this.autoplayFetcher != null) {
      try {
        const autoTrack = await this.autoplayFetcher(lastTrack);
        if (autoTrack != null) {
          this.queue.enqueue(autoTrack);
          const trackToPlay = this.queue.next() ?? autoTrack;
          await this.playTrack(trackToPlay);
          return;
        }
      } catch {
        // fallback to queue end
      }
    }

    this._status = "idle";
    this._paused = false;
    this.events.emit("queueEnd", this.guildId);
  }

  /** Subscribes to player events */
  public on<E extends EventName>(event: E, callback: EventCallback<E>): this {
    this.events.on(event, callback);
    return this;
  }

  /** Reassigns player to a new Lavalink node (for node failover / load balancing) */
  public async setNode(node: Node): Promise<void> {
    this.removeNodeListeners();
    this._node = node;
    this.setupNodeListeners();

    if (this._status === "playing" && this.currentTrack != null) {
      await this.playTrack(this.currentTrack);
    }
  }

  /** Begins or resumes queue playback */
  public async play(): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const track = this.queue.currentTrack ?? this.queue.start();
    if (track == null) {
      throw new PlayerError("No tracks in queue", this.guildId);
    }

    await this.playTrack(track);
  }

  /** Plays a specific track directly */
  public async playTrack(track: TTrack): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const filterPayload = this.filters.toPayload();
    const hasFilterKeys = Object.keys(filterPayload).length > 0;

    try {
      const sessionId = this._node.rest.sessionId;
      if (sessionId == null) {
        throw new PlayerNotConnectedError(this.guildId);
      }

      const voicePayload =
        this._voiceState.token && this._voiceState.endpoint && this._voiceState.sessionId
          ? {
              token: this._voiceState.token,
              endpoint: this._voiceState.endpoint,
              sessionId: this._voiceState.sessionId,
            }
          : undefined;

      await this._node.rest.updatePlayer(
        sessionId,
        this.guildId,
        {
          track: { encoded: track.encoded },
          volume: this._volume,
          paused: this._paused,
          filters: hasFilterKeys ? filterPayload : undefined,
          voice: voicePayload,
        },
        false,
      );

      this._status = "playing";
    } catch (error) {
      this._status = "idle";
      throw error;
    }
  }

  /** Stops playback for current track */
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

  /** Pauses current track playback */
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

  /** Resumes paused track playback */
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

  /** Sets player volume (0 to 1000) and commits to Lavalink node */
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

  /** Seeks to position in track (milliseconds) */
  public async seek(position: number): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const sessionId = this._node.rest.sessionId;
    if (sessionId == null) return;

    await this._node.rest.updatePlayer(sessionId, this.guildId, {
      position,
    });
  }

  /** Updates associated voice channel ID */
  public async setVoiceChannel(
    channelId: string,
    _options?: { selfDeaf?: boolean; selfMute?: boolean },
  ): Promise<void> {
    this._voiceChannelId = channelId;
  }

  /** Replaces complete internal voice connection state */
  public setVoiceState(state: InternalVoiceState): void {
    this._voiceState = { ...state };
  }

  /** Updates partial internal voice connection state */
  public updateVoiceState(partial: Partial<InternalVoiceState>): void {
    Object.assign(this._voiceState, partial);
  }

  /** Destroys player, clears queue and filters, and removes event listeners */
  public async destroy(): Promise<void> {
    this._destroyed = true;
    this._status = "destroyed";
    this.removeNodeListeners();
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

  /** Gets whether player is destroyed */
  public get destroyed(): boolean {
    return this._destroyed;
  }
}

