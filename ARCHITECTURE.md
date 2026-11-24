# Architecture

This document explains how Pirate Battle is organised and why. For setup, commands and controls, see [README.md](README.md).

## 1. Overview

The application has four main parts:

- a **pure TypeScript simulation** that owns every gameplay rule;
- a **PixiJS renderer** that only reads the simulation state;
- a **React shell** for screens, forms, dialogs and the HUD;
- a **data layer** (Axios, TanStack Query, MSW and `localStorage`) for ranking, match history and persistence.

```
┌──────────────────────────── React (screens, HUD, dialogs) ───────────────────────────┐
│  MainMenu · Options · CombatScreen · Result · RegistrationSync                       │
│        │ useSyncExternalStore (snapshot)          │ TanStack Query (ranking/history) │
└────────┼──────────────────────────────────────────┼──────────────────────────────────┘
         │                                          │
┌────────▼─────────── GameSession ─────────┐   ┌────▼──────── Data layer ───────────────┐
│ state · InputController · FixedStepClock │   │ Axios client · contracts · guards      │
│ pause/resume · end of match · events     │   │ registration outbox (localStorage)     │
└──────┬─────────────────┬─────────────────┘   │ MSW worker: handlers · scenarios · db  │
       │ step(dt)        │ events / state      └────────────────────────────────────────┘
┌──────▼──────┐   ┌──────▼─────────────────────┐
│ Simulation  │   │ GameRenderer (PixiJS)      │
│ pure TS     │   │ arena · ships · projectiles│
│ systems     │   │ effects · audio binding    │
└─────────────┘   └────────────────────────────┘
```

Dependencies point one way:

- The simulation imports nothing from React, PixiJS, the DOM or the network.
- The renderer and the UI depend on the simulation's types.
- The data layer never touches the game.

## 2. React and PixiJS integration

### Ownership

`ui/game/Battle.tsx` creates everything a match needs inside one `useEffect`:

1. a `GameSession` (simulation state, input and clock);
2. a `GameRenderer` (PixiJS `Application` and scene layers);
3. the audio binding.

The effect's cleanup destroys all of them. A match is therefore a single unit with a clear lifetime: **Restart** and **Play Again** mount a new `Battle` (new `key`) instead of resetting objects in place, so nothing from the previous match can leak into the next one.

### Synchronising the UI without per-frame renders

`GameSession` is an external store with `subscribe` and `getSnapshot`, consumed by `useSyncExternalStore` in the HUD and the pause dialog.

- The snapshot contains only discrete values: phase, pause reason, end reason, score, remaining whole seconds, health and enemy count.
- It is rebuilt at most every 100 ms (`simulation.uiSyncInterval`) and immediately on a phase change.
- A new object is created only when a value changed. In practice React renders about once per second, plus once per hit or point, and never once per frame.

Continuous state (positions, rotations, projectiles) stays in the simulation and is read directly by PixiJS.

### Events

Each simulation step appends events to `state.events`: shots, hits, destructions, splashes, island impacts, spawns, points and the end of the match. After stepping, the session hands them to its listeners (the renderer layers and the audio binding) and clears the queue. This is how the simulation triggers effects and sounds without knowing they exist.

### Strict Mode and asynchronous initialisation

PixiJS 8 initialises asynchronously (`app.init`). Strict Mode mounts, unmounts and mounts again. If the effect is cleaned up before `init` resolves, `GameRenderer.destroy()` only sets a flag, and `mount()` destroys the application as soon as `init` finishes. No orphan canvas, ticker or WebGL context is left behind. The session's input listeners are attached only after the renderer has mounted.

### Code splitting

`CombatScreen` is loaded with `React.lazy`, so PixiJS and the game code (303 kB, 90 kB gzipped) are downloaded only when the player presses **Play**. The menu chunk is 365 kB (117 kB gzipped). An error boundary shows a reload action if the chunk cannot be downloaded.

## 3. Simulation

### Fixed-step loop

`FixedStepClock` accumulates real frame time and runs as many 1/60 s steps as fit.

