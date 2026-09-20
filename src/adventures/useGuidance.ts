import { useCallback, useEffect, useRef, useState } from 'react'
import type { AdventureSession } from './domain'
import { createStuckState, dismissStuckHelp, GUIDANCE_STORAGE_KEY, parseGuidancePreferences, shouldOfferHelp, updateStuckState, type GuidancePreferences, type StuckContext } from './guidance'
export function useGuidance(session: AdventureSession | null, attemptId: string, context: Omit<StuckContext, 'mode'>) {
  const [preferences, setPreferences] = useState<GuidancePreferences>(() => { try { return parseGuidancePreferences(localStorage.getItem(GUIDANCE_STORAGE_KEY)) } catch { return parseGuidancePreferences(null) } })
  const [storageIssue, setStorageIssue] = useState(false)
  const [offer, setOffer] = useState(false)
  const latest = useRef({ session, attemptId, context, preferences }); latest.current = { session, attemptId, context, preferences }
  const tracker = useRef<ReturnType<typeof createStuckState> | null>(null)
  useEffect(() => { try { localStorage.setItem(GUIDANCE_STORAGE_KEY, JSON.stringify(preferences)); setStorageIssue(false) } catch { setStorageIssue(true) } }, [preferences])
  const interaction = useRef<{ id: number; related: boolean } | undefined>(undefined)
  const observe = useCallback(() => {
      const current = latest.current, s = current.session
      if (!s || s.status !== 'active') { setOffer(false); return }
      const observation = { objectiveKey: `${current.attemptId}:${s.completedObjectives.join(',')}`, progressKey: `${s.completedObjectives.join(',')}:${s.evidence.map(e => e.id).sort().join(',')}`, nowMs: performance.now(), invalidCount: s.rejectedDecisions, interaction: interaction.current }
      const settings = { ...current.context, mode: current.preferences.mode, visible: !document.hidden }
      tracker.current = tracker.current ? updateStuckState(tracker.current, observation, settings) : createStuckState(observation)
      setOffer(shouldOfferHelp(tracker.current, settings, observation.nowMs))
  }, [])
  useEffect(() => { observe() }, [observe, attemptId, session?.eventSequence, context.running, context.replaying, context.cinematic, context.waiting, preferences.mode])
  useEffect(() => { const timer = window.setInterval(observe, 1000); return () => window.clearInterval(timer) }, [observe])
  const dismiss = () => { if (tracker.current) tracker.current = dismissStuckHelp(tracker.current); setOffer(false) }
  const dismissStorageIssue = useCallback(() => setStorageIssue(false), [])
  return { preferences, setPreferences, offer, dismiss, storageIssue, dismissStorageIssue, registerVisit: (related: boolean) => { interaction.current = { id: (interaction.current?.id ?? 0) + 1, related }; observe() } }
}
