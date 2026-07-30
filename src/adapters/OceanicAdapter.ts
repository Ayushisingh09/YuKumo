import { YuKumo } from "../Kumo.ts";

/**
 * Adapter for Oceanic.js Discord library.
 */
export class OceanicAdapter {
  private client: any;
  private kumo: YuKumo;

  constructor(client: any, kumo: YuKumo) {
    this.client = client;
    this.kumo = kumo;
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof this.client?.on === "function") {
      this.client.on("packet", (packet: any) => {
        if (!packet || typeof packet !== "object") return;
        const t = packet.t;
        const d = packet.d;
        if (!t || !d) return;

        if (t === "VOICE_STATE_UPDATE") {
          this.kumo.handleVoiceStateUpdate({
            guildId: d.guild_id,
            sessionId: d.session_id,
            channelId: d.channel_id ?? null,
            userId: d.user_id,
          });
        } else if (t === "VOICE_SERVER_UPDATE") {
          this.kumo.handleVoiceServerUpdate(d.guild_id, {
            token: d.token,
            endpoint: d.endpoint ?? null,
          });
        }
      });
    }
  }

  public sendVoiceStateUpdate(guildId: string, channelId: string | null, selfDeaf = true, selfMute = false): void {
    const guild = this.client?.guilds?.get?.(guildId);
    if (guild && typeof guild.shard?.send === "function") {
      guild.shard.send(4, {
        guild_id: guildId,
        channel_id: channelId,
        self_deaf: selfDeaf,
        self_mute: selfMute,
      });
    }
  }
}
