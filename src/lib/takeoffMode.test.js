import { describe, it, expect } from 'vitest'
import { startsTakeoff, endsTakeoff, joinSegments } from './takeoffMode'

describe('starting a takeoff', () => {
  it('recognises the ways people actually say it', () => {
    for (const s of ['takeoff mode', 'take off mode', 'silent mode', 'quiet mode',
      'be quiet', 'just listen', 'start the takeoff', "i'm counting"]) {
      expect(startsTakeoff(s).hit, s).toBeTruthy()
    }
  })

  it('keeps whatever they said after it', () => {
    // They will not wait for a confirmation before starting to count.
    const { hit, rest } = startsTakeoff('Takeoff mode — back room, four highbays')
    expect(hit).toBeTruthy()
    expect(rest).toBe('back room four highbays')
  })

  it('does not arm itself from a passing mention', () => {
    // "I'll put my phone in silent mode later" is not a takeoff.
    expect(startsTakeoff('I will put my phone in silent mode later').hit).toBeNull()
    expect(startsTakeoff('remind me to be quiet in the meeting tomorrow').hit).toBeNull()
  })

  it('ignores punctuation and case', () => {
    expect(startsTakeoff('TAKEOFF MODE.').hit).toBeTruthy()
  })
})

describe('finishing a takeoff', () => {
  it('ends on the phrases people use', () => {
    for (const s of ["that's it", 'im done', 'all done', 'send it', 'go ahead', 'finished']) {
      expect(endsTakeoff(s).hit, s).toBeTruthy()
    }
  })

  it('only counts at the END, so a rep mid-count keeps going', () => {
    // THE failure that would lose a building: "that's it for the back room,
    // now the warehouse" is somebody still working.
    expect(endsTakeoff("that's it for the back room, now the warehouse").hit).toBeNull()
    expect(endsTakeoff('done with the back room, moving on').hit).toBeNull()
  })

  it('keeps the words that came before the phrase', () => {
    const { hit, rest } = endsTakeoff('two wall packs by the door, that\'s it')
    expect(hit).toBeTruthy()
    expect(rest).toBe('two wall packs by the door')
  })

  it('a bare end phrase leaves nothing behind', () => {
    expect(endsTakeoff("that's it").rest).toBe('')
  })
})

describe('stitching speech across long pauses', () => {
  // The browser restarts recognition on every silence and starts its results
  // over. Without this the earlier rooms vanish — and silences are the entire
  // point of this mode.
  it('carries earlier speech forward', () => {
    expect(joinSegments('back room four highbays', 'warehouse twelve highbays'))
      .toBe('back room four highbays warehouse twelve highbays')
  })

  it('does not count the same fixtures twice when a restart repeats the tail', () => {
    expect(joinSegments('back room four highbays', 'four highbays and two wall packs'))
      .toBe('back room four highbays and two wall packs')
  })

  it('drops a restart that repeats everything', () => {
    expect(joinSegments('back room four highbays', 'four highbays')).toBe('back room four highbays')
  })

  it('handles the empty cases', () => {
    expect(joinSegments('', 'first words')).toBe('first words')
    expect(joinSegments('already here', '')).toBe('already here')
    expect(joinSegments('', '')).toBe('')
  })

  it('does not merge on a short coincidence', () => {
    // Two rooms that both start "and" must not be glued into one.
    expect(joinSegments('front office and', 'and the hallway'))
      .toBe('front office and and the hallway')
  })
})
