# Phase 4 UX and cinematic verification

Prepared on 2026-11-06. This report combines the full browser matrix with focused reruns after rendered review and regression fixes. It separates automated behavior checks, expert visual inspection and measurements; it is not a participant usability study.

## Baseline and scope

The [before-change audit](PHASE4-UX-AUDIT.md) inspected commit `0829772` in the running application before implementation. The release walkthrough exercised failed CI, early approval rejection, repair, digest review, explicit approval and delivery verification. The incident walkthrough exercised correlated evidence, an unsupported diagnosis, ineffective rollback, targeted repair and recovery. Desktop exploration cameras, architecture, help and an emulated phone viewport were inspected. The focused existing adventure/persistence/replay checks passed before changes. Audit images are retained in [the baseline capture directory](../assets/previews/phase4-audit/).

The largest observed problems were a distant camera during infrastructure activity, faint station attention, next actions below long evidence panels, weak location handoffs, a hidden checklist, overloaded mobile notes and unclear entry/viewing choices. The work retains the six adventures, existing technologies/facilities, deterministic simulation and local Blender pipeline. It changes presentation, assistance and camera orchestration rather than introducing another infrastructure model.

## Implemented behavior

- **Watch Flow:** a compact stage caption identifies the active subject, state, explanation and next condition. Automatic and step modes, pause/resume, speed, current-stage replay and recorded-stage navigation share the real simulation boundaries. Approval and repair remain explicit decisions.
- **Camera ownership:** one camera rig switches among player control, cinematic following, temporary manual orbit, return to cinematic and return to Awushi. Drag/wheel takeover, follow, skip-transition and exit controls preserve the exploration camera preference. Automatic motion can be disabled; reduced motion is respected.
- **Subject framing:** measured triangles from the existing district GLBs establish station bounds and outline geometry. Authored footprints provide a fallback. Desktop/portrait framing, alternate sightlines and bounded transitions make the station the subject instead of aiming at its ground coordinate.
- **Attention and flows:** the primary station receives a contrast-backed silhouette, brackets, ring, status glyph and label; related stations receive less emphasis. Processing, healthy, waiting, failed and neutral states are distinguishable without color or bloom alone. Code, images, configuration, secret references, traffic, metrics, logs and alerts use event-derived flow styles, directional paths and destination acknowledgments. No particle has authority to change infrastructure state.
- **Entry and onboarding:** Start Adventure, Continue Adventure when a checkpoint exists, Free Explore and View Architecture form the main choices. A skippable six-step companion introduction explains movement, inspection, adventures, Watch Flow and help. It can be replayed from Help and does not block starting an adventure.
- **Shared mission guidance:** briefings separate symptoms, goal, first location and tools. A visible current checklist is derived from confirmed objectives, with optional expansion. Investigation, decision and verification actions are grouped; the next useful inspection is prominent. Guide Me frames a location and offers an interaction without performing it.
- **Assistance and evidence:** Guided Explorer, Engineer and Incident Commander change presentation without resetting progress. Requested hints advance through direction, technology, evidence and suggested action. Their usage remains visible without lowering results. The evidence glossary explains actual recorded values; the help offer responds to repeated rejection, unrelated visits or inactivity and is suppressible/dismissible.
- **Architecture continuity:** graph selection survives world focus and return. Incoming/outgoing relationships use the existing technology registry. Station inspection presents current simulated state when leaving historical stage review.

The implementation contracts and customization points are documented in [guidance](GUIDANCE.md), [cinematics](CINEMATICS.md), [UI](UI.md) and [persistence](PERSISTENCE.md).

## Six-scenario UX acceptance checklist

These are the answers checked in the interface. All six scenario journeys completed through visible controls in desktop Chrome, Chromium phone emulation, Firefox and WebKit, including incorrect decisions and recovery. The checklist is an expert acceptance review, not evidence that every unfamiliar visitor will understand the concepts without assistance.

