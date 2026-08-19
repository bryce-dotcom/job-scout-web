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
