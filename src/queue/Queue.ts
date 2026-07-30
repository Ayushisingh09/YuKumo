import type { RepeatMode } from "../types/internal.ts";
import { QueueError, QueueFullError } from "../errors/index.ts";

export interface QueueOptions {
  /** Maximum number of tracks allowed in queue (0 for unlimited) */
  maxSize?: number;
  /** Maximum number of history items to store */
  maxHistorySize?: number;
}

export interface SerializedQueue<T> {
  tracks: T[];
  history: T[];
  currentIndex: number;
  repeatMode: RepeatMode;
}

/**
 * Type-safe, high-performance Queue manager supporting repeat modes, history,
 * serialization, shuffle, and priority insertion.
 */
export class Queue<T> {
  private readonly tracks: T[] = [];
  private readonly history: T[] = [];
  private currentIndex: number = -1;
  private _repeatMode: RepeatMode = "none";
  private readonly maxSize: number;
  private readonly maxHistorySize: number;

  public constructor(options?: QueueOptions) {
    this.maxSize = options?.maxSize ?? 0;
    this.maxHistorySize = options?.maxHistorySize ?? 50;
  }

  /** Gets total number of tracks currently in the queue */
  public get size(): number {
    return this.tracks.length;
  }

  /** Checks whether the queue is empty */
  public get isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  /** Gets current repeat mode ("none" | "track" | "queue") */
  public get repeatMode(): RepeatMode {
    return this._repeatMode;
  }

  /** Gets 0-based index of currently playing track in queue */
  public get currentIndexInQueue(): number {
    return this.currentIndex;
  }

