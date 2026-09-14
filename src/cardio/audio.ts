/**
 * Cue synthesis.
 *
 * Every cue is generated with OscillatorNodes, so there are no audio assets to
 * source, license, commit or fail to load. Speech was dropped deliberately:
 * `speechSynthesis` does not schedule on the audio clock, is throttled or
 * stopped when the tab loses focus, and on Chrome Android its boundary events
 * do not fire at all.
 *
 * Designed for a phone speaker across a noisy room, not for headphones:
 *
 *  - Fundamentals sit between 500Hz and 1.7kHz. A phone speaker rolls off
 *    badly below ~500Hz, and human hearing is most sensitive from 2-5kHz, so
 *    anything lower is thrown away by the hardware before it reaches the room.
 *  - Square waves rather than sines. A sine at phone-speaker volume is
 *    thin and disappears under a heavy bag; the odd harmonics of a square
 *    carry. A lowpass at 5kHz keeps that from turning into a buzz.
 *  - Attack is ~4ms. A slow fade-in reads as a soft chime and gets missed;
 *    a sharp transient cuts through.
 *
 * Start and end are deliberately opposite shapes - start ascends, end descends
 * - because mid-combo and not looking at the bench, the direction of the sound
 * is the only thing that says which way the transition went.
 */

export type CueKind = 'roundStart' | 'roundEnd' | 'warn10' | 'tick' | 'pause' | 'finish'

type Blip = {
  /** Seconds after the cue's own start. */
  at: number
  freq: number
  dur: number
  gain: number
}

const CUES: Record<CueKind, Blip[]> = {
  // Ascending pair: "go".
  roundStart: [
    { at: 0, freq: 880, dur: 0.16, gain: 1 },
    { at: 0.17, freq: 1320, dur: 0.34, gain: 1 },
  ],
  // Descending pair, longer and lower: "stop".
  roundEnd: [
    { at: 0, freq: 740, dur: 0.22, gain: 1 },
    { at: 0.23, freq: 494, dur: 0.5, gain: 1 },
  ],
  // Three fast high clicks - deliberately unlike either bell, so it is never
  // mistaken for a transition that has already happened.
  warn10: [
    { at: 0, freq: 1660, dur: 0.07, gain: 0.85 },
    { at: 0.13, freq: 1660, dur: 0.07, gain: 0.85 },
    { at: 0.26, freq: 1660, dur: 0.07, gain: 0.85 },
  ],
  // One blip. Used for the 3-2-1 into a round, in place of a spoken count.
  tick: [{ at: 0, freq: 1200, dur: 0.08, gain: 0.7 }],
  // Low and flat, unlike anything else: a stray glove that pauses the session
  // has to be audible, since you are not looking at the bench.
  pause: [
    { at: 0, freq: 520, dur: 0.14, gain: 0.9 },
    { at: 0.18, freq: 520, dur: 0.3, gain: 0.9 },
  ],
  finish: [
    { at: 0, freq: 880, dur: 0.16, gain: 1 },
    { at: 0.17, freq: 1108, dur: 0.16, gain: 1 },
    { at: 0.34, freq: 1320, dur: 0.7, gain: 1 },
  ],
}

/** Kept modest: the envelope peaks are summed, and clipping sounds broken. */
const MASTER_GAIN = 0.9

/**
 * Build the output chain once per context.
 *
 * The lowpass lives here rather than per-blip so a session's worth of
 * scheduled cues share one filter node instead of one each.
 */
export function createOutput(ctx: AudioContext): GainNode {
  const master = ctx.createGain()
  master.gain.value = MASTER_GAIN
  const lp = ctx.createBiquadFilter()
  lp.type = 'lowpass'
  lp.frequency.value = 5000
  master.connect(lp).connect(ctx.destination)
  return master
}

/**
 * Schedule one cue at an absolute AudioContext time.
 *
 * `when` is on `ctx.currentTime`'s clock, NOT `Date.now()`. That clock runs
 * independently of the main thread, which is the entire point: a frozen or
 * throttled main thread cannot make a scheduled cue late.
 *
 * Returns the oscillators so a pause or an early finish can stop them. Anything
 * still scheduled must be cancellable, or ending a session at round three
 * leaves twenty minutes of bells queued up.
 */
export function scheduleCue(
  ctx: AudioContext,
  out: GainNode,
  kind: CueKind,
  when: number,
): OscillatorNode[] {
  const started: OscillatorNode[] = []

  for (const b of CUES[kind]) {
    const t = when + b.at
    const osc = ctx.createOscillator()
    osc.type = 'square'
    osc.frequency.setValueAtTime(b.freq, t)

    const env = ctx.createGain()
    // Sharp attack, exponential decay. setValueAtTime(0) first, because
    // exponentialRampToValueAtTime cannot start from or reach exactly zero.
    env.gain.setValueAtTime(0.0001, t)
    env.gain.exponentialRampToValueAtTime(b.gain, t + 0.004)
    env.gain.exponentialRampToValueAtTime(0.0001, t + b.dur)

    osc.connect(env).connect(out)
    osc.start(t)
    osc.stop(t + b.dur + 0.02)
    started.push(osc)
  }
  return started
}

/**
 * Create or resume the AudioContext.
 *
 * Must be called from inside a user gesture: a context created outside one
 * starts `suspended` and stays silent with no error anywhere. This is why the
 * config screen has a test-sound button - it is the gesture that unlocks
 * audio, as well as the volume check.
 */
export async function ensureContext(existing?: AudioContext | null): Promise<AudioContext> {
  const ctx = existing ?? new AudioContext()
  if (ctx.state === 'suspended') await ctx.resume()
  return ctx
}

/** The config screen's "test sound" - plays each cue in turn, hands free. */
export async function playTestSequence(ctx: AudioContext, out: GainNode): Promise<void> {
  const t = ctx.currentTime + 0.05
  scheduleCue(ctx, out, 'roundStart', t)
  scheduleCue(ctx, out, 'warn10', t + 1.1)
  scheduleCue(ctx, out, 'roundEnd', t + 2.2)
  scheduleCue(ctx, out, 'tick', t + 3.5)
  scheduleCue(ctx, out, 'tick', t + 3.9)
  scheduleCue(ctx, out, 'tick', t + 4.3)
  scheduleCue(ctx, out, 'roundStart', t + 4.8)
}