- A frame longer than 0.25 s is capped, which prevents a "spiral of death" after a stall.
- The accumulator is reset on pause and on resume, so time spent paused is never replayed.
- Movement, damage, cooldowns, projectile range and spawn timers all use `dt`. Results are identical at any frame rate.

### Order of one step

`sim/step.ts` calls the systems in this order:

1. player movement;
2. player weapons;
3. enemy AI, movement and firing;
4. spawning;
5. projectile movement and island blocking;
6. projectile hits on ships;
7. Chaser impacts;
8. removal of dead entities;
9. timer update, then the end check (death has priority over time).

With this order, a newly spawned enemy acts only on the next step, and a shot that destroys a Chaser in the same step as its impact counts as a kill and prevents the damage.

### Phases

| Phase     | Meaning                                                                                                                                                    |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `running` | Normal play                                                                                                                                                |
| `paused`  | Set by `Esc`/`P`, the HUD button, window blur or a hidden tab. The simulation does not step and input is released. Only an explicit player action resumes. |
| `ended`   | Set once, by time or death. `stepSimulation` becomes a no-op: movement, firing, damage, spawns and scoring stop together.                                  |

### Determinism

All randomness comes from a seeded `mulberry32` RNG stored in the state: enemy types, spawn positions and mocked network latency. The same seed with the same inputs produces the same match. Visual effects advance with simulation time, not real time. Audio variations use `Math.random`, because audio never feeds back into the simulation.

### Configuration snapshot

`createMatchConfig(options)` deep-clones the base configuration, applies the player's options and deep-freezes the result. Changing options during or after a match only affects the next one.

## 4. Collisions and combat

### Shapes

Ships and projectiles are circles. Islands are unions of axis-aligned rectangles, defined in tile units in `config/arenaMap.ts` and converted to world units.

The map is validated when it is built: islands must be inside the arena, and a clearance radius around the player spawn must be free of islands.

### Ships against islands and borders

`resolveShipPlacement` computes the penetration vector between the ship's circle and each rectangle and pushes the ship out along it, so ships slide along coasts instead of sticking. If the centre is inside a rectangle, it pushes along the shortest axis. Up to three passes resolve the inner corners of L-shaped islands. Finally the circle is clamped to the arena bounds.

The fastest ship moves about 2.3 units per step and the narrowest island is 64 units wide, so ships cannot tunnel through islands.

### Projectiles

Each step a projectile:

1. moves by `velocity × dt` and subtracts the distance travelled from its remaining range;
2. is removed silently if it left the arena;
3. is removed with a "blocked" event if it touches an island;
4. is removed with a splash event if its range is exhausted.

Projectiles move at most 7 units per step against a minimum island size of 64, so no raycast is needed.

### Damage is applied once

- When a projectile hits, it is marked dead immediately and stops checking other targets.
- Dead ships are skipped by every system for the rest of the step and removed at its end.
- Player projectiles only test enemies, and enemy projectiles only test the player.
- A ship's destruction is reported once. The score is incremented only when a player projectile destroys an enemy.
- A Chaser that rams the player is destroyed and deals contact damage without scoring.
- Once the player dies, no further hits or points are processed in that step.

### Enemy behaviour

| Enemy       | Behaviour                                                                                                                                                                                                                                                      |
| ----------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Chaser**  | Steers toward the player at full speed.                                                                                                                                                                                                                        |
| **Shooter** | Approaches until its preferred distance (240), easing off within a 40-unit band, then keeps turning to face the player. It fires its bow cannon only when the player is within attack range (320), the cooldown is ready and its aim error is under about 10°. |

Both share the player's movement code, so they obey the same turn rates, island collisions and borders.

**Steering around islands:** each enemy probes two points ahead on its desired heading. If either touches an island, it tries alternative headings in 30° increments, up to 120°. Each enemy has a preferred side, based on its id, which avoids indecision and spreads groups around obstacles.

**Separation:** overlapping enemies are pushed apart, and a Shooter overlapping the player is pushed away. The player is never displaced by enemies. Chasers are not separated from the player, because they must touch it to explode.

### Spawning