  /** Gets currently active track or null */
  public get currentTrack(): T | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.tracks.length) {
      return null;
    }
    return this.tracks[this.currentIndex] as T;
  }

  /** Gets readonly array of all tracks in queue */
  public get tracksList(): readonly T[] {
    return this.tracks;
  }

  /** Gets readonly array of played track history */
  public get historyList(): readonly T[] {
    return this.history;
  }

  /** Sets repeat mode ("none" | "track" | "queue") */
  public setRepeatMode(mode: RepeatMode): this {
    this._repeatMode = mode;
    return this;
  }

  /**
   * Enqueues a track at the end or specified index.
   * @param track Track object to append
   * @param index Optional position index
   */
  public enqueue(track: T, index?: number): this {
    if (this.maxSize > 0 && this.tracks.length >= this.maxSize) {
      throw new QueueFullError(this.maxSize);
    }

    if (index !== undefined && (index < 0 || index > this.tracks.length)) {
      throw new QueueError(`Index ${index} is out of bounds`);
    }

    if (index !== undefined) {
      this.tracks.splice(index, 0, track);
      if (this.currentIndex >= index) {
        this.currentIndex++;
      }
    } else {
      this.tracks.push(track);
    }

    return this;
  }

  /**
   * Enqueues a track at the top of the queue (immediately after current playing track).
   * @param track Track object to prioritize
   */
  public priorityEnqueue(track: T): this {
    const insertPos = this.currentIndex >= 0 ? this.currentIndex + 1 : 0;
    return this.enqueue(track, insertPos);
  }

  /**
   * Dequeues a track at specified index or top of queue.
   * @param index Optional index to remove
   */
  public dequeue(index?: number): T | null {
    if (this.tracks.length === 0) return null;

    const removeIndex = index ?? 0;
    if (removeIndex < 0 || removeIndex >= this.tracks.length) return null;

    const [removed] = this.tracks.splice(removeIndex, 1) as [T];

    if (this.currentIndex === removeIndex) {
      this.currentIndex = -1;
    } else if (this.currentIndex > removeIndex) {
      this.currentIndex--;
    }

    return removed;
  }

  /** Advances queue to next track based on current repeat mode */
  public next(): T | null {
    if (this.tracks.length === 0) return null;

    if (this._repeatMode === "track" && this.currentTrack != null) {
      return this.currentTrack;
    }

    this.addCurrentToHistory();

    if (this._repeatMode === "queue") {
      this.currentIndex = (this.currentIndex + 1) % this.tracks.length;
      return this.tracks[this.currentIndex] as T;
    }

    if (this.currentIndex < this.tracks.length - 1) {
      this.currentIndex++;
      return this.tracks[this.currentIndex] as T;
    }

    this.currentIndex = -1;
    return null;
  }

  /** Steps back to previous track in history or queue */
  public previous(): T | null {
    if (this.tracks.length === 0) return null;

    const historyTrack = this.history.pop() ?? null;
    if (historyTrack != null) {
      return historyTrack;
    }

    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.tracks[this.currentIndex] as T;
    }

    return null;
  }

  /** Starts playback from first track in queue */
  public start(): T | null {
    if (this.tracks.length === 0) return null;
    this.currentIndex = 0;
    return this.tracks[0] as T;
  }

  /** Clears all tracks from queue */
  public clear(): void {
    this.tracks.length = 0;
    this.currentIndex = -1;
  }

  /** Clears track play history */
  public clearHistory(): void {
    this.history.length = 0;
  }

  /** Randomly shuffles queue tracks (excluding currently playing track) */
  public shuffle(): void {
    if (this.tracks.length <= 1) return;

    const startIdx = this.currentIndex >= 0 ? this.currentIndex + 1 : 0;
    for (let i = this.tracks.length - 1; i > startIdx; i--) {
      const j = startIdx + Math.floor(Math.random() * (i - startIdx + 1));
      const temp = this.tracks[i] as T;
      this.tracks[i] = this.tracks[j] as T;
      this.tracks[j] = temp;
    }
  }

  /** Removes a range of tracks from queue */
  public remove(startIndex: number, deleteCount: number = 1): T[] {
    if (startIndex < 0 || startIndex >= this.tracks.length) return [];
    const removed = this.tracks.splice(startIndex, deleteCount);

    if (this.currentIndex >= startIndex + deleteCount) {
      this.currentIndex -= removed.length;
    } else if (this.currentIndex >= startIndex) {
      if (this.tracks.length === 0) {
        this.currentIndex = -1;
      } else if (startIndex < this.tracks.length) {
        this.currentIndex = startIndex;
      } else {
        this.currentIndex = this.tracks.length - 1;
      }
    }

    return removed;
  }

  /** Moves a track from one index position to another */
  public move(fromIndex: number, toIndex: number): void {
    if (fromIndex < 0 || fromIndex >= this.tracks.length || toIndex < 0 || toIndex >= this.tracks.length) {
      throw new QueueError(`Invalid move indices: ${fromIndex} -> ${toIndex}`);
    }

    if (fromIndex === toIndex) return;

    const [track] = this.tracks.splice(fromIndex, 1) as [T];
    this.tracks.splice(toIndex, 0, track);

    if (this.currentIndex === fromIndex) {
      this.currentIndex = toIndex;
    } else if (fromIndex < toIndex) {
      if (this.currentIndex > fromIndex && this.currentIndex <= toIndex) {
        this.currentIndex--;
      }
    } else {
      if (this.currentIndex >= toIndex && this.currentIndex < fromIndex) {
        this.currentIndex++;
      }
    }
  }

  /** Replaces queue tracks with a new list */
  public setTracks(tracks: T[]): void {
    this.tracks.length = 0;
    this.tracks.push(...tracks);
    this.currentIndex = this.tracks.length > 0 ? 0 : -1;
  }

  /** Exports queue state for persistence or serialization */
  public export(): SerializedQueue<T> {
    return {
      tracks: [...this.tracks],
      history: [...this.history],
      currentIndex: this.currentIndex,
      repeatMode: this._repeatMode,
    };
  }

  /** Imports queue state from exported state */
  public import(state: SerializedQueue<T>): void {
    this.tracks.length = 0;
    this.tracks.push(...state.tracks);
    this.history.length = 0;
    this.history.push(...state.history);
    this.currentIndex = state.currentIndex;
    this._repeatMode = state.repeatMode;
  }

  private addCurrentToHistory(): void {
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
      this.history.push(this.tracks[this.currentIndex] as T);
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }
    }
  }

  /**
   * Returns a paginated slice of upcoming tracks in the queue.
   * @param page 1-based page number (default 1)
   * @param pageSize Number of items per page (default 10)
   */
  public getPage(page = 1, pageSize = 10): { tracks: T[]; page: number; totalPages: number; totalTracks: number } {
    const upcoming = this.tracks.slice(this.currentIndex + 1);
    const totalTracks = upcoming.length;
    const totalPages = Math.max(1, Math.ceil(totalTracks / pageSize));
    const normalizedPage = Math.max(1, Math.min(page, totalPages));
    const start = (normalizedPage - 1) * pageSize;
    const paginatedTracks = upcoming.slice(start, start + pageSize);

    return {
      tracks: paginatedTracks,
      page: normalizedPage,
      totalPages,
      totalTracks,
    };
  }
}


