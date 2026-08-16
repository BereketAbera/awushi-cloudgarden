# Engineering showcase

The portfolio entry describes a locally generated miniature DevOps world before asking a visitor to play. The existing Awushi identity, animated environment and welcoming language remain the main presentation. Play Adventure opens six independent lessons; Free Explore preserves unstructured navigation and the deployment lab; View Architecture opens the shared technology graph. The engineering invitation opens an inspectable technical explanation, not a second dashboard.

## Four connected responsibilities

`src/components/Portfolio.tsx` contains a selectable four-layer diagram and concise source references:

| Layer | Responsibility | Source |
| --- | --- | --- |
| Author | Python creates editable Blender scenes, materials, character rig/morphs and portable GLBs | `scripts/blender/` |
| Model | Typed commands, deterministic infrastructure transitions, explicit events and adventure objectives | `src/simulation/engine.ts`, `src/adventures/engine.ts` |
| Present | React interface, React Three Fiber scene, cameras, collisions and event-driven effects | `src/Scene.tsx`, `src/game/camera.ts`, `src/simulation/SimulationEffects.tsx` |
| Verify and retain | Bounded versioned journals, deterministic replay, unit/browser checks and exported-buffer validation | `src/adventures/persistence.ts`, `src/adventures/replay.ts`, `tests/`, `scripts/validate-assets.mjs` |

The diagram explains responsibilities; it is not a claim that rendering controls infrastructure execution. User actions flow into the shared model, and the world/UI reflect that model. Replay submits recorded decisions and logical timestamps to the same transitions. No completed record is mutated during playback.

The technology and relationship counts come from `TECHNOLOGIES` and `GRAPH_EDGES`, so the showcase cannot drift from the registry. The same map bindings connect technologies to the existing facilities. Advanced explanations preserve distinctions between CI and cluster access, namespaces and physical isolation, image promotion and rebuilding, readiness and restarts, and database recovery and dependent object data.

## Honest presentation

The experience has no live cloud integration and asks for no credentials. It uses generated local 3D assets and locally synthesized audio. All operational values are simulated. Local gameplay does not imply that initial dependency installation requires no network access.

The showcase describes the performance techniques in the code—cached geometry, instancing, bounded effects and simple authored colliders—without converting those techniques into unsupported performance claims. Recorded measurements belong in the current phase verification report, including browser, quality settings, sample method and physical-device limitations.

Repository paths in the detail panels identify where a reviewer can inspect the implementation. They are not fake external source links. The checked-in documentation provides regeneration, extension and validation instructions. The presentation makes no unsupported claims about the portfolio owner's employment, production traffic or real infrastructure operations.

## Accessibility and responsive presentation

Diagram nodes are ordinary keyboard-operable buttons with `aria-pressed`; a polite live region announces the selected layer’s explanation. Numbered stages preserve reading order on narrow screens. Cards collapse into a single column where needed, source paths wrap, and primary actions remain available without precise pointer input. Existing reduced-motion preferences and keyboard focus styles apply.

The showcase is wrapped by the app’s shared accessible dialog. Adventure missions themselves use a nonmodal field notebook so the game remains visible during investigation. See `UI.md`, `ADVENTURES.md` and `PERSISTENCE.md` for interaction and state contracts.
