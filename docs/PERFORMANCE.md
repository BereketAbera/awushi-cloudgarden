# Runtime performance

The current measurements and browser versions are recorded in `PHASE4-VALIDATION.md` and `assets/phase4-verification.json`; Phase 3 reports remain historical evidence. This document explains the measured workload and the resource decisions; it does not promise a frame rate on every device.

## Update boundaries

The infrastructure and adventure models advance on a 100ms logical-clock timer, independently of the renderer. Hidden tabs pause the notebook; resumed timers clamp a single wall-time delta to one second, so background throttling cannot fast-forward the lesson. Saves happen at commands, infrastructure event boundaries, pause/leave and page visibility changes. Nothing writes storage every animation frame.

Character, camera, visual interpolation and collision updates use R3F frame callbacks and refs. React receives position, expression, FPS and renderer diagnostics about five times per second. The UI can render ten times per second while a lesson advances; its work is bounded by the small local model, latest evidence per inspection kind and bounded event/decision history. Replay reconstructs at the same 100ms cadence from at most 512 recorded commands. There is no network subscription or repeated polling of a real service.

The static procedural reflection environment is memoized by quality and lighting, preventing scene telemetry updates from rebuilding its cube map. World and character GLBs are cached; cloned hierarchies retain shared geometry and material resources. Five character clips reuse one rig, while expressions modify existing morph weights. Effects use at most eight event packets and eight instanced Pod shells; they do not add unbounded particles. See `EFFECTS.md` for ownership and cleanup.

## Graphics budget

The existing geometry and texture budgets are enforced by `assets:validate`; Phases 3 and 4 add no new models or texture maps. The shadow map is 1024 pixels at Balanced and 2048 at High. Pixel ratio is capped at 1 for Low, 1.5 for Balanced and 1.75 for High. Low disables shadows. One studio contact-shadow resource set is retained per Canvas and disabled outside the studio. On unmount, private skeleton bone textures, per-instance buffers, tinted materials and audio nodes are released by their owners.

All-pass renderer counters are captured at the next frame boundary with `gl.info.autoReset=false`, then reset before frame callbacks. This includes shadow and transmission work. Geometry and texture counters count resources; they do not measure GPU bytes. The FPS readout uses completed animation-frame intervals, not a GPU timestamp query. These distinctions matter when comparing the reports with profiler or asset-file triangle totals.

## Repeatable measurement

`tests/browser/performance.spec.ts` starts the actual promotion lesson, pushes a development release, observes ten one-second samples, inspects CI and the published image, approves the reviewed digest, then observes eighteen further samples. The field notebook is closed during sampling so the real third-person world is visible. The test records FPS, submitted draw calls/triangles and resource counts. Desktop and phone-profile runs are serialized to avoid simultaneous benchmark renderers.

A second case warms the full overview, then switches between studio and world five times through real UI controls and records the returned world’s geometry/texture counts. This checks bounded repeated-mode allocation, not every possible leak or a long-duration memory soak. Separate overview samples preserve a simple baseline. Reports retain transient frame-rate dips rather than filtering them away.

The phone profile is headless desktop Chromium with an iPhone-sized viewport and touch emulation. It does not emulate a phone GPU, battery, heat or Safari. Firefox and WebKit verify behavior; their results must not be presented as physical Firefox mobile, Safari or iOS testing. Physical-device profiling, longer stress runs and heap/GPU-byte analysis remain useful next steps.

The Three.js scene is dynamically imported separately from the interface. Its roughly 1 MB minified bundle still triggers Vite’s visible large-chunk warning; the build succeeds. Further splitting, geometry LOD or district streaming should be justified by measured loading and physical-device constraints instead of adding complexity to this small scene prematurely.

## Phase 4 cinematic workload

`tests/browser/cinematic-performance.spec.ts` runs the free-exploration healthy release in Watch Flow at 2×, samples the actual renderer every 500ms, explicitly approves the proposed digest through the UI, and observes the completed flow. Samples include camera travel, source/destination packets, the primary silhouette, secondary emphasis, rolling Pods and captions. The fixture requires at least 15 observed stage identifiers and records the full observed set, rather than assuming all stages appeared. Desktop and phone-profile captures are serialized. `assets/phase4-performance-desktop.json` and `assets/phase4-performance-mobile.json` retain every sample, including dips and loading/transitional work. Final measured values are in the Phase 4 validation report.

Station outline extraction occurs once when each district loads. One primary station and at most two related stations receive selective geometry; their resources are disposed when no longer selected. No full-screen bloom or global postprocessing was added. The camera writes once per frame; bounds/framing and derived historical frames are memoized against their inputs. Read-only stage reconstruction operates on cloned command records and the existing bounded engine history, not an independently simulated visual state.

The visible camera viewport excludes the playback or Guide Me rail, so its aspect calculation reflects unobscured space. Phone profiles sacrifice scene height for readable captions and controls. On these layouts the compact station label remains, while redundant packet HTML labels are suppressed; packet shape/color and the route caption still identify movement. Pausing freezes the simulation and active visual clock. Renderer interruption pauses live adventures, live laboratory playback, full recorded journeys and historical-stage playback until the visitor chooses to continue.
