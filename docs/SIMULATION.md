# Local deployment simulation

The game runs a deterministic, application-agnostic teaching model in the browser. It does **not** push Git commits, start GitHub Actions, build containers, contact a registry, operate Kubernetes, retrieve secrets, scrape services, or restore a database. Digests, revisions, Pods, metrics, logs, approvals and backup results are simulated. The actual running software is the React/Three.js game and its local asset pipeline.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `src/simulation/domain.ts` | Serializable infrastructure state, command/event types, scenarios and environment identifiers |
| `src/simulation/scenario.ts` | Ordered stages, prerequisites described for the visitor, durations and station/event bindings |
| `src/simulation/engine.ts` | Command validation, pure transitions, dependency guards, failures, rollout calculation, station state selectors |
| `src/simulation/registry.ts` | Technology explanations, source links, relationships and bindings to the existing 17 stations |
| `src/components/useSimulation.ts` | React integration and an injected monotonic clock |
| `src/components/SimulationPanels.tsx` | Journey controls and event history |
| `src/components/TechnologyPanels.tsx` | Technology inspection and the architecture overview |
| `src/simulation/SimulationEffects.tsx` | Event-driven world presentation; no deployment decisions |

No XState dependency was present, so the state machine is an explicit typed reducer. It has no Three.js, React, random number, network, filesystem or wall-clock dependencies. The caller supplies milliseconds from the same monotonic clock to every command and tick. Advancing in one large tick or many small ticks yields the same state and event timestamps at the next pause or completion.

```ts
import { createSimulation, reduceSimulation, tickSimulation } from '../src/simulation/engine'

let state = createSimulation(0)
state = reduceSimulation(state, {
  type: 'start', environment: 'development', scenario: 'healthy',
}, 10)
state = tickSimulation(state, 20_000) // Stops at waiting-approval.
state = reduceSimulation(state, { type: 'approve' }, 20_001)
state = tickSimulation(state, 60_000) // Completes the remaining automated stages.
```

The UI schedules ticks independently of rendering, approximately every 100 ms. Rendering can pause or change frame rate without bypassing a gate. `clock` freezes at the logical pause, failure or completion timestamp. Particle lifetimes use the renderer's current clock against event timestamps; they must not keep aging from a frozen simulation clock.

## State transitions and commands

| Command | Allowed state | Result |
| --- | --- | --- |
| `start {environment, scenario?}` | Idle, succeeded, failed, cancelled | Begins a new candidate; retains both environments' deployed state |
| `approve` | Waiting for approval with an open proposal | Records explicit review/merge, then starts the local image copy |
| `retry` | Failed | Applies the demonstrated repair and repeats the failed stage with its guards |
| `cancel` | Running, retrying, waiting for approval | Stops future guided work and marks any running CI checks cancelled; retains already applied changes |
| `reset` | Any | Restores the initial teaching infrastructure and clears history |
| `backup {environment}` | Idle or terminal | Captures the selected environment's simulated record count and deployment revision |
| `restore {environment}` | Idle or terminal, with a backup | Validates that backup in a separate recovery target; preserves live records and traffic |

Invalid command shapes, unknown environments/scenarios, non-finite timestamps and backward time return the original state unchanged. Commands cannot skip stages or approve automatically. Typed events are constructed only by the engine; there is no external event injection endpoint. Consumers do not mutate state or fabricate completion events.

The seven statuses are `idle`, `running`, `waiting-approval`, `succeeded`, `failed`, `retrying`, and `cancelled`. A retry is visible until the next valid tick. The button says **Apply fix & retry** because the lesson explicitly repairs its seeded cause; it does not imply that repeating a real failing command would fix it. Dependency failures remain blocked if their prerequisite is still absent.

Cancellation is not a rollback or cancellation of a real Kubernetes controller. It stops this guided model at its current snapshot. A subsequent release retains the healthy Pods actually present, including multiple digests left by a partial rollout, and replaces them gradually; it never recreates old Pods from the last stable version. Reset is a teaching reset, not a destructive infrastructure operation. Event IDs and run IDs remain monotonic across reset so old effects cannot replay under reused identities.

## The 22-stage journey

