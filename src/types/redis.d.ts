declare module "redis" {
  export function createClient(options?: Record<string, unknown>): {
    get(key: string): Promise<string | null>;
    set(key: string, value: string): Promise<unknown>;
    del(key: string): Promise<number>;
    exists(key: string): Promise<number>;
    flushdb(): Promise<unknown>;
    quit(): Promise<unknown>;
    connect(): Promise<void>;
    on(event: string, listener: (...args: unknown[]) => void): void;
  };
}
