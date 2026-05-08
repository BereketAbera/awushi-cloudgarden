# Local asset pipeline

The repository is the source of truth. Blender Python creates the meshes, materials, rig, animation keyframes, procedural eye texture, lighting, and exports. The attached character reference is preserved at `assets/reference/awushi.png`. No external modeling API, asset pack, HDRI, cloud renderer, or downloaded model is used. AI assistance is the authoring and refinement of the Python and game code; asset generation itself is deterministic local code, not an installed local neural model.

## Requirements and first run

- Node.js 22 or newer, npm, and a locally installed Blender. The authoring environment uses Blender 5.1.1.
- `npm ci` installs the locked game and validation tools. This initial dependency installation requires package-registry access. Afterwards, regeneration, validation, preview, and gameplay use local files.
- Blender is discovered through `BLENDER_BIN`, the standard macOS application path, or `PATH`. `BLENDER_BIN` must be an executable file path, not a command containing arguments.

```sh
npm ci
npm run assets:generate
npm run assets:validate
npm run test:pipeline
npm run test:runtime
npm run build
npm run dev
```

The default generator builds the first milestone: Awushi's GLB, editable `.blend`, manifest, and four rendered views. It starts from Blender factory settings and runs a fresh Blender process per generator. Explicit Python errors produce a nonzero process exit; the wrapper also fails on process crashes. A partial output left by a failed run is not proof of success.

```sh
# Character only, without rendering previews
npm run assets:generate -- --character

# Character and all review angles
npm run assets:generate -- --character --previews

# Environment only, after character review
npm run assets:generate -- --environment

# Regenerate all implemented assets and previews
npm run assets:generate -- --all

# Use a specific installed Blender
BLENDER_BIN=/path/to/blender npm run assets:generate
```

On macOS in the Codex execution sandbox, Blender 5.1.1 can crash during Metal device discovery before it reaches Python. The observed stack ends in `supports_barycentric_whitelist`. Running the same headless command in an authorized host execution context succeeded. From a normal local terminal, no Codex sandbox is involved. This is not fixed by switching the render engine: GPU discovery happens during Blender startup, before the script sets Cycles.

## Sources and outputs

| Path | Purpose |
| --- | --- |
| `scripts/generate.mjs` | Discovers Blender and invokes the selected generator with checked exit status |
| `scripts/blender/common.py` | Shared mesh, curve, material, light, and GLB export helpers |
| `scripts/blender/generate_awushi.py` | Character sculpt, face, bubbles, weighted armature, clips, studio, and previews |
| `scripts/blender/generate_world.py` | Environment generator; only run once the character milestone has passed review |
| `assets/reference/awushi.png` | User-provided visual source of truth |
| `assets/source/awushi.blend` | Regenerated editable character and local preview studio |
| `assets/source/awushi-manifest.json` | Generator version, seed, dimensions, mesh budget, clip frame counts, and export size |
| `assets/previews/awushi-front.png` | Front-facing facial and silhouette review |
| `assets/previews/awushi-three-quarter.png` | Face placement, crown depth, and volume review |
| `assets/previews/awushi-side.png` | Profile and depth review |
| `assets/previews/awushi-back.png` | Back surface and complete crown review |
| `public/assets/awushi.glb` | Self-contained game asset with embedded image, PBR materials, skin, and clips |
| `scripts/validate-assets.mjs` | Native binary checks and the Khronos glTF Validator |
| `assets/validation-report.json` | Actual export sizes, triangle counts, bounds, clips, material extensions, SHA-256 checksums, and validator messages |

Generated `.blend`, `.glb`, preview images, and manifests are intended to be tracked along with their scripts and the reference. Temporary renders, Blender backups, dependency folders, build outputs, and Python caches are not source assets. Reproducibility means the same authored geometry and animation for the same code, seed, and Blender version; `.blend` serialization and rendered pixels are not guaranteed byte-identical across Blender versions, rendering backends, or machines.

## Character construction and customization

Awushi's broad head, small pear-shaped torso, and rounded limbs are first laid out as overlapping volumes. Catmull–Rom paths describe the crown's swept lobes. A voxel remesh fuses the volumes into a continuous surface, smoothing relaxes the skin, and decimation keeps the exported mesh within the real-time budget. The face has domed amber eyes, dark rims, separate highlights, and a beveled curved smile. Bubble geometry is distributed around the head and body, including the back and sides.

All changes below belong in `scripts/blender/generate_awushi.py`, followed by regeneration and rendered review:

| Change | Source section | Review implication |
| --- | --- | --- |
| Head/body ratio and limbs | `lump(...)` blocks before `paths` | Compare silhouette and feet contact from all four angles |
| Crown contour and sweep | `paths` control points `(x, y, z, radius)` | Preserve distinct valleys, asymmetric tips, and convincing depth |
| Surface fidelity | `voxel_size`, smoothing settings, decimation ratio | Smaller voxels improve curvature but increase time and triangle count |
| Cyan color, gloss, transparency | `jelly` material and its Principled inputs | Keep opacity at 1; use physical transmission, not alpha fading |
| Color absorption through the body | `add_jelly_volume(mat, color, density, thickness)` in `common.py` | Linear RGB sets attenuation; density is inverse attenuation distance; thickness approximates the body's optical depth in the game |
| Amber eye gradient | Generated `128 × 128` texture pixels | Keep the bright yellow lower eye, warm amber top, and dark outline |
| Face proportions | `eye_mesh`, eye locations, and `FriendlySmile` points | Verify the face stays on the curved surface in profile |
| Bubble distribution | Seed and bubble loops | Keep the face readable and preserve bubbles on multiple sides |
| Skin deformation | `bones`, vertex weight assignment | Inspect neck, shoulders, crown, and leg transitions while moving |
| Motion timing | `clips` and per-frame animation branches | Preserve clip names and cyclic endpoints for Idle/Walk/Run |
| Preview lighting | Studio area lights and world color | Use the same lighting between revisions for a fair comparison |

