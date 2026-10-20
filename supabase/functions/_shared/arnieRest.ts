// The two PostgREST calls the Arnie shared modules need, in one place so the
// service-role header block is not retyped at every call site.
import type { Rest } from './arnieConfig.ts'

const headers = (r: Rest) => ({
  apikey: r.key,
  Authorization: `Bearer ${r.key}`,
  'Content-Type': 'application/json',
})

/** GET a path already carrying its own query string. Returns [] on failure. */
export async function readRecordList(r: Rest, path: string): Promise<any[]> {
  const res = await fetch(`${r.url}/rest/v1/${path}`, { headers: headers(r) })
  if (!res.ok) return []
  const json = await res.json().catch(() => [])
  return Array.isArray(json) ? json : []
}

/**
 * EVERY matching row, paged — for a COUNT or a TOTAL a person will read.
 *
 * readRecordList is one request, and a count taken from one request is the
 * page size, not the truth: Cole's daily refresh said "200 stale quotes" (there
 * were 931) and "50 approved estimates not yet jobs" (there were 157), because
 * those were the limits (2026-10-14). The server also caps a page at 1000
 * rows whatever the limit says, so this pages with Range until it is done.
 * Leave any limit= OUT of the path.
 */
export async function readAllRecords(r: Rest, path: string, max = 20000): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; from < max; from += 1000) {
    const res = await fetch(`${r.url}/rest/v1/${path}`, { headers: { ...headers(r), Range: `${from}-${from + 999}`, 'Range-Unit': 'items' } })
    if (!res.ok && res.status !== 206) break
    const page = await res.json().catch(() => [])
    if (!Array.isArray(page) || !page.length) break
    out.push(...page)
    if (page.length < 1000) break
  }
  return out
}

/**
 * PATCH exactly one row, scoped by company as well as id.
 * The company filter is redundant with the id — and stays anyway, because a
 * write that can only ever touch one tenant is worth more than the byte it
 * costs to prove it.
 */
export async function patchRow(
  r: Rest, table: string, companyId: number, id: number, patch: Record<string, unknown>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(
    `${r.url}/rest/v1/${table}?id=eq.${id}&company_id=eq.${companyId}`,
    { method: 'PATCH', headers: { ...headers(r), Prefer: 'return=minimal' }, body: JSON.stringify(patch) },
  )
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` }
  return { ok: true }
}
