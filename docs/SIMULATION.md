# Local deployment simulation

The game runs a deterministic, application-agnostic teaching model in the browser. It does **not** push Git commits, start GitHub Actions, build containers, contact a registry, operate Kubernetes, retrieve secrets, scrape services, or restore a database. Digests, revisions, Pods, metrics, logs, approvals and backup results are simulated. The actual running software is the React/Three.js game and its local asset pipeline.

## Module boundaries

| Module | Responsibility |
| --- | --- |
| `src/simulation/domain.ts` | Serializable infrastructure state, command/event types, scenarios and environment identifiers |
| `src/simulation/scenario.ts` | Ordered stages, prerequisites described for the visitor, durations and station/event bindings |
| `src/simulation/engine.ts` | Command validation, pure transitions, dependency guards, failures, rollout calculation, station state selectors |
| `src/simulation/operations.ts` | Shared Pod faults, drift, incident observations and data recovery transitions |
| `src/simulation/registry.ts` | Technology explanations, source links, relationships and bindings to the existing 17 stations |
| `src/components/useSimulation.ts` | React integration and an injected monotonic clock |
| `src/adventures/engine.ts` | Evidence, guarded learner decisions and objectives around the same infrastructure state |
| `src/adventures/useAdventures.ts` | Adventure clock, pause/resume, validated command journal and isolated replay |
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

The UI schedules ticks independently of rendering, approximately every 100 ms. Rendering can pause or change frame rate without bypassing a gate. The delivery `clock` freezes at the logical approval, failure or completion timestamp. An active adventure has its own logical session clock and calls both `tickSimulation` and `tickOperations`; infrastructure events retain their due timestamps even when a caller advances in one large step. Paused, hidden and reloaded adventures do not accrue offline progress. Visual interpolation is separate from these clocks and cannot finish a stage. See [persistence and replay](PERSISTENCE.md) for the saved journal and replay contract.

## State transitions and commands

| Command | Allowed state | Result |
| --- | --- | --- |
| `start {environment, scenario?}` | Idle, succeeded, failed, cancelled | Begins a new candidate; retains both environments' deployed state |
| `promote-existing {environment: 'production', source: 'development', digest}` | Successful development delivery, healthy serving digest, matching published image and passing CI | Opens a separate production proposal for the same artifact, starting at stage 7 without rebuilding |
| `approve` | Waiting for approval with an open proposal | Records explicit review/merge, then starts the local image copy |
| `retry` | Failed | Applies the demonstrated repair and repeats the failed stage with its guards |
| `cancel` | Running, retrying, waiting for approval | Stops future guided work and marks any running CI checks cancelled; retains already applied changes |
| `reset` | Any | Restores the initial teaching infrastructure and clears history |
| `backup {environment}` | Idle or terminal | Captures the selected environment's simulated record count and deployment revision |
| `restore {environment}` | Idle or terminal, with a backup | Validates that backup in a separate recovery target; preserves live records and traffic |

Invalid command shapes, unknown environments/scenarios, non-finite timestamps and backward time return the original state unchanged. Commands cannot bypass prerequisites or approve automatically. Existing-artifact promotion deliberately begins at the proposal stage after validating the prior successful delivery; it does not fabricate completed build stages. Typed events are constructed only by the shared delivery/operations layer; there is no external event injection endpoint. Consumers do not mutate state or fabricate completion events.

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

The production adventure first verifies a successful development rollout and captures its serving digest. `promote-existing` preserves that candidate and its successful CI/publication state, changes the target environment and opens a new proposal. A second human approval is required before the existing copy/configuration/GitOps/rollout stages run. Verification checks that production serves exactly the verified development digest and that development's digest and deployment revision remain unchanged. This is immutable artifact promotion, not a new build with a matching version label. Both environments use separate namespaces/configuration in the same illustrated kind cluster.

Each event carries a monotonic ID, run ID, injected timestamp, environment, typed event name, optional stage ID and readable message. Optional visual metadata binds a kind and real source/destination station IDs. Stage entry and completion both have context; effects consume selected event types to avoid duplicate packets. Operational changes use `emitOperation`, which appends to this same log and sequence. History retains the most recent 240 events, while sequence numbers remain monotonic. Reset clears history. Adventure evidence and decision records are separate from infrastructure events: opening an inspector or rendering a selector does not create evidence or complete objectives.

`rollout.targetRevision` tracks the applied Pod template; `deploymentRevision` tracks the last fully healthy revision. An interrupted template still consumes a revision, so these can differ and successful revision numbers can have gaps. The rollout uses an illustrative `maxUnavailable=0`, `maxSurge=1`: the old revision keeps the required ready count while replacements become ready. Argo `Synced` and application `Healthy` remain distinct. The three selectable failures are:

