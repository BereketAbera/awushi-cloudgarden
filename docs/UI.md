# Phase 1 interface

The interface in `src/App.tsx` sits around one persistent React Three Fiber scene. The welcome screen offers a guided Adventure, Free Explore, the Architecture map, and the Character Studio. Adventure introduces each of the six districts; Free Explore removes the itinerary while keeping every discovery available.

Gameplay keeps the centre of the view clear. The district heading, next introduction, discoveries, map, camera modes and nearby landmark prompt update from the scene's low-frequency `Telemetry` callback. The minimap uses the same district and bridge data as the world and collision code. Its bright dot is Awushi's measured world position. The journal opens previously discovered notes; undiscovered entries remain disabled.

## Controls and accessibility

- Move with WASD or arrow keys; hold Shift to run. On small or touch screens, hold a direction on the pointer pad; hold the lightning control with another finger to run.
- Press E or tap the nearby landmark prompt to discover a station. Repeated keydown events and a short interaction cooldown prevent accidental repeated panels.
- Space celebrates, M opens the map, R returns to the Common, and Escape closes a dialog or opens settings.
- Follow, Explore and Overview are always available. The Home icon returns to the Common without clearing discoveries, including on mobile.
- Dialogs trap keyboard focus, close with Escape or the backdrop, restore focus to the opener, and make the background inert. Opening a dialog clears held movement keys and disables scene input. Blur and document visibility changes also clear held movement.
- System reduced-motion preferences are respected on first visit. Settings also offer reduced motion, three rendering quality levels, lighting and measured render statistics.

`src/components/Dialog.tsx` supplies the shared modal behavior. `src/components/MiniMap.tsx` supplies the accessible map. `src/styles.css` handles all layouts, including the 350px small-screen regression, and uses local system fonts.

## Character studio

The ten expressions blend independently of the five animation clips. The studio offers expression intensity, playback speed, lighting, angle presets, character rotation, pause/play, fullscreen and a complete studio reset. On mobile, the Character Controls drawer starts collapsed so the character remains visible. These controls pass through the typed `SceneProps` interface; they do not replace or modify the generated asset.

## Discovery, not simulation

Every station panel is a current educational discovery. Each explains the concept and explicitly identifies later hands-on functionality. Architecture presents the six connected disciplines and their existing 17 introductions; it does not imply a running GitHub, Kubernetes, cloud, secret-management or incident simulator.

## Persistence and extension

Exploration uses the versioned `awushi-exploration-v2` local storage record and the shared helpers in `src/game/progress.ts`. Invalid records are safely discarded or filtered. Preferences use `awushi-preferences-v2`; unavailable local storage never prevents play. Returning home and changing modes preserve discoveries. The explicitly labeled Reset Exploration Progress action starts a fresh notebook.

To add a station, edit the shared world layout and its generator/runtime as documented in the world guide. The UI derives district headings, maps, journal entries and discovery panels from that data. Add an expression only when it exists in the shared expression type and generated asset, then include it in the studio selector.

Browser coverage is in `tests/browser/adventure.spec.ts` and `tests/browser/touch.spec.ts`. It covers the real movement path, discovery persistence, expressions, camera controls, dialog focus, mobile pointer release, input blocking, hub recovery and small-screen overflow.
