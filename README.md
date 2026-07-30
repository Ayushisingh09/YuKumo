<div align="center">

# Yukumo

**A modern, lightweight, production-ready [Lavalink v4](https://lavalink.dev/) client for JavaScript and TypeScript.**

[![npm version](https://img.shields.io/npm/v/yukumo?color=cb3837&label=npm)](https://www.npmjs.com/package/yukumo)
[![npm downloads](https://img.shields.io/npm/dm/yukumo?color=blue)](https://www.npmjs.com/package/yukumo)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Lavalink v4](https://img.shields.io/badge/Lavalink-v4-1DB954)](https://lavalink.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-Strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

Zero runtime dependencies · ESM + CJS · Node.js + Bun · Full type safety

[Documentation](https://yukumo.js.org) · [Getting Started](https://yukumo.js.org/getting-started) · [API Reference](https://yukumo.js.org/api-reference) · [Discord](#)

</div>

---

## Why Yukumo

Most Lavalink clients are either abandoned, TypeScript-only with JS bolted on as an afterthought, or carry dependency baggage you didn't ask for. Yukumo is built to fix that: a single, actively maintained client with full Lavalink v4 protocol coverage, first-class support for both JS and TS, and zero runtime dependencies — so it stays light and doesn't break because something upstream did.

| | Yukumo | Others |
|---|:---:|:---:|
| Full Lavalink v4 protocol (REST + WS) | ✅ | ⚠️ Partial in most |
| Zero runtime dependencies | ✅ | ❌ |
| JS and TS as equal first-class citizens | ✅ | ⚠️ TS-first, JS an afterthought |
| Native ESM + CJS dual output | ✅ | ⚠️ Often ESM-only or CJS-only |
| Session resuming + auto-reconnect | ✅ | ⚠️ Varies |
| Built-in plugin lifecycle system | ✅ | ❌ |
| Pluggable node selectors | ✅ (4 built-in) | ❌ |
| Redis-backed distributed state | ✅ | ❌ |

## Features

- **Full Lavalink v4 support** — Complete REST + WebSocket protocol coverage, including sessions, resuming, route planner, and plugins (LavaSrc, SponsorBlock, and more)
- **TypeScript-first, JS-equal** — Strict types and rich IntelliSense for TS; the same clean, documented API and JSDoc-powered autocomplete for plain JS
- **Multi-node architecture** — 4 built-in load-balancing selectors (CPU, memory, players, ping), or bring your own strategy
- **Resilient by default** — Configurable auto-reconnect with backoff, session resuming, and automatic track requeue on node failure
- **Extensible plugin system** — 9 lifecycle hooks to extend core behavior without forking the library
- **Complete filter suite** — All 10 standard Lavalink filters, with presets and chaining support
- **Flexible storage** — In-memory by default, with a drop-in Redis adapter for multi-process and sharded deployments
- **Dual module output** — Native `import`/`export` with a CJS fallback that just works
- **Zero runtime dependencies** — Nothing beyond the standard library, so nothing upstream can break you

## Installation

```bash
npm install yukumo
# or
bun add yukumo
# or
yarn add yukumo
# or
pnpm add yukumo
```

## Quick Start

**TypeScript**

```ts
import { Yukumo } from "yukumo";

const client = new Yukumo({
  nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
});

await client.init();

// Forward Discord voice events from your gateway
client.handleVoiceStateUpdate(voiceStateData);
client.handleVoiceServerUpdate(guildId, voiceServerData);

// Search and play
const result = await client.search("lofi hip hop");
const player = await client.createPlayer({ guildId, voiceChannelId });
await client.play(guildId, result.tracks[0]);
```

**JavaScript**

```js
const { Yukumo } = require("yukumo");

const client = new Yukumo({
  nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
});

await client.init();

client.handleVoiceStateUpdate(voiceStateData);
client.handleVoiceServerUpdate(guildId, voiceServerData);

const result = await client.search("lofi hip hop");
const player = await client.createPlayer({ guildId, voiceChannelId });
await client.play(guildId, result.tracks[0]);
```

Every example in the docs is shown in both languages — Yukumo treats JS as a first-class target, not a stripped-down TS build.

## Documentation

| Guide | Description |
|---|---|
| [Getting Started](https://yukumo.js.org/getting-started) | Install, connect a node, play your first track |
| [API Reference](https://yukumo.js.org/api-reference) | Full method, event, and type reference |
| [Plugin Development](https://yukumo.js.org/plugin-development) | Build your own plugins with the lifecycle hook system |
| [Migration Guides](https://yukumo.js.org/migration) | Coming from Hoshimi, Kazagumo, Poru, or lavalink-client |

## Framework Examples

| Library | Example |
|---|---|
| [discord.js v14](https://discord.js.org) | [`examples/discordjs/`](examples/discordjs/) |
| [Seyfert](https://seyfert.dev) | [`examples/seyfert/`](examples/seyfert/) |
| [Eris](https://abal.moe/Eris/) | [`examples/eris/`](examples/eris/) |
| [Oceanic.js](https://oceanic.ws) | [`examples/oceanic/`](examples/oceanic/) |
| [Discordeno](https://discordeno.mod.land) | [`examples/discordeno/`](examples/discordeno/) |

## Contributing

Contributions are welcome — bug reports, feature requests, and PRs alike. Check the [contributing guide](CONTRIBUTING.md) before opening a PR.

## License

MIT © Yukumo Contributors