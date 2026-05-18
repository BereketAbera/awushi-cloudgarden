# Awushi’s DevOps World

A fully local, reproducible Blender → glTF → React Three Fiber character and world pipeline. Awushi is modeled from the included user-supplied reference with a continuous splash-shaped sculpt, cyan jelly PBR, amber eyes, embedded bubbles and five skeletal animations.

## Run the game

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Vite. Everything the running game needs is served from this repository: no API keys, external model services, asset packs, CDN fonts or downloaded environment maps. Package installation needs npm access once; regeneration and gameplay then work offline.

- **WASD / arrow keys:** move; **Shift:** run.
- **E:** curious interaction; **Space:** celebrate; **R:** reset.
- Drag to orbit, scroll to zoom. Use camera presets and animation controls for inspection.
- Studio mode puts character fidelity first. World mode shows the generated DevOps island. Walk near a station and press **E** to discover its DevOps concept; the interface tracks the three visited stations for the current session. Touch controls support movement on narrow screens.

## Regenerate assets

Install Blender 5.1 (tested with 5.1.1), then:

```sh
npm run assets:generate                 # character + four studio renders
npm run assets:generate -- --character # character export only
npm run assets:generate -- --all       # character, world, all previews
npm run assets:build                   # regenerate everything, then validate
npm run assets:validate
npm run test:pipeline
npm run test:runtime
npm run build
# Or run all verification steps together:
npm run verify
```

Set `BLENDER_BIN` when Blender is not found automatically. On macOS, the runner detects `/Applications/Blender.app/Contents/MacOS/Blender`. A restricted execution sandbox may need permission to launch Blender, because Metal initialization happens even in headless mode.

## Source of truth

| Path | Purpose |
| --- | --- |
| `assets/reference/awushi.png` | Supplied character reference; preserved unchanged |
| `scripts/blender/generate_awushi.py` | All character geometry, colors, rig and animation authoring |
| `scripts/blender/common.py` | Shared modeling, material and glTF export helpers |
| `scripts/blender/generate_world.py` | Island, workshop, CI factory, cluster and prop generators |
| `assets/source/` | Editable generated `.blend` scenes and manifests |
| `public/assets/` | Self-contained game-ready GLBs |
| `assets/previews/` | Actual Blender camera renders |
| `assets/validation-report.json` | Actual exported model and animation checks |
| `docs/PIPELINE.md` | Pipeline internals, customization, coordinate and material contracts |
| `docs/WORLD.md` | Environment layout and generator customization |
| `docs/VALIDATION.md` | Verification evidence and visual limitations |

Open `assets/source/awushi.blend` in Blender to inspect the generated scene. It opens framed in the studio camera with materials visible. The active clip is **Idle**, frames 0–120. Select `AwushiRig` and use the Action Editor to select **Walk**, **Run**, **Interact** or **Celebrate**. Reopen/revert the file after a headless regeneration to see the latest result. The editable Python generator is authoritative: manual `.blend` edits are replaced when regenerating.

## Local AI authoring

The procedural generator is code authored and refined by an AI coding agent against real Blender renders. It does not contain or silently call an AI modeling service, and it does not require a local LLM to execute. Given the same Blender version and code, the modeling seed, materials and animations are reproducible. If using a local coding model, give it the reference and rendered previews and ask it to change the checked-in parameters/functions; rerun the same validation loop.

This is an original procedural 3D reconstruction from one image. Unseen surfaces and motion are authored to preserve the same character, rather than recovered from unavailable multiview data. See the visual review notes for remaining differences.
