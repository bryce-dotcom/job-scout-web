import { describe, it, expect } from 'vitest'
import { estimateKickoff } from './arnieEstimate'

describe('what Arnie hears when the button is pressed', () => {
  it('asks for a new estimate from a description, and to ask before drafting', () => {
    const k = estimateKickoff()
    expect(k).toMatch(/^Let's build an estimate\./)
    expect(k).toMatch(/price book/)
    expect(k).toMatch(/ask me before you draft/i)
  })
  it('names who it is for when the page knows', () => {
    expect(estimateKickoff({ forLabel: 'Precision Diesel' })).toMatch(/^Let's build an estimate for Precision Diesel\./)
  })
  it('fills the empty draft the rep is looking at, by its number and id', () => {
    const k = estimateKickoff({ forLabel: 'Precision Diesel', estimateRef: 'EST-5112', estimateId: 5112 })
    expect(k).toMatch(/^Fill estimate EST-5112 \(#5112\) for Precision Diesel\./)
    expect(k).toMatch(/into that estimate/)
    expect(estimateKickoff({ estimateId: 77 })).toMatch(/^Fill estimate #77 \(#77\)\./)
  })
})
