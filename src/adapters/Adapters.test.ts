import { describe, it, expect, vi } from "vitest";
import { DiscordJSAdapter } from "./DiscordJSAdapter.ts";
import { ErisAdapter } from "./ErisAdapter.ts";
import { RawGatewayAdapter } from "./RawGatewayAdapter.ts";
import { YuKumo } from "../Kumo.ts";

describe("Discord Adapters", () => {
  it("DiscordJSAdapter should handle voice events and send voice state updates", () => {
    const kumo = new YuKumo({ nodes: [] });
    const voiceStateSpy = vi.spyOn(kumo, "handleVoiceStateUpdate");
    const voiceServerSpy = vi.spyOn(kumo, "handleVoiceServerUpdate");

    let rawListener: ((packet: any) => void) | undefined;
    const sendMock = vi.fn();

    const mockClient = {
      on: vi.fn((event: string, listener: any) => {
        if (event === "raw") rawListener = listener;
      }),
      ws: { shards: { get: () => ({ send: sendMock }) } },
      guilds: { cache: { get: () => ({ shardId: 0, shard: { send: sendMock } }) } },
    };

    const adapter = new DiscordJSAdapter(mockClient as any, kumo);
    expect(rawListener).toBeDefined();

    rawListener?.({
      t: "VOICE_STATE_UPDATE",
      d: { guild_id: "123", session_id: "sess1", channel_id: "456", user_id: "789" },
    });
    expect(voiceStateSpy).toHaveBeenCalledWith({
      guildId: "123",
      sessionId: "sess1",
      channelId: "456",
      userId: "789",
    });

    rawListener?.({
      t: "VOICE_SERVER_UPDATE",
      d: { guild_id: "123", token: "tok1", endpoint: "ep1" },
    });
    expect(voiceServerSpy).toHaveBeenCalledWith("123", { token: "tok1", endpoint: "ep1" });

    adapter.sendVoiceStateUpdate("123", "456", true, false);
    expect(sendMock).toHaveBeenCalledWith({
      op: 4,
      d: { guild_id: "123", channel_id: "456", self_deaf: true, self_mute: false },
    });
  });

  it("ErisAdapter should handle rawWS events and send voice state updates", () => {
    const kumo = new YuKumo({ nodes: [] });
    const voiceStateSpy = vi.spyOn(kumo, "handleVoiceStateUpdate");

    let rawWsListener: ((packet: any) => void) | undefined;
    const sendWsMock = vi.fn();

    const mockErisClient = {
      on: vi.fn((event: string, listener: any) => {
        if (event === "rawWS") rawWsListener = listener;
      }),
      getGuildShard: () => ({ sendWS: sendWsMock }),
    };

    const adapter = new ErisAdapter(mockErisClient as any, kumo);
    expect(rawWsListener).toBeDefined();

    rawWsListener?.({
      t: "VOICE_STATE_UPDATE",
      d: { guild_id: "999", session_id: "sess9", channel_id: "888", user_id: "777" },
    });
    expect(voiceStateSpy).toHaveBeenCalled();

    adapter.sendVoiceStateUpdate("999", "888");
    expect(sendWsMock).toHaveBeenCalledWith(4, {
      guild_id: "999",
      channel_id: "888",
      self_deaf: true,
      self_mute: false,
    });
  });

  it("RawGatewayAdapter should process raw packets and build voice state payload", () => {
    const kumo = new YuKumo({ nodes: [] });
    const voiceServerSpy = vi.spyOn(kumo, "handleVoiceServerUpdate");
    const adapter = new RawGatewayAdapter(kumo);

    adapter.handleRawPacket({
      t: "VOICE_SERVER_UPDATE",
      d: { guild_id: "111", token: "tok", endpoint: "ep" },
    });
    expect(voiceServerSpy).toHaveBeenCalledWith("111", { token: "tok", endpoint: "ep" });

    const payload = adapter.buildVoiceStatePayload("111", "222");
    expect(payload).toEqual({
      op: 4,
      d: { guild_id: "111", channel_id: "222", self_deaf: true, self_mute: false },
    });
  });
});
