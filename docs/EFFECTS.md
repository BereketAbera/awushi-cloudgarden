# Deployment effects

Phase 2 reuses the existing 17 facilities. `scripts/blender/generate_effects.py` adds six small, reusable visual props rather than extra buildings. It uses the same local asset factory and generates its materials, softened geometry, editable review scene and previews without downloaded assets.

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

`src/simulation/SimulationEffects.tsx` accepts the typed simulation state, selected environment and reduced-motion setting. It never dispatches a command, finishes a stage, or changes infrastructure state.

- Typed visual metadata on real history events creates at most eight recent packets. Routes resolve station IDs through the same world layout used for navigation and panels.
- Packet travel is interpolated locally between event timestamps. Missing or unknown station bindings are ignored. Reduced motion shows the marker at its destination instead of flying it through the world.
- The active facility has a restrained ring. Amber means waiting for human approval, red means failure, and mint means automation or recovery is active.
- Replica models are instanced by material. Their count, revision category and readiness come directly from `infra.environments[environment].pods`. Muted shells are old replicas, amber shells are starting, and bright shells are ready. This is a floating status display above the Kubernetes facility, not new collision geometry.
- The Service link is visible only when `serviceReady` is true. The telemetry link additionally requires collected metrics and ingress readiness. No synthetic continuous telemetry stream is invented.

The `useGLTF` cache owns shared prototype geometry/materials. Packet clones own only their scene hierarchy. The activity ring’s private tinted materials are disposed on unmount; instanced replica geometry stays shared. Effects use frame refs rather than per-frame React state. Their render interpolation cannot influence the deterministic simulation clock or event ordering.

## Evidence

Three actual Blender angles were inspected. The independent Khronos validator reports zero errors and warnings. `tests/effects.test.ts` loads the real GLB, verifies all six reusable prototypes and their finite dimensions, and tests bounded environment-filtered event projection plus reduced-motion interpolation. `assets/source/effects-reproducibility.json` records a second isolated generation: exact vertex positions, materials, metadata and oriented topology; a few harmless index-order and sub-0.0002 normal differences are allowed by the repository’s existing comparison rules.
