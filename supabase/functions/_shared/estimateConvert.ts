// An accepted estimate becomes a job — in ONE place.
//
// Before 2026-09-20 this was written twice: EstimateDetail.handleConvertToJob
// (the page, the full version) and approve-document (the customer portal,
// "simplified"). They had already drifted: the portal copy dropped
// in_utility_scope on every line (so an out-of-scope warranty on a
// portal-signed Energy Scout job would invoice as in-scope), never made the
// deposit invoice, never linked the audit, and left the lead at Won instead
// of the delivery column. The page's version is the truth; this is that
// version, callable from the page (convert-estimate), the portal
// (approve-document) and Arnie ("Halifax signed").
//
// Shape: planConversion() is pure — every decision (title, business unit,
// customer, lines, deposit, coverage dates, lead status) is computed from
// rows and returned, so tests pin it. convertEstimate() reads, plans and
// writes. undoConversion() takes exactly that away, and refuses once the
// job has moved on.

import type { Rest } from './arnieConfig.ts'
import { readRecordList } from './arnieRest.ts'

const hdr = (r: Rest) => ({ apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' })
const r2 = (n: unknown) => Math.round((Number(n) || 0) * 100) / 100
const nowIso = () => new Date().toISOString()

// ── ports of the client rules (tests hold each to its src/lib twin) ─────

const digits = (v: unknown) => String(v ?? '').replace(/\D/g, '').slice(-10)

/** src/lib/customerMatch.js findMatchingCustomer — email, phone, then a non-conflicting name. */
export async function findMatchingCustomer(r: Rest, companyId: number, { name, email, phone }: { name?: string | null; email?: string | null; phone?: string | null }): Promise<number | null> {
  const e = String(email || '').trim().toLowerCase()
  const p = digits(phone)
  const n = String(name || '').trim()
  if (e) {
    const rows = await readRecordList(r, `customers?select=id&company_id=eq.${companyId}&email=ilike.${encodeURIComponent(e)}&limit=1`)
    if (rows.length) return rows[0].id
  }
  if (p && p.length >= 7) {
    const rows = await readRecordList(r, `customers?select=id,phone&company_id=eq.${companyId}&phone=ilike.*${p.slice(-4)}*&limit=25`)
    const hit = rows.find((c: any) => digits(c.phone) === p)
    if (hit) return hit.id
  }
  if (n) {
    const rows = await readRecordList(r, `customers?select=id,email,phone&company_id=eq.${companyId}&name=ilike.${encodeURIComponent(n)}&limit=5`)
    const safe = rows.find((c: any) => {
      const emailConflict = c.email && e && String(c.email).trim().toLowerCase() !== e
      const phoneConflict = digits(c.phone) && p && digits(c.phone) !== p
      return !emailConflict && !phoneConflict
    })
    if (safe) return safe.id
  }
  return null
}

/** src/lib/customerMatch.js contactGapPatch — fill blanks only. */
export function contactGapPatch(customer: any, source: any): Record<string, string> | null {
  if (!customer || !source) return null
  const patch: Record<string, string> = {}
  for (const field of ['phone', 'email', 'address']) {
    const have = String(customer[field] ?? '').trim()
    const incoming = String(source[field] ?? '').trim()
    if (!have && incoming) patch[field] = incoming
  }
  return Object.keys(patch).length ? patch : null
}

/** src/lib/leadDeliveryStatus.js — the lead mirrors its job's status, in the company's own vocabulary. */
const DEFAULT_DELIVERY: Record<string, string> = { 'Chillin': 'Job Scheduled', 'Scheduled': 'Job Scheduled', 'On Hold': 'Job Scheduled', 'In Progress': 'In Progress', 'Completed': 'Job Complete' }
export function leadStatusForJob(jobStatus: string | null | undefined, jobStatuses: any[] = []): string {
  const js = jobStatus || 'Chillin'
  const ids = (jobStatuses || []).map((s) => typeof s === 'string' ? s : (s?.name || s?.id)).filter(Boolean) as string[]
  if (ids.length === 0) return DEFAULT_DELIVERY[js] || 'Job Scheduled'
  if (ids.includes(js)) return js
  if (/complete|done|finish/i.test(js)) return ids.find((x) => /complete|done|finish/i.test(x)) || ids[0]
  return ids.find((x) => /^scheduled$/i.test(x)) || ids.find((x) => /chillin|new|open/i.test(x)) || ids[0]
}

/** src/lib/businessUnitForWork.js — the division from the type of work. */
export const BU_ENERGY = 'Energy Scout'
export const BU_BUILDING = 'HHH Building Services'
export function classifyType(type: unknown): string | null {
  if (!type) return null
  const t = String(type).toLowerCase()
  if (/clean|window|exterior|janitor|pressure|power.?wash|maint/.test(t)) return BU_BUILDING
  if (/electric|energy|light|led|highbay|retrofit|fixture|lamp|lenard|ballast/.test(t)) return BU_ENERGY
  return null
}
export function classifyText(text: unknown): string | null {
  if (!text) return null
  const t = String(text).toLowerCase()
  if (/window|cleaning|janitor|pressure wash|power wash|exterior|awning|gutter/.test(t)) return BU_BUILDING
  if (/\blight|led\b|highbay|fixture|retrofit|lamp|electric|\bmes\b|smbe|wrap|strip|kelvin|watt|ballast|energy scout|energy|utility|rebate/.test(t)) return BU_ENERGY
  return null
}
export function deriveFromProducts(products: any[] = []): string | null {
  let energy = 0, building = 0
  for (const p of products || []) {
    if (p?.suggest_in_lenard) { energy++; continue }
    const bu = classifyType(p?.type) || classifyText(p?.name)
    if (bu === BU_ENERGY) energy++
    else if (bu === BU_BUILDING) building++
  }
  if (energy > building) return BU_ENERGY
  if (building > energy) return BU_BUILDING
  return null
}
export function deriveBusinessUnit({ products = [], text = '' }: { products?: any[]; text?: string } = {}): string | null {
  return deriveFromProducts(products) || classifyText(text)
}

// ── the plan: every decision, from rows, no writes ───────────────────────

export interface ConversionInput {
  quote: any
  lead: any | null
  customer: any | null          // the customer the quote/lead already points at, if any
  lines: any[]                  // quote_lines
  products: any[]               // products_services rows for the lines' item_ids (type, name, suggest_in_lenard, coverage months)
  jobStatuses: any[]            // settings.job_statuses
  laborWarrantyMonths: number
  partsWarrantyMonths: number
  today?: Date
}

export interface ConversionPlan {
  customerName: string
  businessName: string | null
  contact: { phone: string | null; email: string | null; address: string | null }
  jobTitle: string
  businessUnit: string | null
  status: string
  startDate: string | null
  jobTotal: number
  jobTotalSource: 'lines' | 'manual'
  discount: number
  utilityIncentive: number
  details: string | null
  notes: string | null
  lines: Record<string, unknown>[]      // job_lines rows minus company_id/job_id
  deposit: { label: string; amount: number } | null
  coverage: { laborUntil: string; partsUntil: string }
  leadStatus: string | null
}

const addMonths = (from: Date, months: number) => { const d = new Date(from); d.setMonth(d.getMonth() + months); return d.toISOString().slice(0, 10) }

export function planConversion(i: ConversionInput): ConversionPlan {
  const q = i.quote
  const ci = i.customer || i.lead || {}
  const customerName = String(ci?.name || ci?.customer_name || '').trim()
  const businessName = ci?.business_name || i.lead?.business_name || null
  const who = businessName || customerName
  const lineSum = r2((i.lines || []).reduce((s, l) => s + (parseFloat(l.line_total) || parseFloat(l.total) || 0), 0))
  const discount = r2(q.discount)
  const quoteAmount = r2(q.quote_amount)
  // The page: quote_amount, else lines less discount. The lines own the total
  // when they produced it (lib/jobTotal); a quote priced by hand is manual.
  const jobTotal = quoteAmount || r2(lineSum - discount)
  const jobTotalSource: 'lines' | 'manual' = i.lines?.length && Math.abs(r2(lineSum - discount) - jobTotal) < 0.01 ? 'lines' : 'manual'

  const productById = new Map((i.products || []).map((p: any) => [String(p.id), p]))
  const lines = (i.lines || []).map((line: any, idx: number) => ({
    item_id: line.item_id || null,
    item_name: line.item_name || productById.get(String(line.item_id))?.name || null,
    quantity: line.quantity || 1,
    price: line.price || 0,
    total: line.line_total ?? line.total ?? 0,
    totals: line.line_total ?? line.total ?? 0,
    discount: line.discount || 0,
    notes: line.notes || null,
    photos: line.photos || [],
    // Out-of-scope add-ons tagged on the estimate stay tagged on the job and
    // the invoice — the portal copy lost this and every add-on went in-scope.
    in_utility_scope: line.in_utility_scope !== false,
    description: line.description || line.item_name || null,
    labor_cost: line.labor_cost || 0,
    kind: line.kind ?? null,
    taxable: line.taxable ?? null,
    unit_of_measure: line.unit_of_measure ?? null,
    job_line_id: `JL-${idx + 1}`,
    _quote_line_id: line.id,
  }))

  // Deposit from the formal proposal.
  const cfg = q.settings_overrides?.formal_proposal || {}
  const dpRaw = parseFloat(cfg.down_payment_amount) || 0
  const dpAmount = cfg.down_payment_is_percent ? r2((lineSum - discount) * (dpRaw / 100)) : r2(dpRaw)
  const deposit = dpAmount > 0 ? { label: cfg.down_payment_label || 'Deposit', amount: dpAmount } : null

  // Coverage: company defaults plus what any Extended Service Coverage upsell on the quote added.
  let laborAdded = 0, partsAdded = 0
  for (const l of i.lines || []) {
    const p = productById.get(String(l.item_id)); if (!p) continue
    const qty = Number(l.quantity) || 1
    laborAdded += (Number(p.labor_coverage_months_added) || 0) * qty
    partsAdded += (Number(p.parts_coverage_months_added) || 0) * qty
  }
  const today = i.today || new Date()
  const coverage = { laborUntil: addMonths(today, (Number(i.laborWarrantyMonths) || 12) + laborAdded), partsUntil: addMonths(today, (Number(i.partsWarrantyMonths) || 12) + partsAdded) }

  const status = 'Chillin'
  return {
    customerName, businessName,
    contact: { phone: ci?.phone || i.lead?.phone || null, email: ci?.email || i.lead?.email || null, address: ci?.address || i.lead?.address || null },
    // Who, then what — never the bare service type (JOB-MTDMUYP4 was "Energy Efficiency").
    jobTitle: q.estimate_name || (who && q.service_type ? `${who} - ${q.service_type}` : null) || `${who || 'Customer'} - Job`,
    businessUnit: q.business_unit || deriveBusinessUnit({ products: lines.map((l) => productById.get(String(l.item_id))).filter(Boolean), text: q.estimate_name || q.service_type }) || null,
    status,
    // Only a real service date — an auto-filled start pushes every approved job into Scheduled.
    startDate: q.service_date || null,
    jobTotal, jobTotalSource, discount, utilityIncentive: r2(q.utility_incentive),
    details: [q.summary, q.notes, q.estimate_message].filter(Boolean).join('\n\n') || null,
    notes: [q.notes, q.summary].filter(Boolean).join('\n\n') || null,
    lines, deposit, coverage,
    leadStatus: i.lead ? leadStatusForJob(status, i.jobStatuses) : null,
  }
}

// ── read everything the plan needs ───────────────────────────────────────

export async function loadEstimate(r: Rest, companyId: number, quoteId: number) {
  const [quote] = await readRecordList(r, `quotes?select=*&company_id=eq.${companyId}&id=eq.${quoteId}&limit=1`)
  if (!quote) return null
  const lead = quote.lead_id ? (await readRecordList(r, `leads?select=id,customer_name,business_name,phone,email,address,customer_id,converted_customer_id,status,customer_signature_path,customer_signature_typed,customer_signature_method,customer_signature_captured_at&company_id=eq.${companyId}&id=eq.${quote.lead_id}&limit=1`))[0] || null : null
  const customerId = quote.customer_id || lead?.converted_customer_id || lead?.customer_id || null
  const customer = customerId ? (await readRecordList(r, `customers?select=id,name,email,phone,address,business_name&company_id=eq.${companyId}&id=eq.${customerId}&limit=1`))[0] || null : null
  const lines = await readRecordList(r, `quote_lines?select=id,item_id,item_name,quantity,price,line_total,total,discount,notes,photos,in_utility_scope,description,labor_cost,kind,taxable,unit_of_measure,sort_order&quote_id=eq.${quoteId}&order=sort_order.asc.nullslast,id.asc`)
  const itemIds = [...new Set(lines.map((l: any) => l.item_id).filter(Boolean))]
  const products = itemIds.length ? await readRecordList(r, `products_services?select=id,name,type,suggest_in_lenard,labor_coverage_months_added,parts_coverage_months_added&id=in.(${itemIds.join(',')})`) : []
  const settings = await readRecordList(r, `settings?select=key,value&company_id=eq.${companyId}&key=in.(job_statuses,default_labor_warranty_months,default_parts_warranty_months)`)
  const setting = (k: string) => { const row = settings.find((s: any) => s.key === k); if (!row) return null; try { return JSON.parse(row.value) } catch { return row.value } }
  return {
    quote, lead, customer, lines, products,
    jobStatuses: Array.isArray(setting('job_statuses')) ? setting('job_statuses') : [],
    laborWarrantyMonths: Number(setting('default_labor_warranty_months')) || 12,
    partsWarrantyMonths: Number(setting('default_parts_warranty_months')) || 12,
  }
}

// ── approve: the estimate is won ─────────────────────────────────────────

export interface ApproveOpts { deposit?: { amount: number; method?: string | null; date?: string | null; notes?: string | null; photo_url?: string | null } | null; createdBy?: string | null; signedAttachmentId?: number | null }

/** Status Approved, the deposit payment if one was taken, the lead to Won, the company told. What the page's two Approve buttons do. */
export async function approveEstimate(r: Rest, companyId: number, quoteId: number, opts: ApproveOpts = {}) {
  const [quote] = await readRecordList(r, `quotes?select=id,quote_id,status,lead_id,customer_id,estimate_name,quote_amount&company_id=eq.${companyId}&id=eq.${quoteId}&limit=1`)
  if (!quote) return { ok: false as const, error: 'No such estimate.' }
  const before = { status: quote.status, lead_status: null as string | null }
  const dep = opts.deposit
  const patch: Record<string, unknown> = { status: 'Approved', updated_at: nowIso() }
  if (dep) { patch.deposit_amount = r2(dep.amount); patch.deposit_method = dep.method || null; patch.deposit_date = dep.date || null; patch.deposit_notes = dep.notes || null; patch.deposit_photo = dep.photo_url || null }
  else patch.deposit_amount = 0
  if (opts.signedAttachmentId) patch.signed_proposal_attachment_id = opts.signedAttachmentId
  const up = await fetch(`${r.url}/rest/v1/quotes?id=eq.${quoteId}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
  if (!up.ok) return { ok: false as const, error: `Could not approve: ${up.status} ${await up.text()}` }

  let paymentId: number | null = null
  if (dep && r2(dep.amount) > 0) {
    const ins = await fetch(`${r.url}/rest/v1/payments`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' }, body: JSON.stringify({
      company_id: companyId, payment_id: `DEP-${Date.now().toString(36).toUpperCase()}`, amount: r2(dep.amount),
      date: dep.date || new Date().toISOString().slice(0, 10), method: dep.method || null, status: 'Completed',
      notes: `Deposit for estimate ${quote.quote_id || quote.id}${dep.notes ? ' — ' + dep.notes : ''}`, is_deposit: true, quote_id: quoteId, receipt_photo: dep.photo_url || null,
    }) })
    if (ins.ok) paymentId = (await ins.json())[0]?.id ?? null
  }
  if (quote.lead_id) {
    const [lead] = await readRecordList(r, `leads?select=status&id=eq.${quote.lead_id}&limit=1`)
    before.lead_status = lead?.status ?? null
    await fetch(`${r.url}/rest/v1/leads?id=eq.${quote.lead_id}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ status: 'Won', updated_at: nowIso() }) })
  }
  const amount = r2(quote.quote_amount)
  const who = (quote.customer_id ? (await readRecordList(r, `customers?select=name&id=eq.${quote.customer_id}&limit=1`))[0]?.name : null)
    || (quote.lead_id ? (await readRecordList(r, `leads?select=customer_name&id=eq.${quote.lead_id}&limit=1`))[0]?.customer_name : null) || 'Unknown'
  await fetch(`${r.url}/rest/v1/company_notifications`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({
    company_id: companyId, type: 'estimate_won', title: 'Estimate Won!', message: `${who}${amount > 0 ? ` — $${amount.toLocaleString()}` : ''} (${quote.quote_id || quote.id})`,
    metadata: { quote_id: quoteId, customer_name: who, amount }, created_by: opts.createdBy || null,
  }) })
  return { ok: true as const, before, paymentId }
}

