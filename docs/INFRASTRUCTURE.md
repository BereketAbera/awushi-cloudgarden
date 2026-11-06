# Infrastructure architecture and station registry

Awushi's world teaches a generic application delivery architecture across the existing six districts and 17 stations. All infrastructure is simulated locally in the browser. Inspecting an explanation or source link does not provision or connect a service.

The reference was read from `docs/architecture.md` and `docs/platform-contract.md` in the Wayline platform repository. We adopted reusable boundaries: hosted CI cannot access the local cluster; promotion copies a selected image before publishing desired state; a local Git mirror is Argo CD's reachable source; development and production-like namespaces share a cluster; application manifests are rendered before reconciliation. No Plane domain, deployment manifests, credentials, application implementation or live infrastructure was copied into the game.

## One graph, shared facilities

`src/simulation/registry.ts` owns technology explanations, sources and `GRAPH_EDGES`. Each technology has a stable ID, name, station ID, overview, responsibility, inputs, outputs and optional advanced details. Related technologies are derived from edges rather than maintained as a second relationship list. `FACILITIES` derives world bindings from the existing `STATIONS` in `src/worldConfig.ts`.

The 2D architecture view, station inspection, adventure actions and world navigation consume those same bindings. Graph edges describe responsibilities and flows; they are not all stage prerequisites. The shared delivery reducer and operational transitions own executable behavior and its guards. This avoids claiming, for example, that a human must install every data service during every release.

| District | Station IDs | Technologies |
| --- | --- | --- |
| Development and CI | `github`, `ci`, `delivery` | GitHub; GitHub Actions; lint/tests; Docker builds; CI security; digest promotion review |
| Images and infrastructure | `registry`, `containers`, `infrastructure` | GHCR; local registry; image digests; image promotion; pull-through caches; Terraform; Helm; Kustomize |
| Kubernetes and GitOps | `kubernetes`, `gitops`, `network` | Kubernetes; kind; namespaces; Deployments; Pods; Services; Argo CD; GitOps repository; local Git mirror; Traefik |
| Security | `secrets`, `security`, `supply-chain` | Infisical; secret synchronization operator; Kubernetes Secrets; RBAC; NetworkPolicies; resource requests/limits; Trivy; gitleaks |
| Observability | `observability`, `alerts` | Prometheus; Grafana; Alloy; Loki; Alertmanager |
| Data and recovery | `database`, `messaging`, `recovery` | PostgreSQL; Valkey; RabbitMQ; S3-compatible objects; backups; restore procedures |

The registry includes 43 technology entries and 49 directional relationships. Technology selection exposes concise inputs and outputs first; advanced details explain limits such as readiness versus liveness and namespace versus physical isolation.

The architecture explorer has searchable technologies, environment selection and relationship lenses for the selected component, delivery, security, observability and data. Station panels show current modeled state and links to related facilities. During an adventure these panels inspect its state and direct actions to the guarded mission console; free exploration retains the original Deployment Lab. Viewing the graph or opening a panel does not satisfy a mission's explicit evidence requirement. Historical `future` descriptions in world-layout metadata are not UI labels or executable scenario definitions.

## Delivery and ownership

CI tests and scans source, builds and inspects an image, publishes it to GHCR, and opens a digest promotion proposal. The visitor's approval is a real UI action applied to simulated state. The proposal is separate from the desired-state branch Argo watches. A local bridge copies the reviewed content to the local registry, verifies availability, prepares manifests and publishes the desired revision to the local Git mirror. Argo CD reconciles that revision without needing the hosted runner to contact Kubernetes. This matches the separation described in [Argo CD's automated sync documentation](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/).

