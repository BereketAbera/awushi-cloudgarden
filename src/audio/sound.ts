/** Original, locally synthesized sound palette. No samples, downloads or audio network calls. */
export type SoundCue = 'step' | 'interaction' | 'build' | 'success' | 'warning' | 'error' | 'celebration'
export type SoundPreferences = { muted: boolean; volume: number }
type Note = { frequency: number; end?: number; delay: number; duration: number; gain: number; type?: OscillatorType }
export const SOUND_PALETTE: Record<SoundCue, readonly Note[]> = {
  step: [{ frequency: 150, end: 75, delay: 0, duration: .055, gain: .04 }],
  interaction: [{ frequency: 580, end: 780, delay: 0, duration: .1, gain: .08 }],
  build: [{ frequency: 440, delay: 0, duration: .13, gain: .07 }, { frequency: 660, delay: .11, duration: .18, gain: .07 }],
  success: [523, 659, 784].map((frequency, index) => ({ frequency, delay: index * .09, duration: .23, gain: .065 })),
  warning: [{ frequency: 370, end: 320, delay: 0, duration: .17, gain: .07, type: 'triangle' }],
  error: [{ frequency: 220, end: 165, delay: 0, duration: .22, gain: .07, type: 'triangle' }],
  celebration: [523, 659, 784, 1047].map((frequency, index) => ({ frequency, delay: index * .085, duration: .24, gain: .055 })),
}
const intervals: Record<SoundCue, number> = { step: .24, interaction: .18, build: .6, success: 1.5, warning: .8, error: .8, celebration: 1.5 }
export const MAX_VOICES = 12
export function cueAllowed(cue: SoundCue, now: number, last: number | undefined, voices: number) {
  return Number.isFinite(now) && (last === undefined || now - last >= intervals[cue]) && voices + SOUND_PALETTE[cue].length <= MAX_VOICES
}
export function normalizeSound(value: Partial<SoundPreferences>): SoundPreferences {
  return { muted: typeof value.muted === 'boolean' ? value.muted : true, volume: typeof value.volume === 'number' && Number.isFinite(value.volume) ? Math.min(1, Math.max(0, value.volume)) : .35 }
}

export class LocalSound {
  private context: AudioContext | null = null
  private master: GainNode | null = null
  private voices = new Set<OscillatorNode>()
  private last = new Map<SoundCue, number>()
  private preferences: SoundPreferences = { muted: true, volume: .35 }
  played = 0
  unavailable = false
  get status() { return this.unavailable ? 'unavailable' : this.preferences.muted ? 'muted' : this.context?.state === 'running' ? 'ready' : 'waiting for interaction' }
  get voiceCount() { return this.voices.size }
  configure(preferences: SoundPreferences) {
    this.preferences = normalizeSound(preferences)
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.preferences.muted ? 0 : this.preferences.volume, this.context.currentTime, .025)
  }
  /** Call only from a pointer/keyboard gesture. Starting the page creates no AudioContext. */
  async unlock() {
    if (this.preferences.muted || this.unavailable) return
    try {
      if (!this.context) {
        this.context = new AudioContext()
        this.master = this.context.createGain()
        this.master.gain.value = this.preferences.volume
        this.master.connect(this.context.destination)
      }
      if (this.context.state === 'suspended') await this.context.resume()
    } catch { this.unavailable = true }
  }
  play(cue: SoundCue) {
    const context = this.context, master = this.master
    if (!context || !master || context.state !== 'running' || this.preferences.muted || this.preferences.volume <= 0) return false
    const now = context.currentTime
    if (!cueAllowed(cue, now, this.last.get(cue), this.voices.size)) return false
    this.last.set(cue, now); this.played++
    for (const note of SOUND_PALETTE[cue]) {
      const oscillator = context.createOscillator(), envelope = context.createGain(), at = now + note.delay
      oscillator.type = note.type ?? 'sine'
      oscillator.frequency.setValueAtTime(note.frequency, at)
      oscillator.frequency.exponentialRampToValueAtTime(note.end ?? note.frequency, at + note.duration)
      envelope.gain.setValueAtTime(.0001, at)
      envelope.gain.exponentialRampToValueAtTime(note.gain, at + .008)
      envelope.gain.exponentialRampToValueAtTime(.0001, at + note.duration)
      oscillator.connect(envelope); envelope.connect(master); this.voices.add(oscillator)
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); this.voices.delete(oscillator) }
      oscillator.start(at); oscillator.stop(at + note.duration + .01)
    }
    return true
  }
  suspend() { if (this.context?.state === 'running') void this.context.suspend().catch(() => {}) }
  dispose() {
    for (const voice of this.voices) { try { voice.stop() } catch { /* Already ended. */ } }
    this.voices.clear(); this.last.clear()
    if (this.context) void this.context.close().catch(() => {})
    this.context = null; this.master = null
  }
}
