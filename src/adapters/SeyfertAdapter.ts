import { YuKumo } from "../Kumo.ts";

/**
 * Adapter for Seyfert Discord framework.
 */
export class SeyfertAdapter {
  private client: any;
  private kumo: YuKumo;

  private readonly packetListener = (packet: any): void => this.handlePacket(packet);
  private subscribedEvent: string | null = null;

  constructor(client: any, kumo: YuKumo) {
    this.client = client;
    this.kumo = kumo;
    this.setupListeners();
    this.kumo.registerAdapter(this);
  }

  private setupListeners(): void {
    if (typeof this.client?.events?.rawWS === "function") {
      this.client.events.rawWS(this.packetListener);
    } else if (typeof this.client?.on === "function") {
      // Subscribe to exactly one event name — clients emitting both "rawWS" and
      // "raw" would otherwise process every voice packet twice
      this.client.on("rawWS", this.packetListener);
      this.subscribedEvent = "rawWS";
    }
  }

  /** Detaches the gateway listener; called automatically by YuKumo.destroy() */
  public destroy(): void {
    if (this.subscribedEvent != null && typeof this.client?.off === "function") {
      this.client.off(this.subscribedEvent, this.packetListener);
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
    } else if (t === "CHANNEL_DELETE") {
      if (d.guild_id != null && d.id != null) {
        void this.kumo.handleChannelDelete(String(d.guild_id), String(d.id));
      }
    }
  }

  public sendVoiceStateUpdate(
    guildId: string,
    channelId: string | null,
    selfDeaf = true,
    selfMute = false,
  ): void {
    if (typeof this.client?.gateway?.send === "function") {
      this.client.gateway.send(0, {
        op: 4,
        d: { guild_id: guildId, channel_id: channelId, self_deaf: selfDeaf, self_mute: selfMute },
      });
    }
  }
}
