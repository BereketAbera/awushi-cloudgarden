# Camera and movement

The perspective follow camera introduced in Phase 2 remains the gameplay default in Phase 3. Four modes share one player controller and switch without teleporting the character. The selected mode is saved in local preferences; **C** cycles it and the HUD provides direct selection. The welcome screen uses Overview framing without replacing that saved gameplay preference.

| Mode | Projection and framing | Controls |
| --- | --- | --- |
| Third-person | 58° vertical FOV (64° narrow layouts), 5.8m follow boom, approximately 3.15m camera height at default pitch, 2.2m look-ahead | W/S move; A/D steer; drag to look; wheel adjusts 3.8–8m boom |
| First-person | 68° FOV (72° narrow layouts), actual authored eye height 1.218m | Same movement and steering, mouse/touch drag look; avatar hidden |
| Overview | Orthographic full-world tactical map, aspect-aware 64m span | Classic camera-relative WASD/arrows |
| Isometric | Preserved orthographic three-quarter follow framing | Classic camera-relative WASD/arrows |

Shift or the held touch lightning button runs. Up/down arrows match W/S; left/right arrows match A/D. On touch screens, hold the arrow pad and drag an unobstructed part of the world to look. No pointer lock is required, so Escape remains available for dialogs/settings. Studio orbit, angle presets, rotation, lighting and playback are preserved.

## Adventures and camera ownership

The mission notebook is a nonmodal field console beside the visible world. While it is open, movement and world keyboard/look input are disabled and held keys are cleared, so clicking evidence or typing into controls cannot move Awushi. Escape or its close button returns to the mission HUD and restores world input. Closing the notebook does not pause the logical adventure clock: use its explicit Pause control when needed.

**Find facility** closes the notebook and adds a gold navigation marker and minimap target. It does not teleport the player or complete an objective. Nearby station panels show the same current infrastructure; adventure inspections and repairs remain explicit mission actions. This lets visitors navigate physically or investigate from the remote console without a camera angle or walking trigger deciding the technical outcome.

Adventure replay reconstructs infrastructure and decisions, not recorded camera movement. The current camera stays independently controllable when the notebook is closed. Pausing replay freezes its logical timeline and infrastructure effects; changing views cannot change the saved result. Opening the adventure selector, returning home, entering the studio or choosing Free Explore pauses unfinished adventure work and retains its checkpoint. Hidden pages pause the lesson; reload resumes only after an explicit Resume action.

If a local model fails to load or the WebGL context is lost, the app disables world input and pauses the adventure. The visible recovery notice offers retrying local assets or reloading saved progress. A restored renderer does not silently resume the lesson. Camera preferences, exploration discoveries and adventure journals have separate storage responsibilities; see [persistence](PERSISTENCE.md).

## Why steering

Immersive modes use a consistent camera-steered scheme. A/D changes the viewing heading and turns Awushi; W/S moves along that heading. Turning and walking together traces a smooth curve. This avoids the feedback spiral caused by repeatedly redefining sideways movement against a camera that also chases the character's new heading. Backtracking faces the direction of travel while preserving the view heading, so S does not unexpectedly flip the camera 180°. Isometric/Overview retain the previous free directional movement for tactical exploration.

Mouse and touch drag change yaw and a clamped pitch. A pure analytical steering integrator tracks a linearly turning target, while midpoint yaw drives movement. Look is resolved before player motion; camera position resolves afterwards. Tests compare 15, 60 and 144 FPS, with equivalent held steering travel within 2cm after one second and matching final yaw.

## Geometry and stability

`src/game/camera.ts` contains projection targets, shortest-angle damping, steering integration and camera obstruction checks. `CameraRig` in `Scene.tsx` applies them. Projection swaps match the apparent size at the focal plane before easing toward the new mode, reducing abrupt framing changes. The transition takes approximately 0.85 seconds. Reduced motion snaps to the requested camera pose.

Third-person camera collision tests the boom from the player against the same 17 station footprints, expanded by 0.28m and conservatively extended to 3.5m above their floor. Actual district exports top out at 3.18m. The damped position is checked again, including during mode transitions, so smoothing cannot carry it through a building. Camera height respects the authored island/bridge surface. If a nearby wall collapses the boom within 1.1m, the avatar temporarily hides to prevent its skin filling the view. This collision model deliberately uses inexpensive conservative cylinders, not per-frame full-world triangle casts.

First-person uses the exported eye-bone height `2.1 × 0.58 = 1.218m`; the third-person boom uses a separate 1.55m anchor. The eye stays on the player's collision axis rather than protruding into walls. The character is hidden for the whole first-person mode. The camera has no head bob, and interaction still uses reliable proximity/elevation checks.

Movement divides long steps into pieces of at most 0.1m, slides against blockers, and cannot leave the union of island discs and bridge capsules. Bridge elevations interpolate from the exact samples used to generate their visible decks. Frame deltas are bounded at 0.1s to recover safely after background suspension. Extreme stalls therefore do not teleport the player.

## Verification and tuning

`tests/camera.test.ts` checks framing, actual exported eye height, angle wrapping, frame-rate invariance, every building collider and every bridge sample. Playwright checks both desktop and phone framing, real touch-look events, projection switching/persistence, steering across a real bridge, and first-person station interaction. The existing all-six-district traversal remains covered in Isometric mode.

Phase 3 adds visible adventure/replay journeys and renderer/asset recovery checks to the browser suite. Chrome desktop and phone emulation retain the navigation coverage; Firefox and WebKit run the adventure, compatibility and resilience suites. Browser emulation and a headless WebKit process do not establish performance or interaction quality on physical iOS hardware. The [Phase 2 report](PHASE2-VALIDATION.md) retains the measured camera results from that revision.

Tune camera constants in `camera.ts` and keep `WORLD_CHARACTER_SCALE` coupled to the eye-height test. R or the visible Home control recovers to the Common without clearing exploration progress or the simulated infrastructure.
