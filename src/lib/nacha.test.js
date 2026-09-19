import { describe, it, expect } from 'vitest'
import { buildNachaFile, entriesFromDdCsv, isValidRouting, creditCode, yymmdd } from './nacha'

const settings = {
  odfiRouting: '124000054',            // a real Utah routing number, valid check digit
  ein: '00-0000025',
  companyName: 'Summit Field Co',
  destinationName: 'Zions Bank',
}
const csv = [
  'Employee,Routing Number,Account Number,Account Type,Net Amount,Status',
  'Carlos Rivera,021000021,000123456789,checking,1308.82,OK',
  'Tyler Brooks,011000015,000987654321,savings,1019.06,OK',
  'Sarah Chen,,,,2061.85,NO DIRECT DEPOSIT ON FILE — PAY BY CHECK',
  'Jordan Lee,021000021,000555,checking,0.00,OK',
].join('\r\n')

describe('routing numbers', () => {
  it('accepts a valid check digit and rejects a typo', () => {
    expect(isValidRouting('021000021')).toBe(true)
    expect(isValidRouting('124000054')).toBe(true)
    expect(isValidRouting('021000022')).toBe(false)
    expect(isValidRouting('12345')).toBe(false)
  })
  it('credits checking as 22 and savings as 32', () => {
    expect(creditCode('checking')).toBe('22')
    expect(creditCode('Savings')).toBe('32')
  })
  it('dates are YYMMDD with no timezone shift', () => {
    expect(yymmdd('2026-09-20')).toBe('260920')
    expect(yymmdd(new Date(2026, 8, 2, 23, 30))).toBe('260902')
  })
})

describe('the direct-deposit export becomes entries', () => {
  it('keeps the people with bank details and money, and names the rest', () => {
    const { entries, skipped } = entriesFromDdCsv(csv)
    expect(entries.map(e => e.name)).toEqual(['Carlos Rivera', 'Tyler Brooks'])
    expect(entries[0].amountCents).toBe(130882)
    expect(skipped.map(s => s.name + ':' + s.reason)).toEqual(['Sarah Chen:no direct deposit on file', 'Jordan Lee:nothing to pay'])
  })
  it('refuses a routing number that fails its check digit', () => {
    const { entries, skipped } = entriesFromDdCsv('Employee,Routing Number,Account Number,Account Type,Net Amount,Status\r\nX,021000022,1,checking,10,OK')
    expect(entries).toHaveLength(0)
    expect(skipped[0].reason).toMatch(/check digit/)
  })
})

describe('the NACHA file', () => {
  const { entries } = entriesFromDdCsv(csv)
  const now = new Date(2026, 8, 18, 14, 5)
  const file = buildNachaFile({ settings, effectiveDate: '2026-09-20', entries, now })
  const lines = file.text.split('\r\n').filter(Boolean)

  it('is whole 10-record blocks of 94-character lines', () => {
    expect(lines.length % 10).toBe(0)
    for (const l of lines) expect(l).toHaveLength(94)
    expect(file.blocks).toBe(1)
  })
  it('has one of each control record around the entries', () => {
    expect(lines[0][0]).toBe('1'); expect(lines[1][0]).toBe('5')
    expect(lines[2][0]).toBe('6'); expect(lines[3][0]).toBe('6')
    expect(lines[4][0]).toBe('8'); expect(lines[5][0]).toBe('9')
    expect(lines.slice(6).every(l => l === '9'.repeat(94))).toBe(true)
  })
  it('file header: destination bank, origin from the EIN, creation stamp', () => {
    expect(lines[0].slice(3, 13)).toBe(' 124000054')
    expect(lines[0].slice(13, 23)).toBe('1000000025')
    expect(lines[0].slice(23, 33)).toBe('2609181405')
    expect(lines[0].slice(33, 34)).toBe('A')
    expect(lines[0].slice(40, 63).trim()).toBe('ZIONS BANK')
  })
  it('batch header: credits only, PPD, PAYROLL, the pay date as effective date', () => {
    expect(lines[1].slice(1, 4)).toBe('220')
    expect(lines[1].slice(4, 20).trim()).toBe('SUMMIT FIELD CO')
    expect(lines[1].slice(50, 53)).toBe('PPD')
    expect(lines[1].slice(53, 63).trim()).toBe('PAYROLL')
    expect(lines[1].slice(69, 75)).toBe('260920')
  })
  it('entries carry code, routing, account, cents and name, with sequential traces', () => {
    const c = lines[2]
    expect(c.slice(1, 3)).toBe('22'); expect(c.slice(3, 12)).toBe('021000021'); expect(c.slice(12, 29).trim()).toBe('000123456789')
    expect(c.slice(29, 39)).toBe('0000130882'); expect(c.slice(54, 76).trim()).toBe('CARLOS RIVERA')
    expect(c.slice(79, 94)).toBe('124000050000001')
    const t = lines[3]
    expect(t.slice(1, 3)).toBe('32'); expect(t.slice(79, 94)).toBe('124000050000002')
  })
  it('batch and file control: counts, entry hash and totals agree', () => {
    const hash = String(2100002 + 1100001).padStart(10, '0')
    expect(lines[4].slice(4, 10)).toBe('000002')
    expect(lines[4].slice(10, 20)).toBe(hash)
    expect(lines[4].slice(32, 44)).toBe('000000232788')
    expect(lines[5].slice(1, 7)).toBe('000001'); expect(lines[5].slice(7, 13)).toBe('000001')
    expect(lines[5].slice(13, 21)).toBe('00000002'); expect(lines[5].slice(21, 31)).toBe(hash)
    expect(file.totalCents).toBe(232788)
  })
  it('a balanced file adds a debit offset for the total and reports mixed class 200', () => {
    const b = buildNachaFile({ settings: { ...settings, balanced: true, offsetAccount: '9988776655', offsetAccountType: 'checking' }, effectiveDate: '2026-09-20', entries, now })
    const l = b.text.split('\r\n').filter(Boolean)
    expect(l[1].slice(1, 4)).toBe('200')
    expect(l[4].slice(1, 3)).toBe('27'); expect(l[4].slice(29, 39)).toBe('0000232788')
    expect(l[5].slice(20, 32)).toBe('000000232788'); expect(l[5].slice(32, 44)).toBe('000000232788')
    expect(b.entryCount).toBe(3)
  })
  it('refuses to build without a valid bank routing, an effective date, or anyone to pay', () => {
    expect(() => buildNachaFile({ settings: { ...settings, odfiRouting: '1' }, effectiveDate: '2026-09-20', entries })).toThrow(/routing/)
    expect(() => buildNachaFile({ settings, effectiveDate: '', entries })).toThrow(/effective date/)
    expect(() => buildNachaFile({ settings, effectiveDate: '2026-09-20', entries: [] })).toThrow(/No employees/)
    expect(() => buildNachaFile({ settings: { ...settings, balanced: true }, effectiveDate: '2026-09-20', entries })).toThrow(/offset/)
  })
})
