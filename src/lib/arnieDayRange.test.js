// "No HHH jobs today" with seven on the board (Christopher, live test,
// 2026-10-21). Every date Arnie filters on is a timestamp; "lte.2026-10-21"
// meant before midnight UTC at the START of the day. One helper now turns a
// plain day into the company's local day, start to end, for every lookup.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { transformSync } from 'esbuild'
import { dayStartUtc } from '../../supabase/functions/_shared/repGoals.ts'

const chat = readFileSync(new URL('../../supabase/functions/arnie-chat/index.ts', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const src = transformSync(chat.match(/async function appendDayRange\([\s\S]*?\n}\n/)[0], { loader: 'ts' }).code
const appendDayRange = new Function('dayStartUtc', 'companyTz', `${src}; return appendDayRange`)(dayStartUtc, async () => 'America/Denver')

const range = async (start, end) => {
  const p = new URLSearchParams()
  await appendDayRange(p, 'start_date', start, end, 3)
  return p.getAll('start_date')
}

describe('a day is the company\'s whole local day', () => {
  it('"today" in Denver runs 06:00Z to 06:00Z next day — so 12:00Z, 13:30Z and 16:30Z jobs are inside', async () => {
    const [from, to] = await range('2026-10-21', '2026-10-21')
    expect(from).toBe('gte.2026-10-21T06:00:00.000Z')
    expect(to).toBe('lt.2026-10-22T06:00:00.000Z')
    for (const job of ['2026-10-21T12:00:00Z', '2026-10-21T13:30:00Z', '2026-10-21T16:30:00Z']) {
      expect(job >= from.slice(4) && job < to.slice(3)).toBe(true)
    }
  })
  it('the old filter would have dropped all of them', () => {
    expect('2026-10-21T12:00:00Z' <= '2026-10-21').toBe(false)
  })
  it('a full timestamp is passed through as given', async () => {
    expect(await range('2026-10-21T00:00:00Z', '2026-10-21T23:59:59Z')).toEqual(['gte.2026-10-21T00:00:00Z', 'lte.2026-10-21T23:59:59Z'])
  })
  it('one end only', async () => {
    expect(await range(null, '2026-10-21')).toEqual(['lt.2026-10-22T06:00:00.000Z'])
    expect(await range(null, null)).toEqual([])
  })
})

describe('every lookup uses it — none compares a day to a timestamp any more', () => {
  it('jobs, leads, invoices, estimates, expenses, appointments and the time clock', () => {
    for (const col of ['start_date', 'start_time', 'clock_in', 'date']) {
      expect(chat).toMatch(new RegExp(`await appendDayRange\\(params, '${col}', input\\.start_date, input\\.end_date, companyId\\)`))
    }
    expect((chat.match(/await appendDayRange\(params, 'created_at', input\.start_date, input\.end_date, companyId\)/g) || []).length).toBe(3)
    expect(chat).not.toMatch(/lte\.\$\{input\.end_date\}`\)/)
  })
})