| Scenario | What am I trying to accomplish? | What is happening now? | Where should I look? | What can I do? | What changed after my action? | What should I do next? |
| --- | --- | --- | --- | --- | --- | --- |
| Ship a New Release | Deliver a reviewed image and verify healthy requests. | The current objective and stage distinguish CI failure, publication, approval and rollout. | Guide Me follows the objective; Watch Flow frames GitHub, CI, registry, delivery, GitOps, Pods, routing and observability as they participate. | Push; inspect failed CI; repair; review passing checks and the digest; explicitly approve; verify delivery. | Feedback distinguishes unchanged-code retry from repair. Recorded CI/image evidence and stage events expose the resulting state. | Follow the next unchecked objective; after approval, verify reconciliation, new Pods, routing and telemetry. |
| Recover a Failed Pod | Recover a ready workload endpoint using its actual failure evidence. | The briefing shows ready replica count and health; the Pod report differentiates crash, image, readiness and capacity conditions. | The Pod facility first; registry, infrastructure or network when the selected investigation requires them. | Inspect status/events; test a recovery or configuration change; verify ready endpoints. | An ineffective restart preserves the fault with an explanation. A supported correction or controller recovery changes the actual readiness state. | Verify all desired endpoints; completion explains why this cause required that recovery. |
| Fix Configuration Drift | Bring the live cluster into agreement with reviewed Git configuration. | Git/live evidence shows the replica difference and whether self-heal is enabled. | GitOps for desired state/policy; Kubernetes for the live diff and health. | Inspect both sides in either order; request manual sync or explicitly enable/observe self-heal. | A live-only patch leaves disagreement visible. Valid reconciliation reports when the controller actually converges. | Verify desired/live agreement, synchronization and healthy replicas. |
| Promote to Production | Promote the exact artifact verified in development. | Stage and environment indicators separate development delivery from a later production proposal and approval. | CI, registry and delivery for review; Kubernetes/GitOps for each environment's result. | Inspect and approve development; verify its digest/health; create and review a production proposal; separately approve production. | The production proposal retains the development digest without rebuilding. Feedback distinguishes missing evidence from authorization. | Verify healthy production and unchanged development before completion. |
| Investigate an Incident | Establish the cause of failing requests and verify recovery. | The briefing reports the simulated HTTP 5xx/latency/alert symptoms without naming the cause. Inspected observations share the mission timeline. | Alerts first is recommended; metrics and logs remain available in another valid order. Guide Me locates the current investigation tool. | Correlate alert, metrics and logs; test a diagnosis; choose a correction; verify fresh observations. | Unsupported diagnoses and ineffective actions explain the observed inconsistency. A supported repair starts a new observation window rather than immediately declaring success. | Wait for fresh metrics/logs and alert resolution, then verify the recovery window. |
| Restore from Backup | Restore a consistent data set and its object dependencies before cutover. | The briefing shows database/object damage and paused traffic. Snapshot evidence exposes age, consistency and recovery objectives. | Database for damage; recovery for snapshots/restore; object storage and routing for dependencies/validation. | Compare recovery points; select one; restore an isolated database and matching objects; validate before serving traffic. | Corrupt or stale points are rejected with reasons. Database-only recovery still lacks object dependencies; valid restoration updates observed counts and integrity state. | Validate records, checksums and references; then inspect the completion summary's RPO/RTO outcome and host-loss limitation. |

For every row, a panel visit, graph selection or camera movement must leave the objective count unchanged. Incorrect choices remain recoverable. Guidance preferences change the amount of explanation, never the underlying evidence or valid technical outcomes.

## Regression fixes included in the implementation

1. Historical stage reconstruction now uses the recorded command prefix as well as time. A later same-timestamp approval or repair cannot appear in the earlier frame. Duplicate approval announcements form one review frame, and stale frame/record combinations are rejected.
2. Completed-journey Watch Flow uses that recording's pause/resume/speed controls. It labels recorded content, disables live mode/advance operations and returns from a nested stage review to the journey rather than resuming an unrelated unfinished attempt.
3. Architecture focus clears historical review, and architecture/station inspectors read current state rather than a stale review snapshot.
4. Native summary controls retain keyboard Space behavior; playback options do not accidentally trigger world shortcuts.
5. Pause stops automatic interpolation, while explicit focus/return/skip commands remain usable. Manual orbit begins from the existing pose instead of allowing camera controllers to compete.
6. Finished/cancelled missions remove inactive Guide Me controls, route markers and stale direction notices; graph focus keeps its own selected station context. Guidance storage notices can be dismissed and clear after a successful save.
7. Starting exploration closes the introductory card so it cannot cover phone controls. The Guide Me view reserves a separate scene viewport and control rail. WebGL interruption pauses lab, adventure and recorded-stage clocks.
8. Missing mechanical prerequisites receive explanations without disabling useful incorrect choices. Hint usage no longer penalizes an otherwise equal completed result.

Additional final review found and corrected operational-state attention (failing requests despite healthy Pods; Processing while GitOps reconciliation is pending), a completed/history caption conflict, a first-visit mobile introduction overlapping the portfolio link, repeated movement-key events restarting the return-to-character tween, and playback-button focus persisting after the visitor clicked the world. The canvas now receives keyboard focus on deliberate pointer takeover while playback controls retain isolated keyboard behavior. Each correction has direct behavioral or rendered verification.

## Automated verification

