import { describe, it, expect } from 'vitest'
import { bidIntakeOf, compareItemNo, scheduleRows, groupSections, scheduleTotal, buildSchedule, fmtMoney, fmtQty } from './bidSchedule'

const lines = [
  { id: 1, bid_item_no: '10', bid_spec: 'LED high bay, 150W, DLC', quantity: 12, price: 189.5, line_total: 2274, unit_of_measure: 'EA', sort_order: 3 },
  { id: 2, bid_item_no: '2', item_name: 'Photocell', quantity: 4, price: 22, unit_of_measure: 'EA', sort_order: 1, price_source: 'ai_sourced' },
  { id: 3, bid_item_no: '2.1', item_name: 'Photocell bracket', quantity: 4, price: 5.5, sort_order: 2, price_source: 'ai_sourced', price_verified_at: '2026-09-25' },
  { id: 4, item_name: 'Lift rental', description: '3 days', quantity: 1, price: 900, sort_order: 0 },
]

describe('item numbers read like a bid form', () => {
  it('2 comes before 10, 2.1 after 2, letters after numbers', () => {
    expect(['10', '2', '2.1', 'A-1', '1'].sort(compareItemNo)).toEqual(['1', '2', '2.1', '10', 'A-1'])
  })
})

describe('rows', () => {
  it('uses the buyer\'s spec when there is one, else name — description', () => {
    const rows = scheduleRows(lines)
    expect(rows.find(r => r.id === 1).description).toBe('LED high bay, 150W, DLC')
    expect(rows.find(r => r.id === 4).description).toBe('Lift rental — 3 days')
  })
  it('extends qty × unit price when no line_total is stored, and trusts a stored one', () => {
    const rows = scheduleRows(lines)
    expect(rows.find(r => r.id === 2).extended).toBe(88)
    expect(rows.find(r => r.id === 1).extended).toBe(2274)
  })
  it('numbered items first in buyer order, then the rest by sort order', () => {
    expect(scheduleRows(lines).map(r => r.id)).toEqual([2, 3, 1, 4])
  })
  it('carries the redline so the preview can show it and the portal never does by accident', () => {
    const rows = scheduleRows(lines)
    expect(rows.find(r => r.id === 2).unverified).toBe(true)
    expect(rows.find(r => r.id === 3).unverified).toBe(false)
    expect(rows.find(r => r.id === 1).unverified).toBe(false)
  })
})

describe('sections and totals', () => {
  const doc = { bid_intake: JSON.stringify({ title: 'ITB 2026-114', sections: [{ name: 'Base Bid', item_nos: ['2', '2.1', '10'] }, { name: 'Alternate 1', item_nos: ['A-1'] }] }) }
  it('reads the intake whether object or JSON string', () => {
    expect(bidIntakeOf(doc).title).toBe('ITB 2026-114')
    expect(bidIntakeOf({ bid_intake: { title: 'x' } }).title).toBe('x')
    expect(bidIntakeOf({}).columns.length).toBe(6)
  })
  it('groups by the package sections; unplaced rows land in Other Items; empty sections vanish', () => {
    const s = buildSchedule(doc, lines)
    expect(s.sections.map(x => x.name)).toEqual(['Base Bid', 'Other Items'])
    expect(s.sections[0].rows.map(r => r.id)).toEqual([2, 3, 1])
    expect(s.sections[0].total).toBe(88 + 22 + 2274)
    expect(s.sections[1].rows.map(r => r.id)).toEqual([4])
  })
  it('a bid with no sections is one section, and the total is the sum of extensions', () => {
    const s = buildSchedule({}, lines)
    expect(s.sections.map(x => x.name)).toEqual(['Schedule of Items'])
    expect(s.total).toBe(scheduleTotal(s.rows))
    expect(s.total).toBe(3284)
    expect(s.unverified).toBe(1)
  })
  it('sections add up to the total, by construction', () => {
    const s = buildSchedule(doc, lines)
    expect(s.sections.reduce((t, x) => t + x.total, 0)).toBe(s.total)
  })
})

describe('formatting', () => {
  it('money and quantities read like a bid form', () => {
    expect(fmtMoney(2274)).toBe('$2,274.00')
    expect(fmtQty(12)).toBe('12')
    expect(fmtQty(2.5)).toBe('2.5')
  })
})
