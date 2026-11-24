# Pirate Battle

A top-down 2D naval shooter built with React, TypeScript and PixiJS. Sail between islands, fight enemy ships and score as many points as you can before the time runs out.

**Live demo:** <add your Vercel URL>

- Architecture and design decisions: [ARCHITECTURE.md](ARCHITECTURE.md)
- Latest performance report: [reports/performance/latest.md](reports/performance/latest.md)

## Features

- Player ship with forward movement, rotation, a bow cannon and two three-shot broadsides
- Two enemy types: **Chaser** (rams and explodes) and **Shooter** (keeps its distance and fires)
- Islands that block ships and cannonballs, time-based simulation with a fixed 60 Hz step
- Manual and automatic pause (window blur, hidden tab), clean restart, persistent options and last result
- Ranking and match history served by a mocked REST API (MSW) through Axios and TanStack Query
- Idempotent match registration with an offline outbox that survives refreshes and failures
- Keyboard and touch controls, accessible menus and a semantic HUD
- Playwright E2E tests, visual regression and an automated performance profile

## Tech stack

| Responsibility                  | Technology          |
| ------------------------------- | ------------------- |
| UI and menus                    | React 19            |
| Language                        | TypeScript (strict) |
| Game rendering                  | PixiJS 8            |
| Remote state (ranking, history) | TanStack Query 5    |
| HTTP client                     | Axios               |
| API mocking                     | MSW 2               |
| E2E and visual tests            | Playwright          |
| Build tool                      | Vite                |

## Requirements

- Node.js 20.19+ or 22.12+
- npm 10+

## Setup

```bash
npm ci
npm run dev
```

Open http://localhost:5173.

To run the tests for the first time, install the Playwright browser:

```bash
npx playwright install chromium
```

## Commands

| Command                    | Description                                        |
| -------------------------- | -------------------------------------------------- |
| `npm run dev`              | Development server with hot reload                 |
| `npm run build`            | Type-check and build for production into `dist/`   |
| `npm run preview`          | Serve the production build locally                 |
| `npm run lint`             | ESLint                                             |
| `npm run typecheck`        | TypeScript project check                           |
| `npm run test:e2e`         | All Playwright tests (desktop and mobile Chromium) |
| `npm run test:e2e:desktop` | Tests on the desktop project only                  |
| `npm run test:e2e:mobile`  | Tests on the mobile project only                   |
| `npm run test:e2e:update`  | Run the tests and update the visual baselines      |
| `npm run test:e2e:report`  | Open the last HTML report                          |
| `npm run perf`             | Profile a three-minute match in a headed browser   |
| `npm run perf:headless`    | Same profile without a window (software WebGL)     |

## Environment variables

The application needs **no environment variables**: gameplay runs locally and the API is mocked in the browser, in development, tests and production alike.

| Variable        | Used by        | Effect                                                  |
| --------------- | -------------- | ------------------------------------------------------- |
| `CI`            | Playwright     | Enables retries, forbids `test.only` and limits workers |
| `PERF_HEADLESS` | `npm run perf` | `1` runs the profile without a window                   |

### URL parameters

These query parameters are read at startup. They exist for testing and demos and do not change the game rules.

| Parameter      | Example            | Effect                                                    |
| -------------- | ------------------ | --------------------------------------------------------- |
| `scenario`     | `?scenario=slow`   | Selects a network scenario (persisted)                    |
| `latencyScale` | `?latencyScale=0`  | Multiplies every mocked latency (persisted)               |
| `mockSeed`     | `?mockSeed=7`      | Seed for random mocked latency (persisted)                |
| `apiTimeout`   | `?apiTimeout=1500` | Axios timeout in milliseconds (default `8000`)            |
| `e2e`          | `?e2e`             | Exposes the test bridge on `window`                       |
| `seed`         | `?seed=42`         | Fixes the simulation seed (spawn order and positions)     |
| `clock`        | `?clock=manual`    | Stops the real-time clock so tests advance the simulation |

## Controls

| Action               | Keyboard               | Touch                    |
| -------------------- | ---------------------- | ------------------------ |
| Sail forward         | `W` or `↑`             | Forward button           |
| Turn left / right    | `A` / `D` or `←` / `→` | Turn buttons             |
| Fire bow cannon      | `Space` or `K`         | Bow cannon button        |
| Fire left broadside  | `Q` or `J`             | Left broadside button    |
| Fire right broadside | `E` or `L`             | Right broadside button   |
| Pause                | `Esc` or `P`           | Pause button (top right) |

