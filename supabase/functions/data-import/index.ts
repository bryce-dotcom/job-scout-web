// data-import — bringing a company's customers in from whatever they ran before.
//
// THE SPLIT THAT MAKES THIS SAFE. Working out that "Account Name" is the
// customer and "Billing Street" is the address is a judgement call on a dozen
// headers and five sample rows: that is the model's job and it is cheap.
// Moving five thousand customers is not a judgement call at all, and a model
// anywhere near it would be slow, expensive and — the part that matters —
// capable of quietly changing a phone number on row 3,814. So rows never go
// to a model. They are validated, deduped and inserted by this function, in
// batches, and the whole thing is as boring as it sounds.
//
// NOT A PER-VENDOR INTEGRATION. Salesforce, HousecallPro, ServiceTitan and
// Jobber all export CSV, and so does the spreadsheet a lot of them actually
// run on. One importer that reads any export beats four OAuth integrations
// that each break when a vendor ships a change.
//
// IDEMPOTENT BY CONSTRUCTION. customers already carried source_system and
// source_id from the HousecallPro migration; this leans on them and on the
// unique index added alongside, so running the same export twice updates the
// same rows instead of making a second company's worth of customers. If the
// export has no id column, the dedupe key is the email, then the phone, then
// the name — in that order, and said out loud on the card.
//
// WHO. Admin and up, because an import writes thousands of rows that somebody
// then has to live with, and because undoing one is a bigger act still.

import { resolveCaller } from '../_shared/auth.ts'
import { callAnthropic } from '../_shared/anthropic.ts'

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** What a customer row can be made of. The model may only choose from these. */
const CUSTOMER_FIELDS: Record<string, string> = {
  name: 'The customer. A person or a company — whichever this row is about.',
  business_name: 'The company name, when the row has BOTH a person and a company.',
  email: 'Email address.',
  phone: 'Phone number, any format.',
  address: 'The whole address. If the export splits street/city/state/zip, name them all and they are joined in that order.',
  notes: 'Free text about the customer.',
  job_title: 'Their role, when the row is a person at a company.',
  secondary_contact_name: 'A second person on the account.',
  secondary_contact_email: 'That second person\'s email.',
  secondary_contact_phone: 'That second person\'s phone.',
  source_id: 'The id this row had in the OLD system. Gold: it is what makes re-importing safe.',
  tags: 'Labels, comma separated.',
}