| Gate | Result for final build |
| --- | --- |
| ESLint and TypeScript | Passed |
| Procedural pipeline checks | 20 passed |
| Runtime GLB/Three.js loading checks | 19 passed |
| Unit/domain checks, including camera, guidance, playback and replay | 131 passed |
| GLB validation and asset budgets | 14 exports, zero errors and zero warnings |
| Production build | Passed; UI 510.71 kB and scene 1,082.71 kB minified trigger the visible size warning |
| Desktop Chrome 156.0.8078.80 | 47 passed, 2 intentional skips |
| Chromium phone emulation | 44 passed, 5 intentional skips |
| Firefox 159.0 | 31 passed |
| WebKit 27.2 desktop automation | 31 passed |
| Unique latest browser outcomes | 153 passed, 7 intentional skips, 0 unresolved failures |
| Total unique passed checks | 323 (170 pipeline/runtime/unit + 153 browser) |

The [machine-readable verification record](../assets/phase4-verification.json) retains each unique case, latest outcome, run history, source hashes, versions and raw measurements. The initial full 152-case run had 143 passes, seven skips and two failures: mobile onboarding intercepted the portfolio link, and a concurrent smoke run removed Firefox trace artifacts during cleanup. The portfolio layout was fixed; reconciliation/reload was rerun in isolation in all four browsers. Later focused runs passed 40 cases, then exposed and fixed keyboard focus in a new held-key regression; the final cross-browser focus run passed 24 cases and the final mobile run passed nine. Public screenshot review then identified a leftover completed-mission route marker; the final completion/graph/operational regression run verifies its cleanup. This is a merged final result, not a claim that the initial full run was uninterrupted and green. Seven longstanding skips avoid duplicated keyboard routes/timed lab journeys on the phone and touch-only tests on desktop; mobile adventure journeys and touch behavior have separate passing coverage.

`tests/guidance.test.ts` covers read-only guidance, real checklist updates, non-spoiling briefing data, mechanical prerequisites, guidance preferences, hints, detector thresholds and suppression. `tests/playback.test.ts` covers readable stage timing, gate clamps, same-tick event provenance, stale record rejection and immutable review. `tests/cinematic.test.ts` checks actual GLB subject bounds, desktop/portrait frustum fit, alternate sightlines, shot families, ownership, manual orbit and status semantics. Existing adventure/persistence/replay tests continue to exercise the shared engine.

The browser additions are `cinematic.spec.ts`, `cinematic-performance.spec.ts`, `guidance.spec.ts`, `guidance-regression.spec.ts`, `phase4-visual.spec.ts`, `operational-flow.spec.ts` and `replay-controls.spec.ts`; renderer-loss cases extend `resilience.spec.ts`. Ordinary six-scenario success/failure/recovery journeys continue to use visible UI actions in `adventures.spec.ts`. The dedicated recorded-journey isolation case uses a synthetic notebook **constructed and validated through the real adventure engine** to prepare a completed recording alongside an unrelated unfinished attempt; it then exercises the visible controls. It does not inject fabricated infrastructure or completion objects. The architecture-history case completes the Pod lesson through the UI.

## Visual review artifacts

Actual captures were opened and inspected, including several deployment stages, incident evidence, recovery and phone layouts. A short local walkthrough recording was also captured; the committed screenshots are the durable visual evidence. Camera attributes were used to synchronize capture, not as a substitute for looking at the rendered result.

| Review subject | Capture(s) | Final visual assessment |
| --- | --- | --- |
| Station framing and playback controls | [Desktop](../assets/previews/phase4-cinematic-desktop.png), [phone emulation](../assets/previews/phase4-cinematic-mobile.png) | Station fills the unobscured viewport; caption and fixed playback controls remain legible. |
| Approval-to-promotion handoff | [Desktop](../assets/previews/phase4-approved-desktop.png), [phone emulation](../assets/previews/phase4-approved-mobile.png) | Registry focus matches promotion after explicit approval; one primary label. |
| Several active release stages | [Build](../assets/previews/phase4-flow-build-desktop.png), [sync](../assets/previews/phase4-flow-sync-desktop.png), [rollout](../assets/previews/phase4-flow-rollout-desktop.png), [logs](../assets/previews/phase4-flow-logs-desktop.png) | Clear active subjects and source/destination relationships. Raised oblique Kubernetes angle removes the district-sign obstruction and shows rolling Pods. |
| Mission guidance and evidence | [Desktop](../assets/previews/phase4-guidance-desktop.png), [phone emulation](../assets/previews/phase4-guidance-mobile.png) | Objective/action first; requested hints and consequences readable. Long raw evidence remains scrollable. |
| Optional introduction | [Desktop](../assets/previews/phase4-onboarding-desktop.png), [phone emulation](../assets/previews/phase4-onboarding-mobile.png) | Six short steps, visible skip/next, independent phone welcome scrolling prevents link interception. |
| Graph-to-world continuity | [Desktop](../assets/previews/phase4-graph-focus-desktop.png), [phone emulation](../assets/previews/phase4-graph-focus-mobile.png) | Related facilities share the view, focus rail identifies the selected station, return preserves graph selection. |