| # | Stage | Main outcome |
| --- | --- | --- |
| 1 | Push code | New simulated application source commit |
| 2 | Start GitHub Actions | CI runner receives the push |
| 3 | Lint and tests | Quality gate passes |
| 4 | Source security | gitleaks and Trivy source/configuration gate passes |
| 5 | Build and inspect | Docker candidate plus built-image Trivy inspection |
| 6 | Publish to GHCR | Candidate digest available upstream |
| 7 | Digest-bump pull request | Promotion proposal opens separately from watched desired state |
| 8 | Human approval and merge | Explicit visitor decision; never timer-driven |
| 9 | Local image promotion | Approved content copied before desired state is published |
| 10 | Configuration | Selected environment's digest and references prepared |
| 11 | Helm and Kustomize | Example chart rendering plus environment overlay |
| 12 | GitOps commit and mirror | Desired revision published to a reachable local Git mirror |
| 13 | Argo CD detects drift | Desired revision differs from applied revision |
| 14 | Argo CD sync | Resources applied; scoped secrets and policies available |
| 15 | Rolling Deployment | New ready Pods gradually replace old Pods |
| 16 | Healthy Pods | Whole new revision passes readiness |
| 17 | Service routing | New version's ready endpoints are checked |
| 18 | Traefik ingress | Environment host routes to the Service |
| 19 | Prometheus | Deterministic request metric sample inspected |
| 20 | Alloy → Loki | Corresponding labeled request log forwarded |
| 21 | Grafana | Metrics and logs available to the dashboard |
| 22 | Alertmanager | Applicable alert state reviewed |

These last observations are presented in a guided order, not as universal runtime dependencies. Alloy does not require Prometheus; Prometheus rules feed Alertmanager independently of Grafana. Existing monitoring observes a readiness failure during rollout, before the final review. Existing Service/ingress paths continue serving healthy old Pods while new Pods are unready. A healthy delivery creates no fictional failure alert.

Terraform is already provisioned in the starting model. This journey does not apply Terraform on every application release. Helm then Kustomize is this architecture's selected rendering approach, not a requirement that all GitOps systems use both. Hosted CI has `canAccessCluster: false`; only the illustrated local bridge copies content and exposes Git to Argo CD.

## Infrastructure and event semantics

`state.activeImageDigest` is the **current run's candidate** (used by the review panel). The serving digest is `state.infra.environments[environment].activeImageDigest`. The registry fields describe candidate availability, not an inventory of all images: resetting the candidate does not erase already deployed images. Shared-facility inspectors explicitly identify the candidate target even while another environment is selected. The cache field describes use during the candidate build, not deletion of a persistent cache between runs. Cache use is separate from approved local promotion.

Each environment retains its namespace, application configuration, secret reference/version, desired/applied/mirror revisions, serving digest, Pods, telemetry, alert state and recovery data. Starting a production run does not modify development state. The source runner and registry are shared facilities; one journey runs at a time. Metrics and digest strings are reproducible teaching values, not measurements or hashes of real artifacts.

Each event carries a monotonic ID, run ID, injected timestamp, environment, typed event name, optional stage ID and readable message. Optional visual metadata binds a kind and real source/destination station IDs. Stage entry and completion both have context; effects should consume a single relevant event type to avoid duplicate packets. History retains the most recent 240 events, while sequence numbers remain monotonic. Reset clears history.

`rollout.targetRevision` tracks the applied Pod template; `deploymentRevision` tracks the last fully healthy revision. An interrupted template still consumes a revision, so these can differ and successful revision numbers can have gaps. The rollout uses an illustrative `maxUnavailable=0`, `maxSurge=1`: the old revision keeps the required ready count while replacements become ready. Argo `Synced` and application `Healthy` remain distinct. The three selectable failures are:

- **Failing test:** blocks image building/publication.
- **Security finding:** blocks delivery for a simulated leaked test credential; explains removal and rotation.
- **Readiness failure:** new Pods remain unready, old ready endpoints continue, health becomes degraded and the readiness alert fires. Repair resumes rollout and the final alert review records resolution.

Backups hold model metadata and a record count only. Restore stores `recoveredRecords` and `restoredBackupId` without overwriting `data.records`. This demonstrates the distinction between image rollback and data recovery; it is not a backup implementation or evidence of production recoverability.

## Extending and testing

For a new scenario, add its typed ID and explanation in `domain.ts`, define an explicit cause and repair in the engine, and test the prerequisite, state, event and environment invariants. For a new stage, extend `StageId`, the ordered definitions, guards and completion transitions together. Add technology metadata and graph relationships in the registry, binding to an existing station where possible. Keep presentation timing out of those transitions.

Run `node --import tsx --test tests/simulation.test.ts` for the pure suite, or `npm run test:unit` for all unit tests. Tests cover the complete 22-stage sequence, indefinite approval, cadence invariance, runtime command validation, all three failures and retry, gradual rollout capacity, registry/GitOps prerequisites, environment independence, cancellation/reset, recovery, graph consistency and station state. Browser tests exercise the same reducer through the visible controls; they do not use a second deployment implementation.

Phase 3 can add rollback, stale mirrors, secret synchronization failures, resource pressure, message redelivery and restore verification scenarios. Those should introduce real model state and invariants before adding visual effects. Concurrent releases, persisted event replay, actual Kubernetes/CI execution and arbitrary application topology are intentionally outside this local Phase 2 lesson.
