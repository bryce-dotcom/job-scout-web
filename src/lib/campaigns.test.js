import { describe, it, expect } from 'vitest'
import { newTouch, audienceLabel, campaignProblem, campaignNumbers, mergeText } from './campaigns'

describe('campaigns', () => {
  it('newTouch walks the default days and never goes backwards', () => {
    const a = newTouch([])
    expect(a.day).toBe(0)
    const b = newTouch([a])
    expect(b.day).toBe(3)
    const c = newTouch([a, { ...b, day: 10 }])
    expect(c.day).toBeGreaterThan(10)
  })

  it('audienceLabel reads like a sentence', () => {
    expect(audienceLabel({ kind: 'leads', ids: [1] })).toBe('1 person you picked')
    expect(audienceLabel({ kind: 'lead_status', status: 'Callback' })).toBe('Leads marked Callback')
    expect(audienceLabel({ kind: 'customers', months: 6 })).toMatch(/6 months/)
    expect(audienceLabel({})).toBe('Nobody yet')
  })

  it('campaignProblem names the first thing to fix', () => {
    expect(campaignProblem({})).toMatch(/name/)
    expect(campaignProblem({ name: 'x' })).toMatch(/who/)
    expect(campaignProblem({ name: 'x', audience: { kind: 'prospects' } })).toMatch(/one email/)
    expect(campaignProblem({ name: 'x', audience: { kind: 'prospects' }, touches: [{ kind: 'email', day: 0, subject: '', body: 'hi' }] })).toMatch(/subject/)
    expect(campaignProblem({ name: 'x', audience: { kind: 'prospects' }, touches: [{ kind: 'email', day: 0, subject: 's', body: 'b' }, { kind: 'email', day: 0, subject: 's', body: 'b' }] })).toMatch(/after/)
    expect(campaignProblem({ name: 'x', audience: { kind: 'prospects' }, touches: [{ kind: 'email', day: 0, subject: 's', body: 'b' }] })).toBe('')
  })

  it('campaignNumbers counts people, not events', () => {
    const n = campaignNumbers([
      { state: 'queued', touch_index: 0 }, { state: 'sent', touch_index: 1 }, { state: 'replied', touch_index: 1, replied_at: 'x' }, { state: 'unsubscribed', touch_index: 1 },
    ])
    expect(n).toMatchObject({ people: 4, sent: 3, replied: 1, unsubscribed: 1, waiting: 1 })
  })

  it('mergeText fills the four fields and has a fallback for each', () => {
    expect(mergeText('Hi {{first_name}} at {{company}}, from {{our_company}}', { name: 'Dana Ruiz', company: 'Ruiz Roofing', our_company: 'HHH' })).toBe('Hi Dana at Ruiz Roofing, from HHH')
    expect(mergeText('Hi {{ first_name }}', {})).toBe('Hi there')
  })
})