The procedural amber texture is packed into the `.blend` and GLB. Blender's subsurface response is used for the studio appearance, but glTF does not reproduce every Cycles shader feature. The portable look comes from glTF metallic/roughness plus transmission, IOR, clearcoat, and emissive materials. `add_jelly_volume` additionally supplies a Cycles Volume Absorption node and the exporter's `glTF Material Output` thickness socket, producing `KHR_materials_volume` with attenuation color, distance, and thickness. The helper was verified against an actual Blender export. Runtime studio lighting therefore matters. Do not use a preview-only shader as a substitute for testing the exported GLB in the browser.

For faster intermediate renders, invoke the Python generator directly with its preview controls:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python scripts/blender/generate_awushi.py -- \
  --root "$PWD" --previews --resolution 600 --samples 24
```

Omit `--previews` for geometry iteration. Use higher resolution and samples for final inspection. Direct invocations and the Node wrapper use the same generation code.

## Runtime contract

Blender authoring uses meters, Z-up, and a face directed toward −Y. The glTF exporter converts to Y-up with Awushi facing +Z. The feet rest near `y = 0`; world movement belongs to the game object enclosing the GLB. Animation is in place, so the clips do not carry the character through the level.

The character uses one weighted armature. The crown has its own deformation influence; eye bones allow blinking without a browser-only shader; celebration droplets are driven by bones. Exported clips are named exactly:

| Clip | Intended use |
| --- | --- |
| `Idle` | Loop breathing, gentle crown movement, and blinking |
| `Walk` | Loop a bouncy gait with alternating arms |
| `Run` | Loop the faster, more playful gait |
| `Interact` | Play a curious head tilt and arm gesture |
| `Celebrate` | Play the happy jump and small splash |

Load `/assets/awushi.glb` using `useGLTF`, clone it with `SkeletonUtils.clone` if creating multiple independent characters, and drive its clips with `useAnimations` or `THREE.AnimationMixer`. Crossfade between locomotion states. Play interaction and celebration once, then return to the current locomotion state. Do not apply a second `−π/2` rotation: the GLB already has the correct game coordinate system.

## Validation and visual acceptance

```sh
# All exported GLBs, plus a persisted report
npm run assets:validate

# A specific export
node scripts/validate-assets.mjs public/assets/awushi.glb

# Validator and process-wrapper regression checks
npm run test:pipeline

# Actual Three.js loader, skin, and all five animation clips (no GPU required)
npm run test:runtime
```

Validation checks the actual binary buffers: GLB headers and lengths, embedded resources, accessor strides and ranges, finite coordinates, valid triangle indices, normals, node hierarchy, normalized skin weights, valid joints, increasing animation times, and all five required character clips. It checks that clips really change, celebration jumps vertically along glTF +Y, root motion stays in place horizontally, and idle includes an eye blink. Character validation also requires a transmission material, a Y-up height of 2–5 meters, feet near zero, at most 80,000 triangles, and at most 5 MiB. Environment exports have an individual ceiling of 150,000 triangles and 8 MiB. Khronos validation must report zero errors. Warnings and informational messages are preserved in the report rather than hidden.

`meshLocalBounds` are raw mesh coordinates; `sceneBounds` include the node transforms in the default scene. These bounds describe the rest scene and are not an animated envelope. Structural validation cannot establish character likeness, motion quality, or rendering performance.

The runtime tests use the actual `GLTFLoader`, `SkeletonUtils.clone`, and `AnimationMixer`. They check material-extension conversion, finite bone/world matrices, moving skinned vertices for all five clips, and rest-pose restoration. A test-only loader hook substitutes local one-pixel textures for Node image decoding. Browser appearance still needs the actual texture and lights and is reviewed separately.

Before accepting a character revision:

1. Inspect front, side, back, and three-quarter renders beside the reference. Check the oversized head, low friendly face, swept asymmetrical crown, tiny limbs, and cyan/amber balance.
2. Inspect the actual GLB in the local game from each view, including the back. Check silhouettes, eye placement, smooth shading, and material response.
3. Play every clip. Watch foot contact, loops, eye blinks, head/body seams, and the jump/splash; confirm the game returns from one-shot actions.
4. Run asset validation and the production build. Keep both the before/after visual evidence and the updated generator in the same meaningful Git change.

Do not proceed to elaborate environmental modeling merely because the generator runs. The character's recognizable silhouette, material, and motion take priority over the number of props.

## Source references

- [Blender glTF export operator](https://docs.blender.org/api/current/bpy.ops.export_scene.html) documents the local exporter and its animation options.
- [Three.js MeshPhysicalMaterial](https://threejs.org/docs/pages/MeshPhysicalMaterial.html) describes the browser's transmission, thickness, and IOR behavior.
- [Khronos glTF Validator](https://github.com/KhronosGroup/glTF-Validator) supplies the independent specification checks used by the validation script.

These links are documentation only; the asset pipeline and running game do not fetch them.
