# Phase 4 UX audit and implementation plan

Audit performed on 2026-11-06 against commit `0829772`, before implementation. The local Vite application was started on port 5173. A fresh Chrome profile completed Ship a New Release through failed CI, rejected early approval, inspection, repair, digest review, explicit approval and health/routing/telemetry verification. Investigate an Incident was completed through alerts, metrics, logs, a wrong ingress diagnosis, ineffective image rollback, configuration repair and verification. No page errors occurred. The existing in-app browser was also used to inspect exploration cameras. A Chrome iPhone 13 emulation reviewed welcome, incident notes and world HUD; there was no horizontal overflow. This is an expert walkthrough, not a participant usability study or physical-device test.

Actual captures are in `assets/previews/phase4-audit/`. A short audit recording is retained locally under `.cache/phase4-audit-video/`. Existing functionality was confirmed in implementation: six adventures and six districts, 17 stations, 43 technologies, registry relationships, 22 release stages, four exploration cameras, ten expressions, five clips, state-derived evidence, approval guards, hints and deterministic saved replay. The focused domain audit passed all 39 existing adventure/persistence/replay tests.

| Priority | Observed problem | Impact on a new visitor | Planned improvement |
| --- | --- | --- | --- |
| P0 | Release effects stay across the bridge while the camera watches Awushi at the hub. | A visitor cannot see which technology is acting, even with notes closed. | One camera director, station bounds, Watch Flow shots and concise synchronized captions. |
| P0 | CI evidence pushes all next actions below the notebook fold. The entire checklist is below multiple sections. | Diagnosing becomes a scrolling task; next useful action is unclear. | Short briefing, visible checklist, grouped diagnostics/decisions, compact latest evidence and clear prerequisites. |
| P0 | Find station only sets a distant marker; mobile hides the mission's location shortcut. | The right tool is known but finding/seeing it remains difficult. | Guide Me with station framing, persistent touch action, interaction handoff and route/minimap cues. |
| P1 | Station rings are faint and packets cross large distances quickly. | Data movement and failure/recovery are easy to miss. | High-contrast silhouette/brackets, status labels/icons, one primary emphasis, typed flows and destination acknowledgments. |
| P1 | The mission workspace obscures most of the world on mobile. Desktop also keeps a large inspector open during automation. | Reading and watching compete. | Compact stage player; deliberate switching between Watch Flow and notes; progressive disclosure. |
| P1 | Start shows a long scenario selector and opens notes without context or a viewing choice. Help is a generic controls sheet. | First-time visitors must infer the relationship between walking, remote diagnostics and simulation. | Four clear entry actions, skippable contextual introduction, mission symptoms/tools and recommended Watch Flow. |
| P1 | Every domain action is presented as enabled, including premature approval and verification. | Mechanical prerequisites look like technical puzzles. | Explain locked prerequisites while retaining plausible incorrect choices and engine enforcement. |
| P1 | The graph location action discards graph selection and leaves the camera at the hub. | Architecture and world feel disconnected. | Controlled graph selection, station focus, related links and a direct return. |
| P2 | No guidance preferences or optional help after repeated ineffective actions. Some copy names the incident cause early. | Beginners can stall; experienced visitors cannot reduce assistance. | Shared guidance modes, non-spoiling briefings, four explicit hint levels and dismissible stuck prompts. |
| P2 | Hint usage affects best-result tie-breaking. | Asking for help is implicitly penalized. | Keep hints in learning summaries without lowering result selection. |

## Implementation sequence

1. Preserve the deterministic infrastructure model and its approval/failure rules. Add pure presentation contracts and tests for camera ownership, shots, guidance and stuck detection.
2. Extend the existing sole Scene camera writer; add selective, bounded highlights and flow effects. Stage review reconstructs historical adventure state from the existing journal and never advances live decisions.
3. Add Watch Flow orchestration and playback, then simplify onboarding, entry points, HUD and shared mission components. Connect graph selection and Guide Me to the same focus system.
4. Exercise all six scenarios, camera interruption/return, gate-safe stepping/replay, guidance preferences, accessibility and mobile layouts. Review actual screenshots of several release stages and incident evidence; measure active-render performance.
5. Run repository gates and the full test matrix, document evidence and remaining limits, and commit coherent milestones.

## Acceptance questions for each scenario

The rendered interface must answer: What am I trying to accomplish? What is happening now? Where should I look? What can I do? What changed after my action? What should I do next? Opening a panel alone must not satisfy an investigation objective. Guidance must never dispatch a diagnostic or repair command, and camera navigation must never approve a release.
