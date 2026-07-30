# Yukumo

High-Performance, Framework-Agnostic Lavalink v4 Client for JavaScript and TypeScript.

[![npm version](https://img.shields.io/npm/v/yukumo?color=0052cc&label=npm)](https://www.npmjs.com/package/yukumo)
[

![npm downloads](https://img.shields.io/npm/dt/yukumo?color=success&label=downloads)

](https://www.npmjs.com/package/yukumo)
[

![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)

](LICENSE)
[

![Lavalink v4](https://img.shields.io/badge/Lavalink-v4-1DB954)

](https://lavalink.dev/)
[

![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)

](https://www.typescriptlang.org/)
[

![Documentation](https://img.shields.io/badge/Docs-yukumo.vercel.app-000000)

](https://yukumo.vercel.app)

---

## Overview

Yukumo is an enterprise-grade, lightweight, zero-dependency client library designed to interface seamlessly with Lavalink v4 audio servers. It treats JavaScript (CommonJS & ESM) and TypeScript as equal first-class targets, providing JSDoc-powered editor autocomplete for JavaScript consumers and strict, generic-capable typing with zero `any` declarations for TypeScript projects.

Documentation: [https://yukumo.vercel.app](https://yukumo.vercel.app)

---

## Architectural Comparison

| Architectural Capability | Yukumo | Hoshimi | Kazagumo | Poru | lavalink-client |
|---|:---:|:---:|:---:|:---:|:---:|
| Full Lavalink v4 REST + WebSocket Protocol | Yes | Partial | Partial | Partial | Yes |
| Equal First-Class JS & TS Parity | Yes | No | No | No | TypeScript-First |
| Native Dual Build (CommonJS + ESM) | Yes | Partial | Partial | Partial | Partial |
| REST Response Caching & 429 Retry Backoff | Yes | No | No | No | No |
| Multi-Node Load Balancing (8 Strategies) | Yes | No | No | No | Partial |
| Automatic Node Failover & Migration | Yes | No | No | No | Partial |
| Native Framework Adapters (`discord.js`, `Eris`, `Seyfert`, `Oceanic`, `Discordeno`) | Yes | No | No | No | No |
| Audio Filter DSP Presets (`BassBoost`, `Nightcore`, `8D`...) | Yes | No | No | No | Partial |
| Distributed State Architecture (`RedisStorage`) | Yes | No | No | No | No |
| OpenMetrics / Prometheus Exporter | Yes | No | No | No | No |

---

## Technical Features

- **Protocol Coverage**: Native support for Lavalink v4 REST API endpoints (search, decode, sessions, routeplanner unmark/status, plugins) and WebSocket events (player updates, stats, event dispatching).
- **LavaSearch Multi-Category Search**: Integrated `lavaSearch` method supporting concurrent queries across tracks, albums, artists, playlists, and text sources.
- **Node Management & Load Balancing**: 8 node selection algorithms: `LeastUsed`, `LeastPenalty`, `CpuUsage`, `MemoryUsage`, `LowestPing`, `RoundRobin`, `Random`, and `CustomSelector`.
- **Zero-Downtime Auto-Failover**: Automatic player migration to healthy nodes in the event of WebSocket disconnection or server fault.
- **REST Caching & Backoff**: Built-in TTL response caching for track search/decoding requests, accompanied by HTTP 429 `Retry-After` header parsing and exponential retry backoff.
- **Queue System & Pagination**: Supports repeat modes (`off`, `track`, `queue`), play history tracking, array shuffling, priority track injection (`priorityEnqueue`), state serialization (`export()` / `import()`), and pagination (`getPage`).
- **Audio DSP Filters & Presets**: Complete DSP filter chain control (Equalizer, Karaoke, Timescale, Tremolo, Vibrato, Rotation, Distortion, ChannelMix, LowPass) plus instant audio presets (`setBassBoost()`, `setNightcore()`, `setVaporwave()`, `set8D()`, `setKaraoke()`).
- **Framework Adapters**: First-class gateway integration adapters for `discord.js` v14 (`DiscordJSAdapter`), `Eris` (`ErisAdapter`), `Seyfert` (`SeyfertAdapter`), `Oceanic.js` (`OceanicAdapter`), `Discordeno` (`DiscordenoAdapter`), and raw gateway packets (`RawGatewayAdapter`).
- **Plugins**: Pre-built wrappers for LavaSrc (Spotify, Apple Music, Deezer, Yandex Music), SponsorBlock segment filtering, and FloweryTTS text-to-speech.
- **Observability & Logging**: Integrated `PrometheusExporter` generating OpenMetrics format text output for Grafana dashboards, along with a pluggable `Logger` interface.
- **Distributed State**: Drop-in `RedisStorage` adapter for multi-process and sharded architecture deployments.

---

## Installation

```bash
npm install yukumo
# or
bun add yukumo
```

---

## Code Examples

### JavaScript (CommonJS)

```js
const { Client, GatewayIntentBits } = require("discord.js");
const { YuKumo, DiscordJSAdapter, LeastPenaltySelector } = require("yukumo");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const yukumo = new YuKumo({
  nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
  defaultNodeSelector: new LeastPenaltySelector(),
});

const adapter = new DiscordJSAdapter(client, yukumo);

yukumo.on("nodeReady", (nodeId) => console.log(`[Yukumo] Node connected: ${nodeId}`));
yukumo.on("trackStart", (guildId, track) => console.log(`Playing: ${track.info.title}`));

client.once("ready", async () => {
  yukumo.setUserId(client.user.id);
  await yukumo.init();
});

client.on("messageCreate", async (message) => {
  if (message.author.bot || !message.content.startsWith("!play ")) return;

  const query = message.content.slice(6).trim();
  const voiceChannel = message.member?.voice?.channel;
  if (!voiceChannel) return message.reply("Join a voice channel first!");

  const res = await yukumo.search(query);
  if (res.tracks.length === 0) return message.reply("No tracks found!");

  await yukumo.createPlayer({
    guildId: message.guild.id,
    voiceChannelId: voiceChannel.id,
    textChannelId: message.channel.id,
  });

  adapter.sendVoiceStateUpdate(message.guild.id, voiceChannel.id);
  await yukumo.play(message.guild.id, res.tracks[0]);
  message.reply(`Playing: ${res.tracks[0].info.title}`);
});

client.login(process.env.DISCORD_TOKEN);
```

### JavaScript (ESM)

```js
import { Client, GatewayIntentBits } from "discord.js";
import { YuKumo, DiscordJSAdapter, LeastUsedSelector } from "yukumo";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const yukumo = new YuKumo({
  nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
  defaultNodeSelector: new LeastUsedSelector(),
});

const adapter = new DiscordJSAdapter(client, yukumo);

client.once("ready", async () => {
  yukumo.setUserId(client.user.id);
  await yukumo.init();
});

client.login(process.env.DISCORD_TOKEN);
```

### TypeScript

```ts
import { Client, GatewayIntentBits, Message } from "discord.js";
import { YuKumo, DiscordJSAdapter, TrackData, SearchResult, LeastPenaltySelector } from "yukumo";

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

const yukumo = new YuKumo({
  nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
  defaultNodeSelector: new LeastPenaltySelector(),
});

const adapter = new DiscordJSAdapter(client, yukumo);

client.once("ready", async () => {
  if (!client.user) return;
  yukumo.setUserId(client.user.id);
  await yukumo.init();
});

client.on("messageCreate", async (message: Message) => {
  if (message.author.bot || !message.guild || !message.member?.voice.channel) return;

  if (message.content.startsWith("!play ")) {
    const query = message.content.slice(6).trim();
    const searchRes: SearchResult = await yukumo.search(query);

    if (searchRes.tracks.length === 0) {
      await message.reply("No tracks found.");
      return;
    }

    const track: TrackData = searchRes.tracks[0];
    const player = await yukumo.createPlayer({
      guildId: message.guild.id,
      voiceChannelId: message.member.voice.channel.id,
      textChannelId: message.channel.id,
    });

    adapter.sendVoiceStateUpdate(message.guild.id, message.member.voice.channel.id);
    await yukumo.play(message.guild.id, track);
    player.filters.setBassBoost("medium");
    await message.reply(`Now playing: ${track.info.title}`);
  }
});

client.login(process.env.DISCORD_TOKEN);
```

---

## Reference Examples

Functional reference implementations are located in the `examples/` directory:
- [CommonJS JavaScript Bot](examples/js-cjs/bot.js)
- [ESM JavaScript Bot](examples/js-esm/bot.js)
- [TypeScript Bot](examples/ts/bot.ts)

---

## Community & Contributing

- Showcase: See [SHOWCASE.md](SHOWCASE.md) to register projects utilizing Yukumo.
- Contributing: See [CONTRIBUTING.md](CONTRIBUTING.md) for environment setup and contribution guidelines.
- Documentation: [https://yukumo.vercel.app](https://yukumo.vercel.app)

---

## License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
