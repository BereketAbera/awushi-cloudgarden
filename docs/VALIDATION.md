# Validation record

Review date: 6 November 2026. This record distinguishes automated export checks, visual observations, and runtime checks. The machine-readable source for the current binaries is `assets/validation-report.json`; regenerate it after any asset change.

## Character export

The reviewed export uses one skinned mesh with six material primitives and one 16-joint armature. The latest completed validation at the time of this record reports 56,184 triangles and 2,026,776 bytes (about 1.93 MiB), below the 80,000-triangle / 5 MiB character budgets. It includes clearcoat, transmission, volume, and IOR extensions; images are embedded. Khronos glTF Validator reports zero errors and zero warnings.

The five animation clips are present with changing channels:

| Clip | Duration | Verified exported behavior |
| --- | --- | --- |
| `Idle` | 4.0 s | Eye scale drops to about 0.122 for a blink; root stays in place |
| `Walk` | 1.0 s | Vertical root bounce reaches about 0.065 m; no horizontal root drift |
| `Run` | 0.733 s | Vertical root bounce reaches about 0.119 m; no horizontal root drift |
| `Interact` | 3.0 s | Changing pose channels and blink; root stays in place |
| `Celebrate` | 2.2 s | Root jumps about 0.650 m along glTF +Y; no horizontal root drift |

These are binary animation-sample checks, not a claim that motion has been visually approved. The report also contains bounds, material extensions, per-clip channel counts, and checksums tying the evidence to the actual files.

## Actual refinement work

The first rendered character was inspected from front, three-quarter, side, and back. Its silhouette had the swept primary splash lobe and an oversized head, but the material looked pale and milky, the eyes were too small, crown valleys were insufficiently separated, and the bubbles were hard to see. Back inspection exposed strong ghost images of the face through the body.

The following changes were then made and regenerated:

- Increased eye scale and refined the dark outlines.
- Opened the crown valleys and adjusted the upper head volume.
- Increased cyan saturation and adjusted studio color management.
- Added explicit visible bubble accents alongside distributed bubble geometry.
- Added a physically exported absorption volume. A separate real Blender smoke export verified `KHR_materials_volume` attenuation color, inverse-density attenuation distance, and optical thickness, with zero Khronos errors or warnings.
- Joined the skinned pieces into one mesh with shared material primitives and preserved skin groups. This eliminated the initial non-root skinned-mesh warnings and reduced draw-call overhead.
- Corrected a real bone-space animation defect: the initial jump moved along forward depth because the vertical Blender bone uses local Y. The regenerated GLB now jumps vertically along game +Y. A regression test rejects the old behavior.
- Explicitly connected the authored eye UV map, fixing the yellow-to-amber gradient after mesh joining.
- Increased the torso and leg volume, and placed the larger bubble accents against the actual skin surface with ray casts.
- Added a dense cyan interior to approximate scattering and block the opposite-side face from showing through the translucent shell; the final export has six materials.

The final front, three-quarter, side, and back studio renders and the actual GLB in the game were inspected. The character milestone is accepted as a faithful stylized reconstruction: stronger cyan color, large amber eyes with yellow lower halves, separated swept crown lobes, a rounded body, and visible bubbles. The back no longer shows ghost eyes or a smile. The source image's intricate flowing internal highlights and finely detailed bubble distribution are simplified for real-time geometry.

## Repeated-generation audit

`npm run assets:generate -- --character` was executed successfully twice from the actual Node wrapper, using fresh factory-startup Blender processes. The final generator defaults are 900 × 900 and 64 Cycles samples, recorded in the source manifest. This audit did not rerender the images; it regenerated the GLB and source `.blend`.

The repeated GLB is **not byte-identical**. Before/after hashes and the detailed comparison are saved in `assets/reproducibility-report.json`. GLB JSON, vertex positions, UVs, joint/weight data, every animation accessor, and embedded texture bytes are exact matches. The six materials' oriented triangle sets are also exact matches; their triangle serialization order varies. Ten normal components differ by at most 0.0000851. This is geometric and animation reproducibility with harmless serialization and floating-point variation, not a byte-stable export claim.

The comparison can be repeated locally:

```sh
cp public/assets/awushi.glb /tmp/awushi-before.glb
npm run assets:generate -- --character
node scripts/compare-glb.mjs /tmp/awushi-before.glb public/assets/awushi.glb assets/reproducibility-report.json
npm run assets:validate
```

## Reproducible checks

```sh
npm run assets:validate
npm run test:pipeline
npm run test:runtime
npm run build
```

