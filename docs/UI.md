# Phase 2 interface

The existing interface now surrounds an immersive world and a deterministic local deployment lab. Adventure, Free Explore, the Character Studio, discovery progress, the journal and all accessibility settings remain available. The world and architecture inspector use the same station/technology registry.

## Camera and movement controls

- Follow is the default perspective view behind Awushi. First person moves to eye level. Overview shows the whole world; Isometric keeps the miniature view available.
- C cycles all four views. Camera buttons provide the same controls on touch screens. The selected mode is saved with other local preferences.
- In Follow and First person, W/S move forward/backward and A/D turn the viewing direction. Drag the world with a mouse or finger to look around. Arrow keys match the same scheme.
- Isometric and Overview retain camera-relative WASD movement. Shift runs; on touch screens hold the lightning control with another finger while moving.
- E or the nearby landmark prompt opens a technology station. Space celebrates, M opens the map, and R or the Home icon returns to the Common without clearing discoveries.
- Opening a panel clears held input and stops player movement. Simulation time continues independently. Blur and visibility changes also clear movement keys.

See `CAMERA.md` for framing, obstruction and transition details. The studio still offers all ten expressions, five clips, expression intensity, playback speed, lighting, rotation, camera presets and reset controls. Studio speed does not change world movement or gait speed.

## Deployment lab

The small world HUD card shows the current stage, status, selected environment and progress. It opens a full pipeline panel; on mobile it collapses to one compact entry point so the world remains visible.

The full panel offers a healthy deployment or one of three learning failures: tests, security or readiness. Push a simulated change, inspect the evidence at the digest-bump approval gate, and explicitly approve/merge before local promotion and GitOps reconciliation continue. A failed run exposes its reason and an Apply fix & retry action. Cancellation stops future work and preserves already-applied simulated state; it does not claim to roll back resources. Reset starts a fresh simulation while preserving exploration discoveries.

The pipeline panel lists all 22 stages, distinguishes human approval from automation, shows an environment summary and exposes the recorded event history. State and telemetry are consistently labeled simulated. Development and production use independent namespaces, configurations, secret references and deployment state within one shared cluster. Selecting an environment for inspection does not retarget an active run; the active run's environment remains visible.

`components/useSimulation.ts` owns a 100ms clock independent of the renderer. It dispatches typed commands into the pure domain engine and stops its timer in idle, approval and terminal states. Scenario correctness never depends on a particle or character animation completing.

## Stations and architecture

Technology station panels group related technologies into the existing 17 facilities. Each includes a concise responsibility, inputs and outputs, related technologies, optional technical details with official documentation links, and current state for the selected environment. Data/recovery facilities expose local simulated backup and restore actions.

The architecture inspector is available before any discovery. Its facility graph and relationship edges derive from the same registry used by station panels and world bindings. Select a facility or search the technology directory, inspect connected technologies and state, then choose Find in world. The app sets a destination marker and provides a distance/district hint; it does not teleport Awushi. The map and journal also offer a navigation action for undiscovered locations while their field notes remain discovery-gated.

The graph is horizontally scrollable on narrow screens, with keyboard-operable facility buttons and a separate accessible technology directory. Only connections relevant to the selected facility are emphasized, keeping the overview readable.

## Accessibility, state and extension

`components/Dialog.tsx` traps focus, handles Escape and backdrop dismissal, restores the opener and makes the background inert. Focus is captured before applying inert, so browser blur cannot erase the opener. All icon controls have labels and visible focus styling. System reduced motion is respected initially and remains configurable alongside quality and lighting.

Exploration uses the validated `awushi-exploration-v2` local record; preferences including camera use `awushi-preferences-v2`. Unavailable or invalid local storage never prevents play. Simulation state is in memory for the current visit and continues across interface modes; reloading or resetting the simulation starts fresh infrastructure state.

Add educational technologies and graph relationships in `simulation/registry.ts`, associate them with a world station, and implement any new domain capability in the engine. The interface consumes those definitions. Do not add independent infrastructure behavior to a 3D mesh or duplicate registry content in the architecture graph.

`tests/browser/simulation.spec.ts` covers the complete timed journey, a genuine human approval wait, environment separation, telemetry, reset, failure repair/cancel and architecture-to-world guidance. Existing exploration, camera, studio, keyboard and touch coverage remains in the other browser suites.