Incident review also covered [red station attention on phone](../assets/previews/phase4-incident-focus-mobile.png), [correlated evidence](../assets/previews/phase4-incident-evidence-desktop.png), [incorrect-diagnosis feedback](../assets/previews/phase4-incident-feedback-mobile.png), and [verified completion](../assets/previews/phase4-incident-complete-desktop.png). The in-app browser could not initialize WebGL during the final connection check; its [architecture fallback](../assets/previews/phase4-iab-architecture-fallback.png) remained usable. Actual 3D verification used Playwright Chrome, Firefox and WebKit.

Compare these with the baseline's [distant release view](../assets/previews/phase4-audit/release-world-before.png), [release evidence panel](../assets/previews/phase4-audit/release-evidence-before.png) and [phone incident notes](../assets/previews/phase4-audit/incident-mobile.png). Review legibility, station size, occlusion, flow direction, mobile overlap, current action visibility and completion feedback; do not substitute camera data attributes for rendered inspection.

## Performance measurements

The final cinematic sample ran serially in headless Chrome on macOS 26.6.2 arm64, using the real WebGL scene at Balanced quality, pixel ratio capped at 1.5. Automatic Watch Flow ran at 2× with explicit human approval and 500ms sampling. Both profiles observed all 22 release stages. Phone emulation does not simulate a phone GPU, thermal behavior or Safari.

| Measurement | Desktop Chrome | Chromium phone emulation |
| --- | --- | --- |
| Viewport | 1440 × 1000 | 390 × 664 |
| Samples / positive FPS samples | 71 / 70 | 72 / 71 |
| Mean FPS | 59.66 | 59.58 |
| Minimum / maximum FPS | 49 / 60 | 50 / 60 |
| Submitted draw calls | 131–193 | 135–213 |
| Submitted triangles | 346,372–504,176 | 366,336–546,872 |
| Geometry / texture counts | 127–217 / 17 | 123–218 / 17 |
| Returned world after five studio switches | 150 geometries, 19 textures each time | 150 geometries, 19 textures each time |

Raw samples: [desktop](../assets/phase4-performance-desktop.json), [phone](../assets/phase4-performance-mobile.json). Resource checks: [desktop](../assets/phase4-resources-desktop.json), [phone](../assets/phase4-resources-mobile.json). Phase 4 copies of the ordinary manual-adventure and idle samples are also retained. These counters include shadow/transmission passes and resource objects, not GPU bytes. Zero before the first FPS interval is retained in the data but excluded from the FPS average. Subsequent focus/keyboard/copy refinements did not change the cinematic workload; they received focused behavioral checks.

Frames, camera interpolation and station attention use bounded work and refs rather than per-frame React subscriptions. GLB station geometry is extracted once and disposed by its owner; event effects retain a bounded recent set. Historical frame binding reconstructs an adventure journal once per review setup, while the free-exploration adapter derives prefixes only when entering review. These are implementation choices, not substitutes for the measurements above.

## Commits and remaining limits

- `e954c0f` — baseline UX audit and Phase 4 plan.
- The implementation, regression tests and visual/measurement evidence are committed as a coherent Phase 4 milestone; the release commit records the final implementation hash and public deployment verification.

This is an expert walkthrough, not a participant usability study. The design aims to make the starting action apparent quickly, but no measured first-time-user “30 seconds” success rate is claimed. Phone profiles are desktop-browser emulation, and WebKit automation is not a physical Safari/iOS-device test.

Building occlusion uses an authored-footprint approximation; unusual new geometry may need explicit framing. Long raw evidence and technical details still require scrolling on a phone. Historical review can distinguish recorded same-time commands but cannot invent intermediate states inside one atomic reducer command, and trimmed event history is not recoverable through stage navigation. Stuck detection is a dismissible heuristic, not a diagnosis of user understanding. Browser-local saves remain tied to the current origin and profile.

The separate Three.js scene bundle continues to produce Vite's large-chunk warning. The 510.71 kB interface and 1,082.71 kB scene bundles build successfully; their loading cost remains a limitation. Physical-device profiling, longer-duration resource analysis and external first-time-user feedback remain useful follow-up work after this release.
