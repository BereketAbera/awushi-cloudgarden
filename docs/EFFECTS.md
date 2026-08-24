# Deployment effects

The deployment lab and Phase 3 adventures reuse the existing 17 facilities and six local visual props. `scripts/blender/generate_effects.py` uses the same local asset factory and generates materials, softened geometry, an editable review scene and previews without downloaded assets. Phase 3 projects operational faults, repairs and verification from the shared infrastructure state; it adds no parallel visual-only simulation.

| GLB prototype | Purpose |
| --- | --- |
| `CodePacket` | A code-change event travelling from GitHub toward CI |
| `ImagePackage` | A built image being published or copied by digest |
| `ConfigPacket` | A promotion proposal, rendered manifest or synchronization message |
| `PodShell` | A replica display driven by the selected environment’s actual Pod records |
| `SignalOrb` | A telemetry, failure or recovery event marker |
| `SyncRing` | The current stage’s facility activity/approval/failure indicator |

All prototypes use local origins and Y-up meters in the export. The GLB is 209,460 bytes and 6,280 triangles. It has no animation clips or textures. Rendered motion is intentionally separate from simulation correctness.

## Regeneration

```sh
npm run assets:generate -- --environment --previews
# For only these effects during iteration:
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python scripts/blender/generate_effects.py -- --root "$PWD" --previews
npm run assets:validate
```

`--environment` and `--all` run the effects generator after the world generator. The default command continues to generate only the character milestone. Outputs are `assets/source/effects.blend`, `effects-manifest.json`, `public/assets/deployment-effects.glb`, and front/back/three-quarter PNGs in `assets/previews/`. The saved Blender source arranges the prototypes for inspection; the exported prototypes remain centered for reuse.

Edit the named construction blocks in `generate_effects.py` to change their appearance. Preserve exported names, origin conventions, sub-meter dimensions and the 8k-triangle/400-KiB budget. Change shared modeling primitives in `asset_factory.py` only when the world should also inherit that change.

## Runtime projection

`src/simulation/SimulationEffects.tsx` accepts the typed simulation state, selected environment, reduced-motion setting and pause state. `Scene.tsx` uses it for both the deployment lab and the active adventure or replay. It never dispatches a command, finishes a stage, or changes infrastructure state.

- Typed visual metadata on real history events creates at most eight recent packets. `effects.ts` selects stage starts, approvals, failures, retries, basic backup/restore and shared `operation` events. Routes resolve station IDs through the same world layout used for navigation and panels; events from the other environment are excluded.
- Packet travel is interpolated locally between event timestamps. Missing or unknown station bindings are ignored. Reduced motion shows the marker at its destination instead of flying it through the world.
- The active facility has a restrained ring. Amber means waiting for human approval, red means failure, and mint means automation or recovery is active.
- Operational indicators use actual conditions: coral at Kubernetes for an unresolved Pod fault, amber at GitOps for drift, coral at Alertmanager while an alert fires, and amber at the database during data loss. The recovery facility turns mint after the isolated database restore while validation remains pending. The most recent operation or stage completion adds a short 1.4-second destination highlight, coral for a failure and mint otherwise.
- Replica models are instanced by material and capped at eight visible shells. Their count, revision category and readiness come directly from `infra.environments[environment].pods`. Muted shells are old replicas, amber shells are starting, coral shells indicate an unresolved operational Pod fault, and bright shells are ready. This is a floating status display above the Kubernetes facility, not new collision geometry.
- The Service link is visible only when `serviceReady` is true. The telemetry link additionally requires collected metrics and ingress readiness. No synthetic continuous telemetry stream is invented.

Production promotion uses the same image-package events as the shared delivery reducer, beginning with a new production proposal for the existing development digest. There is no fabricated second build effect. Incident alerts can remain visible while Pods are ready, because request errors and readiness are different modeled signals. Backup feedback remains active until database and object validation succeeds, rather than declaring success after database restore alone.

The `useGLTF` cache owns shared prototype geometry/materials. Packet clones own only their scene hierarchy. Every facility ring’s private tinted materials are disposed on unmount. Replica displays dispose their owned instance buffers while preserving shared geometry and materials. Effects use frame refs rather than per-frame React state. Their render interpolation cannot influence the deterministic simulation clock or event ordering. During adventure/replay pause the visual clock stays at the infrastructure snapshot and decorative rings stop rotating/pulsing; reduced motion places packets at their destinations and also quiets rings.

