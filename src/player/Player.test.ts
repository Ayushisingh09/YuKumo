import { describe, it, expect, vi, beforeEach } from "vitest";
import { Player } from "./Player.ts";
import { PlayerManager } from "./PlayerManager.ts";
import { Node } from "../node/Node.ts";
import { VolumeFilter } from "../filters/Filters.ts";
import type { TrackData } from "../types/protocol.ts";

function createMockNode(name = "test-node"): Node {
  const node = new Node(
    {
      host: "localhost",
      port: 2333,
      password: "youshallnotpass",
      name,
    },
    "123456",
  );

  Object.defineProperty(node.ws, "eventDispatcher", {
    value: {
      on: vi.fn(),
      off: vi.fn(),
      emit: vi.fn(),
    },
    configurable: true,
  });

  Object.defineProperty(node.rest, "sessionId", {
    value: "test-session",
    writable: true,
    configurable: true,
  });

  node.rest.updatePlayer = vi.fn();
  node.rest.destroyPlayer = vi.fn();

  return node;
}

function createPlayer(node?: Node): Player {
  const kumoMock = {} as any;
  return new Player({
    guildId: "guild-1",
    node: node ?? createMockNode(),
    voiceChannelId: "channel-1",
    textChannelId: "text-1",
    kumo: kumoMock,
  });
}

const mockTrack: TrackData = {
  encoded: "AAA",
  info: {
    identifier: "test-id",
    isSeekable: true,
    author: "Test Author",
    length: 100000,
    isStream: false,
    position: 0,
    title: "Test Track",
    uri: null,
    artworkUrl: null,
    isrc: null,
    sourceName: "youtube",
  },
  pluginInfo: {},
};

describe("Player", () => {
  it("should create with guild and node", () => {
    const player = createPlayer();
    expect(player.guildId).toBe("guild-1");
    expect(player.voiceChannelId).toBe("channel-1");
    expect(player.textChannelId).toBe("text-1");
    expect(player.status).toBe("idle");
  });

  it("should initialize with empty queue and filters", () => {
    const player = createPlayer();
    expect(player.queue.isEmpty).toBe(true);
    expect(player.filters.getAll()).toHaveLength(0);
  });

  it("should return voice state", () => {
    const player = createPlayer();
    player.setVoiceState({
      sessionId: "sess-1",
      channelId: "ch-1",
      endpoint: "endpoint",
      token: "token",
    });

    const state = player.voiceState;
    expect(state.sessionId).toBe("sess-1");
    expect(state.token).toBe("token");
  });

  it("should enqueue and play track", async () => {
    const node = createMockNode();
    const player = createPlayer(node);

    player.queue.enqueue(mockTrack);

    await player.play();

    expect(node.rest.updatePlayer).toHaveBeenCalled();
    expect(player.status).toBe("playing");
  });

  it("should throw when playing with empty queue", async () => {
    const player = createPlayer();

    await expect(player.play()).rejects.toThrow("No tracks in queue");
  });

  it("should set volume", async () => {
    const node = createMockNode();
    const player = createPlayer(node);

    await player.setVolume(50);
    expect(player.volume).toBe(50);
  });

  it("should clamp volume to 0-1000 range", async () => {
    const node = createMockNode();
    const player = createPlayer(node);

    await player.setVolume(-10);
    expect(player.volume).toBe(0);

    await player.setVolume(2000);
    expect(player.volume).toBe(1000);
  });

  it("should pause", async () => {
    const node = createMockNode();
    const player = createPlayer(node);

    await player.pause();
    expect(player.paused).toBe(true);
    expect(player.status).toBe("paused");
  });

  it("should resume", async () => {
    const node = createMockNode();
    const player = createPlayer(node);

    await player.pause();
    await player.resume();
    expect(player.paused).toBe(false);
    expect(player.status).toBe("playing");
  });

  it("should stop", async () => {
    const node = createMockNode();
    const player = createPlayer(node);

    player.queue.enqueue(mockTrack);
    await player.play();
    await player.stop();

    expect(player.status).toBe("idle");
    expect(player.position).toBe(0);
  });

  it("should seek", async () => {
    const node = createMockNode();
    const player = createPlayer(node);

    await player.seek(30000);
    expect(node.rest.updatePlayer).toHaveBeenCalledWith("test-session", "guild-1", { position: 30000 });
  });

  it("should set voice channel", async () => {
    const player = createPlayer();
    await player.setVoiceChannel("channel-2", { selfDeaf: true });
    expect(player.voiceChannelId).toBe("channel-2");
  });

  it("should set node", async () => {
    const player = createPlayer();
    const newNode = createMockNode("new-node");
    await player.setNode(newNode);
    expect(player.node.id).toBe("new-node");
  });

  it("should destroy and cleanup", async () => {
    const node = createMockNode();
    const player = createPlayer(node);
    player.queue.enqueue(mockTrack);
    player.filters.add(new VolumeFilter(0.5));

    await player.destroy();

    expect(player.destroyed).toBe(true);
    expect(player.status).toBe("destroyed");
    expect(player.queue.isEmpty).toBe(true);
    expect(player.filters.getAll()).toHaveLength(0);
    expect(node.rest.destroyPlayer).toHaveBeenCalled();
  });

  it("should track position via playerUpdate", () => {
    const player = createPlayer();
    const node = player.node;

    const onCalls = (node.ws.eventDispatcher.on as ReturnType<typeof vi.fn>).mock.calls as Array<
      [string, unknown]
    >;
    const playerUpdateCall = onCalls.find((c) => c[0] === "playerUpdate");

    if (playerUpdateCall != null) {
      const handler = playerUpdateCall[1] as (guildId: string, state: { position: number }) => void;
      handler("guild-1", { position: 50000 });
    }

    expect(player.position).toBe(50000);
  });

  it("should set and clear filters in real time", async () => {
    const node = createMockNode();
    const player = createPlayer(node);

    player.filters.setBassBoost("high");
    await player.setFilters();
    expect(node.rest.updatePlayer).toHaveBeenCalled();

    await player.clearFilters();
    expect(player.filters.getAll()).toHaveLength(0);
  });

  it("should configure autoplay and fetcher", () => {
    const player = createPlayer();
    const mockFetcher = vi.fn();
    player.setAutoplay(true, mockFetcher);

    expect(player.autoplay).toBe(true);
    expect(player.autoplayFetcher).toBe(mockFetcher);
  });

  it("should throw on operations when destroyed", async () => {
    const player = createPlayer();
    await player.destroy();

    await expect(player.play()).rejects.toThrow("Player is destroyed");
    await expect(player.stop()).rejects.toThrow("Player is destroyed");
    await expect(player.pause()).rejects.toThrow("Player is destroyed");
    await expect(player.setVolume(50)).rejects.toThrow("Player is destroyed");
  });
});

