import { RestError, LoadError } from "../errors/index.ts";
import { retry, promiseTimeout, type RetryOptions } from "../utils/index.ts";
import type {
  LoadResult,
  PlayerData,
  SessionData,
  TrackData,
  LavalinkInfo,
  RoutePlannerStatus,
  FiltersObject,
} from "../types/protocol.ts";

export interface RestClientOptions {
  host: string;
  port: number;
  password: string;
  secure?: boolean;
  sessionId?: string;
  timeout?: number;
  retryOptions?: RetryOptions;
}

function buildBaseUrl(host: string, port: number, secure?: boolean): string {
  return `${(secure ?? false) ? "https" : "http"}://${host}:${port}/v4`;
}

export class RestClient {
  private readonly baseUrl: string;
  private readonly password: string;
  private readonly timeout: number;
  private readonly retryOptions?: RetryOptions;
  private _sessionId: string | null;

  public constructor(options: RestClientOptions) {
    this.baseUrl = buildBaseUrl(options.host, options.port, options.secure);
    this.password = options.password;
    this.timeout = options.timeout ?? 15000;
    this.retryOptions = options.retryOptions;
    this._sessionId = options.sessionId ?? null;
  }

  public get sessionId(): string | null {
    return this._sessionId;
  }

  public set sessionId(id: string | null) {
    this._sessionId = id;
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: this.password,
      "Content-Type": "application/json",
      Accept: "application/json",
      "User-Agent": "YuKumo/0.0.1",
    };
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown,
    params?: Record<string, string>,
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value);
      }
    }

    const options: RequestInit = {
      method,
      headers: this.buildHeaders(),
      body: body != null ? JSON.stringify(body) : undefined,
      keepalive: true,
    };

    const doFetch = (): Promise<T> =>
      promiseTimeout(
        fetch(url.toString(), options).then(async (response) => {
          if (!response.ok) {
            let errorBody: Record<string, unknown> | undefined;
            try {
              errorBody = (await response.json()) as Record<string, unknown>;
            } catch {
              // ignore parse errors
            }

            const message = (errorBody?.message as string) ?? response.statusText;
            throw new RestError(message, response.status, path);
          }

          if (response.status === 204) {
            return undefined as T;
          }

          return response.json() as Promise<T>;
        }),
        this.timeout,
        `Request to ${method} ${path} timed out after ${this.timeout}ms`,
      );

    return retry(doFetch, this.retryOptions);
  }

  public async updateSession(
    sessionId: string,
    options: { resuming?: boolean; timeout?: number },
  ): Promise<SessionData> {
    return this.request<SessionData>("PATCH", `/sessions/${sessionId}`, options);
  }

  public async getPlayers(sessionId: string): Promise<PlayerData[]> {
    return this.request<PlayerData[]>("GET", `/sessions/${sessionId}/players`);
  }

  public async getPlayer(sessionId: string, guildId: string): Promise<PlayerData | null> {
    try {
      return await this.request<PlayerData>("GET", `/sessions/${sessionId}/players/${guildId}`);
    } catch (error) {
      if (error instanceof RestError && error.statusCode === 404) {
        return null;
      }
      throw error;
    }
  }

  public async updatePlayer(
    sessionId: string,
    guildId: string,
    options: {
      track?: { encoded?: string | null; identifier?: string; userData?: Record<string, unknown> } | null;
      position?: number;
      endTime?: number | null;
      volume?: number;
      paused?: boolean;
      filters?: FiltersObject;
      voice?: { token: string; endpoint: string; sessionId: string };
    },
    noReplace?: boolean,
  ): Promise<PlayerData> {
    const params: Record<string, string> = {};
    if (noReplace === true) {
      params.noReplace = "true";
    }
    return this.request<PlayerData>(
      "PATCH",
      `/sessions/${sessionId}/players/${guildId}`,
      options,
      Object.keys(params).length > 0 ? params : undefined,
    );
  }

  public async destroyPlayer(sessionId: string, guildId: string): Promise<void> {
    return this.request<void>("DELETE", `/sessions/${sessionId}/players/${guildId}`);
  }

  public async loadTracks(identifier: string): Promise<LoadResult> {
    return this.request<LoadResult>("GET", "/loadtracks", undefined, { identifier });
  }

  public async decodeTrack(encodedTrack: string): Promise<TrackData> {
    return this.request<TrackData>("GET", "/decodetrack", undefined, { encodedTrack });
  }

  public async decodeTracks(encodedTracks: string[]): Promise<TrackData[]> {
    return this.request<TrackData[]>("POST", "/decodetracks", encodedTracks);
  }

  public async getInfo(): Promise<LavalinkInfo> {
    return this.request<LavalinkInfo>("GET", "/info");
  }

  public async getStats(): Promise<Record<string, unknown>> {
    return this.request<Record<string, unknown>>("GET", "/stats");
  }

  public async getVersion(): Promise<string> {
    return this.request<string>("GET", "/version");
  }

  public async getRoutePlannerStatus(): Promise<RoutePlannerStatus> {
    return this.request<RoutePlannerStatus>("GET", "/routeplanner/status");
  }

  public async unmarkFailedAddress(address: string): Promise<void> {
    return this.request<void>("POST", "/routeplanner/free/address", {
      address,
    });
  }

  public async unmarkAllFailedAddresses(): Promise<void> {
    return this.request<void>("POST", "/routeplanner/free/all");
  }

  public async resolveTrack(identifier: string): Promise<TrackData> {
    const result = await this.loadTracks(identifier);

    switch (result.loadType) {
      case "track": {
        return result.data;
      }
      case "search": {
        if (result.data.length === 0) {
          throw new LoadError(`No results found for identifier: ${identifier}`);
        }
        return result.data[0] as TrackData;
      }
      case "playlist": {
        if (result.data.tracks.length === 0) {
          throw new LoadError(`Playlist is empty for identifier: ${identifier}`);
        }
        return result.data.tracks[0] as TrackData;
      }
      case "empty": {
        throw new LoadError(`No matches found for identifier: ${identifier}`);
      }
      case "error": {
        throw new LoadError(result.data.message ?? "Failed to load track");
      }
      default: {
        throw new LoadError(`Unexpected load result type: ${(result as LoadResult).loadType}`);
      }
    }
  }
}