- Enemies spawn every configured interval. The timer adds the interval instead of resetting, so the cadence does not drift.
- The first two spawns follow an opening sequence (Chaser, then Shooter), which guarantees both types appear in every standard match. Later spawns use weighted random selection.
- A spawn point must be at least 420 units from the player, at least 16 units away from any island and not overlapping another enemy. Up to 30 candidates are tried; if none fits, the spawn is retried after 0.25 s.
- At most 12 enemies are alive at once; a cycle that would exceed it is skipped.

## 5. Input

`InputController` turns keyboard and touch into a single `PlayerCommands` object that the simulation reads every step.

- Every action keeps a set of **sources** (`key:KeyW`, `pointer:3`), and it is active while any source holds it. This makes it possible to sail and fire at the same time and supports multi-touch.
- Keys are matched by `event.code`, so the layout (QWERTY, AZERTY, ABNT) does not matter.
- Listeners are attached for the lifetime of a match, but keys are captured only while the match is `running`. Menus, form fields and modifier shortcuts are never intercepted.
- Pausing, window blur and ending the match release every source. Keys held across a pause therefore do nothing after resuming until they are pressed again.
- Touch buttons use pointer capture, so a finger sliding off a button keeps the command until it is lifted.

## 6. Rendering and resources

### Scene

`GameRenderer` owns the PixiJS `Application` and a world container sized 1600 × 900. It contains four layers, drawn bottom to top: **arena**, **ships**, **projectiles**, **effects**. Each layer implements `update(state, alpha, frameDelta)`, plus `handleEvents` and `destroy` where needed.

### Viewport, density and input coordinates

- A `ResizeObserver` on the host element refits the canvas on window resizes, orientation changes and mobile browser bars.
- The world is scaled uniformly and centred (letterbox), so proportions and arena bounds never change.
- Resolution follows `devicePixelRatio`, capped at 2, with `autoDensity`.
- `toWorld()` converts screen coordinates to world coordinates, accounting for scale and offsets.

### Textures

- The game loads individual PNGs from `public/assets`: the default or the retina set, depending on screen density. Retina textures are registered with `resolution: 2`, so their logical size matches the default set.
- Ship skins map colour and damage stage to `ship_{colour + stage × 6}`: blue for the player, black for Chasers, red for Shooters.
- Loading reports progress and validates every result. Failed files are listed in an `AssetLoadError`, and combat does not start until every texture is available.
- A retry downloads only the missing files, with a cache-busting query, because PixiJS caches rejected promises by URL.
- Loaded textures are kept for the lifetime of the page and reused by every match. Destroying a scene never destroys textures (`texture: false`, `textureSource: false`).

### Reuse and pooling

| Object                          | Strategy                                                              |
| ------------------------------- | --------------------------------------------------------------------- |
| Ship views                      | Pooled per skin and reused when a new enemy of the same type spawns   |
| Projectile sprites              | A fixed pool; extra sprites are hidden instead of destroyed           |
| Effect sprites and splash rings | Pooled and recycled; at most 200 effects alive at once                |
| Arena                           | Islands are built once; the shallow-water band is cached as a texture |
| Water                           | One `TilingSprite`, whose drift follows simulation time               |

### Visual feedback

- Ship sprites switch to the damaged stages at two thirds and one third of their health, with animated fires.
- Every ship carries a health bar built from the HUD frame and fill images, clipped by a mask.
- Hits tint the hull briefly. Shots, impacts, splashes, explosions and sinking wrecks are short sprite effects that keep the arena readable.

### Cleanup on exit and restart

`GameRenderer.destroy()` removes the ticker callback, disconnects the `ResizeObserver`, unsubscribes from events, destroys every layer (pools included) and destroys the application and its canvas. `GameSession.dispose()` removes the keyboard, blur and visibility listeners. The audio binding stops its loops and timer.

The performance profile checks that canvases go back to zero and that listener counts stay flat across five start-play-exit cycles (see section 11).

### Audio

A small Web Audio engine is created on the first user gesture, to respect autoplay policies. It loads the WAV files in the background; a failed sound is simply skipped and never blocks the game.