- Moving, turning and firing can be combined, on the keyboard and with multi-touch.
- Game keys are captured only while a match is running; menus keep their normal keyboard behaviour.
- The game pauses automatically when the window loses focus or the tab is hidden. Only the **Resume** button (or `Esc` inside the pause dialog) resumes it.
- On phones the supported orientation is **landscape**. Portrait still shows the whole arena, letterboxed.

## Gameplay configuration

All balance values live in typed configuration files. The systems read them; changing a value never requires changing logic.

- `src/game/config/gameConfig.ts`: world, simulation, match, spawn, player, Chaser and Shooter
- `src/game/config/aiConfig.ts`: enemy steering and aiming
- `src/game/config/arenaMap.ts`: islands, in tile coordinates, and player spawn

Each match uses a frozen snapshot of the configuration taken when it starts. Changing the options only affects the next match.

### Player options

| Option            | Range    | Step  | Default |
| ----------------- | -------- | ----- | ------- |
| Game session time | 60–180 s | 10 s  | 120 s   |
| Enemy spawn time  | 1–10 s   | 0.5 s | 3 s     |

Options are validated on save and persisted in `localStorage`.

### Main values

| Area       | Value                                                                                                                   |
| ---------- | ----------------------------------------------------------------------------------------------------------------------- |
| World      | 1600 × 900 units, 64-unit tiles                                                                                         |
| Simulation | Fixed step of 1/60 s, frame delta capped at 0.25 s                                                                      |
| Player     | 100 health, speed 140, turn rate 2.4 rad/s                                                                              |
| Bow cannon | 1 shot, 20 damage, 0.45 s cooldown, speed 420, range 420                                                                |
| Broadsides | 3 parallel shots per side, 15 damage, 1.6 s cooldown each, speed 360, range 300                                         |
| Chaser     | 40 health, speed 120, 25 contact damage                                                                                 |
| Shooter    | 60 health, speed 90, fires within 320 units and holds at 240; 10 damage, 1.8 s cooldown                                 |
| Spawns     | First a Chaser, then a Shooter, then 55% / 45%; at least 420 units from the player and clear of islands; up to 12 alive |

## Ranking and match history API

The API is mocked with MSW at the network level and persisted in `localStorage`, so confirmed matches appear in later queries and survive refreshes.

| Method | Path                                                         | Description                   |
| ------ | ------------------------------------------------------------ | ----------------------------- |
| `GET`  | `/api/ranking?sessionTime&spawnInterval&mapId&page&pageSize` | Ranking for one configuration |
| `GET`  | `/api/players/:playerId/matches?page&pageSize`               | Player history, newest first  |
| `PUT`  | `/api/matches/:matchId`                                      | Idempotent match registration |

Contracts and runtime guards are in `src/api/contracts.ts` and `src/api/guards.ts`. Other captains come from deterministic fixtures in `src/mocks/fixtures.ts`.

## Network scenarios

| Scenario                        | Behaviour                                                                       |
| ------------------------------- | ------------------------------------------------------------------------------- |
| `success`                       | Normal responses after 250 ms                                                   |
| `empty`                         | Ranking and history return no entries                                           |
| `slow`                          | Every response takes 2.5 s                                                      |
| `variable-latency`              | 0.1–2 s per response, seeded                                                    |
| `out-of-order`                  | Odd requests take 1.8 s and even requests 0.2 s, so older responses arrive last |
| `timeout`                       | No response ever arrives                                                        |
| `offline`                       | Network-level failure                                                           |
| `client-error`                  | HTTP 400 on every request                                                       |
| `server-error`                  | HTTP 503 on every request                                                       |
| `ranking-failure`               | Only the ranking fails (HTTP 500)                                               |
| `history-failure`               | Only the history fails (HTTP 500)                                               |
| `register-timeout-after-commit` | The first registration is stored but its response never arrives                 |
| `register-unavailable`          | Registration fails with HTTP 503 until another scenario is selected             |

### Selecting a scenario

- **In the UI:** Main menu → **Network lab**. Choose a scenario and a latency (Normal, Fast or Instant).
- **By URL:** `/?scenario=register-unavailable#/menu`
- **In tests:** `window.__PIRATE_MOCKS__.setScenario('slow')` (available with `?e2e`)

The selected scenario, seed and latency are persisted and survive refreshes.

### Restoring the initial state