const MAX_ROWS_PER_CALL = 250

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  const json = (body: Record<string, unknown>, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } })

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' }

  const rest = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      ...init,
      headers: { ...H, ...(init.method && init.method !== 'GET' ? { Prefer: 'return=representation' } : {}) },
    })
    const text = await res.text()
    if (!res.ok) throw new Error(`${res.status}: ${text.slice(0, 300)}`)
    return text ? JSON.parse(text) : []
  }

  try {
    const caller = await resolveCaller(req, SUPABASE_URL, SERVICE_KEY)
    if (!caller?.companyId || !caller.employeeId) return json({ error: 'Sign in to use this.' }, 401)
    // An import writes thousands of rows somebody has to live with.
    if (caller.level < 3) return json({ error: 'Importing data is for admins and owners.' }, 403)
    const company = caller.companyId
    const me = caller.employeeId

    const body = await req.json().catch(() => ({})) as Record<string, unknown>
    const action = String(body.action || '')

    // ── what is in this file? ────────────────────────────────────────────
    // Headers and a handful of rows, never the file. Returns a mapping for a
    // PERSON to correct — it is a first draft, not a decision.
    if (action === 'plan') {
      const headers = (Array.isArray(body.headers) ? body.headers : [])
        .filter((h): h is string => typeof h === 'string').slice(0, 80)
      const samples = (Array.isArray(body.samples) ? body.samples : []).slice(0, 5)
      if (!headers.length) return json({ error: 'That file has no column headings.' }, 400)

      const fieldList = Object.entries(CUSTOMER_FIELDS).map(([k, v]) => `- ${k}: ${v}`).join('\n')
      const ai = await callAnthropic({ feature: 'data-import-plan', companyId: company }, {
        model: 'claude-sonnet-4-5',
        max_tokens: 1500,
        system:
          'You map the columns of an exported spreadsheet onto JobScout customer fields.\n\n' +
          `The fields you may choose from, and nothing else:\n${fieldList}\n\n` +
          'Rules:\n' +
          '- Answer with JSON only: {"mapping":{"<column heading>":"<field>"},"source_label":"<the system this looks like>","warnings":["..."]}\n' +
          '- Leave a column OUT of the mapping if it does not belong to one of those fields. Most exports have columns we do not want; that is normal and is not a warning.\n' +
          '- More than one column may map to address (street, city, state, postcode). Nothing else may be doubled up.\n' +
          '- name is required. If no column is a name, say so in warnings and map what you can.\n' +
          '- Guess source_label from the column names: Salesforce, HousecallPro, ServiceTitan, Jobber, QuickBooks, or "spreadsheet" when it is nobody in particular.\n' +
          '- Warn about anything that would lose data or surprise them, in a short sentence each, in plain words.',
        messages: [{
          role: 'user',
          content: `Column headings:\n${headers.join('\n')}\n\nFirst rows:\n${JSON.stringify(samples).slice(0, 4000)}`,
        }],
      })
      if (!ai.ok) return json({ error: ai.friendly, ai_unavailable: ai.unavailable === true }, 503)

      const text = (ai.data?.content || []).filter((b: { type: string }) => b.type === 'text')
        .map((b: { text: string }) => b.text).join('')
      let plan: { mapping?: Record<string, string>; source_label?: string; warnings?: string[] } = {}
      try {
        plan = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1))
      } catch {
        return json({ error: 'Could not read that file\'s columns. Check the first row is the headings.' }, 422)
      }

      // The model may only name fields that exist. Anything else is dropped
      // rather than trusted — a mapping is about to write to real columns.
      //
      // Built in the FILE's column order, not the order the model happened to
      // answer in. Several columns map to the address and they are joined in
      // the order they appear, so a mapping that came back listing the
      // postcode first produced "84601, Provo, UT, 101 Mill Road" — a real
      // address, backwards, on every row. Insertion order is the whole
      // contract downstream, so it is set here once.
      const chosen = plan.mapping || {}
      const mapping: Record<string, string> = {}
      for (const col of headers) {
        const field = chosen[col]
        if (field && CUSTOMER_FIELDS[field]) mapping[col] = field
      }

      const made = await rest('data_imports', {
        method: 'POST',
        body: JSON.stringify({
          company_id: company,
          employee_id: me,
          kind: 'customers',
          source_label: String(plan.source_label || body.source_label || 'spreadsheet').slice(0, 60),
          file_name: String(body.file_name || '').slice(0, 200) || null,
          status: 'ready',
          mapping,
          // The order, kept where order survives. jsonb sorts an object's
          // keys, so `mapping` cannot be trusted to remember which column
          // came first — and several of them join to make the address.
          columns: headers,
        }),
      })

      return json({
        ok: true,
        import_id: made?.[0]?.id,
        mapping,
        source_label: made?.[0]?.source_label,
        warnings: (plan.warnings || []).filter((w: unknown) => typeof w === 'string').slice(0, 6),
        fields: CUSTOMER_FIELDS,
      })
    }

    // ── put a batch in ───────────────────────────────────────────────────
    // The client sends the rows it parsed, in batches. Nothing here asks a
    // model anything.
    if (action === 'apply') {
      const importId = Number(body.import_id)
      const rows = Array.isArray(body.rows) ? body.rows : []
      if (!Number.isFinite(importId)) return json({ error: 'import_id is required' }, 400)
      if (rows.length > MAX_ROWS_PER_CALL) return json({ error: `Send at most ${MAX_ROWS_PER_CALL} rows at a time.` }, 400)

      const [job] = await rest(`data_imports?select=id,company_id,status,mapping,columns,source_label,counts&id=eq.${importId}&company_id=eq.${company}&limit=1`)
      if (!job) return json({ error: 'No import of yours by that id.' }, 404)
      if (job.status === 'undone') return json({ error: 'That import was undone. Start a new one.' }, 409)

      const mapping: Record<string, string> = job.mapping || {}
      // Street, city, state, postcode join IN THE FILE'S ORDER, which is kept
      // in `columns` because jsonb sorts an object's keys and would otherwise
      // hand back "84601, Provo, UT, 101 Mill Road" — a real address,
      // backwards, with nothing erroring to say so.
      const order: string[] = Array.isArray(job.columns) ? job.columns : Object.keys(mapping)
      const addressCols = order.filter((c) => mapping[c] === 'address')

      const clean = (v: unknown) => (v === null || v === undefined ? '' : String(v).trim())
      const prepared: Record<string, unknown>[] = []
      let skipped = 0

      for (const raw of rows) {
        if (!raw || typeof raw !== 'object') { skipped++; continue }
        const r = raw as Record<string, unknown>
        const out: Record<string, unknown> = {}
        for (const [col, field] of Object.entries(mapping)) {
          if (field === 'address') continue
          const v = clean(r[col])
          if (v) out[field] = v.slice(0, field === 'notes' ? 4000 : 300)
        }
        // The address is however many columns the export split it into, in
        // the order they were mapped.
        const addr = addressCols.map((c) => clean(r[c])).filter(Boolean).join(', ')
        if (addr) out.address = addr.slice(0, 300)

        // A row with no name is not a customer. Counted and reported, never
        // guessed at.
        if (!clean(out.name)) {
          // A business with no contact name is still a customer.
          if (clean(out.business_name)) out.name = out.business_name
          else { skipped++; continue }
        }

        out.company_id = company
        out.source_system = job.source_label
        out.import_id = importId
        // No id in the export? Then the key is the email, the phone, or the
        // name — in that order, and said out loud on the card.
        if (!clean(out.source_id)) {
          out.source_id = clean(out.email) || clean(out.phone) || clean(out.name)
        }
        prepared.push(out)
      }

      let created = 0
      if (prepared.length) {
        // Upsert on the plain unique index. Running the same export twice
        // updates the same rows rather than making a second company's worth.
        const res = await fetch(
          `${SUPABASE_URL}/rest/v1/customers?on_conflict=company_id,source_system,source_id`,
          {
            method: 'POST',
            headers: { ...H, Prefer: 'return=representation,resolution=merge-duplicates' },
            body: JSON.stringify(prepared),
          },
        )
        const text = await res.text()
        if (!res.ok) {
          await rest(`data_imports?id=eq.${importId}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'failed', error: text.slice(0, 500) }),
          })
          return json({ error: `That batch did not go in: ${text.slice(0, 200)}` }, 500)
        }
        created = (text ? JSON.parse(text) : []).length
      }

      const counts = job.counts || {}
      const next = {
        rows: (Number(counts.rows) || 0) + rows.length,
        written: (Number(counts.written) || 0) + created,
        skipped: (Number(counts.skipped) || 0) + skipped,
      }
      await rest(`data_imports?id=eq.${importId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: body.last === true ? 'applied' : 'applying',
          counts: next,
          applied_at: body.last === true ? new Date().toISOString() : null,
        }),
      })

      return json({ ok: true, written: created, skipped, counts: next })
    }

    // ── take it back out ─────────────────────────────────────────────────
    // Only what this import created, and only rows nothing has happened to
    // since. A customer who has a job is somebody's work now, not an import
    // artefact, and deleting them would take the job with them.
    if (action === 'undo') {
      const importId = Number(body.import_id)
      if (!Number.isFinite(importId)) return json({ error: 'import_id is required' }, 400)
      const [job] = await rest(`data_imports?select=id,status&id=eq.${importId}&company_id=eq.${company}&limit=1`)
      if (!job) return json({ error: 'No import of yours by that id.' }, 404)

      const mine = await rest(`customers?select=id&import_id=eq.${importId}&company_id=eq.${company}`)
      const ids = mine.map((r: { id: number }) => r.id)
      if (!ids.length) {
        await rest(`data_imports?id=eq.${importId}`, {
          method: 'PATCH', body: JSON.stringify({ status: 'undone', undone_at: new Date().toISOString() }),
        })
        return json({ ok: true, removed: 0, kept: 0 })
      }

      // Anything that has been worked on stays. Checked by asking the tables
      // that would point at it, rather than by hoping a cascade is kind.
      const busy = new Set<number>()
      for (const table of ['jobs', 'quotes', 'invoices', 'leads']) {
        try {
          const rows = await rest(`${table}?select=customer_id&customer_id=in.(${ids.join(',')})`)
          for (const r of rows) if (r.customer_id) busy.add(Number(r.customer_id))
        } catch { /* a table with no customer_id is not a reason to stop */ }
      }
      const removable = ids.filter((id: number) => !busy.has(id))
      if (removable.length) {
        await rest(`customers?id=in.(${removable.join(',')})&company_id=eq.${company}`, { method: 'DELETE' })
      }
      await rest(`data_imports?id=eq.${importId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: 'undone',
          undone_at: new Date().toISOString(),
          counts: { removed: removable.length, kept: busy.size },
        }),
      })
      return json({ ok: true, removed: removable.length, kept: busy.size })
    }

    if (action === 'history') {
      const rows = await rest(`data_imports?select=id,kind,source_label,file_name,status,counts,created_at,applied_at,undone_at&company_id=eq.${company}&order=id.desc&limit=20`)
      return json({ ok: true, imports: rows })
    }

    return json({ error: `unknown action: ${action || '(none)'}` }, 400)
  } catch (e) {
    return json({ error: String((e as Error).message || e).slice(0, 300) }, 500)
  }
})