// ── convert: the job, and everything that follows it ─────────────────────

export interface Converted { jobId: number; jobNumber: string; customerId: number | null; customerCreated: boolean; linesCopied: number; depositInvoice: { id: number; number: string; amount: number; label: string } | null; leadStatusBefore: string | null; warnings: string[] }

export async function convertEstimate(r: Rest, companyId: number, quoteId: number, opts: { createdBy?: string | null } = {}): Promise<{ ok: true; result: Converted } | { ok: false; error: string; stale?: boolean }> {
  const est = await loadEstimate(r, companyId, quoteId)
  if (!est) return { ok: false, error: 'No such estimate.' }
  if (est.quote.job_id) return { ok: false, stale: true, error: `${est.quote.quote_id || 'This estimate'} is already a job.` }
  const plan = planConversion(est)
  const warnings: string[] = []

  // 1. The customer: linked, else matched identity-safely, else created.
  let customerId: number | null = est.customer?.id ?? null
  let customerCreated = false
  const lead = est.lead
  if (!customerId && plan.customerName) {
    const matched = await findMatchingCustomer(r, companyId, { name: plan.customerName, email: plan.contact.email, phone: plan.contact.phone })
    if (matched) {
      customerId = matched
      const [row] = await readRecordList(r, `customers?select=phone,email,address&id=eq.${matched}&limit=1`)
      const patch = contactGapPatch(row, plan.contact)
      if (patch) await fetch(`${r.url}/rest/v1/customers?id=eq.${matched}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify(patch) })
    } else {
      const ins = await fetch(`${r.url}/rest/v1/customers`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' }, body: JSON.stringify({ company_id: companyId, name: plan.customerName, business_name: plan.businessName, phone: plan.contact.phone, email: plan.contact.email, address: plan.contact.address }) })
      if (!ins.ok) return { ok: false, error: `Could not create the customer: ${ins.status} ${await ins.text()}` }
      customerId = (await ins.json())[0].id; customerCreated = true
    }
  } else if (customerId && lead && est.customer) {
    const patch: Record<string, unknown> = {}
    if (!est.customer.phone && lead.phone) patch.phone = lead.phone
    if (!est.customer.email && lead.email) patch.email = lead.email
    if (!est.customer.address && lead.address) patch.address = lead.address
    if (!est.customer.business_name && lead.business_name) patch.business_name = lead.business_name
    if (Object.keys(patch).length) await fetch(`${r.url}/rest/v1/customers?id=eq.${customerId}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ ...patch, updated_at: nowIso() }) })
  }
  if (!customerId) warnings.push('no customer could be linked — the job has no customer record')

  // 2. The job.
  const jobNumber = `JOB-${Date.now().toString(36).toUpperCase()}`
  const jobRow: Record<string, unknown> = {
    company_id: companyId, job_id: jobNumber, job_title: plan.jobTitle, customer_id: customerId,
    customer_name: plan.customerName || plan.businessName || null, phone: plan.contact.phone, email: plan.contact.email,
    lead_id: est.quote.lead_id ? parseInt(String(est.quote.lead_id)) : null, salesperson_id: est.quote.salesperson_id || null, quote_id: quoteId,
    business_unit: plan.businessUnit, job_address: plan.contact.address, status: plan.status, start_date: plan.startDate,
    job_total: plan.jobTotal, job_total_source: plan.jobTotalSource, discount: plan.discount, utility_incentive: plan.utilityIncentive,
    details: plan.details, notes: plan.notes,
    labor_coverage_until_date: plan.coverage.laborUntil, parts_coverage_until_date: plan.coverage.partsUntil,
    signed_proposal_attachment_id: est.quote.signed_proposal_attachment_id || null,
    customer_signature_path: lead?.customer_signature_path || null, customer_signature_typed: lead?.customer_signature_typed || null,
    customer_signature_method: lead?.customer_signature_method || null, customer_signature_captured_at: lead?.customer_signature_captured_at || null,
    updated_at: nowIso(),
  }
  const jins = await fetch(`${r.url}/rest/v1/jobs`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' }, body: JSON.stringify(jobRow) })
  if (!jins.ok) return { ok: false, error: `Could not create the job: ${jins.status} ${await jins.text()}` }
  const job = (await jins.json())[0]

  // 3. The lines, then the photos that were on them.
  let linesCopied = 0
  if (plan.lines.length) {
    const rows = plan.lines.map(({ _quote_line_id, job_line_id, ...l }) => ({ company_id: companyId, job_id: job.id, job_line_id: `JL-${job.id}-${job_line_id.slice(3)}`, ...l }))
    const lins = await fetch(`${r.url}/rest/v1/job_lines`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' }, body: JSON.stringify(rows) })
    if (!lins.ok) warnings.push(`line items failed to copy: ${lins.status} ${await lins.text()}`)
    else {
      const made = await lins.json(); linesCopied = made.length
      for (let k = 0; k < plan.lines.length; k++) {
        const qlId = plan.lines[k]._quote_line_id, jlId = made[k]?.id
        if (qlId && jlId) await fetch(`${r.url}/rest/v1/file_attachments?quote_line_id=eq.${qlId}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ job_id: job.id, job_line_id: jlId }) })
      }
    }
  }
  // 4. Documents and note photos on the estimate ride along; the audit points at its job.
  await fetch(`${r.url}/rest/v1/file_attachments?quote_id=eq.${quoteId}&company_id=eq.${companyId}&job_id=is.null`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ job_id: job.id }) })
  if (est.quote.audit_id) await fetch(`${r.url}/rest/v1/lighting_audits?id=eq.${est.quote.audit_id}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ job_id: job.id }) })

  // 5. The deposit invoice, and the deposit already taken on the estimate applied to it.
  let depositInvoice: Converted['depositInvoice'] = null
  if (plan.deposit) {
    const number = `INV-DEP-${Date.now().toString(36).toUpperCase()}`
    const dins = await fetch(`${r.url}/rest/v1/invoices`, { method: 'POST', headers: { ...hdr(r), Prefer: 'return=representation' }, body: JSON.stringify({
      company_id: companyId, job_id: job.id, customer_id: customerId, invoice_id: number, amount: plan.deposit.amount, payment_status: 'Draft', invoice_type: 'deposit',
      business_unit: plan.businessUnit, job_description: `${plan.deposit.label} for ${est.quote.estimate_name || est.quote.quote_id || 'project'}`,
      notes: `Auto-generated deposit invoice from ${est.quote.quote_id || `EST-${quoteId}`}. ${plan.deposit.label} due upon acceptance per formal proposal.`, created_at: nowIso(), updated_at: nowIso(),
    }) })
    if (!dins.ok) warnings.push(`deposit invoice failed: ${dins.status}`)
    else {
      const inv = (await dins.json())[0]
      depositInvoice = { id: inv.id, number, amount: plan.deposit.amount, label: plan.deposit.label }
      const [paid] = await readRecordList(r, `payments?select=id,amount&company_id=eq.${companyId}&quote_id=eq.${quoteId}&is_deposit=eq.true&order=created_at.desc&limit=1`)
      if (paid?.id) {
        await fetch(`${r.url}/rest/v1/payments?id=eq.${paid.id}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ invoice_id: inv.id, job_id: job.id }) })
        const amt = r2(paid.amount)
        const status = amt >= plan.deposit.amount - 0.01 ? 'Paid' : amt > 0 ? 'Partial' : null
        if (status) await fetch(`${r.url}/rest/v1/invoices?id=eq.${inv.id}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ payment_status: status, updated_at: nowIso() }) })
      }
    }
  }

  // 6. Expenses on the estimate (and on the lead, not yet on a job) belong to the job now.
  await fetch(`${r.url}/rest/v1/expenses?quote_id=eq.${quoteId}&company_id=eq.${companyId}&job_id=is.null`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ job_id: job.id }) })
  if (est.quote.lead_id) await fetch(`${r.url}/rest/v1/expenses?lead_id=eq.${est.quote.lead_id}&company_id=eq.${companyId}&job_id=is.null`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ job_id: job.id }) })

  // 7. The estimate points at its job; the lead lands in the delivery column and knows its customer.
  await fetch(`${r.url}/rest/v1/quotes?id=eq.${quoteId}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ job_id: job.id, customer_id: customerId, updated_at: nowIso() }) })
  let leadStatusBefore: string | null = null
  if (lead) {
    leadStatusBefore = lead.status ?? null
    await fetch(`${r.url}/rest/v1/leads?id=eq.${lead.id}&company_id=eq.${companyId}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify({ status: plan.leadStatus, converted_customer_id: customerId, ...(lead.customer_id ? {} : { customer_id: customerId }), updated_at: nowIso() }) })
  }
  return { ok: true, result: { jobId: job.id, jobNumber, customerId, customerCreated, linesCopied, depositInvoice, leadStatusBefore, warnings } }
}

