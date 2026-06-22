# Phase 1 architecture

The existing Vite/React/R3F prototype is extended, with no backend. `App.tsx` owns screen routing, settings, discovery panels and local storage. `Scene.tsx` owns the live Three.js graph. Pure TypeScript modules contain navigation, camera and behavior rules so they can be tested without a GPU. The 3D scene is lazy-loaded separately from the interface.

## Shared world data

`src/data/world-layout.json` is consumed by both Blender Python and TypeScript. It defines the hub, six districts, 17 stations and 12 sampled curved bridges. World coordinates are Y-up in meters; the generator converts them to Blender Z-up. A district export is local to its center and is placed there exactly once by R3F. The hub export includes the bridges in global coordinates.

| District | Identity | Discoveries |
| --- | --- | --- |
| Development & CI / Maker Village | Workshop roofs and automated factory | GitHub, CI, delivery |
| Images & Infrastructure / Container Harbor | Warehouse, crane, containers | Registry, infrastructure, containers |
| Kubernetes & GitOps / Cluster City | Server towers and network equipment | Kubernetes, GitOps, networking |
| Security & Secrets / Cipher Keep | Vault, checkpoint and fortress | Security, secrets, supply chain |
| Observability / Signal Heights | Observatory and signal tower | Observability, alerts |
| Data & Recovery / Memory Gardens | Database, messaging, recovery facilities | Database, messaging, recovery |

Each district connects to the Common and its two neighbors. Elevations vary from 0.2 to 0.85m. The layout reserves open interiors and uses two large landmarks plus an optional smaller related stop per district. The generated terrain has deeper faceted undersides, vegetation, arrival banners and shared materials. Six runtime beacon instances gently pulse at entrances; reduced motion freezes them.

## Interaction and personality

`eligibleStation()` uses horizontal distance, elevation and hysteresis. A ring highlights the eligible station and the HUD names it. E or the touch prompt opens a shared `Dialog`; a 650ms guard, key-repeat suppression and modal input blocking prevent accidental reopening. The panel lists the concept, concrete lifecycle steps, and an explicit future scenario label. Every station is a discovery interaction, not a live service or simulated deployment.

`progress.ts` validates versioned storage, drops unknown IDs, deduplicates discoveries, and counts the six district introductions. Entering a district and discovering a station are separate events. Local storage failure leaves the session usable. Recovery resets position and camera but preserves discoveries. Full progress reset is a distinct settings action. Finishing six introductions triggers a celebration after the panel closes.

`behavior.ts` selects Curious near stations, Thinking while reading, Happy after an interaction, Worried after pushing a boundary, Determined while recovering, Excited while running and Sleepy after 22 seconds of inactivity. These facial cues do not seize movement controls. A movement command can interrupt a gesture. Explicit short reactions expire after 2.2 seconds.

The animation mixer drives the five authored skeletal clips. The cached morph controller runs afterwards and changes only facial influences. World motion always uses normal animation playback speed; the studio speed control is isolated from gameplay. Position and camera refs update every rendered frame; UI telemetry is published at most five times per second.

## Rendering and ownership

GLBs are loaded through the shared `useGLTF` cache. Static district meshes keep normal frustum culling. The one animated hero disables rest-bound culling because its crown and face deform beyond static bounds. Skeleton cloning isolates the character's pose; cached geometry and materials remain shared. `useAnimations` cleans up its mixer and the explicit finished listener is removed on cleanup. DOM input handlers, timeouts and dialog focus are also cleaned up.

Six entrance beacons use one `InstancedMesh`. World meshes are joined by material during generation; reusable building prototypes and a shared material library avoid duplicated authoring. Shadows cover a 24m region centered on the player. Low quality disables shadows, while all modes limit pixel ratio. No full-world triangle collision queries occur in the frame loop.

## Add a future location

1. Add a station record to the shared JSON with a stable ID, district, local concept content, world position, radius and model key. Keep its collider outside bridge entrances and other stations.
2. Add or reuse a factory function in `scripts/blender/asset_factory.py`; fit visible geometry within the declared footprint. Keep signs overhead or outside walkable space.
3. Regenerate the environment and inspect the district close render and runtime camera view. Run navigation reachability, bounds/winding and GLB checks.
4. No UI switch statement is needed: minimap, proximity, discovery panel and progress consume station data. Old saves accept new IDs automatically when they are discovered.
5. A real future simulation should introduce its own explicit state and tests. Change the panel's status and architecture legend only when the simulation exists.
