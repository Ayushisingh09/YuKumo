import type { Node } from "../node/Node.ts";
import { Queue } from "../queue/Queue.ts";
import { FilterChain } from "../filters/FilterChain.ts";
import type { TrackData, PlayerState } from "../types/protocol.ts";
import type { InternalVoiceState } from "../types/internal.ts";
import { PlayerNotConnectedError, PlayerError } from "../errors/index.ts";
import { EventDispatcher } from "../ws/EventDispatcher.ts";
import type { EventName, EventCallback } from "../types/internal.ts";

import type { YuKumo } from "../Kumo.ts";
import type { SearchResult } from "../types/internal.ts";

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
  /** Reference to the main YuKumo client */
  kumo: YuKumo;
}

/**
 * Manages audio playback, filters, and voice state for a single Discord Guild.
 */
export class Player<TTrack extends TrackData = TrackData> {
  public readonly guildId: string;
  public readonly queue: Queue<TTrack>;
  public readonly filters: FilterChain;
  public readonly events: EventDispatcher;
  
  /** Custom data map for developers to store persistent session variables */
  public readonly data: Map<string, any> = new Map();

  /** Whether autoplay is enabled when queue ends */
  public autoplay: boolean = false;
  /** Custom autoplay recommendation fetcher hook */
  public autoplayFetcher?: (lastTrack: TTrack) => Promise<TTrack | null>;