- The same sound cannot repeat within 40 ms, and at most 24 voices play at once.
- Loops fade in and out.
- The match binding maps simulation events to sounds and reacts to snapshot changes: pause, resume, the last 10 seconds and low health.

## 7. Local persistence

Every value is stored under a `pirate-battle:` key as `{ version, data }` and validated when read. Corrupted or outdated data falls back to defaults, and storage errors (private mode, full quota) never break the app.

| Key                   | Content                                                                  |
| --------------------- | ------------------------------------------------------------------------ |
| `options`             | Session time and spawn interval                                          |
| `last-result`         | The last completed match: outcome, settings, seed, `matchId`, `playerId` |
| `registration-outbox` | Matches waiting to be sent, with status, attempts and last error         |
| `player`              | Local identity (UUID and generated captain name)                         |
| `mock-db`             | The mocked server's match table                                          |
| `mock-settings`       | Selected scenario, seed and latency scale                                |

**Abandoned matches are not recorded.** Only `completeMatch` writes a result, and it runs only when the simulation reports the end of the match. Leaving the combat screen, going back in the browser or reloading destroys the match without writing anything. Reloading on `#/play` lands on the menu.

## 8. Ranking and match history

### Contracts

`api/contracts.ts` defines the request and response types for the three endpoints. Every response is validated at runtime by `api/guards.ts` before it reaches the UI; an unexpected shape becomes an `invalid-response` error instead of a crash.

A match record contains:

- match and player identification, and the player name;
- the date played;
- score, effective duration and end reason;
- the settings used: session time, spawn interval and map.

### Axios client

- The Axios instance has a configurable timeout (8 s by default).
- Every failure is normalised into an `ApiError` with a kind: `timeout`, `network`, `client`, `server`, `invalid-response` or `cancelled`.
- `retryable` is true for timeouts, network errors, 5xx, 408 and 429 only.
- TanStack Query's `AbortSignal` is passed through, so cancelled queries cancel their HTTP request.

### Queries

| Aspect        | Behaviour                                                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| Keys          | `['ranking', mapId, sessionTime, spawnInterval, page, pageSize]` and `['history', playerId, page, pageSize]`                             |
| Freshness     | Data is fresh for 30 s and kept in cache for 5 min                                                                                       |
| Retries       | Up to two retries with exponential delay (1 s, 2 s, up to 8 s), only for retryable errors                                                |
| Showing a tab | `refetchOnMount: 'always'`: cached data appears immediately and refreshes in the background. Window focus and reconnection also refetch. |
| Changing page | `keepPreviousData` keeps the previous page visible, dimmed and `aria-busy`, until the new page arrives                                   |
| UI states     | Loading, empty, error with retry, "updating…" and "could not refresh, showing saved results"                                             |

**Late responses never overwrite newer data.** Every page has its own cache entry, so a slow response for page 3 only fills page 3, even if the player has moved back to page 1. Invalidations cancel in-flight requests for the same key through the abort signal.

### Ranking rules

The ranking compares only matches with identical settings: session time, spawn interval and map. Each completed match is one entry. Ties are broken deterministically, in this order:

1. higher score;
2. shorter duration;
3. earlier date;
4. `matchId` in lexical order.

### Registration and recovery

1. When a match ends, `completeMatch` generates a `matchId`, saves the last result and appends an entry to the **outbox**, all before any network call.
2. `RegistrationSync`, mounted once at the app root, sends outbox entries through a TanStack `useMutation`. All registrations share a mutation `scope`, so they are sent one at a time, in order.
3. The request is `PUT /api/matches/:matchId` with an `Idempotency-Key` header:
   - an unknown id is stored (`201`);
   - a known id with the same payload returns the existing record (`200`, `created: false`);
   - a known id with a different payload returns `409`.
4. On success, the entry is marked `confirmed` and both the ranking and history queries are invalidated, so both tabs refresh.
5. On failure after retries, the entry is marked `failed`. The result screen offers **Retry now** and the history tab shows how many matches are waiting.

