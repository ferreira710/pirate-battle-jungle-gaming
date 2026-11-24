# Performance profile

Generated at 2026-11-24T17:48:29.519Z.

## Environment

| Item | Value |
| --- | --- |
| CPU | AMD Ryzen 5 5600X 6-Core Processor (12 threads) |
| Memory | 31.2 GB |
| OS | Linux 7.3.4-arch1-2 (x64) |
| Browser | Chromium 159.0.8154.6 |
| GPU renderer | ANGLE (NVIDIA Corporation, NVIDIA GeForce RTX 3060/PCIe/SSE2, OpenGL ES 3.2) |
| Viewport | 1280×720 @ 1x |

## Match

| Item | Value |
| --- | --- |
| session time (s) | 180 |
| enemy spawn time (s) | 3 |
| seed | 7 |
| ended by | death |
| time played (s) | 45 |
| score | 8 |

## Frame timing

| Metric | Value |
| --- | --- |
| frames measured | 7378 |
| average FPS | 164.8 |
| mean frame time (ms) | 6.07 |
| p95 frame time (ms) | 6.1 |
| p99 frame time (ms) | 6.2 |
| worst frame (ms) | 24.3 |
| frames over 16.7 ms (%) | 0.03 |

## Entities

| Metric | Value |
| --- | --- |
| average entities | 4 |
| peak entities | 9 |
| peak enemies | 5 |
| peak projectiles | 3 |

## Memory after start, play and exit cycles

| Sample | JS heap (MB) | Event listeners | DOM nodes | Canvases |
| --- | --- | --- | --- | --- |
| menu (before cycles) | 8.83 | 213 | 333 | 0 |
| after cycle 1 | 9.09 | 220 | 333 | 0 |
| after cycle 2 | 9.33 | 222 | 333 | 0 |
| after cycle 3 | 9.62 | 220 | 334 | 0 |
| after cycle 4 | 9.7 | 221 | 333 | 0 |
| after cycle 5 | 9.82 | 219 | 333 | 0 |

**Verdict:** No continuous growth: heap changed 0.49 MB between cycles 2 and 5 and event listeners stayed stable.

## Notes

- Built with `vite build` and served by `vite preview`.
- The player is driven by an in-page autopilot that dispatches keyboard events every 50 ms and reads the simulation state; this adds a small, constant overhead.
- Frame times come from `requestAnimationFrame`, so the frame rate is capped by the display refresh rate.
- Headless runs use software WebGL and are not representative of real devices.
