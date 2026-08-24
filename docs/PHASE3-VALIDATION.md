# Phase 3 verification

Verified locally on 2026-11-06 with Node v24.13.0. Phase 3 builds on the committed Phase 2 implementation; the accepted character, five clips, ten expressions, six districts and all 14 GLBs are preserved. No geometry or source Blender changes were required. Historical Phase 1/2 evidence is retained separately.

## Gates and browser coverage

| Suite | Result |
| --- | --- |
| Pipeline / exported-buffer and generation rules | 20 passed |
| Runtime / real GLBs in Three.js | 19 passed |
| Unit / simulation, adventures, persistence, replay, camera, audio, effects | 92 passed |
| Unique browser cases across the matrix and final follow-up | 73 passed; 7 intentional platform skips |
| GLB validation | 14 exports; zero errors, zero warnings |
| ESLint, TypeScript, production build, diff whitespace | Passed |

The verified case set contains **204 passing tests**, with no unresolved failures. Seven intentional browser skips allocate long keyboard traversal and full lab execution to desktop, and touch-only cases to mobile. All six adventures, including the four Pod causes and both drift modes, execute in all four projects.

The full matrix ran against the production preview on port 5176. It identified a mobile error warning that covered the welcome actions; the fix adds an explicit way to continue with field notes while keeping 3D movement blocked. Renderer counter/cleanup optimizations and short-screen spacing were then verified in a focused final run covering studio, touch, browser compatibility, recovery, performance and repeated mode switches. The report retains both run summaries and merges their latest outcomes per test/project. Failed exploratory runs are not presented as passing full runs.

| Browser family | Actual launched version |
| --- | --- |
| Chromium / installed Google Chrome | 156.0.8078.80 |
| Firefox / Playwright | 159.0 |
| WebKit / Playwright desktop | 27.2 |

Chromium desktop and iPhone-profile emulation cover the existing exploration, camera, discovery and deployment-lab behavior. Firefox and desktop WebKit cover adventures, portfolio/architecture, immersive look, reduced motion, audio and recovery. Tests use actual UI actions and real logical waiting, not injected adventure completions. Normal journeys fail on uncaught page/console errors; deliberately aborted models and context-loss tests isolate their expected resource errors.

## Six adventures: verified decisions and outcomes

| Adventure | Wrong decision and recovery verified through the UI |
| --- | --- |
| Ship a New Release | Failing CI blocks approval; unchanged retry fails; inspect and repair the regression, review publication/digest, approve, then verify GitOps, Pods, routing and telemetry. |
| Recover a Failed Pod | Restarting unchanged configuration does not repair an image, readiness or scheduling fault. Inspect each cause and apply its matching correction. A transient exit recovers through the valid kubelet restart policy. |
| Fix Configuration Drift | Waiting without self-heal leaves OutOfSync state. Compare Git/live replicas, manually synchronize, or observe explicitly enabled self-heal; verify real convergence. |
| Promote to Production | Premature promotion and unreviewed approval are rejected. Prove development, review production and promote the exact digest; development retains its digest and deployment revision. |
| Investigate an Incident | Ingress diagnosis and image rollback leave the 5xx errors. Correlated alert/metrics/log evidence identifies DB_POOL_MAX; repair it and verify a fresh healthy observation window. |
| Restore from Backup | Newest corrupted and over-age recovery points are rejected. Database-only restore fails validation. Restore the consistent DB/object pair before cutover and check actual recovery state. |

Objectives require explicit inspection or a guarded action against current infrastructure state. Opening a panel never advances them. Unit tests additionally cover malformed commands, cancellation/restart, hint levels and disabling, lifetime mistake counts, cadence-independent events, resource fields, dependency guards and shared technology bindings. The scenarios orchestrate the existing reducer and shared operations; rendering is a projection, not another simulation.

## Notebook, replay and resilience

Version 2 localStorage journals retain selected and suspended unfinished lessons, the best completed recording per lesson and hint preferences. Existing discovery/camera/quality/audio preferences remain independent. Compact validated commands reconstruct infrastructure, evidence and event history through the same engine. Saves are bounded to 512 KiB, 512 actions per attempt and fourteen logical days; localStorage is sufficient for this bounded data, so no IndexedDB/backend was added.

