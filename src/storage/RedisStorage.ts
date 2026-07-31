import type { StorageAdapter } from "../types/internal.ts";

export interface RedisStorageOptions {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  database?: number;
  keyPrefix?: string;
}

type RedisClient = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
  del(key: string | string[]): Promise<number>;
  exists(key: string): Promise<number>;
  scanIterator(options: { MATCH: string; COUNT: number }): AsyncIterable<string | string[]>;
  quit(): Promise<unknown>;
};

export class RedisStorage implements StorageAdapter {
  private client: RedisClient | null = null;
  private readonly options: RedisStorageOptions;
  private readonly prefix: string;

  public constructor(options?: RedisStorageOptions) {
    this.options = options ?? {};
    this.prefix = this.options.keyPrefix ?? "YuKumo:";
  }

  private getKey(key: string): string {
    return `${this.prefix}${key}`;
  }

  public async connect(): Promise<void> {
    if (this.client != null) return;

    try {
      const { createClient } = await import("redis");
      const redisOptions: Record<string, unknown> = {};

      if (this.options.url != null) {
        redisOptions.url = this.options.url;
      } else {
        redisOptions.socket = {
          host: this.options.host ?? "localhost",
          port: this.options.port ?? 6379,
        };
        if (this.options.password != null) {
          redisOptions.password = this.options.password;
        }
      }

      if (this.options.database != null) {
        redisOptions.database = this.options.database;
      }

      const client = createClient(redisOptions);
      await client.connect();
      this.client = client;
    } catch {
      throw new Error(
        "Failed to connect to Redis. Ensure the 'redis' package is installed: npm install redis",
      );
    }
  }

  public async get(key: string): Promise<unknown | null> {
    if (this.client == null) throw new Error("Redis not connected");

    const value = await this.client.get(this.getKey(key));
    if (value == null) return null;

    try {
      return JSON.parse(value) as unknown;
    } catch {
      return value;
    }
  }

  public async set(key: string, value: unknown): Promise<void> {
    if (this.client == null) throw new Error("Redis not connected");

    const serialized = JSON.stringify(value);
    await this.client.set(this.getKey(key), serialized);
  }

  public async delete(key: string): Promise<boolean> {
    if (this.client == null) throw new Error("Redis not connected");

    const result = await this.client.del(this.getKey(key));
    return result > 0;
  }

  public async has(key: string): Promise<boolean> {
    if (this.client == null) throw new Error("Redis not connected");

    const result = await this.client.exists(this.getKey(key));
    return result === 1;
  }

  public async clear(): Promise<void> {
    if (this.client == null) throw new Error("Redis not connected");

    // Delete only keys under our prefix — FLUSHDB would wipe unrelated data
    // from applications sharing the same Redis database
    const batch: string[] = [];
    for await (const key of this.client.scanIterator({ MATCH: `${this.prefix}*`, COUNT: 250 })) {
      // node-redis v4 yields strings; v5 yields string arrays
      if (Array.isArray(key)) {
        batch.push(...key);
      } else {
        batch.push(key);
      }
      if (batch.length >= 250) {
        await this.client.del(batch.splice(0, batch.length));
      }
    }
    if (batch.length > 0) {
      await this.client.del(batch);
    }
  }

  public async disconnect(): Promise<void> {
    if (this.client != null) {
      await this.client.quit();
      this.client = null;
    }
  }
}