- **In the UI:** Network lab → **Reset mock server**. Restores the fixtures, removes registered matches and selects `success`.
- **In tests:** `window.__PIRATE_MOCKS__.resetMocks()`
- **Everything, including options and the pending outbox:** clear the site data in the browser (DevTools → Application → Storage → Clear site data).

## Reproducing failures

| Situation                                      | Steps                                                                                                                                                       |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Ranking error and retry                        | Select `ranking-failure`, open the Ranking tab, then select `success` and press **Try again**                                                               |
| Background refresh failure                     | Load the Ranking, select `ranking-failure`, switch to Match History and back: saved rows stay visible with a warning                                        |
| Loading state                                  | Select `slow` with Normal latency and reload                                                                                                                |
| Late responses                                 | Select `out-of-order` with Normal latency, go to page 2, press Next and immediately Previous: the page you are viewing is kept                              |
| Registration unavailable at the end of a match | Select `register-unavailable`, finish a match, reload the result screen (still pending), start another match, then select `success` and press **Retry now** |
| Timeout after the match was saved              | Select `register-timeout-after-commit` and finish a match: the retry recovers the stored record and the match appears once                                  |
| Asset loading failure                          | DevTools → Network → right click `ship_5.png` → **Block request URL**, then press Play; unblock and press **Try again**                                     |
| Abandoned match                                | Start a match and reload or press **Main Menu** in the pause dialog: nothing is recorded                                                                    |

The quickest way to finish a match is Options → **Enemy spawn time** `1` and **Game session time** `60`.

## Testing

```bash
npm run test:e2e
```

- Tests run against the production build (`vite build` + `vite preview`) on two projects: **desktop-chromium** (1280×720) and **mobile-chromium** (Pixel 7, landscape, touch).
- Each test starts from an isolated browser context with empty storage and fresh mock data.
- Tests use a fixed seed and a manual clock (`?clock=manual`). They press real keys and touch real buttons, then advance the simulation step by step through `window.__PIRATE_BATTLE__`.
- Any unexpected console error or uncaught exception fails the test.

### Reports and traces

- HTML report: `playwright-report/` (open with `npm run test:e2e:report`)
- Traces, screenshots and videos of failed tests: `test-results/`
- Open a trace: `npx playwright show-trace test-results/<test>/trace.zip`

### Visual regression

Baselines for the menu, a stable arena state and the result screen are versioned in `tests/__screenshots__/<platform>/`. They are platform specific. To check or update them on any machine, use the official Playwright image (its version must match `@playwright/test` in `package.json`):

```bash
docker run --rm --network host -v "$PWD":/work -w /work mcr.microsoft.com/playwright:v<version>-noble \
  /bin/bash -c "npm ci && npx playwright test tests/visual"
```

Add `--update-snapshots` to regenerate them.

## Performance

```bash
npm run perf
```

The profile builds the app, plays a three-minute match with an in-page autopilot and runs five start-play-exit cycles. It writes a JSON and a Markdown report to `reports/performance/`, recording:

- hardware, browser, GPU renderer and resolution;
- average FPS, mean, p95 and p99 frame time;
- entity counts;
- memory after each cycle.

Keep the browser window focused during the run: losing focus pauses the game.

## Deployment

The app is a static site and deploys to Vercel with the default Vite settings (build `npm run build`, output `dist`). Navigation uses the URL hash, so no rewrites are needed. `public/mockServiceWorker.js` must be committed: the published build runs the mocked API.

## Project structure

```
src/
  api/          contracts, guards, Axios client, queries, registration sync
  app/          App, hash router, QueryClient
  audio/        Web Audio engine
  game/
    audio/      game sounds bound to simulation events
    config/     typed gameplay, AI and arena configuration
    input/      keyboard and touch input
    render/     PixiJS renderer, texture loading and scene layers
    session/    GameSession (state, input, clock, pause, end of match)
    sim/        pure simulation: state, systems, geometry, RNG, fixed-step clock
  mocks/        MSW handlers, scenarios, mock database and fixtures
  storage/      localStorage stores (options, last result, outbox, identity)
  testing/      test bridge
  ui/           screens, menu panels, HUD and components
tests/
  e2e/          functional tests
  visual/       visual regression
  perf/         performance profile
  support/      helpers and fixtures
public/assets/  art and sound assets
```

## Assets and licenses

All art and sound assets are the ones provided with the challenge, in `public/assets/`, used as delivered (individual PNGs; the default or retina set is chosen by screen density). No third-party art, sounds or fonts were added; the interface uses system fonts.