  private _node: Node;
  private readonly kumo: YuKumo;
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
  private _voiceStateSent: boolean = false;
  private _paused: boolean = false;
  private _destroyed: boolean = false;
  private _selfDeaf: boolean;
  private _selfMute: boolean;

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
    this.events.emit("playerUpdate", guildId, state as never);
  };

  private readonly boundOnTrackException = (guildId: string, track: TrackData, exception: unknown) => {
    if (guildId !== this.guildId) return;
    this.events.emit("trackException", guildId, track, exception);
  };

  public constructor(options: PlayerOptions) {
    this.guildId = options.guildId;
    this._node = options.node;
    this.kumo = options.kumo;
    this._voiceChannelId = options.voiceChannelId;
    this._textChannelId = options.textChannelId ?? null;
    this._selfDeaf = options.selfDeaf ?? true;
    this._selfMute = options.selfMute ?? false;
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
    ws.on("trackException", this.boundOnTrackException as never);
    ws.on("playerUpdate", this.boundOnPlayerUpdate as never);
  }

  private removeNodeListeners(): void {
    const ws = this._node.ws.eventDispatcher;
    ws.off("trackEnd", this.boundOnTrackEnd as never);
    ws.off("trackStart", this.boundOnTrackStart as never);
    ws.off("trackStuck", this.boundOnTrackStuck as never);
    ws.off("trackException", this.boundOnTrackException as never);
    ws.off("playerUpdate", this.boundOnPlayerUpdate as never);
  }

  /** Consecutive queue-advance failures; guards against retry-looping a dead node or all-broken queue */
  private _advanceFailures = 0;

  private async handleTrackEnd(lastTrack: TTrack, reason: string): Promise<void> {
    if (this._destroyed) return;

    // A track that failed to load must not be repeated, or repeat-track mode
    // would hammer the node with the same broken track forever; explicit skips
    // advance past repeat-track too
    const forceAdvance = reason === "loadFailed" || reason === "stuck" || reason === "skipped";
    const nextTrack = this.queue.next(forceAdvance);
    if (nextTrack != null) {
      try {
        await this.playTrack(nextTrack);
        this._advanceFailures = 0;
        return;
      } catch (error) {
        this._advanceFailures++;
        this.events.emit(
          "debug",
          `Failed to start next track in guild ${this.guildId}: ${error instanceof Error ? error.message : String(error)}`,
        );
        if (this._advanceFailures < 3) {
          // Skip the broken track and try the one after it
          return this.handleTrackEnd(nextTrack, "loadFailed");
        }
        this._advanceFailures = 0;
        // Too many consecutive failures — fall through to autoplay/queueEnd
      }
    }

    if (this.autoplay) {
      try {
        let autoTrack: TTrack | null = null;
        if (this.autoplayFetcher != null) {
          autoTrack = await this.autoplayFetcher(lastTrack);
        } else {
          // Default smart autoplay fallback: search related tracks using artist & title or YouTube RD mix
          const searchIdentifier = lastTrack.info?.identifier
            ? `https://www.youtube.com/watch?v=${lastTrack.info.identifier}&list=RD${lastTrack.info.identifier}`
            : `ytsearch:${lastTrack.info?.author ?? ""} ${lastTrack.info?.title ?? ""}`;

          const result = await this._node.rest.loadTracks(searchIdentifier);
          if (result.loadType === "playlist" && result.data.tracks.length > 1) {
            autoTrack = (result.data.tracks[1] ?? result.data.tracks[0]) as TTrack;
          } else if (result.loadType === "search" && result.data.length > 0) {
            autoTrack = result.data[0] as TTrack;
          }
        }

        if (autoTrack != null) {
          this.queue.enqueue(autoTrack);
          const trackToPlay = this.queue.next() ?? autoTrack;
          await this.playTrack(trackToPlay);
          return;
        }
      } catch (error) {
        this.events.emit(
          "debug",
          `Autoplay failed in guild ${this.guildId}: ${error instanceof Error ? error.message : String(error)}`,
        );
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

  /** Subscribes to a player event for a single emission */
  public once<E extends EventName>(event: E, callback: EventCallback<E>): this {
    this.events.once(event, callback);
    return this;
  }

  /** Unsubscribes a callback (or all callbacks when omitted) from a player event */
  public off<E extends EventName>(event: E, callback?: EventCallback<E>): this {
    this.events.off(event, callback);
    return this;
  }

  /**
   * Skips the current track, advancing through the same path as a natural
   * track end — so autoplay, repeat handling, and queueEnd all still fire.
   * Returns the track now playing, or null if the queue ended.
   */
  public async skip(): Promise<TTrack | null> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const skipped = this.currentTrack;
    await this.stop();
    await this.handleTrackEnd(skipped as TTrack, "skipped");
    return this.currentTrack;
  }

  /** Reassigns player to a new Lavalink node (for node failover / load balancing) */
  public async setNode(node: Node): Promise<void> {
    const oldNode = this._node;
    this.removeNodeListeners();
    this._node = node;
    this.setupNodeListeners();
    oldNode.playerCount = Math.max(0, oldNode.playerCount - 1);
    node.playerCount += 1;

    if (this._status === "playing" && this.currentTrack != null) {
      await this.playTrack(this.currentTrack, { position: this._position });
    }
  }


  /** Plays the previous track from the queue history */
  public async playPrevious(): Promise<TTrack | null> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const previous = this.queue.previous();
    if (previous == null) return null;

    await this.playTrack(previous);
    return previous;
  }

  /**
   * Shortcut to search for tracks using the main YuKumo instance.
   * @param query Search query
   * @param source Optional search source (e.g. ytsearch, scsearch)
   */
  public search(query: string, source?: string): Promise<SearchResult> {
    return this.kumo.search(query, source);
  }

  /**
   * Sets the queue repeat mode.
   * @param mode "none", "track", or "queue"
   */
  public setLoop(mode: "none" | "track" | "queue"): this {
    this.queue.setRepeatMode(mode);
    return this;
  }

  /**
   * Fetches lyrics for the current track or a specified track using Lavalink Lyrics plugin.
   * @param encodedTrack Optional encoded track. Defaults to the currently playing track.
   */
  public async getLyrics(encodedTrack?: string | null): Promise<any> {
    const trackToUse = encodedTrack ?? this.queue.currentTrack?.encoded;
    if (!trackToUse) return null;
    return this.kumo.getLyrics(trackToUse);
  }

  /**
   * Begins playback of the given track. If none provided, plays next in queue.
   */
  public async play(track?: TrackData): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const trackToPlay = (track as TTrack) ?? this.queue.currentTrack ?? this.queue.start();
    if (trackToPlay == null) {
      throw new PlayerError("No tracks in queue", this.guildId);
    }

    await this.playTrack(trackToPlay);
  }

  /** Plays a specific track directly */
  public async playTrack(track: TTrack, options?: { position?: number }): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);

    const filterPayload = this.filters.toPayload();
    const hasFilterKeys = Object.keys(filterPayload).length > 0;

    // Claim "playing" synchronously so a second play() racing this one
    // sees a non-idle status instead of starting a duplicate playback
    const previousStatus = this._status;
    this._status = "playing";

    try {
      const sessionId = this._node.rest.sessionId;
      if (sessionId == null) {
        throw new PlayerNotConnectedError(this.guildId);
      }

      if (!this._voiceState.token || !this._voiceState.endpoint || !this._voiceState.sessionId) {
        const globalVoice = this.kumo?.voice?.getVoiceState(this.guildId);
        if (globalVoice != null) {
          this.setVoiceState(globalVoice);
        }
      }

      await this.sendVoiceUpdate();

      await this._node.rest.updatePlayer(
        sessionId,
        this.guildId,
        {
          track: { encoded: track.encoded },
          position: options?.position,
          volume: this._volume,
          paused: this._paused,
          filters: hasFilterKeys ? filterPayload : undefined,
        },
        false,
      );
    } catch (error) {
      this._status = previousStatus === "playing" ? "idle" : previousStatus;
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

  /** Applies current filter chain payload to Lavalink node in real time */
  public async setFilters(filters?: FilterChain): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);
    if (filters != null) {
      this.filters.apply(filters.toPayload());
    }

    const sessionId = this._node.rest.sessionId;
    if (sessionId == null) return;

    await this._node.rest.updatePlayer(sessionId, this.guildId, {
      filters: this.filters.toPayload(),
    });
  }

  /** Clears all applied filters and updates Lavalink node in real time */
  public async clearFilters(): Promise<void> {
    this.filters.clear();
    await this.setFilters();
  }

  /** Toggles the nightcore filter preset */
  public async setNightcore(enabled: boolean = true): Promise<void> {
    this.filters.setNightcore(enabled);
    await this.setFilters();
  }

  /** Toggles the vaporwave filter preset */
  public async setVaporwave(enabled: boolean = true): Promise<void> {
    this.filters.setVaporwave(enabled);
    await this.setFilters();
  }

  /** Sets the bassboost preset; pass `false` to disable it */
  public async setBassboost(level: "low" | "medium" | "high" | "extreme" | false): Promise<void> {
    this.filters.setBassBoost(level);
    await this.setFilters();
  }

  /** Sets autoplay state and optional custom recommendation fetcher */
  public setAutoplay(enabled: boolean = true, fetcher?: (lastTrack: TTrack) => Promise<TTrack | null>): this {
    this.autoplay = enabled;
    if (fetcher !== undefined) {
      this.autoplayFetcher = fetcher;
    }
    return this;
  }

  /**
   * Sends Discord OP4 to join the player's voice channel.
   * Requires the `send` option on the YuKumo manager; a no-op otherwise
   * (for setups where the host application dispatches OP4 itself).
   */
  public connect(options?: { selfDeaf?: boolean; selfMute?: boolean }): this {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);
    if (options?.selfDeaf != null) this._selfDeaf = options.selfDeaf;
    if (options?.selfMute != null) this._selfMute = options.selfMute;
    this.sendVoiceStateToDiscord(this._voiceChannelId);
    return this;
  }

  /** Sends Discord OP4 to leave the voice channel (player itself stays alive) */
  public disconnect(): this {
    this.sendVoiceStateToDiscord(null);
    return this;
  }

  private sendVoiceStateToDiscord(channelId: string | null): void {
    const send = this.kumo.sendGatewayPayload;
    if (send == null) return;
    send(this.guildId, {
      op: 4,
      d: {
        guild_id: this.guildId,
        channel_id: channelId,
        self_mute: this._selfMute,
        self_deaf: this._selfDeaf,
      },
    });
  }

  /** Moves the player to another voice channel (sends OP4 when the manager has a `send` function) */
  public async setVoiceChannel(
    channelId: string,
    options?: { selfDeaf?: boolean; selfMute?: boolean },
  ): Promise<void> {
    if (this._destroyed) throw new PlayerError("Player is destroyed", this.guildId);
    this._voiceChannelId = channelId;
    if (options?.selfDeaf != null) this._selfDeaf = options.selfDeaf;
    if (options?.selfMute != null) this._selfMute = options.selfMute;
    this.sendVoiceStateToDiscord(channelId);
  }

  /**
   * Pushes the current voice credentials to Lavalink immediately.
   * Called when Discord delivers new voice server credentials (initial join,
   * region change, session change) so audio survives without waiting for the next play().
   */
  public async sendVoiceUpdate(): Promise<void> {
    if (this._destroyed || this._voiceStateSent) return;
    const { token, endpoint, sessionId: voiceSessionId } = this._voiceState;
    if (!token || !endpoint || !voiceSessionId) return;

    const sessionId = this._node.rest.sessionId;
    if (sessionId == null) return;

    try {
      await this._node.rest.updatePlayer(sessionId, this.guildId, {
        voice: { token, endpoint, sessionId: voiceSessionId },
      });
      this._voiceStateSent = true;
    } catch (err) {
      // Ignore voice update error if player voice state is already registered
    }
  }

  /** Replaces complete internal voice connection state */
  public setVoiceState(state: InternalVoiceState): void {
    if (
      this._voiceState.token !== state.token ||
      this._voiceState.endpoint !== state.endpoint ||
      this._voiceState.sessionId !== state.sessionId
    ) {
      this._voiceStateSent = false;
    }
    this._voiceState = { ...state };
  }

  /** Updates partial internal voice connection state */
  public updateVoiceState(partial: Partial<InternalVoiceState>): void {
    if (
      (partial.token != null && partial.token !== this._voiceState.token) ||
      (partial.endpoint != null && partial.endpoint !== this._voiceState.endpoint) ||
      (partial.sessionId != null && partial.sessionId !== this._voiceState.sessionId)
    ) {
      this._voiceStateSent = false;
    }
    Object.assign(this._voiceState, partial);
  }

  /** Destroys player, leaves the voice channel, clears queue and filters, and removes event listeners */
  public async destroy(): Promise<void> {
    if (this._destroyed) return;
    this.sendVoiceStateToDiscord(null);
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
