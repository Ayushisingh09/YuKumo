import type { RepeatMode } from "../types/internal.ts";
import { QueueError, QueueFullError } from "../errors/index.ts";

export interface QueueOptions {
  maxSize?: number;
  maxHistorySize?: number;
}

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

  public get size(): number {
    return this.tracks.length;
  }

  public get isEmpty(): boolean {
    return this.tracks.length === 0;
  }

  public get repeatMode(): RepeatMode {
    return this._repeatMode;
  }

  public get currentIndexInQueue(): number {
    return this.currentIndex;
  }

  public get currentTrack(): T | null {
    if (this.currentIndex < 0 || this.currentIndex >= this.tracks.length) {
      return null;
    }
    return this.tracks[this.currentIndex] as T;
  }

  public get tracksList(): readonly T[] {
    return this.tracks;
  }

  public get historyList(): readonly T[] {
    return this.history;
  }

  public setRepeatMode(mode: RepeatMode): this {
    this._repeatMode = mode;
    return this;
  }

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

  public start(): T | null {
    if (this.tracks.length === 0) return null;
    this.currentIndex = 0;
    return this.tracks[0] as T;
  }

  public clear(): void {
    this.tracks.length = 0;
    this.currentIndex = -1;
  }

  public shuffle(): void {
    for (let i = this.tracks.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      const temp = this.tracks[i] as T;
      this.tracks[i] = this.tracks[j] as T;
      this.tracks[j] = temp;
    }
  }

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

  public setTracks(tracks: T[]): void {
    this.tracks.length = 0;
    this.tracks.push(...tracks);
    this.currentIndex = this.tracks.length > 0 ? 0 : -1;
  }

  private addCurrentToHistory(): void {
    if (this.currentIndex >= 0 && this.currentIndex < this.tracks.length) {
      this.history.push(this.tracks[this.currentIndex] as T);
      if (this.history.length > this.maxHistorySize) {
        this.history.shift();
      }
    }
  }
}
