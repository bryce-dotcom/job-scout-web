import { describe, it, expect } from 'vitest'
import { MOODS, chordMidi, schedule, midiToHz } from './musicBed'

describe('musicBed planning', () => {
  it('has three moods with tempos', () => {
    expect(Object.keys(MOODS)).toEqual(['calm', 'upbeat', 'bold'])
    expect(MOODS.upbeat.bpm).toBeGreaterThan(MOODS.calm.bpm)
  })
  it('spells chords in the key: major and minor degrees', () => {
    expect(chordMidi('C', 'I', 3)).toEqual([48, 52, 55])       // C E G
    expect(chordMidi('C', 'vi', 3)).toEqual([57, 60, 64])      // A C E
    expect(chordMidi('G', 'V', 3)).toEqual([62, 66, 69])       // D F# A
  })
  it('fills the length exactly, one bar per chord, last bar shortened', () => {
    const s = schedule('calm', 15) // 72 bpm → 3.333 s bars
    const total = s.reduce((n, x) => n + x.len, 0)
    expect(Math.abs(total - 15)).toBeLessThan(0.01)
    expect(s.map((x) => x.chord).slice(0, 4)).toEqual(['I', 'V', 'vi', 'IV'])
    expect(s[s.length - 1].len).toBeLessThan(s[0].len)
  })
  it('tunes A4 to 440', () => {
    expect(midiToHz(69)).toBe(440)
    expect(Math.round(midiToHz(60))).toBe(262)
  })
})
