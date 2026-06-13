# Awushi's DevOps World — local world assets

The Phase 1 world has six districts around **The Common**, joined by six spokes and six perimeter bridges. All art is generated locally with Blender's Python API. There are no downloaded meshes, fonts, textures, asset packs, or external modeling services.

| District | Landmarks | Small discovery prop |
| --- | --- | --- |
| Maker Village | Original GitHub workshop and CI factory | Delivery post |
| Container Harbor | Image registry warehouse and infrastructure crane yard | Container quay |
| Cluster City | Original Kubernetes cluster and GitOps control center | Network exchange |
| Cipher Keep | Access checkpoint and secrets vault | Artifact inspection |
| Signal Heights | Signal observatory and incident beacon | — |
| Memory Gardens | Database conservatory and message exchange | Recovery snapshots |

The two main landmarks in each district share a 1.55 m collision radius. Third stations use a 0.82 m radius and stay visually subordinate. The factory measures every built station and uniformly scales it down when necessary to fit its declared footprint. All buildings face the hub, and their fronts remain consistent with runtime approach positions.

## Regeneration

From the repository root:

```sh
npm run assets:generate -- --environment --previews
npm run assets:validate
npm run test:pipeline
npm run test:runtime
npm run build
```

The wrapper locates Blender locally and invokes it without a UI. `BLENDER_BIN` can select a different local installation. Direct invocation is also supported:

```sh
/Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --disable-autoexec --python-exit-code 1 \
  --python scripts/blender/generate_world.py -- \
  --root "$PWD" --previews
```

Blender 5.1.1 is the generation reference. On macOS, Blender must have ordinary local graphics access even in background mode; a restricted process sandbox can prevent Metal initialization. Render generation requires no network access.

`generate_world.py` reads the shared layout, builds the composite assets, exports GLBs, appends the native Awushi source for review, saves a complete Blender scene, and optionally renders previews. `asset_factory.py` contains reusable mesh, path, terrain, label, equipment, and landmark builders. `legacy_world.py` preserves the original island and three landmark generators; the new world reuses their native mesh data, while the five legacy standalone GLBs remain reproducible for existing consumers.

## Shared placement and navigation

`src/data/world-layout.json` is the authoritative runtime and asset layout. It contains the island centers, elevations and radii, station models and collision radii, district colors, and sampled curved bridge routes. Change this file to move a district or station; regenerate assets after changing physical placement.

The JSON is Y-up, in meters, matching React Three Fiber. Blender converts `(x, y, z)` into `(x, -z, y)` and exports Y-up GLBs. Buildings face Blender -Y / GLB +Z before their JSON yaw is applied.

- `world-hub.glb` is mounted at the origin. It contains the central island and **all twelve bridges**, already in world coordinates.
- Each `district-{id}.glb` is centered at its local origin and mounted at that district's JSON `center`.
- Island tops are flat at local height zero across the walkable interior. Only the outer 0.2 m rim slopes; the player center remains at least 0.34 m inside the declared island radius.
- Bridge tops use the JSON samples directly, with linear elevation between samples. Their deck is 2.65 m wide. Rails and posts lie outside that width. Endpoints overlap the islands by 0.75 m, so the routes have no gaps.
- Ground props stay within declared station colliders or beyond the playable rim. District name banners float above arrival space. Path markings are thin decorative surfaces rather than steps.
- `assets/source/world-navigation.json` is a generated, separate navigation manifest containing the island discs, bridge samples and station circles, plus a SHA-256 of the source layout. It is not an independently editable collision source.

The runtime uses the same island discs, bridge segments, interpolated heights, and station circles. Navigation tests check route continuity and station reachability. Real Three.js loader tests also inspect all 312 sampled bridge edge corners, every exported bedrock triangle’s outward winding, finite mesh transforms and positions, local bounds, and layout-manifest agreement. Asset generation also asserts that the actual horizontal radius of every landmark fits its station collider.

## Materials and geometry

All materials use portable Principled BSDF color, roughness, metallic and emission inputs. There are no image textures, and unused UV layers are removed before export to reduce bandwidth and avoid irrelevant exporter vertex splits. Six accent colors come from the shared layout. Soft bevels and weighted normals keep equipment legible at game scale; simple rounded planting and outward-facing faceted stone establish the floating miniature setting. Small signs use Blender's built-in vector font converted to mesh. Bedrock has a 1.2 m vertical shoulder and a 6.6 m tapered depth so the floating silhouette remains visible from elevated cameras; the walking surface stays at local height zero.

Static parts are combined by composite asset, with duplicate material slots consolidated. The seven runtime composites are limited to 300,000 triangles in total; each export is capped at 150,000 triangles and 8 MiB. `world-manifest.json` reports actual triangles, vertices, materials, byte sizes, station bounds and the layout fingerprint. The current seven composites contain 216,680 triangles and approximately 6.0 MiB in total; the largest individual file is approximately 1.27 MiB. The separate legacy exports are retained for compatibility and are not loaded as duplicate world geometry.

Runtime decorations and station activity cues are separate from the static composites, allowing the game to animate them without rebuilding the island meshes.

## Customization and extension

1. Add or edit a district/station in `src/data/world-layout.json`.
2. Add a landmark function to `asset_factory.py` and register it under the station's `model` value in `BUILDERS`.
3. Author around the origin with the front facing -Y and the base at Z=0. Keep the geometry within the intended station radius. The generator reports and enforces the actual radial footprint.
4. Reuse the shared palette and equipment helpers. Reserve cyan and warm emission for readable signals; keep rougher grass and stone around them.
5. Regenerate and inspect the native source, all affected previews and the game. Run the validation and navigation checks above.

The original `github-workshop`, `ci-factory`, and `kubernetes-cluster` model identifiers select the preserved native generators. Their source geometry is scaled to the district's station footprint without replacing their recognizable silhouettes.

## Review artifacts

- `assets/source/world.blend`: assembled editable scene, native Awushi, studio light rig and overview camera.
- `assets/source/world-manifest.json`: export statistics and measured station footprints.
- `assets/source/world-navigation.json`: separate navigation geometry contract.
- `assets/source/world-reproducibility.json`: independent regeneration comparison for all seven composites. Vertex positions, materials, and oriented triangle sets match exactly; harmless triangle ordering and tiny normal differences are tolerated.
- `assets/previews/world-overview.png`, `world-north.png`, `world-plan.png`: three views of the complete network.
- `assets/previews/district-{id}.png`: six close previews of the individual districts.
- `public/assets/world-hub.glb` and six `district-{id}.glb`: game exports.

The `.blend` includes locally generated studio lights and camera objects for review. These and the native Awushi review instance are excluded from all static world exports. Re-running generation deterministically uses seed 74 and the current shared layout. Keep generator changes, layout changes, source scenes, exports, manifests and reviewed previews together in version control.
