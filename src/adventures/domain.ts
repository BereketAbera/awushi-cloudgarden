import type { ExpressionName } from '../game/types'
import type { SimulationState, StateField } from '../simulation/domain'
export type AdventureId = 'ship-release' | 'recover-pod' | 'fix-drift' | 'promote-production' | 'investigate-incident' | 'restore-backup'
export type AdventureVariant = 'transient' | 'image' | 'readiness' | 'resources' | 'manual' | 'self-heal'
export type AdventureCommand = { type: 'action'; actionId: string } | { type: 'hint' } | { type: 'set-hints'; enabled: boolean } | { type: 'cancel' }
export type Evidence = { id: string; title: string; stationId: string; timestamp: number; fields: StateField[] }
export type Decision = { actionId: string; label: string; timestamp: number; outcome: 'accepted' | 'rejected'; message: string }
export type AdventureSession = {
  version: 1; id: AdventureId; variant: AdventureVariant | null; status: 'active' | 'completed' | 'cancelled'
  clock: number; startedAt: number; completedAt: number | null; simulation: SimulationState
  rejectedDecisions: number; completedObjectives: string[]; evidence: Evidence[]; decisions: Decision[]
  feedback: { tone: 'neutral' | 'good' | 'warning' | 'bad'; message: string }
  hintLevel: number; hintsUsed: number; hintsEnabled: boolean; eventSequence: number
}
export type ObjectiveDefinition = { id: string; title: string; description: string; stationId: string; hints: readonly [string, string, string, string] }
export type MissionObjective = Omit<ObjectiveDefinition, 'hints'> & { completed: boolean }
export type AdventureAction = { id: string; label: string; description: string; stationId: string; kind: 'inspect' | 'decision' | 'repair' | 'verify'; enabled: boolean; reason?: string }
export type AdventureDefinition = {
  id: AdventureId; title: string; description: string; difficulty: 'Beginner' | 'Intermediate' | 'Advanced'; estimatedMinutes: number
  learningObjectives: readonly string[]; stationIds: readonly string[]; variants: readonly { id: AdventureVariant; label: string; description: string }[]
  objectives: readonly ObjectiveDefinition[]; misconceptions: readonly string[]; summary: string; technicalDetails: string
}
export type CompletionSummary = { title: string; whatHappened: string; rootCause: string | null; decisions: Decision[]; technologies: string[]; whyItWorked: string; misconceptions: readonly string[]; technicalDetails: string }
export type AdventureView = { objective: MissionObjective | null; objectives: MissionObjective[]; actions: AdventureAction[]; evidence: Evidence[]; hints: string[]; summary: CompletionSummary; stationId: string | null; progress: { completed: number; total: number }; waiting: boolean; reaction: ExpressionName }
