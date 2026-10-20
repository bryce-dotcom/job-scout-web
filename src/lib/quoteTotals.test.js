// Arnie's reports total an estimate the way the app's screens do
// (src/lib/quoteTotal.js quoteSummary), not from the drifting quote_amount.
import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { effectiveTotal, withEffectiveTotals } from '../../supabase/functions/_shared/quoteTotals.ts'
import { quoteSummary } from './quoteTotal'

const read = (p) => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
afterEach(() => vi.unstubAllGlobals())

describe('the same number the estimate page shows', () => {
  it.each([
    [{ quote_amount: 4378964.81, discount: 0 }, 14723],      // ST-485's typo
    [{ quote_amount: 1048.16, discount: 0 }, 54353.76],      // EST-MN7ZEMTN, stale stored figure
    [{ quote_amount: 5000, discount: 250 }, 0],              // lump sum, no lines
    [{ quote_amount: 100, discount: 500 }, 0],
  ])('%o with lines %d', (q, lines) => {
    expect(effectiveTotal(q, lines)).toBe(quoteSummary(q, lines).total)
  })
  it('reads the lines in batches and tags each quote', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200, json: async () => [{ quote_id: 1, line_total: 10 }, { quote_id: 1, line_total: 5 }, { quote_id: 2, total: 7 }] })))
    const qs = await withEffectiveTotals({ url: 'https://x', key: 'k' }, 3, [{ id: 1, quote_amount: 999 }, { id: 2, quote_amount: 1 }, { id: 3, quote_amount: 40, discount: 4 }])
    expect(qs.map((q) => q.amount)).toEqual([15, 7, 36])
  })
  it('the brief and the refresh use it', () => {
    const brief = read('supabase/functions/_shared/arnieBrief.ts')
    expect(brief).toMatch(/await withEffectiveTotals\(r, companyId, staleQuotes\)/)
    expect(brief).toMatch(/s \+ num\(q\.amount\), 0\)/)
    const refresh = read('supabase/functions/_shared/arnieRefresh.ts')
    expect(refresh).toMatch(/await withEffectiveTotals\(r, companyId, approvedNotJobs\)/)
    expect(refresh).not.toMatch(/num\(q\.quote_amount\)/)
  })
})
