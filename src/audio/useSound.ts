import { useEffect, useRef } from 'react'
import { LocalSound, type SoundPreferences } from './sound'

export function useSound(preferences: SoundPreferences) {
  const sound = useRef<LocalSound | null>(null)
  if (!sound.current) sound.current = new LocalSound()
  const engine = sound.current
  useEffect(() => { engine.configure(preferences) }, [engine, preferences])
  useEffect(() => {
    const gesture = () => { void engine.unlock() }
    const visibility = () => { if (document.hidden) engine.suspend() }
    window.addEventListener('pointerdown', gesture); window.addEventListener('keydown', gesture)
    document.addEventListener('visibilitychange', visibility)
    return () => { window.removeEventListener('pointerdown', gesture); window.removeEventListener('keydown', gesture); document.removeEventListener('visibilitychange', visibility); engine.dispose() }
  }, [engine])
  return engine
}
