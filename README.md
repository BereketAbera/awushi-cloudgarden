# Awushi’s DevOps World

A local, procedural Blender → glTF → React Three Fiber adventure. Explore six connected floating districts with a cyan jelly companion, ten blendable expressions, five skeletal animations, and 17 educational discovery locations. Phase 1 teaches concepts through field notes; infrastructure simulations are future work.

## Run

Use Node 22.13+ or Node 24 and npm. Blender 5.1.1 is required only to regenerate assets; generated models are committed.

```sh
npm ci
npm run dev
```

Open the loopback address printed by Vite. There are no API keys, cloud integrations, downloaded model packs, CDN fonts, remote textures, or external runtime requests. Dependency installation needs npm access once; the game and generation then run locally.

Choose **Play Adventure** for six guided introductions, **Free Explore** for an open itinerary, or **View Architecture** for the lifecycle map. The character studio is always available.

- **WASD / arrows:** camera-relative movement. **Shift:** run.
- **E:** open the nearby discovery. **Space:** celebrate. **R:** return to the hub.
- **M:** journal and world map. **Escape:** settings or close a panel.
- **Follow:** steady tracking. **Explore:** drag to orbit and scroll/pinch to zoom. **Overview:** the whole world.
- Touch movement, interaction, running and recovery controls appear on mobile.
- Discoveries and preferences persist in this browser. Recovery keeps progress; **Reset exploration progress** starts a fresh notebook.

## Generate and verify

```sh
npm run assets:generate                         # character + four angles + ten expression renders
npm run assets:generate -- --character          # character export only
npm run assets:generate -- --environment        # seven district composites + five legacy assets
npm run assets:generate -- --all                # all sources, exports and previews
npm run assets:build                            # regenerate everything, then validate
npm run verify                                 # lint, types, unit/runtime/pipeline, GLB, build, browser
```

`BLENDER_BIN` can point to a local Blender executable. The runner detects the standard macOS application. Headless Blender can require host execution permission in restricted sandboxes because Metal initializes before Python. Browser tests use an installed Google Chrome and a local preview on port 5176; set up Chrome before `npm run test:browser`.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/components/` | Welcome, studio, HUD, accessible panels, minimap and local progress |
| `src/Scene.tsx` | Orthographic cameras, asset loading, rendering, movement and animation integration |
| `src/data/world-layout.json` | Shared district, station, bridge and collision layout |
| `src/game/` | Typed navigation, camera math, behavior and progress rules |
| `src/character/expressions.ts` | Cached, independent facial morph blending |
| `scripts/blender/` | Reusable local character, terrain, bridge, building and prop generation |
| `assets/reference/awushi.png` | Preserved visual source of truth |
| `assets/source/`, `public/assets/` | Editable Blender scenes/manifests and portable GLBs |
| `assets/previews/` | Actual Blender renders and browser screenshots |
| `scripts/test-*.mjs`, `tests/` | Pipeline, real Three.js loader, pure game logic and Playwright checks |

Read [world architecture](docs/ARCHITECTURE.md), [world generation](docs/WORLD.md), [expressions](docs/EXPRESSIONS.md), [camera and navigation](docs/CAMERA.md), [local pipeline](docs/PIPELINE.md), [UI and accessibility](docs/UI.md), and [Phase 1 verification](docs/PHASE1-VALIDATION.md).

Open `assets/source/awushi.blend` in Blender to inspect the character and its actions. `assets/source/world.blend` contains the generated world review scene. Reopen/revert after generation to see new output; Python and layout data are authoritative, so manual `.blend` edits are replaced on regeneration.

## Local AI authoring

An AI coding agent authored and refined the procedural Python against actual renders. Generation does not call an AI modeling service or require an installed neural model. A local coding model can edit the same functions and parameters, then run the documented generation and review loop. The 3D reconstruction preserves the supplied character; unseen surfaces and motion are authored from the single available reference.