Unit tests verify version 1 migration, canonical validation, forged completion rejection, corrupt/incompatible data preservation, quota failures, recovery-copy-before-reset, unique identities and safe resumable selection. The browser suite corrupts a save and confirms the original survives until explicit recovery. Reload during reconciliation preserves elapsed progress and resumes without offline time. Context loss pauses the notebook; a missing model can be retried without losing evidence. The renderer warning can be dismissed to use the field console on a narrow screen without pretending 3D recovered.

Replay is read-only, reconstructs from the original commands/timestamps, and supports pause, restart and 0.5×/1×/2×/4× speed. Completed records stay unchanged. Replay and simulation outcomes match across 15/60/144 FPS-equivalent tick schedules. No secrets, credentials, live infrastructure calls or remote storage are used.

## Presentation and visual review

The landing page offers Play Adventure, Free Explore, Architecture and an engineering showcase. Six independently selectable adventure cards show difficulty, learning goals, variations, completion and best result. A nonmodal notebook contains the current objective, destination, actual evidence, decisions, progressive hints and a causal learning summary. On phones the notebook prioritizes readable text; closing it restores the world and touch controls.

Awushi reacts to investigation, uncertainty, failure, recovery and completion using existing morphs and clips. Operational rings, instanced Pod state and real event packets make faults and recovery visible in the world. Original oscillator sounds are muted initially, gesture-unlocked, bounded and independently adjustable. Tests verify real AudioContext scheduling/lifecycle, not physical speaker quality.

The architecture lenses share the technology registry and deployment-stage definitions. Delivery, security, observability and data views show real relationships and explicit shared-cluster/namespace limits. The showcase explains authoring, deterministic modeling, rendering and verification with repository code references.

Actual browser screenshots were reviewed at desktop and mobile sizes, including completion text, Awushi/world framing, portfolio landing and short-laptop layout. Screenshots in assets/previews/phase3-*.png and the compact machine report accompany the source. No new Blender render is claimed because character geometry/material definitions were unchanged.

## Performance and ownership

Active third-person/Balanced measurement uses 28 one-second samples: ten while development CI runs, then eighteen after inspecting CI/image and approving the digest in the promotion lesson. The field notebook is closed while sampling. Separate overview measurement uses fifteen one-second samples.

| Local profile | Active mean FPS | Active min–max | Overview mean FPS |
| --- | --- | --- | --- |
| Desktop Chromium, 1440×1000 | 59.6 | 49–60 | 60.0 |
| Phone emulation, 390×664 | 59.6 | 48–60 | 59.7 |

Renderer counts now include completed-frame shadow/transmission/offscreen submissions, rather than an arbitrary final pass. Static reflection lighting is memoized, shared GLB geometry is retained, private skeleton/instance/material resources are released, and contact-shadow resources remain bounded to one set per Canvas. Five warmed studio/world transitions retain stable geometry/texture counts; exact samples are in phase3-resources-*.json. Resource counts are not GPU bytes, and this is not a long-duration soak test.

The interface bundle is about 461 kB raw / 142 kB gzip and the lazy scene about 1.06 MB raw / 296 kB gzip. The successful Vite build retains its large-chunk warning. No dependencies or downloaded asset/audio packs were added. See [performance method](PERFORMANCE.md) and [effects ownership](EFFECTS.md).

## Limits and next phase

This is a deterministic teaching model, not a live cluster or production monitoring tool. The original free-explore lab remains ephemeral on reload; adventures are the persisted experience. Saves are browser/origin-local, with no cross-device sync or user-facing import. Command-semantic changes require a save-version migration. Static serving currently expects an origin root and has no PWA/offline installation cache.

Phone results are desktop Chromium emulation. Physical Safari/iOS/Android, battery/thermal behavior, screen-reader software, physical audio output and long-duration GPU memory were not tested. Those are the first next-phase validation priorities. After measurements justify them, consider accessible save import/export, rollback/stale-mirror/secret-sync lessons, and LOD or district streaming. Live cloud credentials and backend services remain outside this phase.
