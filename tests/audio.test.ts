import test from 'node:test'
import assert from 'node:assert/strict'
import { cueAllowed, MAX_VOICES, normalizeSound, SOUND_PALETTE, LocalSound } from '../src/audio/sound.ts'

test('all original sound envelopes are short, bounded and finite', () => {
  assert.equal(Object.keys(SOUND_PALETTE).length, 7)
  for (const notes of Object.values(SOUND_PALETTE)) for (const note of notes) {
    assert.ok(note.frequency >= 75 && note.frequency <= 1200)
    assert.ok(note.duration > .008 && note.delay + note.duration < .6)
    assert.ok(note.gain > 0 && note.gain <= .08)
  }
})
test('sound gate prevents overlap bursts and footsteps cannot exceed walking cadence', () => {
  assert.equal(cueAllowed('step', 1, .8, 0), false)
  assert.equal(cueAllowed('step', 1, .7, 0), true)
  assert.equal(cueAllowed('celebration', 3, undefined, MAX_VOICES - 3), false)
  assert.equal(cueAllowed('error', NaN, undefined, 0), false)
})
test('audio stays silent before a gesture and mute is the safe first-visit preference', () => {
  assert.deepEqual(normalizeSound({}), { muted: true, volume: .35 })
  assert.deepEqual(normalizeSound({muted: false, volume: 8}), { muted: false, volume: 1 })
  const audio = new LocalSound()
  assert.equal(audio.status, 'muted'); assert.equal(audio.play('success'), false)
  audio.configure({ muted:false,volume:.4 })
  assert.equal(audio.status, 'waiting for interaction'); assert.equal(audio.play('success'), false)
  audio.dispose(); assert.equal(audio.voiceCount, 0)
})
