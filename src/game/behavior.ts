import type { Clip, ExpressionName } from './types'
export type BehaviorState = { inactiveFor: number; blockedFor: number; recoveringFor: number; wasBlocked: boolean }
export type BehaviorInput = { moving: boolean; blocked: boolean; running: boolean; nearby: boolean; reading: boolean; clip: Clip; reaction?: ExpressionName | null }
export const createBehavior = (): BehaviorState => ({ inactiveFor: 0, blockedFor: 0, recoveringFor: 0, wasBlocked: false })
export function stepBehavior(state: BehaviorState, input: BehaviorInput, dt: number): { state: BehaviorState; expression: ExpressionName } {
  const blockedFor = input.blocked && input.moving ? state.blockedFor + dt : 0
  const wasBlocked = blockedFor > .45
  const recoveringFor = state.wasBlocked && input.moving && !input.blocked ? 1.5 : Math.max(0, state.recoveringFor - dt)
  const inactiveFor = input.moving || input.reading || input.reaction ? 0 : state.inactiveFor + dt
  const next = { blockedFor, recoveringFor, inactiveFor, wasBlocked }
  const expression: ExpressionName = input.reaction ?? (input.reading ? 'Thinking' : input.clip === 'Celebrate' ? 'Celebrating' : wasBlocked ? 'Worried' : recoveringFor > 0 ? 'Determined' : inactiveFor > 22 ? 'Sleepy' : input.nearby ? 'Curious' : input.running && input.moving ? 'Excited' : input.moving ? 'Happy' : 'Neutral')
  return { state: next, expression }
}
