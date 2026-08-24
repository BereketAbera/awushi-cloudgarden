# Runtime performance

The current measurements and browser versions are recorded in `PHASE3-VALIDATION.md` and `assets/phase3-verification.json`. This document explains the measured workload and the resource decisions; it does not promise a frame rate on every device.

## Update boundaries

The infrastructure and adventure models advance on a 100ms logical-clock timer, independently of the renderer. Hidden tabs pause the notebook; resumed timers clamp a single wall-time delta to one second, so background throttling cannot fast-forward the lesson. Saves happen at commands, infrastructure event boundaries, pause/leave and page visibility changes. Nothing writes storage every animation frame.

Character, camera, visual interpolation and collision updates use R3F frame callbacks and refs. React receives position, expression, FPS and renderer diagnostics about five times per second. The UI can render ten times per second while a lesson advances; its work is bounded by the small local model, latest evidence per inspection kind and bounded event/decision history. Replay reconstructs at the same 100ms cadence from at most 512 recorded commands. There is no network subscription or repeated polling of a real service.

The static procedural reflection environment is memoized by quality and lighting, preventing scene telemetry updates from rebuilding its cube map. World and character GLBs are cached; cloned hierarchies retain shared geometry and material resources. Five character clips reuse one rig, while expressions modify existing morph weights. Effects use at most eight event packets and eight instanced Pod shells; they do not add unbounded particles. See `EFFECTS.md` for ownership and cleanup.

## Graphics budget

The existing geometry and texture budgets are enforced by `assets:validate`; Phase 3 adds no new models or texture maps. The shadow map is 1024 pixels at Balanced and 2048 at High. Pixel ratio is capped at 1 for Low, 1.5 for Balanced and 1.75 for High. Low disables shadows. One studio contact-shadow resource set is retained per Canvas and disabled outside the studio. On unmount, private skeleton bone textures, per-instance buffers, tinted materials and audio nodes are released by their owners.

All-pass renderer counters are captured at the next frame boundary with `gl.info.autoReset=false`, then reset before frame callbacks. This includes shadow and transmission work. Geometry and texture counters count resources; they do not measure GPU bytes. The FPS readout uses completed animation-frame intervals, not a GPU timestamp query. These distinctions matter when comparing the reports with profiler or asset-file triangle totals.

## Repeatable measurement

`tests/browser/performance.spec.ts` starts the actual promotion lesson, pushes a development release, observes ten one-second samples, inspects CI and the published image, approves the reviewed digest, then observes eighteen further samples. The field notebook is closed during sampling so the real third-person world is visible. The test records FPS, submitted draw calls/triangles and resource counts. Desktop and phone-profile runs are serialized to avoid simultaneous benchmark renderers.

A second case warms the full overview, then switches between studio and world five times through real UI controls and records the returned world’s geometry/texture counts. This checks bounded repeated-mode allocation, not every possible leak or a long-duration memory soak. Separate overview samples preserve a simple baseline. Reports retain transient frame-rate dips rather than filtering them away.

The phone profile is headless desktop Chromium with an iPhone-sized viewport and touch emulation. It does not emulate a phone GPU, battery, heat or Safari. Firefox and WebKit verify behavior; their results must not be presented as physical Firefox mobile, Safari or iOS testing. Physical-device profiling, longer stress runs and heap/GPU-byte analysis remain useful next steps.

The Three.js scene is dynamically imported separately from the interface. Its roughly 1 MB minified bundle still triggers Vite’s visible large-chunk warning; the build succeeds. Further splitting, geometry LOD or district streaming should be justified by measured loading and physical-device constraints instead of adding complexity to this small scene prematurely.
