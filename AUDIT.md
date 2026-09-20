# Yukumo Audit Report

**Generated: 2026-09-20**

## Reference Implementations Audit Table

| Feature | Kazagumo | lavalink-client | Yukumo | Action |
|---------|----------|-----------------|--------|--------|
| **Node Management** |
| Multi-node support | ✅ | ✅ | ✅ | Present |
| Node pool/load balancing | ✅ | ✅ | ✅ | 9 selectors present |
| Auto-reconnect with backoff | ✅ | ✅ | ❌ | **ADD** - Need exponential backoff strategy |
| Resume session (Lavalink native) | ✅ | ✅ | ✅ | Present |
| Resume (NodeLink) | ✅ | ❌ | ✅ | Present via isNodeLink detection |
| Node stats access | ✅ | ✅ | ✅ | Present |
| Penalty score calculation | ✅ | ✅ | ✅ | Present |
| Least-load selector | ✅ | ✅ | ✅ | Present |
| Node failover (player migration) | ✅ | ✅ | ✅ | Present |
| Health checks / ping | ✅ | ✅ | ✅ | WS ping + Lavalink ping |
| Maintenance mode | ✅ | ❌ | ✅ | Present |
| **Player Features** |
| create/destroy/connect/disconnect | ✅ | ✅ | ✅ | Present |
| Move channel voice state | ✅ | ✅ | ✅ | Present |
| Voice state/server update handling | ✅ | ✅ | ✅ | Present |
| reconnect on Discord close codes (4014, 4006, 4015) | ✅ | ✅ | ✅ | Present |
| self-deaf/mute on connect | ✅ | ✅ | ✅ | Present |
| Stage channel support | ✅ | ❌ | ⚠️ | Partial - needs testing |
| **Queue Features** |
| add/remove/move/shuffle/clear | ✅ | ✅ | ✅ | Present |
| Previous-track history | ✅ | ✅ | ✅ | Present |
| Loop modes (none/track/queue) | ✅ | ✅ | ✅ | Present |
| Autoplay | ✅ | ✅ | ✅ | Present |
| Related-track suggestions | ✅ | ✅ | ✅ | Source-aware (youtube, spotify, etc.) |
| Queue persistence | ✅ | ✅ | ✅ | Memory/Redis adapters |
| Max queue size | ✅ | ❌ | ✅ | Present via maxSize |
| Duplicate protection | ✅ | ✅ | ✅ | unique() method |
| Custom queue class support | ✅ | ❌ | ⚠️ | Need to check extensibility |
| **Track Resolution** |
| Search/URL/playlist resolve | ✅ | ✅ | ✅ | Present |
| Search prefixes (ytsearch, spsearch, etc.) | ✅ | ✅ | ✅ | Full mapping in formatSourcePrefix() |
| Lazy resolve (Spotify/Apple/Deezer via LavaSrc) | ✅ | ✅ | ✅ | Via plugins |
| Custom track data/requester | ✅ | ✅ | ✅ | Present |
| Track stuck/exception handling | ✅ | ✅ | ✅ | Auto retry/skip logic |
| **Filters** |
| Volume | ✅ | ✅ | ✅ | Present |
| Equalizer | ✅ | ✅ | ✅ | Present |
| Karaoke | ✅ | ✅ | ✅ | Present |
| Timescale | ✅ | ✅ | ✅ | Present |
| Tremolo | ✅ | ✅ | ✅ | Present |
| Vibrato | ✅ | ✅ | ✅ | Present |
| Rotation (8D) | ✅ | ✅ | ✅ | Present |
| Distortion | ✅ | ✅ | ✅ | Present |
| ChannelMix | ✅ | ✅ | ✅ | Present |
| LowPass | ✅ | ✅ | ✅ | Present |
| NodeLink-only filters (Echo, Chorus, Compressor, Phaser, HighPass, Flanger, Reverb, Spatial, Phonograph, Tesseract) | ✅ | ❌ | ✅ | Present |
| Preset methods (bassboost, nightcore, vaporwave, etc.) | ✅ | ✅ | ✅ | Present |
| Smooth filter transitions | ✅ | ❌ | ⚠️ | Need investigation |
| **Events (Typed Event System)** |
| nodeConnect/Disconnect/Reconnect/Error/Raw | ✅ | ✅ | ✅ | Present |
| playerCreate/Destroy/Move/Update | ✅ | ✅ | ✅ | Present |
| trackStart/End/Stuck/Exception/Resolve | ✅ | ✅ | ✅ | Present |
| queueEnd | ✅ | ✅ | ✅ | Present |
| playerEmpty | ✅ | ✅ | ✅ | Present |
| **Plugins/Extras** |
| SponsorBlock | ✅ | ✅ | ✅ | Present |
| LavaLyrics | ✅ | ✅ | ✅ | Present (plugin + native NodeLink) |
| LavaSearch | ✅ | ✅ | ✅ | Present |
| LavaSrc | ✅ | ✅ | ✅ | Present (plugin) |
| Filters plugin (LavaDSPX) | ✅ | ❌ | ❌ | **MISSING** |
| SABR/youtube-source plugin config | ✅ | ❌ | ❌ | **MISSING** |
| OAuth/poToken support | ✅ | ❌ | ❌ | **MISSING** |
| 24/7 mode | ✅ | ✅ | ✅ | Present (stayInVc) |
| **Compatibility** |
| discord.js v14+ | ✅ | ✅ | ✅ | Adapter present |
| Eris | ✅ | ❌ | ✅ | Adapter present |
| Oceanic | ✅ | ❌ | ✅ | Adapter present |
| Seyfert | ✅ | ❌ | ✅ | Adapter present |
| Davey | ✅ | ❌ | ✅ | Adapter present |
| Discordeno | ✅ | ❌ | ✅ | Adapter present |
| Raw gateway | ✅ | ✅ | ✅ | Via `send` callback |
| ESM + CJS builds | ✅ | ✅ | ✅ | Package.json exports |
| Full .d.ts types | ✅ | ✅ | ✅ | Strict TypeScript |
| **Developer Experience** |
| JSDoc on public methods | ❌ | ❌ | ✅ | Present |
| Strict TypeScript (no any) | ✅ | ✅ | ✅ | Present |
| Input validation | ⚠️ | ✅ | ✅ | Partial |
| Debug logging with levels | ✅ | ✅ | ✅ | Present |
| Zero/minimal dependencies | ✅ | ✅ | ✅ | Only `ws` |