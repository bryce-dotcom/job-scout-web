import { describe, it, expect } from 'vitest'
import {
  ACCESS_DEFAULTS, STOREYS, liftDecision, installHours, accessLines, accessWarning,
} from './chrisAccess'

// Bryce: "look to see if its a two story or if a lift will be needed".
// The feet are not the job — the same 180 ft is a morning off a step ladder
// or a day with a lift. Antonino's labor rate is $75/hr.

describe('when a lift is actually needed', () => {
  it('three storeys always, because no ladder reaches', () => {
    const d = liftDecision({ storeys: '3+' })
    expect(d.lift).toBe(true)
    expect(d.certain).toBe(true)
  })

  it('two storeys alone does NOT need one', () => {
    // Plenty of installers do a second storey off a 28ft extension ladder.
    // Pricing a lift into every two-storey loses the job.
    const d = liftDecision({ storeys: '2' })
    expect(d.lift).toBe(false)
    expect(d.why).toMatch(/off ladders/)
  })

  it('needs one when the ladder cannot be FOOTED, whatever the height', () => {
    const d = liftDecision({ storeys: '1', obstructions: ['conservatory below the eave'] })
    expect(d.lift).toBe(true)
    expect(d.certain).toBe(true)
    expect(d.why).toMatch(/conservatory below the eave/)
  })

  it('two storeys on a steep pitch is a lift, but not a confident one', () => {
    const d = liftDecision({ storeys: '2', pitch: 'steep' })
    expect(d.lift).toBe(true)
    expect(d.certain).toBe(false)
  })

  it('an unsure read asks, rather than guessing either way', () => {
    // Guessing cheap loses money; guessing dear loses the job.
    const d = liftDecision({ storeys: 'unsure' })
    expect(d.certain).toBe(false)
    expect(d.why).toMatch(/check on site/)
    expect(accessWarning(d)).toMatch(/guess until someone confirms/)
  })

  it('says nothing when it is sure', () => {
    expect(accessWarning(liftDecision({ storeys: '1' }))).toBe(null)
  })

  it('offers the heights a person can pick', () => {
    expect(STOREYS).toEqual(['1', '2', '3+', 'unsure'])
  })
})

describe('how long it takes', () => {
  it('is feet over the crew rate on a single storey', () => {
    // 180 ft at 40 ft/hr
    expect(installHours({ feet: 180, storeys: '1' })).toBe(4.5)
  })

  it('takes longer upstairs', () => {
    expect(installHours({ feet: 180, storeys: '2' })).toBe(7.2)   // x1.6
  })

  it('takes longer again on a steep pitch', () => {
    expect(installHours({ feet: 180, storeys: '2', pitch: 'steep' })).toBe(9)  // x1.6 x1.25
  })

  it('uses the company own rates over the starters', () => {
    expect(installHours({ feet: 180, storeys: '1', rates: { install_ft_per_hour: 60 } })).toBe(3)
  })

  it('is zero rather than Infinity when nothing is configured', () => {
    expect(installHours({ feet: 180, storeys: '1', rates: { install_ft_per_hour: 0 } })).toBe(0)
    expect(installHours({})).toBe(0)
  })
})

describe('what access adds to the estimate', () => {
  const LABOR = 75   // what Antonino was set to

  it('adds NOTHING on a single storey', () => {
    // The per-foot rate already covers it, and a zero line is noise.
    expect(accessLines({ feet: 180, storeys: '1', laborRate: LABOR })).toEqual([])
  })

  it('charges only the EXTRA hours upstairs, not the whole job twice', () => {
    const [line] = accessLines({ feet: 180, storeys: '2', laborRate: LABOR })
    expect(line.item_name).toBe('Height and access')
    expect(line.quantity).toBe(2.7)          // 7.2 upstairs - 4.5 flat
    expect(line.price).toBe(75)
    expect(line.description).toMatch(/Two-storey work/)
  })

  it('names a lift and what it is for', () => {
    const lines = accessLines({ feet: 180, storeys: '3+', laborRate: LABOR })
    const lift = lines.find((l) => l.item_name === 'Lift hire')
    expect(lift.price).toBe(ACCESS_DEFAULTS.lift_day_rate + ACCESS_DEFAULTS.lift_delivery)
    expect(lift.description).toMatch(/no ladder reaches/i)
  })

  it('bills a lift for an obstruction even on a bungalow', () => {
    const lines = accessLines({ feet: 120, storeys: '1', obstructions: ['flat roof over the porch'], laborRate: LABOR })
    expect(lines.map((l) => l.item_name)).toContain('Lift hire')
  })

  it('leaves the labour line off when the company has no rate', () => {
    // Better a missing line than a line priced at zero.
    const lines = accessLines({ feet: 180, storeys: '2', laborRate: 0 })
    expect(lines.find((l) => l.item_name === 'Height and access')).toBeUndefined()
  })

  it('honours the company own lift rates', () => {
    const lines = accessLines({ feet: 180, storeys: '3+', laborRate: LABOR, rates: { lift_day_rate: 500, lift_delivery: 0 } })
    expect(lines.find((l) => l.item_name === 'Lift hire').price).toBe(500)
  })
})