GHCR publication and local availability are separate states. Digests identify content; tags can move. Pull-through caches improve repeated pulls but do not approve releases or guarantee an uncached image is available offline. A disconnected cluster can use a prepared local registry and mirror; introducing a new remote artifact still requires a connected bridge or explicit offline transfer. See [GitHub Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [Kubernetes image digests](https://kubernetes.io/docs/concepts/containers/images/), and [Docker registry mirrors](https://docs.docker.com/docker-hub/image-library/mirror/).

Phase 3's production adventure verifies the successful development release before issuing `promote-existing`. The shared reducer requires healthy development, passing CI and a matching published/serving digest, then starts a separate production proposal at the existing review stage. It preserves the artifact rather than rebuilding it or fabricating earlier stage completions. Production approval is explicit; final verification checks the exact same digest and unchanged development digest/revision. This uses the same delivery ownership boundaries as the original lab.

Terraform owns platform bootstrap in the illustrated design. Helm renders a chart and Kustomize applies an environment overlay; rendered manifests are committed. Argo owns application reconciliation, avoiding a competing `helm install` or Terraform ownership of the same application objects. These are deliberate choices for this lesson, not requirements imposed by the tools. See [Terraform](https://developer.hashicorp.com/terraform/intro), [Helm charts](https://helm.sh/docs/topics/charts/), and [Kustomize](https://kubernetes.io/docs/tasks/manage-kubernetes-objects/kustomization/).

## Environment boundary

| Property | Development | Production-like |
| --- | --- | --- |
| Namespace | `awushi-dev` | `awushi-prod` |
| Host rule | `app.dev.localhost` | `app.prod.localhost` |
| Secret reference | `application-dev-secrets` | `application-prod-secrets` |
| Desired replicas | 2 | 3 |
| Cluster | `kind-awushi` | `kind-awushi` |
| Release/telemetry/recovery state | Independent | Independent |

“Production” in the selector means the production **teaching environment**, not real production infrastructure. Namespaces separate resource names and policy scopes; they share nodes, the control plane and host failure boundary. RBAC restricts Kubernetes API actions, NetworkPolicies restrict supported network paths, and resource budgets constrain scheduling/consumption. They are different controls; none turns one shared kind host into two physically independent clusters. NetworkPolicy enforcement also requires a supporting network plugin. See [Kubernetes multi-tenancy](https://kubernetes.io/docs/concepts/security/multi-tenancy/), [NetworkPolicies](https://kubernetes.io/docs/concepts/services-networking/network-policies/), and [kind](https://kind.sigs.k8s.io/).

Infisical supplies secrets through an authenticated synchronization operator. The registry describes current `InfisicalStaticSecret` resources; workloads consume Kubernetes Secrets in the selected namespace. The game keeps names and versions only, never secret values. Synchronizing a value does not automatically mean every running application reloads it. Kubernetes Secret base64 content is encoded, not encrypted. See [Infisical secret synchronization](https://infisical.com/docs/integrations/platforms/kubernetes/infisical-secret-crd) and [Kubernetes Secrets](https://kubernetes.io/docs/concepts/configuration/secret/).

## Runtime, telemetry and data

The rolling deployment keeps old healthy Pods available while new Pods pass readiness. `Synced` describes desired-resource agreement; `Healthy` describes workload health. Services use ready endpoints, and Traefik routes the environment's host to the Service. The stages inspect the completed new-version path without pretending the previous Service stopped during rollout. See [Kubernetes Deployments](https://kubernetes.io/docs/concepts/workloads/controllers/deployment/) and [Services](https://kubernetes.io/docs/concepts/services-networking/service/).

Prometheus collects numeric metrics and evaluates the illustrated readiness or request-error rule. Alloy forwards workload logs to Loki; Grafana queries those sources. Alertmanager groups/deduplicates/routes alerts received from the rule evaluator, independently of Grafana. The final delivery journey order is an inspection sequence. A seeded rollout failure can alert before that final inspection, and healthy delivery creates no invented incident. The separate incident adventure correlates one pool configuration change with matching timestamps, request errors, latency and logs; it does not generate unrelated random symptoms. See [Prometheus](https://prometheus.io/docs/introduction/overview/), [Alloy Kubernetes logs](https://grafana.com/docs/alloy/latest/collect/logs-in-kubernetes/), [Loki](https://grafana.com/docs/loki/latest/get-started/overview/), and [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/).

PostgreSQL represents durable relational data; Valkey is used as a cache; RabbitMQ represents asynchronous work; S3-compatible storage represents objects. Publisher confirms and consumer acknowledgements have separate responsibilities, and consumers must tolerate redelivery. S3 compatibility describes an interface, not a requirement to use AWS. The original lab's basic restore validates simulated data in an isolated target. Phase 3 adds selection among recovery points, separate recovery of database and matching object versions, integrity verification and a final simulated cutover. Neither mode confuses restoring data with reverting an image. See [PostgreSQL backup](https://www.postgresql.org/docs/current/backup.html), [Valkey](https://valkey.io/topics/), and [RabbitMQ acknowledgements](https://www.rabbitmq.com/docs/confirms).

## Six local operational lessons

Adventure orchestration shares the same `SimulationState`, environment records, event history and station snapshots as the deployment lab. `src/simulation/operations.ts` adds optional typed cause/configuration records under `EnvironmentState.operations`, while updating actual modeled Pods, replicas, routing, metrics, logs and data. Mission code supplies evidence prerequisites and learning objectives; UI callbacks never directly repair infrastructure.

| Adventure | Technical decision and required evidence |
| --- | --- |
| Ship a New Release | Repair the failed regression, inspect passing CI and the published digest, explicitly approve, then verify GitOps, rollout, routing and telemetry |
| Recover a Failed Pod | Distinguish a one-time exited process from an unavailable image, wrong readiness path or unschedulable request; observe the configured restart or apply the matching correction, then verify endpoints |
| Fix Configuration Drift | Compare Git and live replicas, inspect the actual self-heal policy, reconcile the reviewed configuration and verify agreement and health |
| Promote to Production | Verify development, review and approve a new production proposal for that exact immutable digest, then check both environments |
| Investigate an Incident | Correlate the alert, metrics and logs, diagnose the pool change from 8 to 1, correct it and verify fresh successful requests after the observation window |
| Restore from Backup | Compare consistency, RPO and storage location; restore the valid database snapshot and matching objects, validate integrity and only then restore traffic |

Controller behavior differs by cause. The transient crash has `restartPolicy=Always` and no persistent configuration fault. Waiting or restarting cannot fix a nonexistent image, a probe requesting `/ready` instead of `/health/ready`, or a 4096Mi request exceeding 1024Mi available capacity. The reviewed resource correction is 512Mi for a measured 256Mi working set. Readiness recovery restores endpoint eligibility without treating readiness failure as a liveness restart.

Live-only drift remains unresolved when automatic self-heal is disabled until the visitor requests a sync or explicitly enables the policy. When automated sync and self-heal are enabled, the modeled controller reconciles after a deterministic delay. Git's reviewed replica count remains authoritative; a live patch does not alter it. Incident recovery separately demonstrates that healthy Pods and Argo status do not prove successful application requests: configuration can exhaust a connection pool while readiness still passes.

The data lesson compares a corrupt newest snapshot, a consistent but stale twenty-minute snapshot and a verified two-minute point within a five-minute RPO. PostgreSQL metadata references external object versions, so database restore alone cannot validate the application. Counts, modeled checksums and references must agree before cutover. The summary reports elapsed recovery time against a five-minute RTO target. All illustrated backups share the same host and therefore cannot protect against host loss. These values and delays are local teaching data, not production guarantees.

## Persistence and inspection boundaries

An explicit mission inspection records a timestamped snapshot of modeled evidence. Decisions guard against missing or stale evidence; completion requires verification of actual state. Wrong but recognized actions produce explanations and can be corrected. Four progressive hints are optional, and each completion summary distinguishes the observed outcome from the mechanism that worked.

The versioned local notebook stores scenario identities and timestamped commands, not trusted infrastructure objects. Loading and replay reconstruct through the same adventure/delivery/operations reducers, validate completion claims and preserve environment boundaries. Replay is a separate read-only session; the live attempt remains paused. Suspended attempts, best results, storage failures and migrations are described in [PERSISTENCE.md](PERSISTENCE.md). Saving this learning journal never connects to a cluster or persists real credentials.

Each technology's inspector includes its official reference. These references support the explanations; the running game never fetches them for simulation correctness. See [SIMULATION.md](SIMULATION.md) for commands, event timing and the 22 stages, [ADVENTURES.md](ADVENTURES.md) for scenario guards and extension, and [ARCHITECTURE.md](ARCHITECTURE.md) for runtime and presentation ownership.
