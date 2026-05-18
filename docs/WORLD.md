# Procedural world assets

The world is generated entirely by `scripts/blender/generate_world.py`, using the shared local Blender helpers in `common.py`. No model packs, downloaded textures, HDRI maps or external fonts are used. Built-in Blender lettering is converted into mesh geometry.

```sh
npm run assets:generate -- --environment --previews
npm run assets:validate
```

The generator creates five independent, self-contained GLBs, an assembled editable `assets/source/world.blend`, a deterministic manifest, and `assets/previews/world-overview.png`. The source scene includes a half-scale copy of the current Awushi Blender source for scale review; it is not duplicated into the environment exports.

| Export | Contents | Placement in the game |
| --- | --- | --- |
| `island.glb` | Moss cap, stratified floating rock, landing plaza, three paths, route lights, rim cushions and mineral veins | Origin |
| `github-workshop.glb` | Warm gable workshop, beveled timber/windows, roof seams, procedural Git branch sign and entrance | `[-4.5, 0, -3]` |
| `ci-factory.glb` | Rounded factory, build/test/ship indicator towers, linking pipe, conveyor and artifact crates | `[4.5, 0, -3]` |
| `kubernetes-cluster.glb` | Three rounded server pods, luminous control-plane hub, data links, orchestration wheel and circular platform | `[0, 0, -6]` |
| `props.glb` | Lanterns, shrubs, mineral crops and supply crates positioned in island coordinates | Origin |

Blender authoring uses Z-up and building fronts toward −Y. Exported GLBs are Y-up and front-facing +Z. Building source coordinates are local to each building; game positioning is done once by React Three Fiber. The island's upper surface is at approximately `y = 0` (the outer edge drops 4 cm), its radius is about 8.6 m, and the lowest bedrock point is at `y = -4.15`. Buildings are approximately 2.5 m wide and 1.6–2.4 m tall. The game uses Awushi at half scale in the world and full scale in the character studio.

## Art direction and customization

The environment uses softened manufactured forms against faceted stone, with navy/teal structure, warm plaster and wood at the workshop, amber build status, and cyan orchestration lights. Color and roughness settings live in the `M` material palette near the top of the generator. Every component uses named modeling helpers, so its shape can be changed without depending on manual `.blend` edits.

- Change island shape in `N`, `radii`, and the bedrock ring `(factor, z)` values. Keep topcap triangles upward and bedrock triangles outward; inward normals become invisible under browser backface culling. Path ribbons begin outside the landing ring to avoid coplanar intersections and black self-shadow artifacts.
- Change station placement in the three `destination` values used for paths and the assembly locations near the end. Mirror these values in `src/worldConfig.ts`, including the interaction/collision positions.
- Adjust each building in its labeled source section. Keep geometry inside the intended collision footprint, or update the game collision radius accordingly.
- Add supporting props using the placement lists in the final modeling section. Keep the three routes and landing plaza clear.
- Change camera and light settings in the final studio section. Preview lights and the floor are excluded from every exported GLB.

Static mesh components are joined into one mesh per GLB while preserving shared materials. Bevels and weighted normals are applied before export. There are no animation clips in these environment assets; all gameplay interaction is driven locally by the game. The generated manifest records actual triangle counts and sizes, and `assets/validation-report.json` records independent structural and Khronos validation.

Open `assets/source/world.blend` in Blender for the assembled scene. The saved viewport uses the studio camera. Reopen the file after regenerating to see new changes; Python source remains authoritative.
