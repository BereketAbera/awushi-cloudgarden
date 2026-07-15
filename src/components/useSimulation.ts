import { useCallback, useEffect, useState } from 'react'
import { createSimulation, reduceSimulation, tickSimulation } from '../simulation/engine'
import type { SimulationCommand } from '../simulation/domain'

/** The domain clock advances independently of the WebGL frame loop. */
export function useSimulation() {
  const [state, setState] = useState(createSimulation)
  const active = state.status === 'running' || state.status === 'retrying'
  useEffect(() => {
    if (!active) return
    const timer = window.setInterval(() => setState(previous => tickSimulation(previous, performance.now())), 100)
    return () => window.clearInterval(timer)
  }, [active])
  const dispatch = useCallback((command: SimulationCommand) => {
    setState(previous => reduceSimulation(previous, command, performance.now()))
  }, [])
  return { state, dispatch }
}
