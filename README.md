# YuKumo

A modern, lightweight, production-ready [Lavalink v4](https://lavalink.dev/) client for TypeScript and JavaScript.

Zero runtime deps. ESM + CJS. Bun + Node.js. Full type safety.

## Features

- **Lavalink v4** — Full REST + WebSocket protocol support
- **TypeScript-first** — Strict types, excellent IntelliSense
- **Multi-node** — 4 built-in selectors; plug in your own
- **Auto-reconnect** — Configurable retry, backoff, session resuming
- **Plugin system** — 9 lifecycle hooks; extend without forking
- **Filters** — All 10 standard Lavalink filters included
- **Storage** — In-memory by default; Redis adapter available
- **ESM + CJS** — Native `import`/`export`, dual-module fallback
- **Zero deps** — No runtime dependencies beyond the standard library

## Installation

```bash
bun add YuKumo
npm install YuKumo
yarn add YuKumo
pnpm add YuKumo
```

## Quick Start

```ts
import { YuKumo } from "YuKumo";

const client = new YuKumo({
  nodes: [{ host: "localhost", port: 2333, password: "youshallnotpass" }],
});

await client.init();

// Forward Discord voice events
client.handleVoiceStateUpdate(voiceStateData);
client.handleVoiceServerUpdate(guildId, voiceServerData);

// Search and play
const result = await client.search("lofi hip hop");
const player = await client.createPlayer({ guildId, voiceChannelId });
await client.play(guildId, result.tracks[0]);
```

## Documentation

- [Getting Started](https://YuKumo.js.org/getting-started/)
- [API Reference](https://YuKumo.js.org/api-reference/)
- [Plugin Development](https://YuKumo.js.org/plugin-development/)

## Examples

| Library | Path |
|---------|------|
| [discord.js v14](https://discord.js.org) | [`examples/discordjs/`](examples/discordjs/) |
| [Seyfert](https://seyfert.dev) | [`examples/seyfert/`](examples/seyfert/) |
| [Eris](https://abal.moe/Eris/) | [`examples/eris/`](examples/eris/) |
| [Oceanic.js](https://oceanic.ws) | [`examples/oceanic/`](examples/oceanic/) |
| [Discordeno](https://discordeno.mod.land) | [`examples/discordeno/`](examples/discordeno/) |

## License

MIT &copy; YuKumo Contributors
