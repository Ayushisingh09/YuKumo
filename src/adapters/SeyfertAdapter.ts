import { YuKumo } from "../Kumo.ts";

/**
 * Adapter for Seyfert Discord framework.
 */
export class SeyfertAdapter {
  private client: any;
  private kumo: YuKumo;

  constructor(client: any, kumo: YuKumo) {
    this.client = client;
    this.kumo = kumo;
    this.setupListeners();
  }

  private setupListeners(): void {
    if (typeof this.client?.events?.rawWS === "function") {
      this.client.events.rawWS((packet: any) => this.handlePacket(packet));
    } else if (typeof this.client?.on === "function") {
      this.client.on("rawWS", (packet: any) => this.handlePacket(packet));
      this.client.on("raw", (packet: any) => this.handlePacket(packet));
    }
  }

  public handlePacket(packet: any): void {
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

  public sendVoiceStateUpdate(guildId: string, channelId: string | null, selfDeaf = true, selfMute = false): void {
    if (typeof this.client?.gateway?.send === "function") {
      this.client.gateway.send(0, {
        op: 4,
        d: { guild_id: guildId, channel_id: channelId, self_deaf: selfDeaf, self_mute: selfMute },
      });
    }
  }
}