Sending is triggered when the app starts (which resumes entries interrupted by a refresh), when a match ends, on **Retry now**, every 30 s, when the browser comes back online and when the tab becomes visible again.

A set of in-flight match ids ensures that repeated clicks and simultaneous triggers send a given match only once. The idempotent `PUT` covers the remaining case: a request stored by the server whose response was lost. Each completed match therefore produces exactly one history record and one ranking entry.

Entries interrupted while `sending` are reset to `pending` on load. Registration never blocks the game: a new match can start while previous ones are pending.

## 9. Mocked API (MSW)

- The service worker runs in development, in tests and in the published build. `main.tsx` waits for it to start before rendering, so the first queries are already intercepted. If it cannot start, the app still renders: the game works and the tabs show errors.
- Handlers, contracts, fixtures and the scenario definitions are shared by every environment.
- `mocks/scenarios.ts` holds the scenario definitions and settings, with no dependency on `msw`. The menu imports it for the Network lab.
- `mocks/network.ts` holds the parts that depend on `msw`: latency, failures and per-route request counters. Only the handlers import it, so MSW stays in a separate chunk.
- Each handler calls `beforeHandling` before processing a request and `afterHandling` after writing to the database. A failure in `afterHandling` simulates a request that was stored but never answered.
- Changing the scenario resets the request counters and the latency RNG, so every scenario starts from the same point.
- The other captains come from 48 seeded fixture matches across three configurations; the default configuration has 34, enough for several ranking pages.

## 10. User interface and accessibility

- **Navigation:** a small hash router gives each screen an address, supports the browser's back button and needs no rewrites on static hosting.
- **Focus:** every screen moves focus to its heading on mount. Pause and Network lab use native `<dialog>` with `showModal()`, which traps focus and makes the rest of the page inert. Focus returns to the trigger when the Network lab closes.
- **Menus:** tabs follow the WAI-ARIA pattern (roving `tabindex`, arrow keys, Home, End). Tables have captions and row headers and scroll horizontally on small screens.
- **Forms:** inputs have labels, hints, `aria-invalid` and per-field errors. Saving with errors shows an error summary with `role="alert"` and focuses the first invalid field.
- **Game state:** the HUD exposes health as a `meter`, score and time in a description list, and a polite live region announces only discrete changes (pause, resume, 30 and 10 seconds left, low health, end of match). It never announces every frame. The canvas is `aria-hidden`.
- **Visual:** focus rings use a high-contrast double outline, and the spinner respects reduced motion.
- **Mobile:** touch controls appear on coarse pointers, sized for thumbs and placed inside the safe areas. The supported orientation is landscape; portrait keeps the whole arena visible and shows a hint.

## 11. Testing strategy

- **Real execution:** E2E tests run against the production build in desktop and mobile Chromium. They drive the game with real key presses and real touch events.
- **Test bridge:** with `?e2e`, the bridge exposes a read-only serialisation of the state and clock control (`advance`, `step`, `run`). With `?clock=manual`, the simulation only advances when a test asks, which makes tests reproducible, together with `?seed`.
- **Speed:** `step` and `run` batch time advances and state reads in a single round trip. In manual-clock mode the renderer is capped at 10 FPS, because headless Chromium renders WebGL in software.
- **Isolation:** every test starts in a new browser context. A shared fixture fails any test that logs an unexpected console error or uncaught exception.
- **Network interception:** requests pass through the MSW service worker, so tests intercept assets with `context.route`; `page.route` does not see requests made by service workers.
- **Visual regression:** the menu, a stable arena state and the result screen are compared against versioned, platform-specific baselines.

## 12. Performance

Measured with `npm run perf` (production build, headed Chromium). The full report is in [reports/performance/latest.md](reports/performance/latest.md).

### Reference environment

| Item     | Value                                          |
| -------- | ---------------------------------------------- |
| CPU      | AMD Ryzen 5 5600X (12 threads)                 |
| Memory   | 31.2 GB                                        |
| OS       | Arch Linux, kernel 7.3.4                       |
| Browser  | Chromium 159                                   |
| GPU      | NVIDIA GeForce RTX 3060 (ANGLE, OpenGL ES 3.2) |
| Viewport | 1280 × 720 at 1×                               |
| Match    | 180 s session, enemy every 3 s, seed 7         |

