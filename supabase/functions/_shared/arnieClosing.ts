// Closing, the server half: load what Cole's closing check needs, and the
// card that emails the job's rep what is missing. The rule itself is
// closingCheck.ts; the won card (arnieWon.ts) refuses while it finds gaps.

// deno-lint-ignore-file no-explicit-any
import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import type { Prepared } from './arnieCreate.ts'
import { readRecordList } from './arnieRest.ts'
import { closingGaps, gapsEmail, type Gap } from './closingCheck.ts'
import { playbookFor } from './lightingPlaybook.ts'

type Any = any

/**
 * The business unit whose estimates close by the playbook's check — null when
 * the company has no playbook. Only THAT unit's estimates are checked: Cole's
 * closing rules are for Energy Scout lighting, not every estimate HHH writes.
 */
export async function closesByPlaybook(r: Rest, companyId: number): Promise<string | null> {
  const rows = await readRecordList(r, `settings?select=value&company_id=eq.${companyId}&key=eq.estimating_playbook&order=id.desc&limit=1`)
  return playbookFor(rows[0]?.value)?.business_unit ?? null
}

/** Everything the check reads, from the estimate's id. */
export async function loadClosingGaps(r: Rest, companyId: number, quoteId: number): Promise<{ gaps: Gap[]; quote: Any; party: Any; rep: Any } | null> {
  const [quote] = await readRecordList(r, `quotes?select=id,quote_id,estimate_name,job_title,business_unit,contract_signed,signed_proposal_attachment_id,manual_annual_savings,audit_id,customer_id,lead_id,salesperson_id&company_id=eq.${companyId}&id=eq.${quoteId}&limit=1`)
  if (!quote) return null
  const [customer] = quote.customer_id ? await readRecordList(r, `customers?select=name,business_name,phone,email,address&company_id=eq.${companyId}&id=eq.${quote.customer_id}&limit=1`) : []
  const [lead] = quote.lead_id ? await readRecordList(r, `leads?select=customer_name,business_name,phone,email,address,salesperson_id,customer_signature_path,customer_signature_typed&company_id=eq.${companyId}&id=eq.${quote.lead_id}&limit=1`) : []
  // The customer record wins; anything it lacks, the lead may have.
  const party = {
    name: customer?.name || lead?.customer_name || null,
    business_name: customer?.business_name || lead?.business_name || null,
    phone: customer?.phone || lead?.phone || null,
    email: customer?.email || lead?.email || null,
    address: customer?.address || lead?.address || null,
  }
  const lines = await readRecordList(r, `quote_lines?select=item_id,item_name,description,notes&company_id=eq.${companyId}&quote_id=eq.${quoteId}&limit=500`)
  const ids = [...new Set(lines.map((l: Any) => l.item_id).filter(Boolean))]
  const comps = ids.length ? await readRecordList(r, `product_components?select=parent_product_id,component_product_id&company_id=eq.${companyId}&parent_product_id=in.(${ids.join(',')})&limit=2000`) : []
  const allIds = [...new Set([...ids, ...comps.map((c: Any) => c.component_product_id)])]
  const prods = allIds.length ? await readRecordList(r, `products_services?select=id,spec_sheet_url&company_id=eq.${companyId}&id=in.(${allIds.join(',')})&limit=3000`) : []
  const products: Record<string, Any> = Object.fromEntries(prods.map((p: Any) => [String(p.id), p]))
  const components: Record<string, number[]> = {}
  for (const c of comps) (components[String(c.parent_product_id)] ||= []).push(c.component_product_id)

  let annualSavings: number | null = Number(quote.manual_annual_savings) || null
  if (!annualSavings && quote.audit_id) {
    const [a] = await readRecordList(r, `lighting_audits?select=annual_savings_dollars&company_id=eq.${companyId}&id=eq.${quote.audit_id}&limit=1`)
    annualSavings = Number(a?.annual_savings_dollars) || null
  }
  const repId = quote.salesperson_id || lead?.salesperson_id || null
  const [rep] = repId ? await readRecordList(r, `employees?select=id,name,email&company_id=eq.${companyId}&id=eq.${repId}&limit=1`) : []
  const signedOnLead = !!(lead?.customer_signature_path || String(lead?.customer_signature_typed || '').trim())
  return { gaps: closingGaps({ quote, party, lines, products, components, annualSavings, signedOnLead }), quote, party, rep: rep || null }
}

