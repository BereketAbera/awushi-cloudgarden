# Awushi project guidance

- Keep generation and runtime local. No external AI modeling APIs, downloaded asset packs or remote runtime dependencies.
- Preserve `assets/reference/awushi.png`. Do not redesign the character, dress it or add accessories.
- Character fidelity is the gate before environmental complexity. Inspect actual front/back/side/three-quarter renders after geometry or shader changes.
- Keep changes reproducible in `scripts/blender/`; do not deliver only hand-edited blend files.
- Blender coordinates are metres, Z-up, face -Y; GLB exports are Y-up, face +Z and feet at the origin.
- Exact reusable clip names: Idle, Walk, Run, Interact, Celebrate. Bone local axes differ from world axes; validate exported sampled transforms.
- Before committing: run `npm run test:pipeline`, `npm run assets:validate`, and `npm run build`. For runtime behavior changes, inspect the game in a browser.
- Commit reference, Python source, generated blend/GLB, previews and reports together. Exclude node_modules, build output, temporary renders and Blender backups.
