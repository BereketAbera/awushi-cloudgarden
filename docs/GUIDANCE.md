# Mission guidance and assistance

The six existing adventures use one presentation layer, `src/adventures/guidance.ts`. `getMissionGuidance(session, mode)` returns a briefing, checklist, investigation target, grouped actions and presentation flags. It reads the canonical adventure session without dispatching a command. `catalog.ts` owns educational copy; `worldConfig.ts` and `simulation/registry.ts` remain the sources of station and technology names.

## Evidence before completion

Briefings separate what happened, current observable symptoms, the objective, a first location and available tools. Symptoms are derived from the current simulated infrastructure. Initial incident copy does not name the cause. The checklist reads `completedObjectives`; opening a station, focusing a camera or requesting guidance cannot check an item. Existing valid investigation orders remain available, including reading incident metrics or logs before the alert.

Guide Me selects an investigation location and frames its station. The visitor still chooses an explicit inspection, diagnosis or correction. A suggested action is limited to a known inspection/verification or starting the release; the selector never chooses the correct diagnosis or repair. Remote field-console actions remain available so walking is not a prerequisite for learning.

Actions are grouped as investigation, decisions and verification. Missing targets have specific disabled reasons: a regression needs inspected CI evidence, a database restore needs a selected recovery point, and object recovery needs its database target. Plausible mistakes remain usable: premature approval or verification, an unsupported diagnosis and an ineffective restart return the engine's explanatory consequence. Presentation flags are not an authorization layer; the unchanged reducers enforce all scenario guards.

`EvidenceCard` displays the recorded `stationSnapshot`/`operationalEvidence` fields. Glossary explanations clarify labels without replacing values, inventing samples or changing telemetry. Display timestamps use the mission clock, including negative times for events before the mission began. Reinspect when a fresh observation is needed; an earlier evidence card remains a snapshot of what was observed then.

Station attention and Watch Flow captions summarize actual operational state even when the delivery pipeline is idle. A healthy Pod count does not conceal request errors; an incident's fresh observation window and an in-progress Git reconciliation show processing. A healthy outcome can precede the required verification action, so the checklist remains the authority for mission completion. Completed operational adventures focus their final station and learning summary. Historical operational review explicitly describes a recorded infrastructure snapshot at the selected event's station instead of borrowing the live objective or completed outcome; opening investigation tools or focusing a graph station clears that stage review.

## Preferences and hints

| Mode | Default presentation |
| --- | --- |
| Guided Explorer | Current steps, location prompts and optional help offers |
| Engineer | Objective and diagnostic tools; navigation and hints on request |
| Incident Commander | Briefing and raw evidence with less explanatory text; help remains available |

All modes use the same simulation and action choices. Switching modes does not restart an attempt or modify its evidence. Mode, automatic-camera preference and onboarding completion are normalized separately in `awushi-guidance-v1`; malformed, oversized or unsupported preference data falls back to defaults. `useGuidance.ts` retains in-memory preferences when storage fails. This key is separate from the version 2 adventure journal and the existing exploration/camera preferences.

Four requested hint levels expose direction, technology, evidence and a suggested action. The first two use registered district/station/technology names; the later levels come from the objective's educational copy. The engine reveals one level at a time, resets the visible level on objective progression and records cumulative assistance. Hints can be disabled. Best-result selection compares rejected decisions only: fewer hints and faster play never win a tie. Learning summaries retain hint usage without a penalty.

## Optional stuck detection

The pure tracker in `guidance.ts` accepts a monotonic UI clock, a stable objective checkpoint, evidence/progress identifiers, cumulative rejected decisions and uniquely numbered station interactions. `useGuidance.ts` observes immediately on relevant state changes and once per second; it does not run per WebGL frame or write tracking events into the journal.

In Guided Explorer, help becomes eligible after three rejections, four unrelated station visits, or 90 seconds without a new progress/evidence identifier. Progress resets the baseline. Related visits do not accumulate unrelated-visit counts, and repeated observations of the same interaction are deduplicated. Paused, replaying, cinematic, automatically waiting or hidden contexts suppress offers and reset the inactivity baseline, so returning from a pause does not immediately trigger help. Advanced guidance modes do not show unsolicited offers.

Dismissal is remembered for that attempt/objective checkpoint in memory. Guide Me also dismisses the offer. The prompt offers a location, never a solution or automatic diagnostic action. This is a small heuristic, not a measurement of understanding: reading an unchanged evidence card for a long time can qualify, and dismissal history is not persisted across reloads.

## Extension and verification

Keep scenario completion in the engine. Add briefing copy and location guidance here only when the canonical scenario changes; do not duplicate infrastructure definitions. Keep preference changes outside recorded commands unless they alter simulation semantics. Run:

```sh
node --import tsx --test tests/guidance.test.ts tests/adventures.test.ts tests/persistence.test.ts tests/replay.test.ts
```

These checks exercise read-only selectors, real checklist progress, optional assistance, prerequisites, mode independence, save compatibility and hint scoring. Browser verification must additionally inspect the visible panel, keyboard focus, Guide Me framing, recovery feedback and narrow layouts; passing pure tests alone does not establish usability. See [cinematic controls](CINEMATICS.md) for the camera and historical-stage boundary.
