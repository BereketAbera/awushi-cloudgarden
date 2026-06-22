# Phase 1 verification

Verification performed locally on 2026-11-06 using Blender 5.1.1, Node 24.13.0, the installed Google Chrome, and the actual exported assets. The original prototype audit in `VALIDATION.md` is retained as history; this document describes the expanded world.

## Automated gates

- ESLint and strict TypeScript checking pass.
- Pipeline suite: **20 passing tests**, including process failures, GLB structure, bounded sparse expansion, morph validation, skin weights, vertical jumps, blinks, and reproducibility semantics.
- Actual Three.js loader suite: **19 passing tests**, covering all five clips, all legacy assets, seven new composites, finite skin/world transforms, outward rock winding, bridge corners/heights, and all 17 declared footprints.
- Pure game and real-GLB expression suites: **13 passing tests**, covering all-location reachability, collisions, camera-relative movement, camera damping, interaction eligibility, behavior, progress/reset, morph crossfades, clone isolation, blink compatibility and locomotion independence.
- Playwright: **10 passing browser tests**, with four intentional cross-platform skips (desktop-only long route/camera checks and mobile-only touch/350px checks). It runs against the **production build** on a private local preview at port 5176. Desktop and mobile projects cover welcome, architecture, modal focus, camera modes, actual camera tracking, studio controls, all six introductions reached with keyboard movement, persistence/reset, pointer movement/release, input blocking, recovery and 350px overflow. Platform-specific tests intentionally run only in their applicable project.
- Production build passes. The lazy Three.js scene remains about **1.05 MB raw / 291 kB gzip**, so Vite reports its normal large-chunk warning. Interface JS is about 284 kB raw / 89 kB gzip. This is recorded rather than suppressing the warning.
- `npm audit` reports **zero vulnerabilities** after patching the development-only glob matcher dependency. Node 22.13+ or 24 is required by the selected lint tools.

Run `npm run verify` for the complete check. `assets/phase1-verification.json` records the final counts, browser cases and source hashes. The JSON browser result and failure traces are written to ignored `test-results/`; approved visual evidence and compact measured performance reports are tracked in `assets/`.

## Assets and reproducibility

All **13 GLBs** passed native checks and the independent Khronos validator with **zero errors and zero warnings**. `assets/validation-report.json` records hashes, sizes, bounds, material extensions, animations and morph names.

| Runtime content | Triangles | Export size |
| --- | ---: | ---: |
| Awushi, including expressive face | 52,332 | 2,704,328 bytes (2.58 MiB) |
| Seven world composites | 216,680 | approximately 6.0 MiB combined |
| Largest world composite | 44,202 | approximately 1.27 MiB |

Five legacy environment assets remain versioned and tested but are not loaded alongside the new composites. The live world therefore contains roughly 269k authored triangles before culling and extra render passes. World materials are texture-free; the character's amber gradient is a small packed procedural texture. Removing unused UV layers reduced the new world exports from about 8.1 to 6.0 MiB without changing their rendered appearance.

Character and world generators each ran again in isolated temporary roots. `assets/awushi-expression-reproducibility.json` and `assets/source/world-reproducibility.json` confirm exact positions, oriented topology, material/metadata and animation semantics. Blender can reorder indices and vary a few normal components within the documented 0.0002 tolerance. Binary identity and pixel identity across platforms are not claimed.

## Visual review and fixes

Rendered and inspected four complete character views, ten expression closeups, three world views and six district closeups. The neutral face preserves the original brow-free identity; expressive brows emerge only in non-neutral states. Open-mouth shading was corrected to a matte dark mouth. The compact face has nine sparse morph targets and uses the existing eye bones for blinking.

Browser screenshots show both desktop and phone layouts, the full overview, studio expressions, and a real discovery panel. Visual review led to deeper island undersides, corrected layered paths, a compact mobile expression drawer that keeps the face visible, and a visible mobile Home recovery control. Tests exposed and fixed opener-focus loss caused by applying `inert` before capturing focus. Studio playback speed is isolated from gameplay to keep the gait aligned with movement.

## Performance and limits

`assets/performance-desktop.json` and `assets/performance-mobile.json` contain 15 one-second FPS samples from the actual production renderer, Balanced quality, idle world Overview. The final run averaged 59.7 FPS in both profiles: 57–60 desktop and 55–60 in the phone-sized emulation. They record viewport, mean and range. The mobile case emulates a phone viewport in desktop Chrome; it is **not** a physical-device benchmark. These are local observed results, not a guarantee of 60 FPS on every device or during every interaction.

| Quality | Maximum DPR | Shadow map | Environment |
| --- | ---: | --- | ---: |
| Low | 1 | Off | 128 |
| Balanced | 1.5 | 1024², player-centered | 256 |
| High | 1.75 | 2048², player-centered | 256 |

The static world uses material batching, frustum culling, cached loading and six instanced animated beacons. Collision uses simple discs and bridge capsules. UI telemetry updates five times per second, not every frame. The initial world load still includes all seven composites; distance streaming and more aggressive LOD remain future options if the map grows. Transmission and shadows cost additional rendering work. Low quality is the first adjustment for weaker devices.

The current interactions are educational notes, with planned simulations labeled honestly. There is no cloud connection, backend, multiplayer, live GitHub action, real Kubernetes cluster or infrastructure engine. The character is a procedural reconstruction of one image; the unseen surfaces and animations are authored. Mobile hardware, Safari/WebKit and assistive-technology testing beyond the included semantics/focus checks remain useful next validation targets.

## Phase 2

Build one complete local learning scenario before adding more buildings: a change moves through GitHub, a failing CI check, a fix, an image and a Kubernetes rollout. Give it explicit states, understandable failure/recovery, saved scenario progress and deterministic tests. Extend the data-driven station model with scenario capabilities while keeping discovery notes available. Measure physical mobile devices and add LOD or streaming only where those measurements justify it.
