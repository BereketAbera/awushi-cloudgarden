# Adventure interface

The interface surrounds the existing immersive world with six optional engineering adventures. Start Adventure opens the adventure collection; Continue Adventure resumes unfinished work; Free Explore retains the independent deployment lab and discovery experience. The Character Studio, journal, ten expressions, five animations and four cameras remain available. The world, architecture inspector and adventures consume shared infrastructure definitions. Phase 4 adds optional onboarding, [mission guidance](GUIDANCE.md) and [Watch Flow](CINEMATICS.md) without changing scenario rules.

## Camera and movement controls

- Follow is the default perspective view behind Awushi. First person moves to eye level. Overview shows the whole world; Isometric keeps the miniature view available.
- C cycles all four views. Camera buttons provide the same controls on touch screens. The selected mode is saved with other local preferences.
- In Follow and First person, W/S move forward/backward and A/D turn the viewing direction. Drag the world with a mouse or finger to look around. Arrow keys match the same scheme.
- Isometric and Overview retain camera-relative WASD movement. Shift runs; on touch screens hold the lightning control with another finger while moving.
- E or the nearby landmark prompt opens a technology station. Space celebrates, M opens the map, and R or the Home icon returns to the Common without clearing discoveries.
- Opening a panel clears held input and stops player movement. Simulation time continues independently. Blur and visibility changes also clear movement keys.

See `CAMERA.md` for framing, obstruction and transition details. The studio still offers all ten expressions, five clips, expression intensity, playback speed, lighting, rotation, camera presets and reset controls. Studio speed does not change world movement or gait speed.

## Adventure collection and field notebook

`components/AdventurePanels.tsx` renders the catalog from `adventures/catalog.ts`. Six cards show difficulty, estimated duration, learning objectives, selectable variations where relevant, completion and the best recorded result. The order is a recommendation, never an unlock requirement. Each adventure can retain a resumable attempt, so switching does not silently discard another checkpoint. Restart is explicit. Completed records expose deterministic replay.

A compact Mission HUD shows the current objective and actual completed-objective count. Find in world uses the existing station marker. The expandable field notebook is a nonmodal side panel on desktop and a readable full-height workspace on narrow screens. The world remains rendered. It shows explicit inspection/actions, observed evidence with timestamps, decision consequences, progressive hints, completed steps and the completion summary. Opening a panel never advances a mission: the engine checks infrastructure and records evidence when the visitor chooses an action. Remote investigation through the field console is intentional, so walking skill is not a prerequisite for learning.

The four hint levels become more specific, from direction and technology to evidence and a suggested action. Visitors can disable hints. Wrong decisions produce explanatory, recoverable feedback; unavailable prerequisites are disabled with a reason. Completion reports what happened, the cause, why the fix worked, relevant technologies and optional engineering detail. Decisions remain available for reflection. A best result favors fewer rejected decisions only; assistance is recorded without lowering a result, and elapsed time is not a speed competition.

The mission panel receives presentation callbacks and `getAdventureView`; it does not mutate infrastructure itself. A live region announces meaningful feedback and status changes. Escape closes the notebook and restores focus. Gameplay input is disabled while the workspace is open; the logical clock continues until Pause is explicitly selected. Replay controls have separate pause/play, restart, speed and leave actions. Replay is read-only and cannot alter the original completed record.

The latest inspected observation is expanded above the action list, with earlier snapshots in the evidence notebook. Choosing an action returns the scroll position to the objective and consequence, so a decision made below the fold cannot hide its feedback. Completion moves focus back to the workspace when the verification control disappears. The header, pause/replay controls and footer stay available while the evidence scrolls.

## Deployment lab

The small world HUD card shows the current stage, status, selected environment and progress. It opens a full pipeline panel; on mobile it collapses to one compact entry point so the world remains visible.

The full panel offers a healthy deployment or one of three learning failures: tests, security or readiness. Push a simulated change, inspect the evidence at the digest-bump approval gate, and explicitly approve/merge before local promotion and GitOps reconciliation continue. A failed run exposes its reason and an Apply fix & retry action. Cancellation stops future work and preserves already-applied simulated state; it does not claim to roll back resources. Reset starts a fresh simulation while preserving exploration discoveries.

