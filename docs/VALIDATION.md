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

The latest inspected front render has stronger cyan color, larger amber eyes with yellow lower halves, clearer crown separation, a rounder body, and visible bubbles. Visual review is still in progress. The source image's intricate flowing internal highlights and finely detailed bubble distribution are simplified for real-time geometry. Inspect all four final views before accepting the character milestone.

## Reproducible checks

```sh
npm run assets:validate
npm run test:pipeline
npm run test:runtime
npm run build
```

The pipeline suite currently has 11 tests covering command selection, Blender Python error propagation, binary boundaries, embedded-resource policy, finite vertex data, valid indices, interleaved accessors, budget limits, hierarchy cycles, vertical jump direction, horizontal drift, and idle blinking. All 11 passed after the volume helper was added. The Blender helper also passed Python compilation and an actual export smoke test.

Six Three.js runtime tests also passed. They load the actual GLB with `GLTFLoader`, verify physical transmission/volume parameters, then play each clip through `AnimationMixer` on a separately cloned skeleton. At five sampled times per clip they check finite world and bone matrices, actual sampled skinned-vertex motion, and restoration of the initial pose after stopping. This Node-only test replaces image decoding with a local one-pixel texture because it has no browser canvas; it does not change geometry, skin data, animation tracks, or PBR parameters. It verifies loader/mixer compatibility, not rendered appearance.

## Review still required

At the time this record was written, final rendered character acceptance and interactive browser verification were pending. In the local game, confirm all five clips play, one-shot actions return to locomotion, movement and camera controls work, the character stays grounded, and front/side/back views are coherent. Run the production build and record its result. Do not interpret the structural validator or headless mixer tests as proof of those interactive checks or as a measured frame-rate result.

Only one character reference image is supplied. The unseen back, exact side profile, full material response, and motion are modeled interpretations, not independently verified reference matches. Cycles and the real-time glTF renderer also differ: the export carries portable PBR parameters, while Blender-only subsurface behavior and multi-bounce refraction do not transfer exactly. No perceptual similarity score, device performance benchmark, or cross-browser certification has been claimed.