## Renderer measurement and ownership

`Scene.tsx` collects renderer work between frame boundaries. `useRendererCounters` temporarily disables Three.js's automatic per-render reset, snapshots the previous completed frame at priority `-1000`, and resets counters before the next frame's callbacks. The first incomplete sample is skipped; the original reset setting is restored on cleanup. Negative priority keeps React Three Fiber in charge of rendering. Telemetry publishes the snapshot approximately five times per second, while FPS is calculated over a roughly one-second window.

Draw calls and triangle submissions include the main scene, shadows, transmission and other offscreen work. These are submitted triangles across all passes, not the number of unique triangles in the asset files. Geometry and texture counts are resource counts, not GPU bytes; FPS is an observed local frame rate, not a GPU timing measurement or a device-independent benchmark. Reading `gl.info` directly in a normal `useFrame` callback would instead risk observing the last offscreen pass before the main scene renders.

The memoized `ReflectionLighting` subtree changes only with lighting or quality. This keeps telemetry updates from rebuilding the procedural cube environment. One ContactShadows instance remains mounted for the Canvas lifetime, hidden with `frames={0}` outside medium/high-quality Studio. Mode and quality toggles therefore reuse its targets and shaders instead of repeatedly allocating the dependency's internally owned resources.

| Resource | Owner and release behavior |
| --- | --- |
| Cached GLB geometry, materials and textures | Shared by `useGLTF` consumers; individual scene/packet clones do not dispose them. |
| Cloned Awushi skeletons | Awushi disposes each unique cloned skeleton on unmount, releasing its bone texture without touching shared geometry/materials. |
| Facial lookup cache | A `WeakMap` stores references to existing morph meshes; it creates no GPU resources and does not keep discarded scene roots alive. |
| Tinted facility-ring materials | Each indicator clones and disposes its own materials. Geometry remains cache-owned. |
| Replica instance matrices/colors | Each `PodPart` calls `InstancedMesh.dispose()` on unmount; this releases instance buffers and preserves its shared GLB inputs. |
| Procedural stage/link geometry | Declarative R3F children follow their parent component's disposal lifecycle. |
| Environment and contact-shadow targets | The environment dependency disposes its cube target; contact-shadow resources are bounded to one set per Canvas and released with the renderer/context lifetime. |

The final browser checks exercised studio expressions, quality changes, renderer recovery and five warmed studio/world switches. Both desktop and phone emulation held at 150 geometries and 19 textures across those switches. Resource counts alone cannot establish the absence of every GPU allocation leak; see `PHASE3-VALIDATION.md` for the measured scope.

## Awushi reactions and local sound

The adventure selector derives Awushi's expression from real decisions and infrastructure events: curious when inspecting evidence, thinking after a wrong decision or at approval, determined while automation runs, worried about failure, surprised by an incident, happy after progress and celebrating upon lesson completion. `App.tsx` consumes the adventure event sequence so rendering a panel does not repeatedly trigger reactions. The explanation and evidence remain visible alongside the expression.

`src/audio/sound.ts` synthesizes all seven cues locally with Web Audio oscillators: footstep, interaction, build, success, warning, error and celebration. It has no downloaded samples or network audio. Sound defaults to muted; a user gesture unlocks the audio context, and Settings exposes enable/volume/status controls. Cue-specific cooldowns and a twelve-voice ceiling bound overlapping sounds. Oscillators, gain nodes and the audio context are released by their owners.

Build completion, delivery success/failure and approval events trigger the corresponding cues through monotonic event IDs. Explicit interactions and movement trigger their own short cues; adventure feedback provides warning/error cues and completion selects the celebration clip. Replayed infrastructure and adventure feedback are silent, preserving a controlled review experience. These sounds never change the simulation or mission journal.

## Evidence

Three actual Blender angles were inspected. The independent Khronos validator reports zero errors and warnings. `tests/effects.test.ts` loads the real GLB, verifies all six reusable prototypes and their finite dimensions, and tests bounded environment-filtered event projection plus reduced-motion interpolation. Adventure tests verify the state/event causes behind operational indicators and companion reactions; audio tests verify the local palette and bounded cue scheduling. Browser tests exercise the visible mission/replay controls. `assets/source/effects-reproducibility.json` records a second isolated generation: exact vertex positions, materials, metadata and oriented topology; a few harmless index-order and sub-0.0002 normal differences are allowed by the repository’s existing comparison rules.
