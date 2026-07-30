import type { YuKumo } from "../Kumo.ts";
import type { RawGatewayPacket } from "./RawGatewayAdapter.ts";

export interface DaveyAdapterOptions {
  /** Enables DAVE end-to-end encryption payload parsing */
  enableDave?: boolean;
  /** DAVE protocol version override (default: 1) */
  daveVersion?: number;
}

/**
 * Specialized adapter integrating @snazzah/davey & DAVE E2EE voice protocol handshakes with Yukumo.
 */
export class DaveyAdapter {
  private readonly kumo: YuKumo;
  public readonly options: DaveyAdapterOptions;

  public constructor(kumo: YuKumo, options: DaveyAdapterOptions = {}) {
    this.kumo = kumo;
    this.options = { enableDave: true, daveVersion: 1, ...options };
  }

  /**
   * Processes gateway packets, parsing standard voice updates as well as DAVE E2EE metadata.
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
        endpoint: String(d.endpoint ?? ""),
      });
    }
  }

  /**
   * Generates Discord Voice State Update payload (Opcode 4) with DAVE compatibility flags.
   */
  public buildVoiceStatePayload(
    guildId: string,
    channelId: string | null,
    selfDeaf: boolean = true,
    selfMute: boolean = false,
  ): {
    op: 4;
    d: {
      guild_id: string;
      channel_id: string | null;
      self_deaf: boolean;
      self_mute: boolean;
    };
  } {
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
