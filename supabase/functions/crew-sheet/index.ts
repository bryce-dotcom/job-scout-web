// crew-sheet — the day or week sheet a crew lead takes into the field
// (Bryce, 2026-10-26: London was having Grok build it from JobScout exports).
//
//   POST { from: 'YYYY-MM-DD', to?: 'YYYY-MM-DD', crew?: 'London Miller' }
//   → the sheet (see _shared/crewSheet.ts): every scheduled job with its crew,
//     contact, lines (area, height, old → new, ladder or lift, the parts inside
//     each bundle, the PO), labor from past jobs' CLOCKED hours beside the plan,
//     flags, and the pull list across the jobs.
//
// Who: a signed-in employee. A Team Lead or above sees every crew; anyone else
// only the jobs they are on. No prices are on it — it is instructions.
// Read with the service key once the caller is known, because the labor
// estimate needs the company's clocked hours, which a crew member cannot read.

import { resolveCaller } from '../_shared/auth.ts'
import { loadCrewSheet } from '../_shared/crewSheetData.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const DAY = /^\d{4}-\d{2}-\d{2}$/

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const URL_ = Deno.env.get('SUPABASE_URL')!, KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const caller = await resolveCaller(req, URL_, KEY, { verify: true })
  if (!caller?.companyId) return json({ error: 'Sign in to see a crew sheet.' }, 401)

  const body = await req.json().catch(() => ({})) as Record<string, any>
  const from = String(body.from || '')
  const to = String(body.to || body.from || '')
  if (!DAY.test(from) || !DAY.test(to) || to < from) return json({ error: 'from and to are days, YYYY-MM-DD.' }, 400)
  if ((Date.parse(to) - Date.parse(from)) / 86_400_000 > 13) return json({ error: 'Two weeks at most on one sheet.' }, 400)

  const H = { apikey: KEY, Authorization: `Bearer ${KEY}` }
  const get = async (p: string) => { const r = await fetch(`${URL_}/rest/v1/${p}`, { headers: H }); return r.ok ? r.json() : [] }
  const [co] = await get(`companies?select=timezone&id=eq.${caller.companyId}&limit=1`)
  let me: { name: string } | null = null
  if (caller.level < 1) {
    const [e] = caller.employeeId != null ? await get(`employees?select=name&id=eq.${caller.employeeId}&limit=1`) : []
    if (!e?.name) return json({ error: 'There is no employee record on this login, so there is no crew to show.' }, 403)
    me = { name: e.name }
  }
  try {
    const sheet = await loadCrewSheet(get, caller.companyId, {
      from, to, tz: co?.timezone || 'America/Denver',
      onlyFor: me, crew: body.crew ? String(body.crew).slice(0, 80) : null,
    })
    return json({ ...sheet, scope: me ? 'mine' : 'all' })
  } catch (e) {
    console.error('[crew-sheet]', (e as Error)?.message)
    return json({ error: 'The crew sheet could not be put together just now.' }, 500)
  }
})
