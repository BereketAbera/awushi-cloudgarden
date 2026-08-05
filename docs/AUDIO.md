# Local sound

All seven cues are original oscillator envelopes in `src/audio/sound.ts`: footsteps, interaction, build completion, deployment success, warning, error and celebration. There are no samples, music downloads or runtime audio requests. Change a cue's frequency, pitch endpoint, delay, duration or gain in `SOUND_PALETTE` to customize it.

First visits are muted at 35% volume. Settings exposes an opt-in checkbox and volume slider; both persist with the existing validated preferences. AudioContext is created/resumed only in a pointer or keyboard gesture after opt-in. A blocked or unsupported context leaves gameplay usable and reports its state in Settings. Opening the page alone produces no sound.

The hook owns one context and master gain, suspends hidden pages and removes listeners/closes the context on unmount. Each note has an exponential attack/release envelope, stops itself, disconnects its nodes and leaves the active voice set. The global limit is twelve voices. Per-cue cooldowns prevent repeated frame events or rapid clicks from creating bursts; footsteps are emitted only for actual player displacement and at most roughly four times per second. Replay is silent for recorded infrastructure cues, avoiding repeated success/failure announcements.

The app subscribes to typed build, success, failure and approval events, tracks their identities, and uses explicit interactions and character celebration for the other cues. Rendering does not schedule infrastructure actions. Volume changes use a short gain ramp. Muting suppresses new notes immediately and fades the master gain over 25ms.

`tests/audio.test.ts` checks finite bounded envelopes, polyphony/cooldown limits, normalization and silent initialization. `tests/browser/compatibility.spec.ts` exercises real opt-in, AudioContext readiness, released voices, mute and saved volume in the configured browser matrix. Headless checks verify scheduling and lifecycle; they are not a physical-speaker listening test.

The browser behavior follows [MDN's Web Audio best practices](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Best_practices), [autoplay guidance](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay), and [AudioContext.resume](https://developer.mozilla.org/en-US/docs/Web/API/AudioContext/resume). The palette and volume are intentionally restrained; there is no continuous background music.
