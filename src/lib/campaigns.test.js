import { describe, it, expect } from 'vitest'
import { newTouch, audienceLabel, campaignProblem, campaignNumbers, mergeText, touchesSummary, bookedCount, TEXT_MAX } from './campaigns'

describe('campaigns', () => {
  it('newTouch walks the default days and never goes backwards', () => {
    const a = newTouch([])
    expect(a.day).toBe(0)
    const b = newTouch([a])
    expect(b.day).toBe(3)
    const c = newTouch([a, { ...b, day: 10 }], 'text')
    expect(c.day).toBeGreaterThan(10)
    expect(c.kind).toBe('text')
  })

  it('audienceLabel reads like a sentence', () => {
    expect(audienceLabel({ kind: 'leads', ids: [1] })).toBe('1 person you picked')
    expect(audienceLabel({ kind: 'lead_status', status: 'Callback' })).toBe('Leads marked Callback')
    expect(audienceLabel({ kind: 'customers', months: 6 })).toMatch(/6 months/)
    expect(audienceLabel({})).toBe('Nobody yet')
  })

  it('touchesSummary says what goes out', () => {
    expect(touchesSummary([{ kind: 'email', day: 0 }])).toBe('1 email')
    expect(touchesSummary([{ kind: 'email', day: 0 }, { kind: 'text', day: 3 }, { kind: 'call', day: 7 }])).toBe('1 email, 1 text and 1 call over 7 days')
    expect(touchesSummary([])).toBe('no touches')
  })

  it('campaignProblem names the first thing to fix, per kind', () => {
    const aud = { kind: 'prospects' }
    expect(campaignProblem({})).toMatch(/name/)
    expect(campaignProblem({ name: 'x' })).toMatch(/who/)
    expect(campaignProblem({ name: 'x', audience: aud })).toMatch(/one touch/)
    expect(campaignProblem({ name: 'x', audience: aud, touches: [{ kind: 'email', day: 0, subject: '', body: 'hi' }] })).toMatch(/subject/)
    expect(campaignProblem({ name: 'x', audience: aud, touches: [{ kind: 'text', day: 0, body: '' }] })).toMatch(/something to say/)
    expect(campaignProblem({ name: 'x', audience: aud, touches: [{ kind: 'text', day: 0, body: 'x'.repeat(TEXT_MAX + 1) }] })).toMatch(/characters/)
    expect(campaignProblem({ name: 'x', audience: aud, touches: [{ kind: 'call', day: 0, body: '' }] })).toMatch(/caller/)
    expect(campaignProblem({ name: 'x', audience: aud, touches: [{ kind: 'email', day: 0, subject: 's', body: 'b' }, { kind: 'call', day: 0, body: 'b' }] })).toMatch(/after/)
    expect(campaignProblem({ name: 'x', audience: aud, touches: [{ kind: 'text', day: 0, body: 'Hi {{first_name}}' }, { kind: 'call', day: 2, body: 'Ask about the roof' }] })).toBe('')
  })

  it('campaignNumbers counts people, not events', () => {
    const n = campaignNumbers([
      { state: 'queued', touch_index: 0 }, { state: 'sent', touch_index: 1 }, { state: 'replied', touch_index: 1, replied_at: 'x' }, { state: 'unsubscribed', touch_index: 1 },
    ])
    expect(n).toMatchObject({ people: 4, sent: 3, replied: 1, unsubscribed: 1, waiting: 1 })
  })

  it('bookedCount reads the lead, not the campaign', () => {
    const members = [{ lead_id: 1 }, { lead_id: 2 }, { lead_id: 3 }, { customer_id: 9 }]
    const leads = { 1: { status: 'Appointment Set' }, 2: { status: 'Contacted', appointment_id: 44 }, 3: { status: 'New' } }
    expect(bookedCount(members, leads)).toBe(2)
  })

  it('mergeText fills the four fields and has a fallback for each', () => {
    expect(mergeText('Hi {{first_name}} at {{company}}, from {{our_company}}', { name: 'Dana Ruiz', company: 'Ruiz Roofing', our_company: 'HHH' })).toBe('Hi Dana at Ruiz Roofing, from HHH')
    expect(mergeText('Hi {{ first_name }}', {})).toBe('Hi there')
  })
})