// ── The card: email the rep what is missing ────────────────────────────────

export async function prepareClosingGaps(r: Rest, caller: Caller, f: Record<string, string>): Promise<Prepared> {
  const companyId = caller.companyId as number
  const t = String(f.quote || '').trim()
  if (!t) return { ok: false, error: 'Which estimate?' }
  const idNum = Number((t.match(/^#?(\d+)$/) || [])[1])
  const rows = idNum
    ? await readRecordList(r, `quotes?select=id,quote_id,estimate_name&company_id=eq.${companyId}&id=eq.${idNum}&limit=1`)
    : await readRecordList(r, `quotes?select=id,quote_id,estimate_name&company_id=eq.${companyId}&or=(quote_id.ilike.*${encodeURIComponent(t)}*,estimate_name.ilike.*${encodeURIComponent(t)}*)&order=created_at.desc&limit=6`)
  if (!rows.length) return { ok: false, error: `No estimate matching "${t}".` }
  if (rows.length > 1) return { needs_choice: rows.map((q: Any) => ({ id: q.id, label: `${q.quote_id || '#' + q.id} — ${q.estimate_name || 'unnamed'}` })), message: 'More than one estimate matches. Ask which, then call again with its number.' }
  const loaded = await loadClosingGaps(r, companyId, rows[0].id)
  if (!loaded) return { ok: false, error: 'That estimate is gone.' }
  const { gaps, quote, party, rep } = loaded
  const ref = quote.quote_id || `#${quote.id}`
  if (!gaps.length) return { ok: false, error: `${ref} has everything the closing check needs — nothing to email. It can be approved.` }
  if (!rep?.email) return { ok: false, error: `${ref} has no rep with an email address to send this to. The missing items: ${gaps.map((g) => g.item).join(', ')}.` }
  const [me] = caller.employeeId ? await readRecordList(r, `employees?select=name&company_id=eq.${companyId}&id=eq.${caller.employeeId}&limit=1`) : []
  const forWhom = party.business_name || party.name || quote.estimate_name || ref
  const mail = gapsEmail({ repName: rep.name, ref, forWhom, gaps, from: me?.name || 'JobScout' })
  return {
    ok: true,
    columns: { to: rep.email, rep_name: rep.name, subject: mail.subject, text: mail.text, reply_to: caller.email, quote_id: quote.id },
    display: [
      { label: 'To', value: `${rep.name} <${rep.email}>` },
      { label: 'Subject', value: mail.subject },
      ...gaps.map((g) => ({ label: g.item, value: g.detail })),
      { label: 'Goes to', value: 'the rep only — nothing goes to the customer' },
    ],
  }
}

export async function applyClosingGaps(_r: Rest, _companyId: number, prop: Any): Promise<{ ok: true; id: number; label: string; created: Record<string, unknown> } | { ok: false; error: string }> {
  const c = prop.payload?.columns || {}
  const key = Deno.env.get('RESEND_API_KEY')
  if (!key) return { ok: false, error: 'Email is not configured (no RESEND_API_KEY).' }
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: 'JobScout <estimates@appsannex.com>', to: [c.to], subject: c.subject, text: c.text, ...(c.reply_to ? { reply_to: c.reply_to } : {}) }),
  })
  if (!res.ok) return { ok: false, error: `The email did not send: ${res.status} ${await res.text()}` }
  const sent = await res.json().catch(() => ({}))
  return { ok: true, id: Number(c.quote_id) || 0, label: `Missing items to ${c.rep_name}`, created: { email_id: sent?.id || null, to: c.to } }
}

export async function rollbackClosingGaps(_r: Rest, _companyId: number, prop: Any): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  return { ok: false, error: `That email went to ${prop.payload?.created?.to || 'the rep'} and cannot be unsent.` }
}
