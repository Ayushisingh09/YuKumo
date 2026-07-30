/**
 * Integration tests against a real Lavalink v4 instance.
 *
 * These tests require Docker. Run:
 *   bun run test:integration
 *
 * Or manually:
 *   cd test && docker compose up -d
 *   bun vitest run test/integration.test.ts
 *   cd test && docker compose down
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { YuKumo } from "../src/YuKumo.ts";

const LAVALINK_HOST = process.env.LAVALINK_HOST ?? "localhost";
const LAVALINK_PORT = Number(process.env.LAVALINK_PORT ?? 2333);
const LAVALINK_PASS = process.env.LAVALINK_PASS ?? "youshallnotpass";

describe("integration", () => {
  let YuKumo: YuKumo;

  beforeAll(async () => {
    YuKumo = new YuKumo({
      nodes: [
        {
          host: LAVALINK_HOST,
          port: LAVALINK_PORT,
          password: LAVALINK_PASS,
          name: "integration-node",
        },
      ],
    });

    await YuKumo.init();
  }, 30000);

  afterAll(async () => {
    await YuKumo.destroy();
  });

  it("should connect to Lavalink node", () => {
    const node = YuKumo.getNode("integration-node");
    expect(node).toBeDefined();
    expect(node!.state).toBe("connected");
  });

  it("should retrieve Lavalink server info", async () => {
    const node = YuKumo.getNode("integration-node")!;
    const info = await node.rest.getInfo();
    expect(info).toBeDefined();
    expect(info.version).toBeDefined();
  });

  it("should search for tracks via HTTP source", async () => {
    const result = await YuKumo.search(
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    );
    expect(result.loadType).toBe("track");
    expect(result.tracks.length).toBe(1);
    expect(result.tracks[0]!.info.title).toBeDefined();
  });

  it("should handle empty search gracefully", async () => {
    const result = await YuKumo.search({
      query: "zzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzzz",
    });
    expect(result.loadType).toBe("empty");
    expect(result.tracks).toEqual([]);
  });

  it("should decode a track", async () => {
    const node = YuKumo.getNode("integration-node")!;
    const result = await YuKumo.search(
      "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    );
    expect(result.tracks.length).toBeGreaterThan(0);

    const decoded = await node.rest.decodeTrack(result.tracks[0]!.encoded);
    expect(decoded.info.title).toBe(result.tracks[0]!.info.title);
  });

  it("should retrieve server stats", async () => {
    const node = YuKumo.getNode("integration-node")!;
    const stats = await node.rest.getStats();
    expect(stats).toBeDefined();
  });
}, 60000);
