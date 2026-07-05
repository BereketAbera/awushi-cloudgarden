# Infrastructure architecture and station registry

Awushi's world teaches a generic application delivery architecture across the existing six districts and 17 stations. All infrastructure is simulated locally in the browser. Inspecting an explanation or source link does not provision or connect a service.

The reference was read from the local Wayline platform's `docs/architecture.md` and `docs/platform-contract.md` under `/Users/bek/dev/pr/plane-platform`. We adopted reusable boundaries: hosted CI cannot access the local cluster; promotion copies a selected image before publishing desired state; a local Git mirror is Argo CD's reachable source; development and production-like namespaces share a cluster; application manifests are rendered before reconciliation. No Plane domain, deployment manifests, credentials, application implementation or live infrastructure was copied into the game.

## One graph, shared facilities

`src/simulation/registry.ts` owns technology explanations, sources and `GRAPH_EDGES`. Each technology has a stable ID, name, station ID, overview, responsibility, inputs, outputs and optional advanced details. Related technologies are derived from edges rather than maintained as a second relationship list. `FACILITIES` derives world bindings from the existing `STATIONS` in `src/worldConfig.ts`.

The 2D architecture view, station inspection and world navigation consume those same bindings. Graph edges describe responsibilities and flows; they are not all stage prerequisites. The reducer owns the smaller executable lifecycle and its guards. This avoids claiming, for example, that a human must install every data service during every release.

| District | Station IDs | Technologies |
| --- | --- | --- |
| Development and CI | `github`, `ci`, `delivery` | GitHub; GitHub Actions; lint/tests; Docker builds; CI security; digest promotion review |
| Images and infrastructure | `registry`, `containers`, `infrastructure` | GHCR; local registry; image digests; image promotion; pull-through caches; Terraform; Helm; Kustomize |
| Kubernetes and GitOps | `kubernetes`, `gitops`, `network` | Kubernetes; kind; namespaces; Deployments; Pods; Services; Argo CD; GitOps repository; local Git mirror; Traefik |
| Security | `secrets`, `security`, `supply-chain` | Infisical; secret synchronization operator; Kubernetes Secrets; RBAC; NetworkPolicies; resource requests/limits; Trivy; gitleaks |
| Observability | `observability`, `alerts` | Prometheus; Grafana; Alloy; Loki; Alertmanager |
| Data and recovery | `database`, `messaging`, `recovery` | PostgreSQL; Valkey; RabbitMQ; S3-compatible objects; backups; restore procedures |

The registry includes 43 technology entries and 49 directional relationships. Technology selection exposes concise inputs and outputs first; advanced details explain limits such as readiness versus liveness and namespace versus physical isolation.

## Delivery and ownership

CI tests and scans source, builds and inspects an image, publishes it to GHCR, and opens a digest promotion proposal. The visitor's approval is a real UI action applied to simulated state. The proposal is separate from the desired-state branch Argo watches. A local bridge copies the reviewed content to the local registry, verifies availability, prepares manifests and publishes the desired revision to the local Git mirror. Argo CD reconciles that revision without needing the hosted runner to contact Kubernetes. This matches the separation described in [Argo CD's automated sync documentation](https://argo-cd.readthedocs.io/en/stable/user-guide/auto_sync/).

GHCR publication and local availability are separate states. Digests identify content; tags can move. Pull-through caches improve repeated pulls but do not approve releases or guarantee an uncached image is available offline. A disconnected cluster can use a prepared local registry and mirror; introducing a new remote artifact still requires a connected bridge or explicit offline transfer. See [GitHub Container registry](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry), [Kubernetes image digests](https://kubernetes.io/docs/concepts/containers/images/), and [Docker registry mirrors](https://docs.docker.com/docker-hub/image-library/mirror/).

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

Prometheus collects numeric metrics and evaluates the illustrated readiness alert. Alloy forwards workload logs to Loki; Grafana queries those sources. Alertmanager groups/deduplicates/routes alerts received from the rule evaluator, independently of Grafana. The final journey order is an inspection sequence. A seeded rollout failure can alert before that final inspection, and healthy delivery creates no invented incident. See [Prometheus](https://prometheus.io/docs/introduction/overview/), [Alloy Kubernetes logs](https://grafana.com/docs/alloy/latest/collect/logs-in-kubernetes/), [Loki](https://grafana.com/docs/loki/latest/get-started/overview/), and [Alertmanager](https://prometheus.io/docs/alerting/latest/alertmanager/).

PostgreSQL represents durable relational data; Valkey is used as a cache; RabbitMQ represents asynchronous work; S3-compatible storage represents objects. Publisher confirms and consumer acknowledgements have separate responsibilities, and consumers must tolerate redelivery. S3 compatibility describes an interface, not a requirement to use AWS. The optional recovery drill snapshots and validates simulated data in an isolated target; it does not confuse restoring data with reverting an image. See [PostgreSQL backup](https://www.postgresql.org/docs/current/backup.html), [Valkey](https://valkey.io/topics/), and [RabbitMQ acknowledgements](https://www.rabbitmq.com/docs/confirms).

Each technology's inspector includes its official reference. These references support the explanations; the running game never fetches them for simulation correctness. See [SIMULATION.md](SIMULATION.md) for commands, event timing, the 22 stages, failure scenarios and tests.
