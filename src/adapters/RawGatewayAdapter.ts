import type { YuKumo } from "../Kumo.ts";

export interface RawGatewayPacket {
  t: string;
  d: Record<string, unknown>;
  op?: number;
}

/**
 * Universal adapter for processing raw Discord Gateway WebSocket payloads directly.
 */
export class RawGatewayAdapter {
  private readonly kumo: YuKumo;

  public constructor(kumo: YuKumo) {
    this.kumo = kumo;
  }

  /**
   * Processes a raw Gateway WebSocket event packet.
   * Call this from your raw gateway listener.
   */
  public handleRawPacket(packet: RawGatewayPacket): void {
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
        endpoint: d.endpoint != null ? String(d.endpoint) : null,
      });
    } else if (packet.t === "CHANNEL_DELETE") {
      const d = packet.d;
      if (d.guild_id != null && d.id != null) {
        void this.kumo.handleChannelDelete(String(d.guild_id), String(d.id));
      }
    }
  }

  /**
   * Formats a standard Discord Opcode 4 (Voice State Update) payload object for sending to Discord WS.
   */
  public buildVoiceStatePayload(
    guildId: string,
    channelId: string | null,
    selfDeaf: boolean = true,
    selfMute: boolean = false,
  ): { op: 4; d: { guild_id: string; channel_id: string | null; self_deaf: boolean; self_mute: boolean } } {
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
