// What an estimate is worth, for anything Arnie REPORTS — the same rule the
// app's own screens use (src/lib/quoteTotal.js quoteSummary):
//
//     subtotal = sum of its line totals, or quotes.quote_amount when it has no lines
//     total    = subtotal − the whole-project discount
//
// quotes.quote_amount is a cached copy that drifts. On 2026-10-20, 510 of
// HHH's estimates disagreed with their own lines, and one typo (ST-485 stored
// $4,378,964.81 against $14,723 of lines) was most of the "$8.3M stale" in
// Cole's daily refresh. The pipeline and the estimate page had stopped
// trusting the column long ago; the assistant's reports had not.

// deno-lint-ignore-file no-explicit-any
import type { Rest } from './arnieConfig.ts'
import { readAllRecords } from './arnieRest.ts'

const num = (v: unknown) => Number(v) || 0
const money = (n: number) => Math.round(n * 100) / 100

/** The line sum per quote id, read in batches. */
export async function lineSums(r: Rest, companyId: number, quoteIds: number[]): Promise<Map<number, number>> {
  const sums = new Map<number, number>()
  const ids = [...new Set(quoteIds.filter((x) => Number.isFinite(Number(x))))]
  for (let i = 0; i < ids.length; i += 150) {
    const chunk = ids.slice(i, i + 150)
    const rows = await readAllRecords(r, `quote_lines?select=quote_id,line_total,total&company_id=eq.${companyId}&quote_id=in.(${chunk.join(',')})`)
    for (const l of rows) {
      const q = Number(l.quote_id)
      sums.set(q, (sums.get(q) || 0) + num(l.line_total ?? l.total))
    }
  }
  return sums
}

/** quoteSummary's total, from a quote row and its line sum. */
export function effectiveTotal(q: any, lineSum: number | undefined): number {
  const subtotal = num(lineSum) > 0 ? num(lineSum) : num(q?.quote_amount)
  return money(Math.max(0, subtotal - num(q?.discount)))
}

/**
 * Each quote with `amount` = what it is really worth. The rows need id,
 * quote_amount and discount selected. Mutates and returns the same rows.
 */
export async function withEffectiveTotals<T extends Record<string, any>>(r: Rest, companyId: number, quotes: T[]): Promise<(T & { amount: number })[]> {
  if (!quotes.length) return quotes as any
  const sums = await lineSums(r, companyId, quotes.map((q) => Number(q.id)))
  for (const q of quotes as any[]) q.amount = effectiveTotal(q, sums.get(Number(q.id)))
  return quotes as any
}
