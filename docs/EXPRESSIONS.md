# Awushi expressions

The character retains its original sculpt, cyan jelly material, amber eyes, five skeletal clips, and skin weights. `scripts/blender/facial_helpers.py` authors a separate, compact facial mesh named `Awushi_ExpressiveFace`. This avoids storing body-sized morph deltas for expressions that only affect the face.

The ten expression states are **Neutral, Happy, Curious, Thinking, Excited, Worried, Surprised, Determined, Celebrating, and Sleepy**. Neutral is the authored basis with every morph weight at zero. The remaining nine state names are the exact glTF morph target names. The states combine eye shape, mouth curves or opening, and small expressive brow strokes. Brows have a subpixel basis radius and rest beneath the jelly surface in Neutral, preserving the original character identity; they expand into small ink strokes as an expression blends in.

| State | Facial cues |
| --- | --- |
| Neutral | Original amber eyes and tiny friendly smile |
| Happy | Softer eyes and a wider curved smile |
| Curious | Asymmetric eye heights, raised brow, off-center smile |
| Thinking | Uneven squint and a small sideways mouth |
| Excited | Enlarged eyes and an open smile |
| Worried | Raised inner brows and downturned mouth |
| Surprised | Tall eyes, arched brows, round O-mouth |
| Determined | Narrow eyes, inward angled brows, firm mouth |
| Celebrating | Happy curved eyes and broad open smile |
| Sleepy | Nearly closed eyes and relaxed tiny smile |

## Blender authoring

`create_face()` makes eye, mouth, and brow geometry. Each piece is bound to the existing head or eye bones, then joined into the facial mesh. `add_expression_keys()` creates the named morph targets after joining. Locomotion actions still animate the armature; blinks still scale the eye bones. Morphs are evaluated with that skinning, so an expression can remain active while walking, running, interacting, or celebrating.

Edit `EYES`, `BROWS`, `OPEN_MOUTH`, `mouth_center()`, and `brow_center()` in `facial_helpers.py` to change expression strength or shape. Do not rename exported targets without updating the runtime's `EXPRESSIONS` contract. Keep expressions bounded and preserve rounded contours at both full and partial intensity.

```sh
npm run assets:generate -- --character --previews
npm run assets:validate
```

In addition to the four full-character camera views, preview generation renders `assets/previews/awushi-expression-<name>.png` for every state using the actual Blender shape keys. These close facial views intentionally crop the crown to make changes easy to inspect. The saved source scene opens with Neutral and Idle; it retains all expression targets and skeletal actions for manual review.

If appending the character into another Blender source scene, include all three objects: `Awushi_SculptedSkin`, `Awushi_ExpressiveFace`, and `AwushiRig`. Parent the roots under one scale transform. The world generator uses this arrangement for its scale reference.

The face contains 3,670 authoring vertices. Export splits it into four material primitives and stores sparse morph deltas, while the body has no morph buffers. This keeps the complete character below the 5 MiB GLB budget. There are no animation channels targeting morph weights, so a skeletal clip cannot overwrite the runtime's facial state.

## Runtime blending

`src/character/expressions.ts` exposes `EXPRESSIONS`, `getExpressionTargets(scene)`, `applyExpression(scene, name, intensity, dt, reducedMotion)`, and `resetExpression(scene)`.

Call `applyExpression` after updating the skeletal animation mixer. It caches the facial primitives once, then exponentially damps each morph weight toward the chosen expression and intensity. It never writes bone transforms, advances animation time, or interrupts locomotion. A transition passes through blended expressions rather than replacing geometry abruptly. Neutral fades every target back to zero. Reduced-motion mode uses a shorter, restrained blend; decorative sway and camera behavior are controlled separately by the gameplay system.

The gameplay behavior controller chooses contextual expressions. The studio exposes manual states and intensity independently of the clip selector. This separation is intentional: **Happy + Walk**, **Worried + Idle**, and **Celebrating + Celebrate** are all valid combinations.

## Validation

`assets:validate` expands and bounds-checks sparse glTF accessors, checks all nine named targets and finite POSITION/NORMAL deltas, requires a skinned face and Neutral defaults, and rejects skeletal animation channels that overwrite facial weights. Generic character fixtures can omit expressions; the explicit expression gate is enabled for the delivered `awushi.glb`.

`tests/expressions.test.ts` loads the real GLB through Three.js, checks the exported target dictionary, verifies facial blending does not change the locomotion pose or mixer time, checks bounded transitions and independent clones, and verifies an Idle blink remains effective with Sleepy applied. These CPU tests replace only image decoding with an empty local texture; geometry, skins, morphs and animations come from the actual binary export. Shader appearance is reviewed separately in the Blender renders and browser studio.

`assets/awushi-expression-reproducibility.json` records a second isolated regeneration. Positions, morph deltas, oriented topology, materials, textures, skinning and animation reproduce exactly. Blender may reorder triangle indices and vary a few normal components below the established `0.0002` tolerance; the comparison applies that same tolerance to base normals and morph normals.