The pipeline suite currently has 13 tests covering command selection, Blender Python error propagation, binary boundaries, embedded-resource policy, finite vertex data, valid indices, interleaved accessors, budget limits, hierarchy cycles, vertical jump direction, horizontal drift, idle blinking, and reproducibility comparisons that distinguish harmless index rotation from changed shape or triangle winding. All 13 passed. The Blender helper also passed Python compilation and an actual export smoke test.

Six Three.js runtime tests also passed. They load the actual GLB with `GLTFLoader`, verify physical transmission/volume parameters, then play each clip through `AnimationMixer` on a separately cloned skeleton. At five sampled times per clip they check finite world and bone matrices, actual sampled skinned-vertex motion, and restoration of the initial pose after stopping. This Node-only test replaces image decoding with a local one-pixel texture because it has no browser canvas; it does not change geometry, skin data, animation tracks, or PBR parameters. It verifies loader/mixer compatibility, not rendered appearance.

## Environment exports

Environment generation began after the character milestone was accepted. All five static GLBs passed native binary checks and Khronos validation with zero errors and zero warnings:

| Asset | Triangles | Bytes | Material primitives |
| --- | ---: | ---: | ---: |
| Floating island | 8,964 | 416,948 | 10 |
| GitHub workshop | 13,060 | 497,688 | 7 |
| CI factory | 17,312 | 788,672 | 8 |
| Kubernetes cluster | 21,548 | 944,112 | 7 |
| Supporting props | 18,588 | 600,332 | 8 |

Each is a single static mesh. The island includes a ground surface near `y = 0` and a floating rock underside reaching `y = −4.15`. The workshop, factory, and cluster are authored around local ground zero; their measured maximum horizontal vertex radii are approximately 1.732, 1.679, and 1.570 meters, within the game's 1.75-meter station collision radius. Props already contain their island-relative placements.

Five additional actual Three.js loader tests cover these files: nonempty static geometry, finite transforms/vertices/PBR values, game-scale bounds, grounded stations, station collision footprints, island dimensions, and scattered-prop containment. Browser inspection also caught inward-wound island rock faces, which hid the underside through backface culling even though structural glTF validation passed. A geometric-normal regression test rejected that original export with an area-weighted radial orientation score of −1718.907. The faces were reversed; all 11 runtime tests then passed, including the positive outward-orientation check. The final full verification command runs these checks together with the 13 pipeline tests.

## Verification limits

The first character milestone has passed rendered and browser inspection. Interactive state transitions also received a code review: a held movement key could previously leave the character moving in Idle after an interaction; one-shot actions now lock translation and resume the locomotion state indicated by the keys when the action completes. World movement projects the avatar outside station collision circles and rejects a move if the island-edge clamp would reintroduce penetration. Nearby interaction range remains reachable outside those collision circles. The final integrated browser and production-build checks are recorded below. Do not interpret the structural validator or headless mixer tests as a measured frame-rate result.

Only one character reference image is supplied. The unseen back, exact side profile, full material response, and motion are modeled interpretations, not independently verified reference matches. Cycles and the real-time glTF renderer also differ: the export carries portable PBR parameters, while Blender-only subsurface behavior and multi-bounce refraction do not transfer exactly. No perceptual similarity score, device performance benchmark, or cross-browser certification has been claimed.

## Final integrated run

On 6 November 2026, `npm run assets:build` completed from start to finish: it launched local Blender twice, regenerated the character and five environment GLBs, saved both source scenes and all five Blender preview images, and validated every binary. All six GLBs returned zero Khronos errors and zero warnings. `npm run verify` then passed all 24 tests, repeated asset validation, TypeScript compilation, and the Vite production build. Vite retains its non-fatal advisory for the approximately 1.04 MB uncompressed Three.js scene chunk (288 kB gzip); the UI loads separately. No measured cross-device frame-rate claim is made.

Interactive browser verification covered all five clips, an airborne celebration pose, camera presets, orbit, pause/resume, real keyboard movement, and return from one-shot actions. The generated world was tested by walking to all three stations and pressing E, reaching 3/3 discovered with the correct notes. Holding movement against the cluster stopped at the collision boundary. At a 390 × 844 viewport, field notes stayed within the viewport and press-and-hold touch controls moved the avatar and updated proximity. Clean page loads produced no application console errors or warnings.

Actual evidence images are in `assets/previews/`: the four character angles, `world-overview.png`, `game-character-studio.jpg`, `game-celebration.jpg`, `game-world.jpg`, `game-mobile.jpg`, `game-world-mobile.jpg`, and `game-field-notes-mobile.jpg`. A separate Blender overview defect was traced by ray casting to overlapping coplanar path strips; paths now begin at the plaza edge, and the final overview was inspected without the black intersection patch. The world source appends the authored character scene for scale review; the browser continues to load the validated GLB.
