# Awushi Cloudgarden

The home of **Awushi’s DevOps World**—a little cloud garden where engineering systems grow.

Private source repository: [BereketAbera/awushi-cloudgarden](https://github.com/BereketAbera/awushi-cloudgarden). The local project folder is `awushi-cloudgarden`.

A local, procedural Blender → glTF → React Three Fiber adventure. Explore six connected floating districts with a cyan jelly companion, ten blendable expressions, five skeletal animations, and 17 technology facilities. Six hands-on DevOps adventures share evidence, recoverable decisions, saved progress and deterministic replay. Phase 4 adds Watch Flow station cinematics, a short optional introduction, three guidance levels, investigation checklists and explicit Guide Me actions. The deterministic infrastructure model and procedural Blender assets remain local.

**Play the live site:** [Awushi’s DevOps World](https://awushi-devops-world.vercel.app). The Vercel release serves the same static game; simulation and saves run in your browser. Localhost and the public site keep separate notebooks.

## Run

Use Node 24 and npm; `package.json` pins the supported deployment runtime to `24.x`. Blender 5.1.1 is required only to regenerate assets; generated models are committed.

```sh
npm ci
npm run dev
```

Open the loopback address printed by Vite. There are no API keys, cloud integrations, downloaded model packs, CDN fonts, remote textures, or external runtime requests. Dependency installation needs npm access once; the game and generation then run locally.

Choose **Start Adventure** to select a lesson, **Continue Adventure** to resume the latest unfinished one, or **Free Explore** for unstructured navigation and the original **Deployment Lab**. **View Architecture** opens the interactive technology graph. The character studio and engineering showcase explain how the world is made.

| Adventure | What you practice |
| --- | --- |
| Ship a New Release | Investigate failed CI, repair the regression, review an immutable digest, approve and verify delivery |
| Recover a Failed Pod | Distinguish a transient crash, bad image, failed readiness check and insufficient scheduling capacity |
| Fix Configuration Drift | Compare Git and live state, then reconcile manually or observe explicitly enabled self-heal |
| Promote to Production | Verify development, review the production change and promote the same image digest |
| Investigate an Incident | Correlate alerts, metrics and logs; repair the supported root cause and verify recovery |
| Restore from Backup | Compare recovery points, restore database and object data, then validate before cutover |

The mission notebook opens with symptoms, an objective and a useful next investigation. **Guide Me** frames the relevant building and opens its tools without performing a diagnosis. **Guided Explorer**, **Engineer** and **Incident Commander** change assistance without changing the simulation or resetting progress. Four requested hint levels are recorded without a scoring penalty. The mission notebook offers explicit inspection and repair actions. **Find facility** marks a destination and returns you to the world; walking there is optional, and opening a station never substitutes for an evidence check. Closing the notebook restores movement. Each lesson keeps its unfinished checkpoint when you switch; reload restores it paused. Completed journeys offer replay with pause, restart and 0.5×–4× speed. Replay does not change saved results.

**Watch Flow** presents one active stage at a time in its own camera view. Pause, use step-by-step playback, choose 0.5×–2× speed, replay an observed stage or take manual camera control. Explicit approval and recovery decisions stay in the investigation tools. Historical review is read-only and leaves live progress paused. Return to Awushi or exit to restore your exploration camera. Automatic camera movement can be disabled in Settings; reduced motion also disables automatic following.

- **Immersive cameras:** W/S move, A/D steer, drag the world to look. Arrow keys match. **Shift:** run.
- **C:** cycle cameras. Isometric/Overview retain classic camera-relative WASD movement.
- **E:** open the nearby discovery. **Space:** celebrate. **R:** return to the hub.
- **M:** journal and world map. **Escape:** settings or close a panel. World shortcuts pause while the mission notebook or a dialog is open.
- **Third-person** follows from behind. **First-person** uses Awushi’s eye level. **Overview** and **Isometric** preserve tactical views.
- Touch movement, interaction, running and recovery controls appear on mobile.
- Adventures, discoveries and preferences persist in this browser when storage is available. **Reset exploration progress** resets discoveries separately from adventure records; adventure restart is explicit.
- Sound starts muted. Enable the locally synthesized cues and adjust volume in Settings. Hints, reduced motion, lighting and quality are configurable there too.
- A save recovery notice offers export/reset or retry when data is incompatible, corrupt or cannot be stored. Keep the exported original before changing a damaged notebook.

## Generate and verify

```sh
npm run assets:generate                         # character + four angles + ten expression renders
npm run assets:generate -- --character          # character export only
npm run assets:generate -- --environment        # seven district composites + five legacy assets + deployment effects
npm run assets:generate -- --all                # all sources, exports and previews
npm run assets:build                            # regenerate everything, then validate
npm run assets:branding                         # render profile pictures and a transparent cutout from the existing character scene
npm run assets:compress                         # smaller JPEG/WebP files at the same pixel dimensions
npm run assets:uncompressed                     # PNG copies with compression disabled in assets/branding
npm run verify                                 # lint, types, unit/runtime/pipeline, GLB, build, browser
```

`BLENDER_BIN` can point to a local Blender executable. The runner detects the standard macOS application. Headless Blender can require host execution permission in restricted sandboxes because Metal initializes before Python. Browser tests use installed Google Chrome plus Playwright Firefox/WebKit and a production preview on port 5176. Install the additional browser binaries once with `npx playwright install firefox webkit`. The desktop/mobile Chrome projects exercise the full browser suite; Firefox/WebKit cover adventures, compatibility, resilience, cinematics, guidance and replay isolation. Mobile is browser emulation, not a physical-device claim.

For profile pictures and reusable full-body images, see the [Awushi branding images](docs/BRANDING.md). Their masters and ready-to-use PNG sizes are rendered locally from the same Blender character source as the game.

For a static production build, run `npm run build` and review with `npm run preview`. The live Vercel project is `bereketaberas-projects/awushi-devops-world`, configured to serve `dist/` at the origin root. See the [deployment guide](docs/DEPLOYMENT.md) for repeat release commands, asset caching and local-save boundaries. The Git remote is the private `BereketAbera/awushi-cloudgarden` repository. Automatic Git deployment is not configured; releases use the authenticated Vercel CLI. Renaming the source repository does not change the existing Vercel project or live URL. Local use requires no hosting account.

The [deployment verification report](assets/vercel-deployment.json) records 18 publicly accessible files matching the local build hashes, including all 14 GLB models, plus a live browser check of Watch Flow, Guide Me, recovery, completion cleanup and reload persistence. Repeat it with `node scripts/verify-deployment.mjs` after publishing the matching local build.

## Repository map

| Path | Responsibility |
| --- | --- |
| `src/App.tsx`, `src/components/` | Welcome, studio, HUD, accessible panels, minimap and local progress |
| `src/Scene.tsx` | Perspective/orthographic cameras, asset loading, rendering, movement and animation integration |
| `src/data/world-layout.json` | Shared district, station, bridge and collision layout |
| `src/game/` | Typed navigation, camera math, behavior and progress rules |
| `src/simulation/` | Typed engine, 43-technology registry, 22-stage scenario and event-driven visual projections |
| `src/adventures/` | Six lesson definitions, guarded decisions, evidence, hints, versioned journals and replay |
| `src/cinematic/` | Stage timing, explanatory captions and isolated historical-stage review |
| `src/audio/` | Original Web Audio cues, bounded voice lifecycle, opt-in and volume controls |
| `src/character/expressions.ts` | Cached, independent facial morph blending |
| `scripts/blender/` | Reusable local character, terrain, bridge, building and prop generation |
| `assets/reference/awushi.png` | Preserved visual source of truth |
| `assets/source/`, `public/assets/` | Editable Blender scenes/manifests and portable GLBs |
| `assets/previews/` | Actual Blender renders and browser screenshots |
| `scripts/test-*.mjs`, `tests/` | Pipeline, real Three.js loader, pure game logic and Playwright checks |

Read [Watch Flow and camera ownership](docs/CINEMATICS.md), [guidance and hints](docs/GUIDANCE.md), [adventure orchestration](docs/ADVENTURES.md), [local persistence and replay](docs/PERSISTENCE.md), [local sound](docs/AUDIO.md), [engineering showcase](docs/SHOWCASE.md), [deployment guide](docs/DEPLOYMENT.md), [world architecture](docs/ARCHITECTURE.md), [world generation](docs/WORLD.md), [expressions](docs/EXPRESSIONS.md), [camera and navigation](docs/CAMERA.md), [local pipeline](docs/PIPELINE.md), [UI and accessibility](docs/UI.md), [simulation events](docs/SIMULATION.md), [infrastructure and environments](docs/INFRASTRUCTURE.md), and [deployment effects](docs/EFFECTS.md). Current results, screenshots and remaining limits are in [Phase 4 verification](docs/PHASE4-VALIDATION.md), the [before-change UX audit](docs/PHASE4-UX-AUDIT.md) and [performance methodology](docs/PERFORMANCE.md). The [Phase 3 report](docs/PHASE3-VALIDATION.md) records the earlier released revision. Historical evidence remains in the [character validation](docs/VALIDATION.md), [Phase 1 verification](docs/PHASE1-VALIDATION.md) and [Phase 2 verification](docs/PHASE2-VALIDATION.md) reports; those measurements describe their recorded revisions.

Open `assets/source/awushi.blend` in Blender to inspect the character and its actions. `assets/source/world.blend` contains the generated world review scene. Reopen/revert after generation to see new output; Python and layout data are authoritative, so manual `.blend` edits are replaced on regeneration.

## Explore the free-form deployment lab

1. Choose **Free Explore**, then open the Deployment Lab and choose Development or Production and a healthy run or a failure scenario.
2. Push a change. Watch tests, source security, image build/inspection and GHCR publication.
3. Review the digest-bump proposal and explicitly **Approve & merge**. Time alone never approves it.
4. Follow local registry promotion, Helm/Kustomize configuration, the local Git mirror, Argo CD reconciliation, rolling Pods, Service/Traefik routing and telemetry.
5. Inspect any facility’s inputs, outputs and current simulated state through the architecture graph. Failure runs offer a demonstrated repair and retry. Data facilities support an isolated backup/restore drill.

Every infrastructure value is simulated. There are no real GitHub, Kubernetes, Infisical or cloud actions. The free-form lab starts fresh on reload; adventure infrastructure reconstructs from the versioned local command journal. Development and production have independent namespace/configuration/secret/deployment state within one modeled kind cluster; namespaces are not separate physical infrastructure. Completing a lesson requires its own inspected evidence and decisions, so free-form lab controls cannot bypass an adventure's approval gates.

## Local AI authoring

An AI coding agent authored and refined the procedural Python against actual renders. Generation does not call an AI modeling service or require an installed neural model. A local coding model can edit the same functions and parameters, then run the documented generation and review loop. The 3D reconstruction preserves the supplied character; unseen surfaces and motion are authored from the single available reference.
