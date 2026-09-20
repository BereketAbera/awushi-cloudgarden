# Local notebooks and deterministic replay

Phase 3 records the visitor's decisions, their logical timestamps and the selected adventure variant. Reload reconstructs the mission, infrastructure and event history through the same `createAdventure`, `tickAdventure` and `reduceAdventure` functions used during play. Saved data cannot inject a fabricated healthy cluster or a completed objective list: infrastructure objects and completion scores are derived from verified inputs.

## Storage and boundaries

`src/adventures/persistence.ts` owns the versioned `awushi-adventures-v2` localStorage value. A notebook contains the selected adventure, current attempt, one suspended attempt for each other adventure, one best completed recording per adventure, a monotonic attempt identifier and the hints preference. Existing exploration and camera preferences retain their separate keys. All infrastructure values are simulated; no credentials or real secrets are collected or stored.

LocalStorage is sufficient for these small command journals. A notebook is bounded at 512 × 1024 JSON characters (at most 1 MiB of UTF-16 storage), each attempt at 512 commands, and the logical clock at fourteen days. Assets, screenshots, textures and full frame-by-frame state snapshots are never saved. IndexedDB would be appropriate if future lessons retain large telemetry captures or many historical attempts; it would add unnecessary asynchronous complexity for this bounded notebook.

`useAdventures` persists after scenario event boundaries and explicit actions, plus `pagehide`, visibility loss and an explicit pause. It does not write on every animation frame or 100ms clock tick. A hidden page pauses the lesson; a reload restores it paused. Pressing Resume continues from the saved logical clock, without treating time spent away as an automatic approval, an elapsed incident observation or new infrastructure work. Pagehide checkpoints retain elapsed time inside a deployment stage. A browser crash can lose time since the last safe event boundary; it does not create synthetic progress.

Choosing another adventure suspends the current unfinished attempt. Launching an adventure with saved progress resumes it. Only the explicit Restart action replaces that adventure's attempt. Completion retains the best result by fewest rejected decisions. Hint usage and elapsed speed do not break ties; assistance remains visible in the learning summary without a penalty. The first equally successful record is retained. The latest completed attempt remains available as the active recording even when an earlier attempt has the better result.

Phase 4 guidance mode, automatic-camera preference and onboarding completion use the separate `awushi-guidance-v1` key. Stuck-detection observations, camera ownership and historical-stage review state stay in memory and do not enter the adventure command journal. Changing guidance does not change the scenario's reconstruction semantics or require a notebook migration. See [guidance](GUIDANCE.md).

## Validation and migration

Loading checks the version, bounded raw size, scenario/variant identities, preferences, finite monotonic timestamps, command shapes, action identifier syntax, record count and identities. It then reconstructs each recording to verify claimed completion and derive its score. Reconstruction is bounded by six scenario identities, at most six suspended and six completed records, and 512 commands per record. Unknown fields do not become executable domain state.

The supported version 1 preview format used `current` and a top-level `hintsEnabled` field. The explicit v1-to-v2 migration moves those fields into `active` and `preferences`, initializing the suspended list. Migration reads either the current key or `awushi-adventures-v1` and leaves the original v1 copy intact. Phase 2 had no persisted simulation state to migrate; its existing discovery/preferences keys remain supported by their original parsers.

Corrupt or unsupported versions produce a visible recovery notice and block automatic writes over the original. Visitors can export the original bytes, or explicitly start fresh while retaining a timestamped recovery copy. Reset copies the original before replacing the current notebook; if the copy cannot be stored, reset refuses to overwrite it. Quota and storage-access failures keep the previous save and current in-memory progress, expose a notice, and offer export/retry. Exporting the current notebook does not require working localStorage.

## Replay

`src/adventures/replay.ts` replays the timestamped user-command journal with the shared deterministic engine. It advances automatic infrastructure events to each input timestamp, applies that input and advances to the requested playhead. A replay never dispatches into the live session. Its record is cloned and treated as immutable, and playback state is excluded from the save.

The controller exposes pause, resume, restart and 0.5×/1×/2×/4× speed. `advanceReplay` integrates logical playback time independently of WebGL's frame rate. Seeking the same timestamp produces the same scenario, infrastructure and event state regardless of how many rendered frames occurred. Stopping replay returns to the paused live session and its untouched completed records.

Watch Flow's historical stage review additionally supplies an optional `commandCount` prefix to `replayAdventure`. This distinguishes events before and after multiple decisions recorded at the same timestamp. Ordinary replay omits that option and preserves its existing behavior. Prefixes are derived from actual event provenance, never written into the saved recording. Review pauses the live controller and navigates only recorded frames; it cannot authorize an approval or repair. See [cinematic playback](CINEMATICS.md).

## Tests and extension

Run `node --import tsx --test tests/persistence.test.ts tests/replay.test.ts`. Tests use the actual adventure engine and an in-memory storage adapter. Coverage includes safe round trips, migration, corrupt/incompatible versions, malformed and oversized journals, quota failures, recovery copies, suspended attempts, mid-stage restoration, replay cadence, seeking and original-record immutability. Browser tests verify a real reload and replay through the visible controls.

When changing command semantics or scenario initial conditions incompatibly, increment the notebook version and provide a verified migration or show an unsupported-version recovery notice. Do not silently reinterpret old inputs under different rules. Keep recorded command parsing and reconstruction together, and preserve the explicit distinction between a supported migration and a fresh notebook.
