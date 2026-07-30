import { YuKumo } from "../Kumo.ts";

/**
 * Adapter for Discordeno framework.
 */
export class DiscordenoAdapter {
  private kumo: YuKumo;

  constructor(kumo: YuKumo) {
    this.kumo = kumo;
  }

  public handleRaw(packet: any): void {
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
  }

  public buildVoiceStatePayload(guildId: string, channelId: string | null, selfDeaf = true, selfMute = false) {
    return {
      op: 4,
      d: {
        guild_id: guildId,
        channel_id: channelId,
        self_deaf: selfDeaf,
        self_mute: selfMute,
      },
    };
  }
}
