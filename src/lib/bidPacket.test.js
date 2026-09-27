import { describe, it, expect } from 'vitest'
import { certificateItems, seedChecklist, autoDoneChecklist, submitReadiness, sortPacket, approvalSentence } from './bidPacket'

const company = {
  company_name: 'Summit Field Co',
  insurance_cert_url: 'docs/coi.pdf', insurance_expiration: '2026-12-31',
  workers_comp_cert_url: 'docs/wc.pdf', workers_comp_expiration: '2026-10-01',
  w9_url: 'docs/w9.pdf', business_license_url: null, bond_cert_url: null,
}
const due = '2026-10-14T20:00:00Z'

describe('certificates', () => {
  it('knows which are on file and which expire before the bid is due', () => {
    const c = Object.fromEntries(certificateItems(company, due).map((x) => [x.key, x]))
    expect(c.insurance.present && !c.insurance.expiredAtDue).toBe(true)
    expect(c.workers_comp.present).toBe(true)
    expect(c.workers_comp.expiredAtDue).toBe(true) // 10/01 < 10/14
    expect(c.business_license.present).toBe(false)
  })
})

describe('the checklist', () => {
  const requirements = { checklist: [
    { key: 'bond', item: 'Bid bond, 5%', required: true, kind: 'bond', page: 3 },
    { item: 'Non-collusion affidavit, signed', required: true, kind: 'form', page: 12 },
    { key: 'coi', item: 'Certificate of insurance', required: true, kind: 'insurance', auto: 'cert:insurance' },
    { key: 'bid_form', item: 'duplicate of the base row', required: true },
  ] }
  it('seeds base rows first, keeps the package words, dedupes by key', () => {
    const c = seedChecklist(requirements)
    expect(c.map((r) => r.key)).toEqual(['bid_form', 'cover_letter', 'qualifications', 'bond', 'non_collusion_affidavit_signed', 'coi'])
    expect(c[0].item).toMatch(/Bid schedule/)
    expect(c.every((r) => r.done === false)).toBe(true)
  })
  it('a bid bond is never auto-satisfied by the bonding letter on file; a capacity letter is', () => {
    const c = seedChecklist({ checklist: [
      { key: 'bid_bond', item: 'Provide five percent (5%) bid bond', required: true, kind: 'bond', auto: 'cert:bond' },
      { key: 'capacity', item: 'Surety letter of bonding capacity', required: true, kind: 'bond', auto: 'cert:bond' },
    ] })
    expect(c.find((r) => r.key === 'bid_bond').auto).toBeNull()
    expect(c.find((r) => r.key === 'capacity').auto).toBe('cert:bond')
  })
  it('ticks what the packet proves and never unticks a person', () => {
    const c = seedChecklist(requirements).map((r) => r.key === 'bond' ? { ...r, done: true, done_by: 'doug' } : r)
    const done = autoDoneChecklist(c, { company, dueAt: due, packet: [{ kind: 'bid_form' }], coverLetter: 'Dear Purchasing,' })
    const by = Object.fromEntries(done.map((r) => [r.key, r]))
    expect(by.bid_form.done && by.bid_form.done_by === 'packet').toBe(true)
    expect(by.cover_letter.done).toBe(true)
    expect(by.qualifications.done).toBe(false)
    expect(by.coi.done).toBe(true)              // on file, unexpired at due
    expect(by.bond.done_by).toBe('doug')        // untouched
    expect(by.non_collusion_affidavit_signed.done).toBe(false) // a person signs
  })
})

describe('may it go out (§5.8)', () => {
  const sourced = { item_name: 'Pole base', price_source: 'ai_sourced', price_verified_at: null }
  it('a bid with an unverified sourced price may not', () => {
    const r = submitReadiness({ documentType: 'bid', lines: [sourced], checklist: [], company, dueAt: due })
    expect(r.ready).toBe(false)
    expect(r.reasons[0]).toMatch(/not yet verified/)
  })
  it('lists every open required item, an expiring certificate, a blocker, a past due date', () => {
    const checklist = [
      { key: 'bond', item: 'Bid bond, 5%', required: true, done: false, waived_reason: null, page: 3 },
      { key: 'wc', item: "Workers' comp", required: true, done: true, auto: 'cert:workers_comp', waived_reason: null },
      { key: 'opt', item: 'Optional brochure', required: false, done: false },
    ]
    const past = submitReadiness({ lines: [], checklist, company, dueAt: '2026-01-01T00:00:00Z', blockers: ['WOSB set-aside not held'] })
    expect(past.ready).toBe(false)
    expect(past.reasons).toEqual(['Checklist: Bid bond, 5% (page 3)', 'Blocker: WOSB set-aside not held', 'The due date has passed'])
    // Due after the workers' comp certificate expires → that is a reason too.
    const late = submitReadiness({ lines: [], checklist, company, dueAt: '2026-10-14T20:00:00Z' })
    expect(late.reasons).toContain("Workers' comp certificate expires 2026-10-01, before the bid is due")
  })
  it('a waived required item does not block; inside the margin is advisory', () => {
    const soon = new Date(Date.now() + 2 * 3600e3).toISOString()
    const r = submitReadiness({ lines: [], checklist: [{ key: 'bond', item: 'Bid bond', required: true, done: false, waived_reason: 'no bond on this one, buyer confirmed' }], company, dueAt: soon })
    expect(r.ready).toBe(true)
    expect(r.inMargin).toBe(true)
  })
})

describe('the packet', () => {
  it('reads in the buyer\'s order: form, letter, qualifications, their forms, certificates', () => {
    const p = sortPacket([{ kind: 'cert:w9' }, { kind: 'buyer_form', file_name: 'b' }, { kind: 'bid_form' }, { kind: 'buyer_form', file_name: 'a' }, { kind: 'cover_letter' }])
    expect(p.map((x) => x.kind + (x.file_name ? ':' + x.file_name : ''))).toEqual(['bid_form', 'cover_letter', 'buyer_form:a', 'buyer_form:b', 'cert:w9'])
  })
  it('the approval sentence names the company', () => {
    expect(approvalSentence('Summit Field Co')).toMatch(/on behalf of Summit Field Co\.$/)
  })
})
