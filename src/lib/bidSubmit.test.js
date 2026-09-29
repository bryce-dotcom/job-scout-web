import { describe, it, expect } from 'vitest'
import { emailPacketPlan, remindersDue, needsReminder, shipByDate, labelLines } from './bidSubmit'

const MB = 1024 * 1024
const packet = [
  { kind: 'bid_form', file_name: 'form.pdf', storage_path: 'a', bytes: 2 * MB },
  { kind: 'cert:insurance', file_name: 'coi.pdf', storage_path: 'b', bytes: 30 * MB },
  { kind: 'combined', file_name: 'packet.pdf', storage_path: 'c', bytes: 28 * MB }, // merged and compressed: smaller than the parts
]

describe('what an email carries', () => {
  it('attaches every file when they fit under the cap', () => {
    const p = emailPacketPlan(packet, 40 * MB)
    expect(p.attach.map((x) => x.kind)).toEqual(['bid_form', 'cert:insurance'])
    expect(p.link).toEqual([])
  })
  it('attaches only the combined PDF when the parts do not fit but it does', () => {
    const p = emailPacketPlan(packet, 30 * MB) // parts are 32 MB, the combined PDF 28 MB
    expect(p.attach.map((x) => x.kind)).toEqual(['combined'])
    expect(p.link.map((x) => x.kind)).toEqual(['bid_form', 'cert:insurance'])
  })
  it('links everything when even the combined PDF is over', () => {
    const p = emailPacketPlan(packet, 10 * MB)
    expect(p.attach).toEqual([])
    expect(p.link.length).toBe(3)
  })
})

describe('reminders', () => {
  const now = new Date('2026-10-13T14:00:00Z')
  it('fire at 24 h and 4 h, once each, only while the bid is not in', () => {
    expect(remindersDue('2026-10-14T13:00:00Z', [], now)).toEqual([24])          // 23 h left
    expect(remindersDue('2026-10-14T13:00:00Z', [24], now)).toEqual([])          // already sent
    expect(remindersDue('2026-10-13T17:00:00Z', [24], now)).toEqual([4])         // 3 h left
    expect(remindersDue('2026-10-13T17:00:00Z', [], now)).toEqual([24, 4])       // both windows open, none sent
    expect(remindersDue('2026-10-16T13:00:00Z', [], now)).toEqual([])            // 71 h left
    expect(remindersDue('2026-10-13T13:00:00Z', [], now)).toEqual([])            // past due: no nagging
    expect(needsReminder({ status: 'approved' })).toBe(true)
    expect(needsReminder({ status: 'bounced' })).toBe(true)
    expect(needsReminder({ status: 'sent' })).toBe(false)
    expect(needsReminder({ status: 'confirmed' })).toBe(false)
  })
})

describe('a sealed bid in the mail', () => {
  it('ships two business days before it is due, skipping the weekend', () => {
    expect(shipByDate('2026-10-13T20:00:00Z').toISOString().slice(0, 10)).toBe('2026-10-09') // Tue → Fri
    expect(shipByDate('2026-10-14T20:00:00Z').toISOString().slice(0, 10)).toBe('2026-10-12') // Wed → Mon
  })
  it('labels the envelope the way the notice words it', () => {
    const l = labelLines({
      opportunity: { buyer: 'City of Ogden', solicitation_number: 'ITB 2026-114', title: 'LED Retrofit', submit_to: { address: '2549 Washington Blvd, Suite 510, Ogden, UT 84401' }, requirements: { label_text: 'ITB 2026-114 — LED Retrofit' } },
      company: { legal_name: 'Summit Field Company LLC', address: '412 Canyon Rd', city: 'Ogden', state: 'UT', zip: '84401' },
    })
    expect(l.to[0]).toBe('City of Ogden')
    expect(l.notice).toBe('ITB 2026-114 — LED Retrofit')
    expect(l.from[0]).toBe('Summit Field Company LLC')
    const bare = labelLines({ intake: { bid_number: 'RFQ 9', buyer: 'GSA' }, company: {} })
    expect(bare.notice).toBe('SEALED BID — RFQ 9 — DO NOT OPEN')
  })
})