- **Failing test:** blocks image building/publication.
- **Security finding:** blocks delivery for a simulated leaked test credential; explains removal and rotation.
- **Readiness failure:** new Pods remain unready, old ready endpoints continue, health becomes degraded and the readiness alert fires. Repair resumes rollout and the final alert review records resolution.

The deployment lab's basic backup command holds model metadata and a record count. Its restore command stores `recoveredRecords` and `restoredBackupId` without overwriting `data.records`. The Phase 3 recovery lesson extends this with multiple recovery points, dependent objects and a separate validated cutover, described below. Neither mode performs real database work.

## Shared operational adventures

`EnvironmentState.operations` holds optional cause/configuration records alongside the same Pods, routing, telemetry and data state used by the deployment lab. `seedOperation`, `applyOperation` and `tickOperations` centralize all operational changes. Adventure code captures evidence and enforces learning prerequisites; React panels, facility effects and scenario metadata never apply repairs themselves.

| Operation | State and correction | Required outcome |
| --- | --- | --- |
| Transient container crash | One exit with valid configuration and `restartPolicy=Always`; modeled kubelet restart after eight logical seconds | Restart count increases, readiness recovers and the learner verifies endpoints |
| Image pull failure | `application:missing` cannot be pulled; repair sets the configured reference to the available approved digest | Container becomes ready; repeatedly restarting the bad reference does not repair it |
| Readiness failure | Running process exposes `/health/ready`, but the probe uses `/ready` | Correct the probe path; the process is not restarted merely for failing readiness |
| Resource scheduling failure | A 4096Mi request exceeds 1024Mi available capacity; reviewed request is 512Mi for a measured 256Mi working set | Correct the request, then verify scheduling and readiness |
| Live configuration drift | Git requests two replicas while a live override requests one | Manual sync, or explicitly enabled automated sync plus self-heal, restores the reviewed count; time alone does not fix manual-policy drift |
| Application incident | Pool limit changes from 8 to 1; correlated logs, 24% request errors and 900ms latency identify acquisition timeouts | Restore the reviewed limit and verify a fresh four-second observation window: 200 responses, zero errors, 42ms latency and resolved alert |
| Data recovery | Compare snapshot consistency, age, database rows, object inventory and same-host storage | Restore a valid database target and its matching objects, validate their consistency, then resume simulated traffic |

Operational delays and measured values are deterministic lesson data, not production timing guarantees. The incident deliberately retains ready Pods and Argo health while requests fail: readiness alone does not prove application correctness. Wrong choices yield evidence-based explanations and remain recoverable. A live-only replica patch changes actual live state but leaves reviewed Git untouched.

The recovery lesson rejects the newest corrupt snapshot and a consistent twenty-minute snapshot that exceeds its five-minute RPO. The verified two-minute snapshot contains 98 records and matching objects. Database restore stays isolated while live data remains at 40 records and traffic stays paused; object restoration and validation are separate operations. Only successful validation updates live records and enables routing. The summary compares elapsed recovery time with the five-minute RTO target and explains that same-host backups do not protect against host loss.

See [adventure orchestration](ADVENTURES.md) for all six lesson paths, evidence/approval guards, hints, completion summaries and technical source references.

## Extending and testing

For a new scenario, add its typed ID and explanation in `domain.ts`, define an explicit cause and repair in the engine, and test the prerequisite, state, event and environment invariants. For a new stage, extend `StageId`, the ordered definitions, guards and completion transitions together. Add technology metadata and graph relationships in the registry, binding to an existing station where possible. Keep presentation timing out of those transitions.

Run `node --import tsx --test tests/simulation.test.ts tests/adventures.test.ts tests/replay.test.ts` for delivery, operational adventures and replay, or `npm run test:unit` for all unit tests. Tests cover the complete 22-stage sequence, indefinite approval, cadence invariance, runtime command validation, all three delivery failures, all four Pod causes, drift policy, same-digest promotion, incident correlation, recovery dependencies, wrong decisions, environment independence and cancellation/reset. Browser tests exercise these same reducers through the visible controls; they do not use a second deployment implementation.

Further lessons could add stale mirrors, secret synchronization failures or message redelivery. Introduce real model state and invariants before adding visual effects. Concurrent releases, actual Kubernetes/CI execution and arbitrary application topology remain outside this local teaching model. Persisted adventure replay is supported through the same reducers and validated command journal, not by trusting saved infrastructure snapshots.