The pipeline panel lists all 22 stages, distinguishes human approval from automation, shows an environment summary and exposes the recorded event history. State and telemetry are consistently labeled simulated. Development and production use independent namespaces, configurations, secret references and deployment state within one shared cluster. Selecting an environment for inspection does not retarget an active run; the active run's environment remains visible.

`components/useSimulation.ts` owns a 100ms clock independent of the renderer. It dispatches typed commands into the pure domain engine and stops its timer in idle, approval and terminal states. Scenario correctness never depends on a particle or character animation completing.

## Stations and architecture

Technology station panels group related technologies into the existing 17 facilities. Each includes a concise responsibility, inputs and outputs, related technologies, optional technical details with official documentation links, and current state for the selected environment. Data/recovery facilities expose local simulated backup and restore actions.

The architecture inspector is available before any discovery. Its facility graph and relationship edges derive from the same registry used by station panels and world bindings. Select a facility or search the technology directory, inspect connected technologies and state, then choose Focus station for a framed view or Find in world for a marker. Follow in world shows the selected incoming/outgoing relationship; Return to architecture preserves selection. Graph focus shows the selected station’s role even during an unrelated mission, and Return to mission restores its investigation tools. Focus views reserve space for their controls so ordinary HUD panels cannot cover the subject. The app sets a destination marker and provides a distance/district hint; it does not teleport Awushi. The map and journal also offer a navigation action for undiscovered locations while their field notes remain discovery-gated.

The graph is horizontally scrollable on narrow screens, with keyboard-operable facility buttons and a separate accessible technology directory. Only connections relevant to the selected facility are emphasized, keeping the overview readable.

## Accessibility, state and extension

`components/Dialog.tsx` traps focus, handles Escape and backdrop dismissal, restores the opener and makes the background inert. Focus is captured before applying inert, so browser blur cannot erase the opener. All icon controls have labels and visible focus styling. System reduced motion is respected initially and remains configurable alongside quality and lighting.

Exploration uses the validated `awushi-exploration-v2` local record; preferences including camera use `awushi-preferences-v2`. Unavailable or invalid local storage never prevents play. Adventure sessions use versioned local command journals, from which the shared reducer reconstructs infrastructure, progress and evidence. Interrupted sessions resume with their logical clock rather than the new page’s performance clock. Recovery notices explain corrupt, incompatible or unavailable storage and expose export/fresh-start controls where appropriate. The free-exploration lab remains separate from adventure mutations. See `PERSISTENCE.md` for bounds, validation, migration and replay semantics.

Add educational technologies and graph relationships in `simulation/registry.ts`, associate them with a world station, and implement any new domain capability in the engine. The interface consumes those definitions. Do not add independent infrastructure behavior to a 3D mesh or duplicate registry content in the architecture graph.

`tests/browser/simulation.spec.ts` covers the complete timed journey, a genuine human approval wait, environment separation, telemetry, reset, failure repair/cancel and architecture-to-world guidance. Existing exploration, camera, studio, keyboard and touch coverage remains in the other browser suites.

## Portfolio entry and engineering showcase

`components/Portfolio.tsx` adds a concise engineering invitation alongside the playable world. Its interactive four-layer diagram explains local procedural authoring, the typed state/event model, React/Three.js presentation and verification/persistence. Selecting a layer reveals responsibilities, boundaries and repository source references. It does not invent production traffic or claim a frame rate. The architecture view remains available without starting an adventure. See `SHOWCASE.md` for the presentation contract.

Adventure styling is isolated in `adventures/adventures.css`, sharing the existing mint/navy palette and system typography. No external fonts, downloaded art or remote runtime requests are introduced.

Manual Chrome review covered desktop, a 1280×720 laptop viewport and a 390×844 phone viewport. The readiness adventure was checked through an incorrect restart, the corrective probe-path change, verification, summary, hints and read-only replay controls. Short laptop layouts compact the portfolio invitation and omit redundant welcome counts to prevent footer clipping. Phone dimensions are browser emulation, not a claim of physical-device testing.

A renderer interruption pauses live lessons, lab playback and recorded review and offers reload or **Continue with field notes**. Continuing dismisses the warning so narrow screens can still reach adventure controls; it does not restart movement or pretend the renderer recovered. A missing-model scene also retains its independent retry button.
