# Watch Flow and cinematic infrastructure

Watch Flow is a presentation of the existing simulation. It never approves a release, repairs a failure or completes an adventure objective. `src/cinematic/playback.ts` supplies stage descriptions and historical frames; `useWatchFlow.ts` owns view/review intent; the single `CameraRig` in `Scene.tsx` applies camera poses. Field notes retain explicit investigation and decision controls.

## Clock and playback boundaries

`playbackDelta` converts wall time to logical simulation time. With Watch Flow enabled, short automated stages are slowed toward 3.5 seconds at 1×; the visitor can select 0.5×, 1× or 2×. Longer stages keep their native duration before the speed multiplier. Each update is bounded to the next real stage boundary, preventing a delayed timer from skipping several visible stages. These durations affect presentation, not stage requirements or outcomes.

Automatic playback continues until a real failure, approval or decision condition requires the visitor. Step mode holds the clock at meaningful event boundaries; Next releases that hold and does not dispatch an approval or correction. Pause stops the applicable live/review clock. The engine remains independent of camera interpolation, packets and rendered frames. Watch Flow is optional; leaving it preserves the selected exploration camera preference.

Previous/Replay Stage enter a separate historical review and pause the live session. Review uses a cloned adventure journal or the in-memory free-exploration lab recording. The frame list contains existing stage-start, approval, failure, completion and operational events only; there is no seekable future stage. The stage-start and approval-required announcements for one gate are consolidated.

Multiple commands can share a logical timestamp. A timestamp-only seek could accidentally include a later approval or repair in an earlier frame. `recordedFrames` therefore reconstructs the journal once and records the command prefix that produced each event. `replayAdventure(record, time, { commandCount })` limits reconstruction to that prefix. Lab frames use `withFrameCommandCounts` and the equivalent `replayLab` option. Event signatures include identity, time, type, environment and message; a mismatched frame/record is omitted rather than represented by an unrelated snapshot. Historical navigation does not modify the live journal or bypass its gates.

Review playback uses the same slowed clock and stops before the next frame. A frame containing an instantaneous same-tick decision may have no elapsed interval; its reconstructed state remains available to inspect. Returning to Live leaves the live simulation paused until explicitly resumed. Full completed-journey replay remains a separate existing feature, with its own 0.5×–4× notebook controls. In Watch Flow it is explicitly labeled Recorded Journey / Read Only, uses its own pause/resume clock and the 0.5×–2× viewer speed choices, and disables live stage advancement. Opening live tools or focusing a graph station clears historical-stage review; those tools always show their current session state. Returning from a recorded stage restores the recorded journey, not an unrelated unfinished adventure.

Operational events do not necessarily have a delivery stage. Their historical review uses the selected event's station and a neutral “Recorded infrastructure state” explanation, with attention derived from that reconstructed snapshot. It does not reuse the current mission objective or completed summary as historical context. A completed operational adventure instead uses its final objective's station, verified summary and Review summary action when outside historical review. Neither view invents a new objective or changes completion.

## Shot definitions and camera ownership

`game/cinematic.ts` defines establishing, close-up, medium, transition, relationship, incident and completion shots. A `ShotRequest` identifies a station, optional related stations, offsets/alternate/mobile framing, minimum framing fraction, distance and transition duration. The default active shot follows `simulation/scenario.ts` station bindings. Nearby source/destination stages can share a relationship shot; distant stages favor a readable subject close-up.

District GLBs merge their meshes by material. `game/stationGeometry.ts` extracts triangles inside authored station footprints once after loading, deriving both the outline geometry and actual subject bounds. Missing measurements fall back to layout position/radius and a conservative height. Framing fits the combined bounding sphere, adjusts for portrait viewports and uses authored building orientation. Simple station-footprint sightline checks choose alternate angles when another building obstructs the preferred shot. Smooth interpolation adds a bounded lift on long transitions.

Kubernetes has an authored elevated, oblique desktop/portrait offset in `STATION_FRAMING`: its district banner obstructs the generic inward-facing shot. Explicit per-shot offsets take precedence, followed by this station exception and then the shot-type default. The same bounds fitting and neighboring-building checks still apply; this exception is a visual framing choice, not a general solution for decorative-mesh occlusion.

| Ownership | Camera behavior |
| --- | --- |
| `player` | Existing third-person, first-person, overview or isometric controller |
| `returning-cinematic` | Explicit smooth transition to the chosen station |
| `cinematic` | Follows active stage shots |
| `overridden` | Drag/wheel controls a temporary orbit from the current pose |
| `returning-character` | Smooth return to Awushi and the saved exploration mode |

The rig chooses one owner per frame. Drag/wheel input transfers to manual orbit; automatic stage following resumes only when requested. Return to Awushi and movement return attention to the player. Skip Transition completes the current camera move without changing simulation time. Pause freezes an automatic move, while an explicit return/focus request remains usable. Disabling automatic camera movement keeps captions and playback available. Reduced motion disables automatic following and uses immediate framing for explicitly requested focus actions.

## Station and flow attention

One primary station receives the strongest outline, contrast backing, bounding brackets, floor ring and label. At most two related stations receive secondary emphasis. Status combines text and a glyph with blue processing, green healthy, amber decision, red investigation and neutral colors. The materials work without bloom. Reduced motion removes the outline pulse.

`statusForSimulation` is shared by captions and station attention. Operational adventures leave the delivery status idle, so their attention reads the selected environment: request errors, firing alerts or degraded health require investigation; drift OutOfSync needs a decision; Syncing shows processing until reconciliation finishes. A corrected incident remains processing during its fresh observation window, then becomes healthy when the real recovery transition occurs. Healthy Pods alone cannot make failed requests healthy. These are summaries of existing state, not new telemetry, and healthy attention never substitutes for explicit adventure verification.

`simulation/effects.ts` maps actual events to code, image, configuration, secret-reference, endpoint-traffic, metric, log and alert flow styles. Source/destination identifiers come from the event and registry. Packets cannot advance simulation state; destination acknowledgments require a corresponding state event/completion. Effects retain a bounded recent set, respect environment filtering, pause and reduced motion, and use local asset prototypes. A long route is an explanatory overlay, not a claim of a physical network path or real packet timing.

## Limits and maintenance

Bounds extraction uses authored footprint membership, not semantic object names. Occlusion checks approximate neighboring buildings rather than performing full mesh visibility analysis. New or unusually tall/wide station geometry needs visual review and may need explicit shot offsets. Portrait layouts may need additional space for captions even when the geometric subject fits. A same-time atomic reducer command cannot be split into intermediate states that the engine never exposed.

The event history is bounded; stage review cannot recover events already trimmed from that history. Free-exploration lab recordings remain in memory, while adventure persistence retains its existing command limits. Do not make physical-device performance claims from browser emulation or equate these pure checks with visual acceptance:

```sh
node --import tsx --test tests/playback.test.ts tests/replay.test.ts tests/cinematic.test.ts
```

After camera, geometry or attention changes, inspect actual desktop and portrait screenshots across CI, approval, rollout and incident focus. Measure active playback on the tested host and report the environment and sampling method. Full Phase 4 validation is recorded separately after the integrated browser review.
