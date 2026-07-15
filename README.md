# Awushi’s DevOps World

A local, procedural Blender → glTF → React Three Fiber adventure. Explore six connected floating districts with a cyan jelly companion, ten blendable expressions, five skeletal animations, and 17 technology facilities. Phase 2 adds immersive cameras and a deterministic, fully local DevOps deployment simulation covering 43 technologies.

## Run

Use Node 22.13+ or Node 24 and npm. Blender 5.1.1 is required only to regenerate assets; generated models are committed.

```sh
npm ci
npm run dev
```

Open the loopback address printed by Vite. There are no API keys, cloud integrations, downloaded model packs, CDN fonts, remote textures, or external runtime requests. Dependency installation needs npm access once; the game and generation then run locally.

Choose **Play Adventure** or **Free Explore**, then open the **Deployment Lab** to push a simulated code change. **View Architecture** opens the interactive technology graph. The character studio is always available.

- **Immersive cameras:** W/S move, A/D steer, drag the world to look. Arrow keys match. **Shift:** run.
- **C:** cycle cameras. Isometric/Overview retain classic camera-relative WASD movement.
- **E:** open the nearby discovery. **Space:** celebrate. **R:** return to the hub.
- **M:** journal and world map. **Escape:** settings or close a panel.
- **Third-person** follows from behind. **First-person** uses Awushi’s eye level. **Overview** and **Isometric** preserve tactical views.
- Touch movement, interaction, running and recovery controls appear on mobile.
- Discoveries and preferences persist in this browser. Recovery keeps progress; **Reset exploration progress** starts a fresh notebook.

## Generate and verify

```sh
npm run assets:generate                         # character + four angles + ten expression renders
npm run assets:generate -- --character          # character export only
npm run assets:generate -- --environment        # seven district composites + five legacy assets + deployment effects
npm run assets:generate -- --all                # all sources, exports and previews
npm run assets:build                            # regenerate everything, then validate
npm run verify                                 # lint, types, unit/runtime/pipeline, GLB, build, browser
```

`BLENDER_BIN` can point to a local Blender executable. The runner detects the standard macOS application. Headless Blender can require host execution permission in restricted sandboxes because Metal initializes before Python. Browser tests use an installed Google Chrome and a local preview on port 5176; set up Chrome before `npm run test:browser`.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/components/` | Welcome, studio, HUD, accessible panels, minimap and local progress |
| `src/Scene.tsx` | Perspective/orthographic cameras, asset loading, rendering, movement and animation integration |
| `src/data/world-layout.json` | Shared district, station, bridge and collision layout |
| `src/game/` | Typed navigation, camera math, behavior and progress rules |
| `src/simulation/` | Typed engine, 43-technology registry, 22-stage scenario and event-driven visual projections |
| `src/character/expressions.ts` | Cached, independent facial morph blending |
| `scripts/blender/` | Reusable local character, terrain, bridge, building and prop generation |
| `assets/reference/awushi.png` | Preserved visual source of truth |
| `assets/source/`, `public/assets/` | Editable Blender scenes/manifests and portable GLBs |
| `assets/previews/` | Actual Blender renders and browser screenshots |
| `scripts/test-*.mjs`, `tests/` | Pipeline, real Three.js loader, pure game logic and Playwright checks |

Read [world architecture](docs/ARCHITECTURE.md), [world generation](docs/WORLD.md), [expressions](docs/EXPRESSIONS.md), [camera and navigation](docs/CAMERA.md), [local pipeline](docs/PIPELINE.md), [UI and accessibility](docs/UI.md), [simulation events](docs/SIMULATION.md), [infrastructure and environments](docs/INFRASTRUCTURE.md), [deployment effects](docs/EFFECTS.md), and [Phase 2 verification](docs/PHASE2-VALIDATION.md).

Open `assets/source/awushi.blend` in Blender to inspect the character and its actions. `assets/source/world.blend` contains the generated world review scene. Reopen/revert after generation to see new output; Python and layout data are authoritative, so manual `.blend` edits are replaced on regeneration.

## Try a deployment

1. In the Deployment Lab, choose Development or Production and a healthy run or a failure scenario.
2. Push a change. Watch tests, source security, image build/inspection and GHCR publication.
3. Review the digest-bump proposal and explicitly **Approve & merge**. Time alone never approves it.
4. Follow local registry promotion, Helm/Kustomize configuration, the local Git mirror, Argo CD reconciliation, rolling Pods, Service/Traefik routing and telemetry.
5. Inspect any facility’s inputs, outputs and current simulated state through the architecture graph. Failure runs offer a demonstrated repair and retry. Data facilities support an isolated backup/restore drill.

Every infrastructure value is simulated in memory. There are no real GitHub, Kubernetes, Infisical or cloud actions. Exploration preferences persist, while a page reload starts a fresh simulation. Development and production have independent namespace/configuration/secret/deployment state within one modeled kind cluster; namespaces are not separate physical infrastructure.

## Local AI authoring

An AI coding agent authored and refined the procedural Python against actual renders. Generation does not call an AI modeling service or require an installed neural model. A local coding model can edit the same functions and parameters, then run the documented generation and review loop. The 3D reconstruction preserves the supplied character; unseen surfaces and motion are authored from the single available reference.
