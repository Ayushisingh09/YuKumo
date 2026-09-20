# BUGS.md — Yukumo systematic bug hunt (Phase 3)

This document is the result of a full read-through of every `src/` module, cross-checked
against the Lavalink v4 protocol spec (`lavalink.dev/api/rest`, `lavalink.dev/api/websocket`)
and the existing test suite. Every item below was verified by tracing the code path —
nothing here is stated "looks fine" without a trace.

Severities: **Critical** (silent corruption / crash / security), **High** (wrong behavior
in normal operation), **Medium** (wrong behavior in a specific but plausible flow),
**Low** (edge-case / cosmetic), **Nit** (style/type-unsafety only).

## Severity summary

| Severity | Count |
|----------|-------|
| Critical | 0 |
| High     | 4 |
| Medium   | 4 |
| Low      | 4 |
| Nit      | 4 |

Top-10 most dangerous items are the 4 High + the 4 Medium + 2 of the Low items
(see [§Top-10](#top-10-most-dangerous-bugs)).

---

## Critical

None found. No buffer/memory-smashing, no auth bypass, no path that tangibly loses
live audio on the happy path. The closest things to Critical (queue cursor desync and
paused-track desync) are classified High because recovery is always possible via
explicit user action.

---

## High

### H1. `boundOnTrackStart` force-unpauses a track that was started paused

**File:** `src/player/Player.ts:243-252`

```ts
private readonly boundOnTrackStart = (guildId: string, track: TrackData) => {
  if (guildId !== this.guildId) return;
  this._status = "playing";
  this._paused = false;            // <-- unconditional unpause
  this._lastTrackStartTs = Date.now();
  ...
};
```

`playTrack` deliberately supports starting paused:

```ts
// src/player/Player.ts:1328
const paused = options?.paused ?? this._paused;
// src/player/Player.ts:1352 (success path)
this._paused = paused;
```

Lavalink v4 emits a `TrackStartEvent` for every started track, including those started
with `paused: true` in the PATCH, and `PlayerUpdateEvent.state` carries **no** `paused`
field — so the event handler cannot rediscover the true pause state and must not
overwrite it. Because the WS event arrives asynchronously after `updatePlayer` resolves,
the sequence `playTrack(track, { paused: true })` leaves `this._paused = true` for a few
ticks and then unconditionally resets it to `false`.

**Concrete repro**

1. `await player.play(track, { paused: true })`.
2. Node sends `TrackStartEvent` (it will; the PATCH said `paused: true` but the event is
   still emitted).
3. Observed: `player.paused === false`, but the node is actually paused.
4. Consequences:
   - `player.position` interpolation (`boundOnPlayerUpdate`/clock) keeps advancing while
     the audio is frozen → wrong positions, wrong persisted positions.
   - `await player.resume()` returns immediately without a PATCH
     (`if (!this._paused) return;` at `Player.ts:1409`) — the user *cannot* unpause
     through the documented API until they call `pause()` first to re-set the flag.

**Fix direction:** remove the forced `this._paused = false`. `_paused` is already set
correctly by `playTrack` before the node confirms; a natural track advance starts the
next track via `playTrack(nextTrack)` which defaults `paused = this._paused` and hence
republishes the intended state.

---

### H2. `Queue.remove()` of the current track silently desyncs the node from the queue

**File:** `src/queue/Queue.ts:254-272`

```ts
public remove(startIndex: number, deleteCount: number = 1): T[] {
  if (startIndex < 0 || startIndex >= this.tracks.length) return [];
  const removed = this.tracks.splice(startIndex, deleteCount);

  if (this.currentIndex >= startIndex + deleteCount) {
    this.currentIndex -= removed.length;
  } else if (this.currentIndex >= startIndex) {
    if (this.tracks.length === 0) {
      this.currentIndex = -1;
    } else if (startIndex < this.tracks.length) {
      this.currentIndex = startIndex;
    } else {
      this.currentIndex = this.tracks.length - 1;
    }
  }
  ...
}
```

In this client the queue cursor *is* the currently playing track. When a removal range
covers `currentIndex`, the branch `this.currentIndex >= startIndex` re-points the cursor
at the array element that slides into `startIndex` — i.e. the **next** track — while the
node is still audibly playing the removed one.

**Concrete repro**

1. Queue `[A, B, C]`, `currentIndex = 0`, node is playing `A` (real playback).
2. `player.queue.remove(0, 1)` (a normal "remove current song" command).
3. Now `player.currentTrack` is `B`, but the node still plays `A` and is unaware of any
   change. Commands such as `skip()` operate on `B`.
4. When `A` finishes naturally, `handleTrackEnd(A)` →
   `Queue.next()` (`Player.ts:499`) calls `addCurrentToHistory()`
   (`Queue.ts:539-546`) — which pushes **`B`**, *not* `A`, into history — then splices
   `[0..currentIndex]` off the array (`Queue.ts:187-192`), leaving `[C]` and playing `C`.
5. **User-visible result: a queued track (`B`) is silently skipped (never heard) on the
   natural end of the song they removed.** Repeating `remove()` of the then-current track
   skips one track each time.

**Note:** the existing unit test pins the buggy outcome:

```ts
// src/queue/Queue.test.ts:367-375
it("should handle remove of current track and advance to next", () => {
  ...
  queue.remove(0, 1);
  expect(queue.currentTrack).toBe("track-2");   // wrong in a player context
});
```

That test codifies the desync; it must be updated together with the fix (the whole
`Queue` is used only inside `Player` — verified via grep — so queue-only semantics are
not a public contract here).

**Fix direction:** keep the removed-but-still-playing track as the "current" track
(separate from the array) until its natural end — `currentTrack` must not silently change
while audio plays — and make the historical-advance logic treat it like a normally
consumed track.

---

### H3. Node failover runs on *every* `nodeDisconnected`, defeating session resuming

**Files:** `src/Kumo.ts:986-989` (wiring) and `src/Kumo.ts:1068-1079` (handler)

```ts
ws.on("nodeDisconnected", (nodeId: string, code: number, reason: string) => {
  this.events.emit("nodeDisconnected", nodeId, code, reason);
  this.handleNodeFailover(nodeId);
});
```

```ts
private handleNodeFailover(failedNodeId: string): void {
  const affectedPlayers = this.players.getAll().filter((p) => p.node.id === failedNodeId);
  for (const player of affectedPlayers) {
    const replacementNode = this.nodes.pick(player.guildId);
    if (replacementNode != null && replacementNode.id !== failedNodeId) {
      player.setNode(replacementNode).catch(() => { /* failover migration error */ });
      this.events.emit("playerMove", player.guildId, failedNodeId, replacementNode.id);
    }
  }
}
```

`setNode` (`Player.ts:752-768`) immediately replays the current track from the current
position on the replacement node — a full re-PATCH (`updatePlayer` with `track` +
`position`). Session resuming (`resuming.enabled`) exists so a transient transport blip
resumes the *same* Lavalink session with gap-free audio (Lavalink v4 `ready.op.resumed`).
But a single blip emits `nodeDisconnected` unconditionally, so with two+ nodes configured
every blip migrates all players to a different node — the resume path (`nodeReady` with
`resumed = true` at `Kumo.ts:975-984`) never gets a chance to run, and audio stutters,
drops, or double-voices through the migration. When the original node reconnects, players
have moved and there is no rebalance back.

Compare `Kumo.ts:980-984`, where the resumed-session path explicitly does **not** re-send
state:

```ts
// A fresh (non-resumed) Lavalink session starts with zero players —
// push each affected player's full state back or they stay silent forever
if (!node.ws.resumed) {
  this.resyncPlayersOnNode(nodeId);
}
```

**Concrete repro**

1. Two nodes, `resuming: { enabled: true }`.
2. A player is playing on node A. Kill the network path to A (not a clean close) — node
   A emits `nodeDisconnected` (code 1006).
3. Observed: before the resume window elapses, every player is re-PATCHed onto node B
   via `setNode`; when A comes back it resumes an empty session. The advertised
   no-gap resuming behavior never materializes.

**Fix direction:** in `handleNodeFailover`, when the failed node has `config.resuming`
enabled (and the failure looks transient), skip the migration and let the reconnect +
`resyncPlayersOnNode` (fresh session only) path handle it.

---

### H4. WebSocketClient: stale socket handlers clobber a successor connection

**File:** `src/ws/WebSocketClient.ts:140-198`

```ts
const instance = new (WSClass as any)(url, { headers });
this.ws = instance;

return new Promise<void>((resolve, reject) => {
  let settled = false;
  const timer = setTimeout(() => {
    if (!settled) {
      settled = true;
      reject(new Error(`Connection to ${host}:${port} timed out after ${connectTimeout}ms`));
    }
  }, connectTimeout);
  ...
  const handleOpen = () => {
    const wasReconnect = this.reconnectAttempts > 0;
    this._state = "connected";
    this.reconnectAttempts = 0;
    this._isAlive = true;
    this.startHeartbeat(instance);
    ...
  };

  const handleClose = (event: any) => {
    ...
    this._state = "disconnected";
    this.stopHeartbeat();
    ...
    if (!this.destroyRequested) {
      this.scheduleReconnect();
    }
  };
  ... (handleMsg / handleError similarly)
```

`handleOpen/handleClose/handleMsg/handleError` are closures over the **client object**
(`this`), not over their own socket instance, and they are never torn down on timeout or
replacement. Two concrete failure modes:

1. **Timed-out connection is never aborted.** The connect timeout merely `reject()`s the
   promise (`L145-150`); the `instance` is left connecting. When it eventually opens
   (slow network, throttled server), `handleOpen` runs anyway: `_state = "connected"`,
   heartbeat started on **that** socket. If the caller meanwhile proceeded (e.g. called
   `connect()` again), there are now two live sockets and the client is attached to the
   first.
2. **Late `close`/`error` from an old socket clobbers the current one.** After socket A
   closes and a reconnect creates socket B (now `this.ws === B`), a late `close`/`error`
   event from A runs A's handler: `_state = "disconnected"`, heartbeat stopped,
   `nodeDisconnected` re-emitted, and (if `destroyRequested` is false) a phantom
   `scheduleReconnect()` starts — while B is healthy and connected. There is no
   `this.ws === instance` identity guard anywhere.

**Concrete repro**

1. `client.connect()` → mock/real socket A; A times out (do not settle it).
2. Caller sees the rejection and calls `connect()` again → socket B, `B.onopen` fires →
   `_state = "connected"`.
3. Now fire A's `onclose` (or `onerror`→`onclose`) — Observed: client flips to
   `"disconnected"`, emits `nodeDisconnected`, and schedules a reconnect while B is
   connected and healthy. With `maxRetries` reached this also emits spurious
   `nodeError: Gave up reconnecting`.

**Fix direction:** (a) capture `const instance = ...` before defining the handlers and
insert `if (this.ws !== instance) return;` at the top of `handleOpen/handleClose/
handleMsg/handleError`; (b) on connect timeout, tear down the pending socket
(`teardownSocket`) instead of leaving it live.

---

## Medium

### M1. `close()`/`destroy()` wipe every WebSocket dispatcher listener → zombie node on reconnect

**File:** `src/ws/WebSocketClient.ts:557-581`

```ts
public async close(): Promise<void> {
  this.destroyRequested = true;
  if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }

  this.teardownSocket("Client shutdown");
  this._state = "disconnected";
  this.events.removeAllListeners();
}

public destroy(): void {
  this.destroyRequested = true;
  this._state = "destroyed";
  if (this.reconnectTimer !== null) { clearTimeout(this.reconnectTimer); this.reconnectTimer = null; }

  this.teardownSocket("Destroy");
  this.events.removeAllListeners();
}
```

`this.events` is the same `EventDispatcher` that `Kumo.bindNodeEvents` subscribes to
(`Kumo.ts:986-1037`: `nodeDisconnected`, `nodeReady`, `stats`, every forwarded event).
`close()` is advertised as a graceful, restartable shutdown — but after it runs, all
manager subscriptions are gone. Any later `connect()` (the guard in `connect()` allows it:
state is `"disconnected"`, not `"destroyed"`) reconnects a socket whose `nodeReady` /
`nodeDisconnected` events fall on no listeners: players are never resynced, failover
never runs, and the "node" is a zombie from the manager's perspective.

**Concrete repro**

1. Create a kumo, init (node connects).
2. `node.ws.close()`, then `node.ws.connect()` (e.g. a health-check restart).
3. Server sends `ready` → `nodeReady` is emitted but `Kumo`'s handler
   (`Kumo.ts:975-984`, which stores the session + calls `resyncPlayersOnNode`) is gone.
4. Observed: `node.state === "connected"` but `node.rest.sessionId` is never repopulated;
   player resync never happens; a subsequent disconnect fails over nothing.

`destroy()` is permanent, so stripping listeners there is harmless; the fix is to not
`removeAllListeners()` on the `close()` (restartable) path.

---

### M2. `resolveTrack()` ignores the playlist's `selectedTrack`

**File:** `src/rest/RestClient.ts:523-528`

```ts
case "playlist": {
  if (result.data.tracks.length === 0) {
    throw new LoadError(`Playlist is empty for identifier: ${identifier}`);
  }
  return result.data.tracks[0] as TrackData;
}
```

Lavalink v4 playlists (`/v4/loadtracks`) carry `data.info.selectedTrack` — the index of the
track the *server* selected (for YouTube "Up Next"/mixed playlists, this is commonly not
0). Returning `tracks[0]` makes `resolveTrack` and therefore commit-of-a-playlist flows
ignore the server's choice.

**Concrete repro**

1. `loadTracks` returns a playlist with `info: { name: "mix", selectedTrack: 3 }` and 5
   tracks.
2. `await rest.resolveTrack("...")` returns `tracks[0]`. Expected per protocol: the track
   at index 3.

Existing test `src/Regressions.test.ts:158-171` already asserts that `kumo.search()`
*passes `selectedTrack` through* to the caller — but `resolveTrack()` (used by player
commit paths) does not use it.

**Fix direction:** `return result.data.tracks[result.data.info.selectedTrack ?? 0]` with a
bounds check.

---

### M3. `Track.toJSON()` drops `requester`

**File:** `src/tracks/Track.ts:80-87`

```ts
public toJSON(): TrackData {
  return {
    encoded: this.encoded,
    info: { ...this.info },
    pluginInfo: { ...this.pluginInfo },
    userData: { ...this.metadata },
  };
}
```

The constructor explicitly supports requester round-trip via `userData`:

```ts
// src/tracks/Track.ts:16-17
this.requester = requester ?? data.userData?.requester;
this.metadata = data.userData ?? {};
```

But `toJSON()` serializes only `this.metadata`. When a `Track` is built with an explicit
requester (`Track.from(data, requester)`) and then JSON-serialized — `Player.saveState()`
JSON-stringifies `PlayerJson` which contains `queue.export()` raw track objects
(`Queue.ts:519-526`; `Player.ts:1006-1010`) — the `requester` field vanishes: restored
players lose `player.currentTrack.requester`, and any user calling `JSON.stringify(player)`
loses it too.

**Concrete repro**

1. `player.queue.enqueue(Track.from(trackData, { id: "user-1" }))`.
2. `player.saveState()`; kill the process; `kumo.restorePlayers()`.
3. `player.currentTrack.requester === undefined` (was `{ id: "user-1" }`).

**Fix direction:** merge `this.requester` into `userData` when defined:
`userData: { ...this.metadata, ...(this.requester !== undefined ? { requester: this.requester } : {}) }`.

---

### M4. `Queue.previous()` duplicates tracks in queue-repeat mode

**File:** `src/queue/Queue.ts:199-216`

```ts
public previous(): T | null {
  const historyTrack = this.history.pop() ?? null;
  if (historyTrack != null) {
    const insertAt = this.currentIndex >= 0 ? this.currentIndex : 0;
    this.tracks.splice(insertAt, 0, historyTrack);   // <-- re-inserts a *copy*
    this.currentIndex = insertAt;
    this.notifyChange();
    return historyTrack;
  }
  ...
}
```

In `"queue"` repeat mode nothing is ever consumed; the array keeps its tracks and the
cursor wraps, while every `next()` **also** pushes the current track into `history`
(`Queue.ts:539-546`). So the history entries are duplicates of live array entries, and
`previous()` pops one and splices it back into the array — growing `tracks` with a
duplicate each call.

**Concrete repro**

1. `queue.setRepeatMode("queue")`, tracks `[A, B, C]`, `currentIndex = 0`.
2. `next()` ×3 → cursor wraps to `A`; history `[A, B, C]`.
3. `previous()` → pops `C`, re-inserts → `tracks = [C, A, B, C]`, cursor at `0`.
4. After enough `previous()` calls the queue contains repeated copies of already-present
   tracks and its length grows unboundedly (the `maxHistorySize` cap only trims `history`,
   not the re-inserted duplicates). The "previous track" is also `C` twice in a row
   instead of stepping back one unique track.

**Fix direction:** in `"queue"` repeat mode, `previous()` should just move the cursor back
(modulo) — nothing is consumed, so history re-insertion is wrong.

---

## Low

### L1. Reconnect timer is never `unref()`'d

**File:** `src/ws/WebSocketClient.ts:510-515`

```ts
this.reconnectTimer = setTimeout(() => {
  this.reconnectTimer = null;
  this.connect().catch(() => {
    // reconnection failure is handled by onclose
  });
}, delay);
```

Contrast with the connect-timeout timer, which *is* unref'd (`L151-152`:
`(timer as { unref?: () => void }).unref?.();`). A dead node therefore keeps the Node
process alive for every backoff window (`reconnectDelay` can be up to `retryDelayMax`,
default 30 s, times up to `maxRetries`). Not a correctness bug, but it defeats graceful
shutdown while retrying.

---

### L2. Second `connect()` while connecting resolves before the socket opens

**File:** `src/ws/WebSocketClient.ts:99-106`

```ts
if (this._state === "connecting" || this._state === "connected") {
  return;
}
```

A caller that calls `connect()` twice in quick succession gets an immediately-resolved
promise from the second call even though the socket is not open — and if the first
connection then times out or fails, the second caller never learned anything. Callers
cannot reliably wait for readiness. (The state guard itself is correct; only the abrupt
early return for `"connecting"` is lazy.)

---

### L3. `playTrack` resets `_position` to 0 even when `noReplace` made the request a no-op

**File:** `src/player/Player.ts:1353`

```ts
this._position = options?.position ?? 0;
```

This line runs after *any* successful `updatePlayer`, including an ignored `noReplace`
request (Lavalink treats `noReplace=true` as "keep the current track" — the client's
position baseline is therefore zeroed while the same track keeps playing). Subsequent
`trackStart`-free position interpolation and persisted positions are then off until the
next `playerUpdate` arrives. Minor, self-healing, but real.

---

### L4. `Queue.skipTo()` drops the currently playing track into history while it still plays

**File:** `src/queue/Queue.ts:330-353`

```ts
const removedCount = index;
if (removedCount > 0) {
  const removedTracks = this.tracks.splice(0, removedCount);
  for (const track of removedTracks) {
    this.history.push(track);
    ...
  }
}
this.currentIndex = 0;
```

When the current track is at index 0 and the user calls `queue.skipTo(2)` (a real music-bot
"jump to #3" command), tracks `[0..1]` are spliced into `history` and the cursor lands on
track `C` — but the node is still playing `A`. On `A`'s natural end, `next()` pushes `C`
(not `A`) into history and splices it away, so `C` is skipped and `D` plays: another
one-track silent skip. Note `Player` has **no** `skipTo` wrapper (verified by grep), so
nothing stops the node first. L3-adjacent and lower impact than H2 because users jumping
tracks normally also trigger `play()` immediately after.

---

## Nit

### N1. Type-unsafe event emissions

**File:** `src/Kumo.ts:782`, `src/Kumo.ts:992`, `src/Kumo.ts:1035-1036`

```ts
this.events.emit("playerMoved" as any, data.guildId, oldChannel, data.channelId);
ws.on("stats", (nodeId: string, stats: unknown) => this.events.emit("stats", nodeId, stats as never));
ws.on(name as EventName, ((...args: unknown[]) =>
  (this.events.emit as (...a: unknown[]) => void)(name, ...args)) as never);
```

`playerMoved` *is* typed in the `EventMap` (see below); the `as any` discards that
signature. Runtime behavior is correct; compile-time safety is lost. `as never` on
`stats`/plugin events similarly bypasses `EventName` checking.

### N2. `resyncPlayersOnNode` formatting

**File:** `src/Kumo.ts:1057`

```ts
private resyncPlayersOnNode(nodeId: string): void {    const affected = this.players.getAll().filter((p) => p.node.id === nodeId);
```

Method body on the same line as the signature. Cosmetic only.

### N3. `createLavaSrcPlugin` / `createSponsorBlockPlugin` / `createFloweryTTSPlugin` are no-op placeholders

**File:** `src/plugins/LavaPlugins.ts:40-68`

```ts
export function createLavaSrcPlugin(_options?: LavaSrcOptions): Plugin {
  return { name: "lavasrc", version: "4.0.0", init() { /* Config registered automatically with Lavalink server */ } };
}
export function createSponsorBlockPlugin(_options?: SponsorBlockOptions): Plugin { ... }
export function createFloweryTTSPlugin(_options?: FloweryTTSOptions): Plugin { ... }
```

None of them logs, validates, or deploys anything — unlike their lavalink-client
counterparts (which issue REST config calls / log warnings). Since lavasrc and sponsorblock
are server-side plugins, this may be by design (the server already holds its own config).
**Needs verification** — confirm the intended contract before treating as a defect.

### N4. `playerEmpty` is a documented alias for `queueEnd`

**File:** `src/Kumo.ts:403-406` matching `src/types/internal.ts:233-234`

`Kumo` emits both `queueEnd` and `playerEmpty` after a queue drains; the internal event map
documents `playerEmpty` as "alias for queueEnd". Verified intentional — not a bug.

---

## Verified non-issues (traced, no action taken)

- **`handleVoiceSocketClosed` rejoins on code 4014** (`Kumo.ts:1045-1055`): Discord voice
  close 4014 = "Disconnected"; erela.js/lavalink-client-class conventions treat 4014/4015
  as reconnect-worthy, and the behavior is pinned by `src/Regressions.test.ts:135-149`.
  **Verified intentional** (yesterday's "Needs verification" is now resolved; if a Discord
  doc change ever reclassifies 4014 as terminal, revisit).
- **`skip()` / `stop()` + `queueTrackEndTask` (`"skipped"`)** (`Player.ts:742-749`): node's
  `"stopped"` TrackEnd is ignored by `boundOnTrackEnd` (`reason !== finished/loadFailed`),
  so double-advance cannot happen; the serialization chain in `handleTrackEnd` is sound.
- **NodeLink voice receiver** (`src/node/NodeLinkVoiceReceiver.ts`): listener removal before
  `ws.close()` is deliberate (no reconnect), reconnect-delay negative check is correct,
  JSON/binary sniff is correct.
- **REST retry policy** (`src/rest/RestClient.ts`): `isRetryableError` covers 429/5xx and
  network timeouts, 2xx accepted, `204`→`undefined` correctly handled.
- **`SearchCache`/`TTLCache`/`MemoryStorage`/`RedisStorage`**, **`EventDispatcher`**,
  **`Node`/`NodeManager`/`NodeSelector`** (connected+!maintenance filtering, penalties,
  session bookkeeping), **`VoiceStateTracker`**, and the **adapters** (Eris/Oceanic/Seyfert/
  Discordeno/Davey) were read without finding defects beyond the listed Nits.
- **`restorePlayers` resume path** (`Resuming.test.ts:161-206`): a resumed session adopts the
  live player and sends no play PATCH — this is the intended complement to the H3 fix and
  the path that must survive it.

---

## Top-10 most dangerous bugs

Ranked by (likelihood × impact), High first, then the worst Medium/Low:

1. **H1** — paused-start tracks silently unpause; `resume()` becomes a no-op (broken pause UX).
2. **H2** — removing the current track silently skips a queued track on every natural end.
3. **H3** — session resuming is defeated by unconditional failover on node blips (gaps/double audio on every transient disconnect).
4. **H4** — timed-out connects are never aborted; stale socket events clobber a healthy successor (spurious disconnect + phantom reconnects).
5. **M1** — `close()` + `connect()` yields a zombie node that the manager can never see again.
6. **M4** — `previous()` in queue-repeat mode grows the queue with duplicate tracks.
7. **M2** — `resolveTrack` plays the wrong track for mixed/selected playlists.
8. **M3** — `requester` lost through persistence/restore and `JSON.stringify`.
9. **L2** — second `connect()` resolves before the socket is open (unawaitable readiness).
10. **L1** — dead-node reconnect loop keeps the process alive (backoff up to 30 s × attempts).

## Standing verification requirements (from the task)

- Confirm each fix against `lavalink.dev/api/rest` and `/api/websocket` when unsure.
- Add one regression test per Critical/High/Medium fix using the established mock-Lavalink
  test infra (`src/ws/WebSocketClient.test.ts` mock-WebSocket pattern + mocked REST).
- Keep `npm run build`, `npm run lint`, `npm run typecheck`, `npm run test` green after every
  commit; update the two tests that pin buggy behavior (`Queue.test.ts:367-375`) and any
  others the fixes legitimately change.