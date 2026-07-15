# Camera and movement

Phase 2 defaults to a perspective camera behind Awushi. Four modes share one player controller and switch without teleporting the character. The selected mode is saved in local preferences; **C** cycles it and the HUD provides direct selection.

| Mode | Projection and framing | Controls |
| --- | --- | --- |
| Third-person | 58° vertical FOV (64° narrow layouts), 5.8m follow boom, approximately 3.15m camera height at default pitch, 2.2m look-ahead | W/S move; A/D steer; drag to look; wheel adjusts 3.8–8m boom |
| First-person | 68° FOV (72° narrow layouts), actual authored eye height 1.218m | Same movement and steering, mouse/touch drag look; avatar hidden |
| Overview | Orthographic full-world tactical map, aspect-aware 64m span | Classic camera-relative WASD/arrows |
| Isometric | Preserved orthographic three-quarter follow framing | Classic camera-relative WASD/arrows |

Shift or the held touch lightning button runs. Up/down arrows match W/S; left/right arrows match A/D. On touch screens, hold the arrow pad and drag an unobstructed part of the world to look. No pointer lock is required, so Escape remains available for dialogs/settings. Studio orbit, angle presets, rotation, lighting and playback are preserved.

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

Tune camera constants in `camera.ts` and keep `WORLD_CHARACTER_SCALE` coupled to the eye-height test. R or the visible Home control recovers to the Common without clearing exploration progress or the simulated infrastructure.
