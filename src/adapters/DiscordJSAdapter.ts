import type { YuKumo } from "../Kumo.ts";

export interface MinimalDiscordJSClient {
  on(event: "raw", listener: (packet: { t: string; d: Record<string, unknown> }) => void): unknown;
  ws: {
    shards: {
      get(id: number): { send(data: unknown): void } | undefined;
    };
  };
  guilds: {
    cache: {
      get(id: string): { shardId: number; shard: { send(data: unknown): void } } | undefined;
    };
  };
  user?: { id: string } | null;
}

/**
 * First-class adapter connecting Yukumo with discord.js v14 clients.
 */
export class DiscordJSAdapter {
  private readonly client: MinimalDiscordJSClient;
  private readonly kumo: YuKumo;

  public constructor(client: MinimalDiscordJSClient, kumo: YuKumo) {
    this.client = client;
    this.kumo = kumo;

    this.setupListeners();
  }

  private setupListeners(): void {
    this.client.on("raw", (packet: { t: string; d: Record<string, unknown> }) => {
      if (!packet || !packet.t || !packet.d) return;

      if (packet.t === "VOICE_STATE_UPDATE") {
        const d = packet.d;
        this.kumo.handleVoiceStateUpdate({
          guildId: String(d.guild_id ?? ""),
          sessionId: String(d.session_id ?? ""),
          channelId: d.channel_id != null ? String(d.channel_id) : null,
          userId: String(d.user_id ?? ""),
        });
      } else if (packet.t === "VOICE_SERVER_UPDATE") {
        const d = packet.d;
        this.kumo.handleVoiceServerUpdate(String(d.guild_id ?? ""), {
          token: String(d.token ?? ""),
          endpoint: String(d.endpoint ?? ""),
        });
      }
    });
  }

  /**
   * Sends voice state update payload to Discord via discord.js shard connection
   */
  public sendVoiceStateUpdate(
    guildId: string,
    channelId: string | null,
    selfDeaf: boolean = true,
    selfMute: boolean = false,
  ): void {
    const guild = this.client.guilds.cache.get(guildId);
    if (!guild) return;

    guild.shard.send({
      op: 4,
      d: {
        guild_id: guildId,
        channel_id: channelId,
        self_deaf: selfDeaf,
        self_mute: selfMute,
      },
    });
  }
}
