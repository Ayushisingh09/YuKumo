# Changelog

All notable changes to the `yukumo` Lavalink client library will be documented in this file.

## [1.4.0] - 2026-08-01

### Added
- **Smart Autoplay Engine**: Added `setAutoplay(enabled, fetcher?)`, `isAutoplayEnabled()`, and `autoplayTrackAdded` event emission on recommendation track enqueues.
- **Extended Queue Operations**: Added `Queue.swap(indexA, indexB)`, `Queue.skipTo(index)`, `Queue.removeRange(start, count)`, and `Queue.clearExceptCurrent()`.
- **Audio DSP Presets**: Added `setSlowedReverb()`, `set3DAudio()`, `setPitchShift()`, `setVoiceIsolation()`, and global custom preset registry (`FilterChain.registerPreset()` & `applyPreset()`).
- **Smart Voice Channel Behaviors**: 24/7 mode (`stayInVc`) and empty voice channel monitor (`setVcMemberCount()`) with configurable auto-pause and auto-disconnect timeouts.
- **Synced Lyrics & SponsorBlock**: `getSyncedLyrics()` helper using LRCLIB API with timestamp parser (`parseLrc()`) and `SponsorBlockClient` segment auto-skipping.
- **Developer Experience & UI Helpers**: `getProgressBar()`, `formatDuration()`, `createQueueEmbedData()`, and `MiddlewareRegistry` interceptor hooks (`useBeforeTrackStart`).

### Fixed
- Voice connection handshake race condition: added `waitForVoiceReady()` promise.
- Session resumption on WebSocket reconnect: re-sends OP4 voice credentials and player states.
- Handled `WebSocketClosedEvent` auto-reconnects on Discord close codes 4009 / 4015.
- Voice endpoint handling: preserved active endpoint when receiving `null` endpoints during Discord region failovers.