### Results

| Metric                    | Value                            |
| ------------------------- | -------------------------------- |
| Average frame rate        | 164.8 FPS (display refresh rate) |
| Mean frame time           | 6.07 ms                          |
| p95 frame time            | 6.1 ms                           |
| p99 frame time            | 6.2 ms                           |
| Worst frame               | 24.3 ms                          |
| Frames over 16.7 ms       | 0.03%                            |
| Entities (average / peak) | 4 / 9                            |

The 60 FPS target is met with a wide margin: the game follows the 165 Hz display, and the 95th percentile frame takes 6.1 ms.

### Memory over five start-play-exit cycles

The JS heap was measured after forcing garbage collection.

| Sample              | JS heap | Listeners | DOM nodes | Canvases |
| ------------------- | ------- | --------- | --------- | -------- |
| Menu, before cycles | 8.83 MB | 213       | 333       | 0        |
| After cycle 1       | 9.09 MB | 220       | 333       | 0        |
| After cycle 5       | 9.82 MB | 219       | 333       | 0        |

- No canvas, WebGL context or event listener is left behind: listeners stay between 219 and 222, and DOM nodes stay at 333–334.
- The heap grows by about 0.1–0.3 MB per cycle (0.49 MB between cycles 2 and 5), well below the 2 MB threshold used to flag a leak. A longer run (20 or more cycles) would show whether this residual growth plateaus.

### Limitations observed

- **Short match and light load.** In this run the autopilot died after 45 s, so the measurement covers 45 s of play and a light load (peak of 9 entities) rather than a full three-minute match.
- **Measurement overhead.** The autopilot dispatches synthetic keyboard events and serialises the state every 50 ms, which adds a small constant overhead.
- **Display-capped frame rate.** `requestAnimationFrame` follows the display, so frame rates above 60 FPS reflect the monitor's refresh rate, not extra headroom.
- **Headless runs.** Headless runs use software WebGL and are not representative of real devices.

## 13. Balancing decisions

| Decision                                                                                                               | Reason                                                                                                   |
| ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Bow cannon fast and accurate (0.45 s, 20 damage, range 420); broadsides slower but wider (three shots, 1.6 s per side) | Gives a precise main weapon and a positional burst that rewards turning broadside to enemies             |
| Chaser fragile and fast (40 health, two bow hits) with heavy contact damage (25)                                       | It must be dealt with early, and letting it reach the player is a real mistake                           |
| Shooter tougher and slower (60 health) with a preferred distance below its attack range                                | It stays inside its own range and keeps pressure without ramming                                         |
| Spawns at least 420 units away, opening with Chaser then Shooter                                                       | No unavoidable damage on spawn, and both enemy types in every match                                      |
| At most 12 enemies alive                                                                                               | Keeps short spawn intervals playable and bounds the per-frame work                                       |
| Session 60–180 s (steps of 10); spawn interval 1–10 s (steps of 0.5)                                                   | Long enough for a meaningful match; one second is the shortest interval that still lets the player react |

## 14. Known limitations and trade-offs

- **No position interpolation.** Positions are drawn as simulated. This is smooth at 60 Hz and above, but very high-refresh displays could show minor judder.
- **Islands.** Inner corners of L-shaped islands use the centre tile and look square. Island colliders are full rectangles, while the sand art has rounded corners.
- **Individual PNGs instead of atlases.** About 130 small requests on the first load. This was chosen because the provided atlas paths would break after hashing and the ships atlas is in a format PixiJS does not read natively.
- **MSW chunk.** The worker chunk (402 kB) is downloaded before the first render so that no request escapes the mocks. With a real backend this chunk would not exist.
- **Local-only identity.** The player is a UUID in `localStorage`. Clearing site data creates a new player.
- **Single fixed map.** Map data is validated and decoupled from rendering, so new maps only need new definitions.
- **Simulated focus loss in tests.** Blur and visibility are simulated with dispatched events, because headless browsers do not lose focus.