// ── undo: exactly what convert made, only while nothing has happened to it ──

export async function undoConversion(r: Rest, companyId: number, c: Converted & { quoteId: number; quoteStatusBefore?: string | null; quoteDepositBefore?: number | null; leadWonBefore?: string | null; depositPaymentId?: number | null }) {
  const [job] = await readRecordList(r, `jobs?select=id,status,start_date&company_id=eq.${companyId}&id=eq.${c.jobId}&limit=1`)
  if (!job) return { ok: false as const, error: 'That job is already gone.' }
  if (job.status !== 'Chillin' || job.start_date) return { ok: false as const, error: `${c.jobNumber} has been scheduled or moved since — undoing it now would lose that work. Cancel it from the job page instead.` }
  const [clocked] = await readRecordList(r, `time_clock?select=id&company_id=eq.${companyId}&job_id=eq.${c.jobId}&limit=1`)
  if (clocked) return { ok: false as const, error: `Someone has already clocked in on ${c.jobNumber}. Cancel it from the job page instead.` }
  const invs = await readRecordList(r, `invoices?select=id,invoice_type,payment_status&company_id=eq.${companyId}&job_id=eq.${c.jobId}`)
  if (invs.some((i: any) => i.invoice_type !== 'deposit')) return { ok: false as const, error: `${c.jobNumber} has been invoiced. Cancel it from the job page instead.` }
  const dep = invs.find((i: any) => i.invoice_type === 'deposit')
  if (dep && dep.payment_status !== 'Draft' && !c.depositPaymentId) return { ok: false as const, error: `The deposit invoice on ${c.jobNumber} has money on it. Cancel it from the job page instead.` }

  const del = (path: string) => fetch(`${r.url}/rest/v1/${path}`, { method: 'DELETE', headers: { ...hdr(r), Prefer: 'return=minimal' } })
  const patch = (path: string, body: unknown) => fetch(`${r.url}/rest/v1/${path}`, { method: 'PATCH', headers: { ...hdr(r), Prefer: 'return=minimal' }, body: JSON.stringify(body) })
  // Things that were re-pointed go back; things that were made go away.
  await patch(`file_attachments?job_id=eq.${c.jobId}&company_id=eq.${companyId}`, { job_id: null, job_line_id: null })
  await patch(`expenses?job_id=eq.${c.jobId}&company_id=eq.${companyId}`, { job_id: null })
  await patch(`lighting_audits?job_id=eq.${c.jobId}&company_id=eq.${companyId}`, { job_id: null })
  if (c.depositPaymentId) { await patch(`payments?id=eq.${c.depositPaymentId}&company_id=eq.${companyId}`, { invoice_id: null, job_id: null }); await del(`payments?id=eq.${c.depositPaymentId}&company_id=eq.${companyId}`) }
  else await patch(`payments?job_id=eq.${c.jobId}&company_id=eq.${companyId}`, { invoice_id: null, job_id: null })
  if (dep) await del(`invoices?id=eq.${dep.id}&company_id=eq.${companyId}`)
  await del(`job_lines?job_id=eq.${c.jobId}&company_id=eq.${companyId}`)
  await patch(`quotes?id=eq.${c.quoteId}&company_id=eq.${companyId}`, { job_id: null, ...(c.quoteStatusBefore ? { status: c.quoteStatusBefore, deposit_amount: c.quoteDepositBefore ?? null } : {}), updated_at: nowIso() })
  const [quote] = await readRecordList(r, `quotes?select=lead_id&id=eq.${c.quoteId}&limit=1`)
  if (quote?.lead_id) await patch(`leads?id=eq.${quote.lead_id}&company_id=eq.${companyId}`, { status: c.leadWonBefore ?? c.leadStatusBefore ?? 'Quote Sent', converted_customer_id: null, updated_at: nowIso() })
  const jd = await del(`jobs?id=eq.${c.jobId}&company_id=eq.${companyId}`)
  if (!jd.ok) return { ok: false as const, error: `Could not remove ${c.jobNumber}: ${jd.status} ${await jd.text()}` }
  if (c.customerCreated && c.customerId) {
    const uses = await readRecordList(r, `jobs?select=id&company_id=eq.${companyId}&customer_id=eq.${c.customerId}&limit=1`)
    if (!uses.length) {
      await patch(`quotes?customer_id=eq.${c.customerId}&company_id=eq.${companyId}`, { customer_id: null })
      await patch(`leads?customer_id=eq.${c.customerId}&company_id=eq.${companyId}`, { customer_id: null })
      await del(`customers?id=eq.${c.customerId}&company_id=eq.${companyId}`)
    }
  }
  return { ok: true as const, deleted: 1 }
}
