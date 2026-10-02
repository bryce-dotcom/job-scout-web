// A music bed the app makes itself, so there is nothing to license.
//
// Three moods, synthesised with plain Web Audio into an AudioBuffer: a pad
// playing a four-chord progression, a bass note under it, and for the
// upbeat mood a soft kick and hat. It is a bed, not a track: it sits under
// the headline and the voice and gets out of the way. A company that owns
// a licensed track can upload it instead (StoryboardMaker, "Your track").
//
// Pure helpers (progression, schedule) are tested; the synthesis needs a
// browser.

export const MOODS = {
  calm:   { label: 'Calm',   bpm: 72,  drums: false, key: 'D',  progression: ['I', 'V', 'vi', 'IV'], pad: 'triangle', cutoff: 1400 },
  upbeat: { label: 'Upbeat', bpm: 112, drums: true,  key: 'G',  progression: ['I', 'IV', 'vi', 'V'], pad: 'sawtooth', cutoff: 2200 },
  bold:   { label: 'Bold',   bpm: 84,  drums: true,  key: 'E',  progression: ['vi', 'IV', 'I', 'V'], pad: 'square',   cutoff: 1100 },
}

const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 }
const MAJOR = [0, 2, 4, 5, 7, 9, 11]
const DEGREE = { I: 0, ii: 1, iii: 2, IV: 3, V: 4, vi: 5 }

export const midiToHz = (m) => 440 * Math.pow(2, (m - 69) / 12)

// Chord tones (midi) for a roman-numeral degree in a major key, root around C3-C4.
export function chordMidi(key, degree, octave = 3) {
  const root = NOTE[key] ?? 0
  const d = DEGREE[degree] ?? 0
  const minor = /^[iv]+$/.test(degree) // lower-case numerals are minor
  const base = 12 * (octave + 1) + root + MAJOR[d]
  return [base, base + (minor ? 3 : 4), base + 7]
}

// When each chord starts and how long it lasts, to fill `seconds`. One bar
// per chord; the last chord is shortened to land exactly on the end.
export function schedule(mood, seconds) {
  const m = MOODS[mood] || MOODS.calm
  const bar = (60 / m.bpm) * 4
  const out = []
  let t = 0, i = 0
  while (t < seconds - 0.01) {
    const len = Math.min(bar, seconds - t)
    out.push({ t: +t.toFixed(3), len: +len.toFixed(3), chord: m.progression[i % m.progression.length] })
    t += len; i++
  }
  return out
}

export async function renderMusicBed({ mood = 'calm', seconds = 15, gain = 1 } = {}) {
  const m = MOODS[mood] || MOODS.calm
  const sr = 44100
  const total = Math.max(1, seconds)
  const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext
  const ctx = new OAC(2, Math.ceil(sr * total), sr)
  const master = ctx.createGain(); master.gain.value = 0.9 * gain
  const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -18; comp.ratio.value = 3
  master.connect(comp); comp.connect(ctx.destination)
  const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = m.cutoff; lp.Q.value = 0.7
  lp.connect(master)

  // Fade in over 0.8 s and out over the last 1.5 s.
  master.gain.setValueAtTime(0, 0)
  master.gain.linearRampToValueAtTime(0.9 * gain, 0.8)
  master.gain.setValueAtTime(0.9 * gain, Math.max(0.8, total - 1.5))
  master.gain.linearRampToValueAtTime(0, total)

  for (const step of schedule(mood, total)) {
    const tones = chordMidi(m.key, step.chord, 3)
    // pad: three detuned voices per tone
    for (const midi of tones) {
      for (const det of [-6, 0, 6]) {
        const o = ctx.createOscillator(); o.type = m.pad; o.frequency.value = midiToHz(midi); o.detune.value = det
        const g = ctx.createGain(); g.gain.setValueAtTime(0, step.t)
        g.gain.linearRampToValueAtTime(0.045, step.t + 0.25)
        g.gain.setValueAtTime(0.045, step.t + step.len - 0.2)
        g.gain.linearRampToValueAtTime(0, step.t + step.len)
        o.connect(g); g.connect(lp); o.start(step.t); o.stop(step.t + step.len + 0.05)
      }
    }
    // bass: root an octave down, plucked twice a bar
    const bassHz = midiToHz(tones[0] - 12)
    const hits = m.drums ? [0, step.len / 2] : [0]
    for (const h of hits) {
      if (h >= step.len) continue
      const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = bassHz
      const g = ctx.createGain(); const t0 = step.t + h
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.18, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + Math.min(1.2, step.len - h))
      o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + Math.min(1.25, step.len - h + 0.05))
    }
    // drums: kick on 1 and 3, hat on the 8ths
    if (m.drums) {
      const beat = step.len / 4
      for (let b = 0; b < 4; b++) {
        const t0 = step.t + b * beat
        if (b % 2 === 0) {
          const o = ctx.createOscillator(); o.type = 'sine'
          o.frequency.setValueAtTime(140, t0); o.frequency.exponentialRampToValueAtTime(45, t0 + 0.12)
          const g = ctx.createGain(); g.gain.setValueAtTime(0.5, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.25)
          o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + 0.3)
        }
        for (const off of [0, beat / 2]) {
          const th = t0 + off
          const len = 0.04
          const buf = ctx.createBuffer(1, Math.ceil(sr * len), sr)
          const d = buf.getChannelData(0)
          for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length)
          const src = ctx.createBufferSource(); src.buffer = buf
          const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 6000
          const g = ctx.createGain(); g.gain.value = off === 0 ? 0.12 : 0.07
          src.connect(hp); hp.connect(g); g.connect(master); src.start(th)
        }
      }
    }
  }
  return ctx.startRendering()
}

// Decode an uploaded track (the company's own, licensed) to a buffer cut
// to length with a fade-out.
export async function decodeTrack(arrayBuffer, seconds) {
  const AC = window.AudioContext || window.webkitAudioContext
  const ac = new AC()
  const full = await ac.decodeAudioData(arrayBuffer.slice(0))
  const sr = full.sampleRate
  const n = Math.min(full.length, Math.ceil(sr * seconds))
  const out = ac.createBuffer(full.numberOfChannels, n, sr)
  const fade = Math.min(n, Math.floor(sr * 1.5))
  for (let ch = 0; ch < full.numberOfChannels; ch++) {
    const src = full.getChannelData(ch), dst = out.getChannelData(ch)
    for (let i = 0; i < n; i++) dst[i] = src[i] * (i > n - fade ? (n - i) / fade : 1)
  }
  try { await ac.close() } catch { /* ignore */ }
  return out
}