describe("PlayerManager", () => {
  let manager: PlayerManager;

  beforeEach(() => {
    const kumoMock = {} as any;
    manager = new PlayerManager(kumoMock);
  });

  it("should create a player", () => {
    const player = manager.create({
      guildId: "guild-1",
      node: createMockNode(),
      voiceChannelId: "channel-1",
    });

    expect(player.guildId).toBe("guild-1");
    expect(manager.size()).toBe(1);
  });

  it("should return existing player for same guild", () => {
    const player1 = manager.create({
      guildId: "guild-1",
      node: createMockNode(),
      voiceChannelId: "channel-1",
    });
    const player2 = manager.create({
      guildId: "guild-1",
      node: createMockNode(),
      voiceChannelId: "channel-1",
    });

    expect(player1).toBe(player2);
    expect(manager.size()).toBe(1);
  });

  it("should get a player by guild id", () => {
    const player = manager.create({
      guildId: "guild-1",
      node: createMockNode(),
      voiceChannelId: "channel-1",
    });

    expect(manager.get("guild-1")).toBe(player);
    expect(manager.has("guild-1")).toBe(true);
    expect(manager.has("noop")).toBe(false);
  });

  it("should destroy a player", async () => {
    manager.create({
      guildId: "guild-1",
      node: createMockNode(),
      voiceChannelId: "channel-1",
    });

    const destroyed = await manager.destroy("guild-1");
    expect(destroyed).toBe(true);
    expect(manager.size()).toBe(0);
  });

  it("should return false destroying non-existent player", async () => {
    expect(await manager.destroy("noop")).toBe(false);
  });

  it("should get all players", () => {
    manager.create({
      guildId: "guild-1",
      node: createMockNode(),
      voiceChannelId: "channel-1",
    });
    manager.create({
      guildId: "guild-2",
      node: createMockNode("node-2"),
      voiceChannelId: "channel-2",
    });

    expect(manager.getAll()).toHaveLength(2);
  });

  it("should get players by node", () => {
    const node = createMockNode("shared-node");
    manager.create({
      guildId: "guild-1",
      node,
      voiceChannelId: "channel-1",
    });
    manager.create({
      guildId: "guild-2",
      node: createMockNode("other-node"),
      voiceChannelId: "channel-2",
    });

    const nodePlayers = manager.getByNode("shared-node");
    expect(nodePlayers).toHaveLength(1);
    expect(nodePlayers[0]?.guildId).toBe("guild-1");
  });

  it("should destroy all players", async () => {
    manager.create({
      guildId: "guild-1",
      node: createMockNode(),
      voiceChannelId: "channel-1",
    });
    manager.create({
      guildId: "guild-2",
      node: createMockNode(),
      voiceChannelId: "channel-2",
    });

    await manager.destroyAll();
    expect(manager.size()).toBe(0);
  });
});
