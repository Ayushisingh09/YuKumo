export function createDeferred<T = void>(): {
  promise: Promise<T>;
  resolve: (value: T | PromiseLike<T>) => void;
  reject: (reason: unknown) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason: unknown) => void;

  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, resolve, reject };
}

export function promiseTimeout<T>(promise: Promise<T>, ms: number, errorMessage?: string): Promise<T> {
  const timeout = new Promise<never>((_, reject) => {
    const id = setTimeout(() => {
      reject(new Error(errorMessage ?? `Promise timed out after ${ms}ms`));
    }, ms);
    if (typeof id === "object" && typeof id.unref === "function") {
      id.unref();
    }
  });

  return Promise.race([promise, timeout]);
}

export interface RetryOptions {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  shouldRetry?: (error: unknown) => boolean;
}

export async function retry<T>(fn: () => Promise<T>, options?: RetryOptions): Promise<T> {
  const maxRetries = options?.maxRetries ?? 3;
  const baseDelay = options?.baseDelay ?? 1000;
  const maxDelay = options?.maxDelay ?? 15000;
  const shouldRetry = options?.shouldRetry ?? ((_error: unknown) => true);

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && shouldRetry(error)) {
        const delay = Math.min(baseDelay * 2 ** attempt, maxDelay);
        await new Promise((resolve) => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
}

export function generateSnowflake(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `${timestamp}${random}`;
}

export function noop(): void {}

export function isPromise(value: unknown): value is Promise<unknown> {
  return (
    typeof value === "object" && value !== null && typeof (value as Promise<unknown>).then === "function"
  );
}

export { type Logger, ConsoleLogger } from "./Logger.ts";
