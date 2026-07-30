<div align="center">

# Yukumo (YuKumo)

**The most powerful, lightweight, production-ready [Lavalink v4](https://lavalink.dev/) client for JavaScript and TypeScript.**

[![npm version](https://img.shields.io/npm/v/yukumo?color=cb3837&label=npm)](https://www.npmjs.com/package/yukumo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Lavalink v4](https://img.shields.io/badge/Lavalink-v4-1DB954)](https://lavalink.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

ESM + CommonJS Dual Build · Full Lavalink v4 Protocol Coverage · First-Class JS & TS Support · Zero Runtime Dependencies

</div>

---

## 🚀 Why Yukumo?

Yukumo is engineered to outperform older Lavalink wrappers (Hoshimi, Kazagumo, Poru, lavalink-client, Erela.js). It provides **equal first-class support for JavaScript and TypeScript developers**—giving JS developers rich JSDoc-powered autocomplete in editors, and TS developers strict, generic-capable types with zero `any`.

| Feature | Yukumo | Hoshimi | Kazagumo | Poru | lavalink-client |
|---|:---:|:---:|:---:|:---:|:---:|
| **Full Lavalink v4 REST + WS** | ✅ | ⚠️ | ⚠️ | ⚠️ | ✅ |
| **JS & TS Equal Priority** | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ TS-first |
| **Native Dual Build (CJS + ESM)** | ✅ | ⚠️ | ⚠️ | ⚠️ | ⚠️ |
| **REST Caching & 429 Backoff** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Node Pool Load Balancing (8 Strategies)** | ✅ | ❌ | ❌ | ❌ | ⚠️ |
| **Auto Node Failover & Migration** | ✅ | ❌ | ❌ | ❌ | ⚠️ |
| **First-Class Framework Adapters** | ✅ (`discord.js`, `Eris`, `Raw`) | ❌ | ❌ | ❌ | ❌ |
| **Audio Filter Presets** | ✅ (`bassboost`, `nightcore`, `8d`...) | ❌ | ❌ | ❌ | ⚠️ |
| **Redis Distributed State** | ✅ (`RedisStorage`) | ❌ | ❌ | ❌ | ❌ |

---

## ✨ Features

- **Lavalink v4 Protocol**: Full coverage of players, tracks, filters, routeplanner status/unmark, sessions, resuming, and plugins.
- **Node Pool & Load Balancing**: 8 built-in node selection strategies: `LeastUsed`, `LeastPenalty`, `CpuUsage`, `MemoryUsage`, `LowestPing`, `RoundRobin`, `Random`, and `CustomSelector`.
- **Auto Node Failover**: Zero-downtime audio migration when a Lavalink node disconnects mid-track.
- **REST Caching & Rate Limit Handling**: In-memory response caching for track search/decode requests, with HTTP 429 `Retry-After` backoff.
- **Queue Manager**: Loop modes (`off`, `track`, `queue`), play history, shuffle, range removal, priority queueing (`priorityEnqueue`), and state serialization (`export()` / `import()`).
- **Filters & Audio Presets**: Complete DSP audio filter suite plus instant presets: `setBassBoost()`, `setNightcore()`, `setVaporwave()`, `set8D()`, and `setKaraoke()`.
- **First-Class Adapters**: `DiscordJSAdapter` (discord.js v14), `ErisAdapter` (Eris), and `RawGatewayAdapter` (Oceanic.js, Seyfert, or custom gateways).
- **Plugins**: Integrated plugin hooks and helpers for LavaSrc (Spotify, Apple Music, Deezer, Yandex Music), SponsorBlock, and FloweryTTS.
- **Redis State Storage**: Pluggable storage architecture with a ready-to-use `RedisStorage` adapter for multi-process or sharded bots.

---

## 📦 Installation

```bash
npm install YuKumo
# or
bun add YuKumo
```

---

## 💻 Quickstart

### JavaScript (CommonJS)

```js
const { Client, GatewayIntentBits } = require("discord.js");
const { YuKumo, DiscordJSAdapter, LeastPenaltySelector } = require("YuKumo");

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const yukumo = new YuKumo({
  nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
  defaultNodeSelector: new LeastPenaltySelector(),
});

const adapter = new DiscordJSAdapter(client, yukumo);

yukumo.on("nodeReady", (nodeId) => console.log(`[Yukumo] Node ready: ${nodeId}`));
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
  message.reply(`Playing: **${res.tracks[0].info.title}**`);
});

client.login(process.env.DISCORD_TOKEN);
```

### JavaScript (ESM)

```js
import { Client, GatewayIntentBits } from "discord.js";
import { YuKumo, DiscordJSAdapter } from "YuKumo";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const yukumo = new YuKumo({
  nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
});

const adapter = new DiscordJSAdapter(client, yukumo);
```

### TypeScript

```ts
import { Client, GatewayIntentBits } from "discord.js";
import { YuKumo, DiscordJSAdapter, TrackData, SearchResult } from "YuKumo";

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

const yukumo = new YuKumo({
  nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
});

const adapter = new DiscordJSAdapter(client, yukumo);
```

---

## 📂 Reference Example Bots

Check out full, functional reference implementations in the repository:
- 📄 [Plain JavaScript (CommonJS) Bot](examples/js-cjs/bot.js)
- 📄 [Plain JavaScript (ESM) Bot](examples/js-esm/bot.js)
- 📄 [TypeScript Bot](examples/ts/bot.ts)
- 🤖 [Complete Slash-Command Reference Discord Bot](../discord-bot/src/index.ts)

---

## 🌟 Community Showcase

Are you using Yukumo in your Discord bot or open-source project? Check out [SHOWCASE.md](SHOWCASE.md) to view featured projects and submit your own!

---

## 🤝 Contributing

Contributions are warmly welcomed! Please read our [CONTRIBUTING.md](CONTRIBUTING.md) guide for details on local environment setup, running tests, typechecks, and submitting Pull Requests.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.