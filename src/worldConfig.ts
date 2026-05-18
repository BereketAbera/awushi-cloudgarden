/** Enable only after the generated environment assets pass validation. */
export const WORLD_ASSETS_READY = true
export const WORLD_ASSETS = {
  island: '/assets/island.glb',
  github: '/assets/github-workshop.glb',
  ci: '/assets/ci-factory.glb',
  kubernetes: '/assets/kubernetes-cluster.glb',
  props: '/assets/props.glb',
} as const

export type ZoneId = 'github' | 'ci' | 'kubernetes'
export type WorldZone = {
  id: ZoneId
  name: string
  subtitle: string
  position: [number, number, number]
  radius: number
  description: string
  steps: { label: string; detail: string }[]
}

export const WORLD_ZONES: WorldZone[] = [
  {
    id: 'github', name: 'GitHub workshop', subtitle: 'Good ideas grow together.',
    position: [-4.5, 0, -3], radius: 1.75,
    description: 'A home for your source code, where a small idea becomes a shared contribution.',
    steps: [
      { label: 'Branch', detail: 'Start an isolated branch to work on a change without disrupting the main code.' },
      { label: 'Commit', detail: 'Save a meaningful snapshot with a message explaining what changed and why.' },
      { label: 'Pull request', detail: 'Invite review, discuss the change, and merge after checks and feedback are resolved.' },
    ],
  },
  {
    id: 'ci', name: 'CI factory', subtitle: 'Small changes. Reliable deliveries.',
    position: [4.5, 0, -3], radius: 1.75,
    description: 'Every new change passes through an automated assembly line before it reaches users.',
    steps: [
      { label: 'Build', detail: 'Turn the source code into a reproducible application artifact.' },
      { label: 'Test', detail: 'Run checks automatically so mistakes are found while a change is still small.' },
      { label: 'Deploy', detail: 'Release the tested artifact to its environment with the appropriate approvals.' },
    ],
  },
  {
    id: 'kubernetes', name: 'Kubernetes cluster', subtitle: 'A little order in a busy world.',
    position: [0, 0, -6], radius: 1.75,
    description: 'A cluster gives applications a home and keeps their desired running state in balance.',
    steps: [
      { label: 'Pods', detail: 'The smallest deployable units hold one or more cooperating containers.' },
      { label: 'Deployment', detail: 'Describe the desired replicas and rollout strategy; controllers reconcile that state.' },
      { label: 'Service', detail: 'Give changing pods a stable network address so other applications can reach them.' },
    ],
  },
]
