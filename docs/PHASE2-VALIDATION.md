# Phase 2 verification

Verified locally on 2026-11-06 with Node 24.13.0, Blender 5.1.1, installed Google Chrome and the actual exported models. Phase 1 evidence remains historical; this report covers the immersive cameras, deployment model, technology inspectors and event-driven effects.

## Automated gates

`npm run verify` runs lint, strict TypeScript, pipeline tests, actual Three.js loader tests, unit tests, independent GLB validation, the production build and Playwright against that build on port 5176.

| Suite | Coverage | Result |
| --- | --- | --- |
| Pipeline | Export structure, animation/skin/morph integrity, process failures and reproducibility rules | 20 passed |
| Runtime loader | Actual character/world exports, five clips, finite transforms, all building footprints and bridge geometry | 19 passed |
| Unit | 14 camera, 19 simulation, 3 effects, 9 game/navigation and 4 expression tests | 49 passed |
| Browser | Desktop and phone-sized Chrome, production assets and real controls | 23 passed; 7 intentional platform-specific skips |
| Asset validation | 14 GLBs, native checks and Khronos validator | Zero errors and warnings |

All lint/type/build gates passed. The complete run has **111 passing tests**, zero failures and seven intentional platform-specific browser skips. `assets/phase2-verification.json` records the cases, counts, source hashes and performance artifacts.

The browser fixture fails on uncaught page or console errors. Tests preserve the ten expressions and studio playback, walk to all six district introductions, cross a bridge using immersive steering, interact in first-person, exercise real touch-look, persist all four camera modes and verify mobile movement/release/recovery. Architecture tests inspect technologies before discovery and locate them through the world marker. Modal tests check focus trapping, reachable event history, live status announcements, sticky close controls and narrow-screen overflow.

Camera unit tests project the real character dimensions into perspective framing, compare the eye level to the exported eye bones, test every bridge sample and approach all 17 colliders from many playable angles. Held steering and travel are compared at 15, 60 and 144 FPS. Final yaw agrees numerically and one-second travel agrees within 2cm. Browser traversal of all six districts uses Isometric; the dedicated immersive route uses the Maker Village bridge and a first-person workshop interaction.

## Connected journey

The primary Playwright journey pushes a code change, reaches the explicit human gate, confirms waiting does not approve it, merges the proposal and verifies the complete 22-stage result: local image availability, the selected environment's deployment revision and healthy replicas, synchronized GitOps, Service/Traefik readiness and telemetry. Switching to the other environment confirms it retained its independent baseline. Reset returns both to their initial state.

Pure tests additionally cover all three seeded failures, repair/retry, cancellation, arbitrary tick cadence, malformed commands, missing prerequisites, bounded history, isolated backup/restore and graph consistency. Regression tests ensure cancelling a partial rollout does not revert ready Pods when a later release begins. Shared CI and registry inspectors name the latest candidate's target; they do not claim a candidate is deployed in whichever environment happens to be selected.

The runtime is a local teaching model. CI has no cluster access; image promotion precedes desired-state publication; Argo reads the reachable local Git mirror. Prometheus rules feed Alertmanager independently of Grafana. Namespace separation does not imply separate physical clusters.

## Rendered assets and review

The new `deployment-effects.glb` contains six reusable prototypes: code packet, image package, configuration packet, Pod shell, signal orb and activity ring. The export is **209,460 bytes and 6,280 triangles**, below its 400-KiB/8k-triangle budget. The generator, editable `effects.blend`, manifest, GLB, three actual Blender renders and isolated regeneration report are versioned together.

`assets/source/effects-reproducibility.json` records a second generation with exact vertex positions, oriented topology, materials and metadata. Blender reordered two index accessors and varied six normal components by at most 0.0000911, within the established 0.0002 tolerance. Binary identity across runs is not claimed. Character and environment geometry are unchanged from the accepted Phase 1 exports.

Visual review covered desktop/phone third-person and first-person framing, the real bridge arrival, the architecture graph, approval and completion panels, mobile scrolling and the Blender effects from three angles. Runtime effects consume actual engine events and replica records; animation completion never advances the model. Eight recent event packets are the maximum, Pod displays use instancing, and reduced motion places packets at their destinations.

## Performance and delivery limits

`assets/phase2-performance-desktop.json` and `assets/phase2-performance-mobile.json` record 28 one-second samples from an active healthy delivery in Third-person/Balanced quality, including 10 seconds before approval and 18 seconds afterwards. They include FPS, draw calls and rendered triangles. Separate `phase2-idle-performance-*.json` files record 15 samples of Overview. These are measurements from local headless Chrome; the phone profile emulates a viewport on the desktop host, not physical mobile hardware.

The active-delivery mean was **59.3 FPS desktop** (41–60) and **59.5 FPS phone emulation** (46–60). Idle Overview averaged 60.0 FPS desktop and 58.5 FPS phone emulation. Transient dips are retained in the reports.

The final production interface chunk is approximately **348 kB raw / 109 kB gzip**, and the lazy Three.js scene is **1.06 MB raw / 295 kB gzip**. Vite's large-chunk warning remains visible; the build succeeds. No dependencies or remote runtime services were added in Phase 2.

Known boundaries: one active delivery at a time; simulation state resets on reload; the registry models the latest candidate rather than a complete inventory; Terraform/cluster bootstrap is already present; metrics, digests and backups are illustrative in-memory values. Collision uses conservative building cylinders and authored walkable surfaces. Safari/WebKit, physical phones and screen-reader software have not been validated. A passing local benchmark is not a universal frame-rate guarantee.

For Phase 3, extend the existing reducer with rollback, stale-mirror, secret-sync and resource-pressure scenarios before adding effects. Persist a versioned event log for resumable lessons, then measure physical devices and introduce LOD or district streaming where measurements justify it. The shared technology/station registry can support these additions without another world rebuild.
