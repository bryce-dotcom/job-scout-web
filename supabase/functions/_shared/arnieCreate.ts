// The create rail: Arnie drafts a NEW record, a person approves it, and the
// row exists only after that click. Same propose → approve → apply → rollback
// shape as config, record and bulk, so the trust model is the one people
// already know.
//
// Leads first. A lead is the cheapest thing in the system to create and to
// delete, it is the top of the funnel, and it is the thing a setter wants to
// say out loud on the phone: "new lead, Halifax Flooring, Ben, solar retrofit,
// came from Angi". Everything the model supplies is checked here — the
// model never writes a column name, only field values the registry knows.
//
// The duplicate check is not optional and not the model's job. Before a lead
// is even drafted, similar_leads() (the same rule the insert trigger and the
// forms use) is asked. If something matches, the draft stops and the person
// is asked "use that one, or is this really new?" — exactly what would have
// saved Tracy's Halifax fee.

import type { Rest } from './arnieConfig.ts'
import type { Caller } from './auth.ts'
import { readRecordList } from './arnieRest.ts'
import { RECORD_TARGETS, activeJobId, resolveEntity } from './arnieRecords.ts'
import { applyAppointment, prepareAppointment, rollbackAppointment } from './arnieAppointment.ts'
import { applyQuote, prepareQuote, rollbackQuote } from './arnieQuote.ts'
import { applyFollowup, prepareFollowup, rollbackFollowup } from './arnieFollowup.ts'
import { applyPayment, preparePayment, rollbackPayment } from './arniePayment.ts'
import { prepareExpense } from './arnieExpense.ts'
import { applyCompanySetup, prepareCompanySetup, rollbackCompanySetup } from './companySetup.ts'
import { applyEmployee, prepareEmployee, rollbackEmployee } from './arnieEmployee.ts'
import { applyPriceBook, preparePriceBook, rollbackPriceBook } from './arniePriceBook.ts'
import { applyWon, prepareWon, rollbackWon } from './arnieWon.ts'

interface CreateField {
  /** Column on the table. null = resolved by `prepare`, never written as-is. */
  column: string | null
  label: string
  required?: boolean
  /** Longest value accepted; longer is refused rather than silently cut. */
  max?: number
  /** Reject anything that does not look like this kind of value. */
  shape?: 'email' | 'phone'
  /** Accept only one of these (case-insensitive; stored in this casing). */
  oneOf?: string[]
  /** Structured, not a string: kept as JSON for `prepare` to parse and check. */
  raw?: true
}

/** What `prepare` hands back: extra columns to store, and rows for the card. */
export type Prepared =
  | { ok: true; columns: Record<string, unknown>; display: { label: string; value: string }[] }
  | { ok: false; error: string }
  | { needs_choice: { id: number; label: string }[]; message: string }

export interface CreateTarget {
  label: string
  table: string
  /** Access-ladder level needed to draft and to approve. */
  minLevel: number
  fields: Record<string, CreateField>
  /** What the card and the audit call the new row. */
  labelOf: (fields: Record<string, string>) => string
  /** The approve button. "Create" unless the action is really something else — "Send". */
  verb?: string
  /** What the card says once applied, when "Created" would be wrong. */
  done?: string
  /** Resolve anything that is not a plain column — e.g. "the Drinkle job" → job_id. */
  prepare?: (r: Rest, caller: Caller, fields: Record<string, string>) => Promise<Prepared>
  /**
   * A target whose apply is more than one insert (an appointment also
   * touches the lead and writes fees). Replaces the generic insert; must
   * return what it made so rollbackCustom can take exactly that away.
   */
  applyCustom?: (r: Rest, companyId: number, prop: any) => Promise<{ ok: true; id: number; label: string; created: Record<string, unknown> } | { ok: false; error: string; stale?: boolean }>
  rollbackCustom?: (r: Rest, companyId: number, prop: any) => Promise<{ ok: true; deleted: number } | { ok: false; error: string }>
}

export const CREATE_TARGETS: Record<string, CreateTarget> = {
  lead: {
    label: 'lead',
    table: 'leads',
    // Anyone can create a lead: LeadSetter is ungated and setters are level 0.
    minLevel: 0,
    fields: {
      customer_name:  { column: 'customer_name',  label: 'Contact',        required: true, max: 120 },
      business_name:  { column: 'business_name',  label: 'Business',       max: 120 },
      phone:          { column: 'phone',          label: 'Phone',          max: 40, shape: 'phone' },
      email:          { column: 'email',          label: 'Email',          max: 120, shape: 'email' },
      address:        { column: 'address',        label: 'Address',        max: 300 },
      service_type:   { column: 'service_type',   label: 'Service',        max: 80 },
      lead_source:    { column: 'lead_source',    label: 'Source',         max: 80 },
      notes:          { column: 'notes',          label: 'Notes',          max: 2000 },
    },
    labelOf: (f) => f.business_name && f.customer_name
      ? `${f.business_name} (${f.customer_name})`
      : (f.business_name || f.customer_name || 'new lead'),
  },

  // Diagnose slice 2. Slice 1 lets a tech ask why a contactor chatters;
  // this keeps the answer once they find it, on the job, searchable — so
  // next time Arnie says "we fixed this on the Drinkle job in March" before
  // he says anything from general knowledge.
  diagnosis: {
    label: 'diagnosis',
    table: 'job_diagnoses',
    minLevel: 0,
    fields: {
      equipment: { column: 'equipment', label: 'Equipment',  max: 160 },
      symptom:   { column: 'symptom',   label: 'Symptom',    required: true, max: 600 },
      cause:     { column: 'cause',     label: 'Cause',      max: 600 },
      fix:       { column: 'fix',       label: 'Fix',        required: true, max: 1000 },
      parts:     { column: 'parts',     label: 'Parts used', max: 400 },
      outcome:   { column: 'outcome',   label: 'Outcome',    max: 20, oneOf: ['fixed', 'partial', 'escalated', 'unresolved'] },
      trade:     { column: 'trade',     label: 'Trade',      max: 60 },
      // Not a column: resolved to job_id by `prepare`. The model describes
      // the job the way the user did; it never supplies an id.
      job:       { column: null,        label: 'Job',        max: 160 },
    },
    labelOf: (f) => `${f.equipment ? f.equipment + ': ' : ''}${f.symptom}`.slice(0, 120),
    prepare: async (r, caller, f) => {
      const companyId = caller.companyId as number
      let jobId: number | null = null
      let jobLabel = ''
      if (f.job) {
        const found = await resolveEntity(r, companyId, RECORD_TARGETS.job_note, f.job)
        if ('error' in found) return { ok: false, error: found.error }
        if ('candidates' in found) {
          return { needs_choice: found.candidates, message: 'More than one job matches. Ask which one, then call again with the job named exactly as listed.' }
        }
        jobId = found.row.id
        jobLabel = RECORD_TARGETS.job_note.labelOf(found.row)
      } else {
        // No job named: if they are clocked in, that is the job.
        const active = await activeJobId(r, companyId, caller.employeeId)
        if (active) {
          const rows = await readRecordList(r, `jobs?select=id,job_id,job_title,customer_name,business_name&company_id=eq.${companyId}&id=eq.${active}&limit=1`)
          if (rows[0]) { jobId = rows[0].id; jobLabel = RECORD_TARGETS.job_note.labelOf(rows[0]) + ' (clocked in)' }
        }
      }
      return {
        ok: true,
        columns: { job_id: jobId },
        display: [{ label: 'Job', value: jobId ? jobLabel : '(none — general note)' }],
      }
    },
  },

  // Arnie files the ticket. Tracy's three tickets in September were all
  // his diagnosis, copied by hand into the Feedback widget — and he was
  // right every time. This is the same widget, the same table, the same
  // queue; the person still approves the card, and the ticket carries
  // THEIR email so the reply reaches them, not Arnie.
  ticket: {
    label: 'ticket',
    table: 'feedback',
    minLevel: 0,
    fields: {
      subject:       { column: 'subject',       label: 'Subject', max: 140 },
      message:       { column: 'message',       label: 'Details', required: true, max: 4000 },
      feedback_type: { column: 'feedback_type', label: 'Type',    max: 20, oneOf: ['bug', 'feature', 'question', 'feedback'] },
    },
    labelOf: (f) => (f.subject || f.message || 'ticket').slice(0, 100),
  },

  // "Book them Tuesday at two with Jordan." Every side effect the Lead
  // Setter page has — see arnieAppointment.ts for the list and why it has
  // to be all of them.
  appointment: {
    label: 'appointment',
    table: 'appointments',
    minLevel: 0,
    fields: {
      lead:             { column: null, label: 'Lead',   required: true, max: 160 },
      when:             { column: null, label: 'When',   required: true, max: 40 },
      timezone:         { column: null, label: 'Zone',   max: 64 },
      salesperson:      { column: null, label: 'With',   max: 80 },
      duration_minutes: { column: null, label: 'Length', max: 4 },
      location:         { column: null, label: 'Where',  max: 300 },
      notes:            { column: null, label: 'Notes',  max: 1000 },
    },
    labelOf: (f) => `${f.lead} — ${f.when}${f.salesperson ? ' with ' + f.salesperson : ''}`.slice(0, 120),
    prepare: prepareAppointment,
    applyCustom: applyAppointment,
    rollbackCustom: rollbackAppointment,
  },

  // "Quote Halifax Flooring for 40 high bays and 12 wall packs." Lines come
  // from the price book; the write goes through estimateIntake. See
  // arnieQuote.ts.
  quote: {
    label: 'quote',
    table: 'quotes',
    minLevel: 0,
    fields: {
      lead:          { column: null, label: 'Lead',     max: 160 },
      customer:      { column: null, label: 'Customer', max: 160 },
      lines:         { column: null, label: 'Lines',    required: true, max: 8000, raw: true },
      estimate_name: { column: null, label: 'Name',     max: 140 },
      service_type:  { column: null, label: 'Service',  max: 80 },
      salesperson:   { column: null, label: 'Rep',      max: 80 },
      notes:         { column: null, label: 'Notes',    max: 2000 },
    },
    labelOf: (f) => `Quote for ${f.lead || f.customer || 'someone'}`.slice(0, 120),
    prepare: prepareQuote,
    applyCustom: applyQuote,
    rollbackCustom: rollbackQuote,
  },

  // A personal follow-up on a quote that went quiet. The one rail whose
  // apply cannot be undone, and the card says Send, not Create. See
  // arnieFollowup.ts.
  followup: {
    label: 'follow-up',
    table: 'communications_log',
    minLevel: 0,
    verb: 'Send',
    done: 'Sent. It is in the communications log; the quote counts one more follow-up.',
    fields: {
      quote:   { column: null, label: 'Quote',   required: true, max: 160 },
      message: { column: null, label: 'Message', required: true, max: 2000 },
      subject: { column: null, label: 'Subject', max: 140 },
      channel: { column: null, label: 'How',     max: 5, oneOf: ['email', 'sms'] },
    },
    labelOf: (f) => `Follow-up on ${f.quote}`.slice(0, 120),
    prepare: prepareFollowup,
    applyCustom: applyFollowup,
    rollbackCustom: rollbackFollowup,
  },

  // "Halifax paid $3,200 by check." The Invoices page's Record Payment, by
  // voice: the row, the status from the one rule, the receipt. Admin —
  // money in is the owner's ledger. See arniePayment.ts.
  payment: {
    label: 'payment',
    table: 'payments',
    minLevel: 3,
    verb: 'Record',
    done: 'Recorded. The invoice status is updated and the receipt, if there was an address, is on its way.',
    fields: {
      invoice:   { column: null, label: 'Invoice',   required: true, max: 160 },
      amount:    { column: null, label: 'Amount',    required: true, max: 20 },
      method:    { column: null, label: 'Method',    required: true, max: 40 },
      date:      { column: null, label: 'Date',      max: 10 },
      reference: { column: null, label: 'Reference', max: 140 },
    },
    labelOf: (f) => `Payment on ${f.invoice}`.slice(0, 120),
    prepare: preparePayment,
    applyCustom: applyPayment,
    rollbackCustom: rollbackPayment,
  },

  // "Log this receipt." The photo is read by the model; the card shows what
  // it read; the file is attached by the client on approve. Anyone. See
  // arnieExpense.ts.
  expense: {
    label: 'expense',
    table: 'expenses',
    minLevel: 0,
    verb: 'Log',
    done: 'Logged. It is on Expenses as Pending, receipt attached if there was one.',
    fields: {
      amount:      { column: null, label: 'Amount',      required: true, max: 20 },
      merchant:    { column: null, label: 'Merchant',    required: true, max: 80 },
      date:        { column: null, label: 'Date',        max: 20 },
      category:    { column: null, label: 'Category',   max: 40 },
      description: { column: null, label: 'What for',   max: 200 },
      job:         { column: null, label: 'Job',         max: 160 },
      notes:       { column: null, label: 'Notes',       max: 200 },
      receipt:     { column: null, label: 'Receipt',     max: 8 },
      timezone:    { column: null, label: 'Timezone',    max: 60 },
    },
    labelOf: (f) => `${f.merchant || 'expense'} ${f.amount || ''}`.trim().slice(0, 120),
    prepare: prepareExpense,
  },

  // "Set up the company." Name, address, trade, entity — and the address
  // does the rest: time zone, state income tax, sales-tax floor, SUI wage
  // base and new-employer rate, deposit schedules, the first business
  // unit, service types, NAICS, the AI crew. Owner/admin. Every derived
  // figure is on the card with where it came from. See companySetup.ts.
  company_setup: {
    label: 'company',
    table: 'companies',
    minLevel: 3,
    verb: 'Set up',
    done: 'Set up. Everything on the card is in Settings → Company now; the "still yours" items are waiting there too.',
    fields: {
      name:                { column: null, label: 'Company',     required: true, max: 120 },
      address:             { column: null, label: 'Address',     required: true, max: 200 },
      trade:               { column: null, label: 'Trade',       max: 120 },
      entity:              { column: null, label: 'Entity',      max: 40 },
      legal_name:          { column: null, label: 'Legal name',  max: 120 },
      phone:               { column: null, label: 'Phone',       max: 30 },
      email:               { column: null, label: 'Email',       max: 120 },
      website:             { column: null, label: 'Website',     max: 120 },
      ein:                 { column: null, label: 'EIN',         max: 12 },
      pay_frequency:       { column: null, label: 'Payroll',     max: 40 },
      charges_sales_tax:   { column: null, label: 'Sales tax',   max: 5 },
      local_sales_tax_pct: { column: null, label: 'Local rate',  max: 8 },
    },
    labelOf: (f) => `Set up ${f.name}`.slice(0, 120),
    prepare: prepareCompanySetup,
    applyCustom: applyCompanySetup,
    rollbackCustom: rollbackCompanySetup,
  },

  // "Add Jordan Reyes, field tech, jordan@…, $28 an hour, starts Monday."
  // Pay lands only when the caller could see it on the Employees page.
  employee: {
    label: 'employee',
    table: 'employees',
    minLevel: 3,
    verb: 'Add',
    done: 'Added. They are on the Employees page now; the invite (if any) is on its way.',
    fields: {
      name:               { column: null, label: 'Name',          required: true, max: 120 },
      role:               { column: null, label: 'Job title',     max: 40 },
      email:              { column: null, label: 'Email',         max: 120, shape: 'email' },
      phone:              { column: null, label: 'Phone',         max: 30, shape: 'phone' },
      user_role:          { column: null, label: 'Access',        max: 20, oneOf: ['User', 'Team Lead', 'Manager', 'Admin'] },
      hourly_rate:        { column: null, label: 'Hourly rate',   max: 20 },
      annual_salary:      { column: null, label: 'Salary',        max: 20 },
      hire_date:          { column: null, label: 'Start date',    max: 40 },
      tax_classification: { column: null, label: 'Tax',           max: 20 },
      business_unit:      { column: null, label: 'Business unit', max: 80 },
      invite:             { column: null, label: 'Invite',        max: 5 },
    },
    labelOf: (f) => String(f.name || '').slice(0, 120),
    prepare: prepareEmployee,
    applyCustom: applyEmployee,
    rollbackCustom: rollbackEmployee,
  },

  // "Halifax signed." — the estimate is won: Approved, the job made, the lead moved. The rep's or a manager's.
  won: {
    label: 'won estimate',
    table: 'jobs',
    minLevel: 0,
    verb: 'Mark won',
    done: 'Won. The job is on the Job Board waiting to be scheduled; the estimate reads Approved; the company has been told.',
    fields: {
      quote:          { column: null, label: 'Estimate', required: true, max: 160 },
      deposit_amount: { column: null, label: 'Deposit',  max: 20 },
      deposit_method: { column: null, label: 'Method',   max: 30 },
    },
    labelOf: (f) => `Won: ${f.quote}`.slice(0, 120),
    prepare: prepareWon,
    applyCustom: applyWon,
    rollbackCustom: rollbackWon,
  },

  // "Here's my price list" + a photo, PDF or sheet → the rows, checked, deduped, as one card.
  price_book: {
    label: 'price book',
    table: 'products_services',
    minLevel: 2,
    verb: 'Add to price book',
    done: 'Added. They are on Products & Services, ungrouped — drag them into sections there.',
    fields: {
      items:  { column: null, label: 'Items',  required: true, max: 60000, raw: true },
      source: { column: null, label: 'Source', max: 120 },
    },
    labelOf: (f) => { try { const n = JSON.parse(f.items || '[]').length; return `${n} item${n === 1 ? '' : 's'}${f.source ? ' from ' + f.source : ''}` } catch { return 'price list' } },
    prepare: preparePriceBook,
    applyCustom: applyPriceBook,
    rollbackCustom: rollbackPriceBook,
  },

  // "Call the Riverside job 'the gym'." "From now on, brief me by text."
  // A fact about THIS person that rides into every conversation from now
  // on (arnie-chat reads arnie_memories for the caller). The card is the
  // consent: nothing is remembered until they approve it, and it is theirs
  // to forget from Arnie → Settings. Never a company fact, never another
  // person's — those belong on the record, not in a head.
  memory: {
    label: 'memory',
    table: 'arnie_memories',
    minLevel: 0,
    verb: 'Remember',
    done: 'Remembered. It rides into every conversation from now on; forget it from Arnie → Settings.',
    fields: {
      text: { column: 'text', label: 'Remember', required: true, max: 240 },
      kind: { column: 'kind', label: 'Kind', max: 12, oneOf: ['preference', 'alias', 'fact'] },
    },
    labelOf: (f) => String(f.text || '').slice(0, 120),
    prepare: async (r, caller, f) => {
      if (caller.employeeId == null) return { ok: false, error: 'This login has no employee record, so there is nobody to remember it for.' }
      const text = String(f.text || '').trim().replace(/\s+/g, ' ')
      if (text.length < 3) return { ok: false, error: 'Tell me what to remember, in a sentence.' }
      // One line about the person, not a paragraph about the company; and not a
      // secret — a password or a card number is not something to keep in a head.
      if (/\b(password|passcode|ssn|social security|card number|cvv|routing number|account number)\b/i.test(text)) {
        return { ok: false, error: 'I will not keep a password or an account number. Those belong in the app\'s own settings, where they are protected.' }
      }
      const mine = await readRecordList(r, `arnie_memories?select=id,text&company_id=eq.${caller.companyId}&employee_id=eq.${caller.employeeId}&limit=100`)
      if (mine.some((m: any) => String(m.text).trim().toLowerCase() === text.toLowerCase())) return { ok: false, error: `I already have that: "${text}".` }
      if (mine.length >= 40) return { ok: false, error: `I am holding 40 things for you already — that is the limit. Forget one from Arnie → Settings first.` }
      return {
        ok: true,
        columns: { employee_id: caller.employeeId, created_by: caller.email, source: 'arnie' },
        display: [{ label: 'Remember', value: text }, { label: 'For', value: 'you — nobody else sees it' }],
      }
    },
  },
}

export const isCreateTarget = (t: string): boolean => Object.hasOwn(CREATE_TARGETS, t)

export function createTargetsSentence(): string {
  return Object.entries(CREATE_TARGETS)
    .map(([k, t]) => `${k} (fields: ${Object.keys(t.fields).join(', ')})`)
    .join('; ')
}

export interface CreatePreview {
  kind: 'create'
  label: string
  entity: string
  fields: { label: string; value: string }[]
  /** Set when the draft went ahead despite a near-match the user waved off. */
  despite?: string
}

export type CreateProposeResult =
  | { proposal: any; preview: CreatePreview }
  | { needs_choice: { id: number; label: string; matched_on: string; status: string }[]; message: string }
  | { error: string }

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const PHONE_DIGITS = /\d{7,}/

/** Clean and validate what the model supplied against the registry. */
function cleanFields(target: CreateTarget, raw: unknown): { ok: true; fields: Record<string, string> } | { ok: false; error: string } {
  const src = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}
  const fields: Record<string, string> = {}
  const unknown = Object.keys(src).filter((k) => !Object.hasOwn(target.fields, k))
  if (unknown.length) return { ok: false, error: `A ${target.label} has no field called ${unknown.join(', ')}. Use: ${Object.keys(target.fields).join(', ')}.` }

  for (const [key, def] of Object.entries(target.fields)) {
    const v = src[key]
    const s = v == null ? '' : (def.raw ? JSON.stringify(v) : String(v).trim())
    if (!s) {
      if (def.required) return { ok: false, error: `I need the ${def.label.toLowerCase()} to create a ${target.label}.` }
      continue
    }
    if (def.max && s.length > def.max) return { ok: false, error: `${def.label} is too long (${s.length} characters, limit ${def.max}).` }
    if (def.shape === 'email' && !EMAIL.test(s)) return { ok: false, error: `"${s}" doesn't look like an email address.` }
    if (def.shape === 'phone' && !PHONE_DIGITS.test(s.replace(/\D/g, ''))) return { ok: false, error: `"${s}" doesn't look like a phone number.` }
    if (def.oneOf) {
      const hit = def.oneOf.find((o) => o.toLowerCase() === s.toLowerCase())
      if (!hit) return { ok: false, error: `${def.label} must be one of: ${def.oneOf.join(', ')}.` }
      fields[key] = hit
      continue
    }
    fields[key] = s
  }
  return { ok: true, fields }
}

async function similarLeads(r: Rest, companyId: number, f: Record<string, string>, excludeId: number | null = null) {
  const res = await fetch(`${r.url}/rest/v1/rpc/similar_leads`, {
    method: 'POST',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_company_id: companyId,
      p_customer_name: f.customer_name ?? null,
      p_business_name: f.business_name ?? null,
      p_phone: f.phone ?? null,
      p_email: f.email ?? null,
      p_exclude_id: excludeId,
      p_limit: 5,
    }),
  })
  if (!res.ok) return []
  const rows = await res.json().catch(() => [])
  return Array.isArray(rows) ? rows : []
}

const leadLabel = (l: any) => l.business_name && l.customer_name
  ? `${l.business_name} (${l.customer_name})`
  : (l.business_name || l.customer_name || `lead #${l.id}`)

export async function proposeCreate(
  r: Rest,
  caller: Caller,
  input: { target: string; fields?: unknown; confirm_new?: boolean; request_text?: string },
): Promise<CreateProposeResult> {
  const companyId = caller.companyId
  if (companyId == null) return { error: 'No company on this login.' }
  const target = CREATE_TARGETS[input.target]
  if (!target) return { error: `"${input.target}" isn't something Arnie can create. It can create: ${createTargetsSentence()}.` }
  if (caller.level < target.minLevel) return { error: `Creating a ${target.label} is above your access level. Ask a manager.` }

  const cleaned = cleanFields(target, input.fields)
  if (!cleaned.ok) return { error: cleaned.error }
  const fields = cleaned.fields

  // The duplicate check. Not skippable by the model; only the person can
  // wave it off, and the card then says that they did.
  let despite: string | undefined
  if (target.table === 'leads') {
    const similar = await similarLeads(r, companyId, fields)
    if (similar.length && !input.confirm_new) {
      return {
        needs_choice: similar.map((l: any) => ({
          id: l.id, label: leadLabel(l), matched_on: l.matched_on || 'similar', status: l.status || 'New',
        })),
        message: 'A lead like this already exists. Tell the user which one(s) matched and how, and ask whether to use the existing lead instead. Only call again with confirm_new=true if the USER says it is a different customer.',
      }
    }
    if (similar.length && input.confirm_new) {
      despite = `Created even though it looks like ${leadLabel(similar[0])} — the user said it's a different customer.`
    }
  }

  // Anything that is not a plain column — a job named in words — is resolved
  // now, so the card shows what the row will actually point at.
  let prepared: { columns: Record<string, unknown>; display: { label: string; value: string }[] } = { columns: {}, display: [] }
  if (target.prepare) {
    const p = await target.prepare(r, caller, fields)
    if ('needs_choice' in p) return p
    if (!p.ok) return { error: p.error }
    prepared = p
  }

  const entity = target.labelOf(fields)
  const summary = `Create ${target.label}: ${entity}` + (fields.service_type ? ` — ${fields.service_type}` : '') + (fields.lead_source ? ` (from ${fields.lead_source})` : '')

  const insert = await fetch(`${r.url}/rest/v1/arnie_proposals`, {
    method: 'POST',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify({
      company_id: companyId,
      created_by: caller.email,
      request_text: input.request_text || summary,
      target: input.target,
      action: 'create',
      payload: {
        entity_table: target.table, entity_label: entity, fields,
        columns: prepared.columns,
        // The person who asked Arnie is the setter/source of the lead unless
        // the fields say otherwise. Recorded now so apply does not have to
        // guess who was talking.
        proposer_employee_id: caller.employeeId,
        despite: despite ?? null,
      },
      summary,
      before_value: null,
      after_value: fields,
      status: 'pending',
    }),
  })
  if (!insert.ok) return { error: `Couldn't save that draft: ${await insert.text()}` }

  return {
    proposal: (await insert.json())?.[0],
    preview: {
      kind: 'create',
      label: target.label,
      entity,
      fields: [
        ...Object.entries(target.fields)
          .filter(([k, def]) => fields[k] && def.column)
          .map(([k, def]) => ({ label: def.label, value: fields[k] })),
        ...prepared.display,
      ],
      ...(target.verb ? { verb: target.verb } : {}),
      ...(target.done ? { done: target.done } : {}),
      ...(despite ? { despite } : {}),
    },
  }
}

/**
 * Apply an approved create. Consent was to create a specific NEW record: if a
 * matching lead has appeared since the draft (someone else added it, or a
 * previous approve of this same draft already ran), refuse rather than make
 * a second one — which would be this rail causing the exact problem it was
 * built to prevent.
 */
export async function applyCreateProposal(
  r: Rest, companyId: number, prop: any,
): Promise<{ ok: true; id: number; label: string } | { ok: false; error: string; stale?: boolean }> {
  const target = CREATE_TARGETS[prop.target]
  if (!target) return { ok: false, error: 'Unknown create target.' }
  const fields: Record<string, string> = prop.payload?.fields || {}
  if (prop.payload?.created_id) return { ok: false, error: 'This draft was already applied.' }

  if (target.table === 'leads' && !prop.payload?.despite) {
    const similar = await similarLeads(r, companyId, fields)
    if (similar.length) {
      return { ok: false, stale: true, error: `${leadLabel(similar[0])} now exists (${similar[0].matched_on}) — it wasn't there when I drafted this. Use that lead, or ask me again if it really is a different customer.` }
    }
  }

  if (target.applyCustom) {
    const res = await target.applyCustom(r, companyId, prop)
    if (!res.ok) return res
    await fetch(`${r.url}/rest/v1/arnie_proposals?id=eq.${prop.id}`, {
      method: 'PATCH',
      headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ payload: { ...prop.payload, created_id: res.id, created: res.created } }),
    })
    return { ok: true, id: res.id, label: res.label }
  }

  const row: Record<string, unknown> = { company_id: companyId, ...(prop.payload?.columns || {}) }
  for (const [key, def] of Object.entries(target.fields)) if (fields[key] && def.column) row[def.column] = fields[key]
  if (target.table === 'job_diagnoses') {
    row.created_by_employee_id = prop.payload?.proposer_employee_id ?? null
    row.created_by = prop.created_by ?? null
    row.source = 'arnie'
  }
  if (target.table === 'feedback') {
    // Exactly what FeedbackButton.jsx writes, so this lands in the same
    // queue and shows in the person's own "My Feedback" tab.
    row.user_email = prop.created_by ?? null
    row.page_url = '/agents/arnie'
    row.status = 'new'
    if (!row.feedback_type) row.feedback_type = 'feedback'
    row.message = String(row.message) + '\n\n(Drafted by Arnie from a conversation; approved and sent by the person named on this ticket.)'
  }
  if (target.table === 'leads') {
    row.status = 'New'
    row.lead_id = `LEAD-${Date.now().toString(36).toUpperCase()}`
    const who = prop.payload?.proposer_employee_id
    if (who) { row.setter_owner_id = who; row.lead_source_employee_id = who }
  }

  const res = await fetch(`${r.url}/rest/v1/${target.table}`, {
    method: 'POST',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: JSON.stringify(row),
  })
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` }
  const created = (await res.json())?.[0]
  if (!created?.id) return { ok: false, error: 'The row was not returned after insert.' }

  // Remember what was made, so rollback can take exactly that away.
  await fetch(`${r.url}/rest/v1/arnie_proposals?id=eq.${prop.id}`, {
    method: 'PATCH',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
    body: JSON.stringify({ payload: { ...prop.payload, created_id: created.id } }),
  })
  return { ok: true, id: created.id, label: prop.payload?.entity_label || target.label }
}

/**
 * Undo a create by deleting the row — but only while it is still just a row.
 * Once a quote, appointment or commission hangs off it, deleting the lead
 * would take those with it, and that is not "undo", that is destroying work.
 */
export async function rollbackCreateProposal(
  r: Rest, companyId: number, prop: any,
): Promise<{ ok: true; deleted: number } | { ok: false; error: string }> {
  const target = CREATE_TARGETS[prop.target]
  if (!target) return { ok: false, error: 'Unknown create target.' }
  if (target.rollbackCustom) return await target.rollbackCustom(r, companyId, prop)
  // Not Number(): leads and diagnoses have integer ids, but feedback rows
  // are UUIDs, and Number('8810cf13-…') is NaN — which read as "never
  // created" and left a test ticket in the queue. A string, checked for
  // the characters an id can contain, and interpolated as-is.
  const id = prop.payload?.created_id == null ? '' : String(prop.payload.created_id)
  if (!id || !/^[A-Za-z0-9-]{1,64}$/.test(id)) return { ok: false, error: 'This draft never created anything.' }

  if (target.table === 'feedback') {
    const rows = await readRecordList(r, `feedback?select=status,reply_message&company_id=eq.${companyId}&id=eq.${id}&limit=1`)
    const t = rows[0]
    if (t && (t.status !== 'new' || t.reply_message)) {
      return { ok: false, error: `Can't withdraw — that ticket is already ${t.status}${t.reply_message ? ' and has a reply' : ''}.` }
    }
  }

  if (target.table === 'leads') {
    const refs = await Promise.all([
      readRecordList(r, `quotes?select=id&company_id=eq.${companyId}&lead_id=eq.${id}&limit=1`),
      readRecordList(r, `appointments?select=id&company_id=eq.${companyId}&lead_id=eq.${id}&limit=1`),
      readRecordList(r, `lead_commissions?select=id&company_id=eq.${companyId}&lead_id=eq.${id}&limit=1`),
      readRecordList(r, `jobs?select=id&company_id=eq.${companyId}&lead_id=eq.${id}&limit=1`),
    ])
    const names = ['a quote', 'an appointment', 'a setter commission', 'a job']
    const held = refs.map((x, i) => x.length ? names[i] : null).filter(Boolean)
    if (held.length) return { ok: false, error: `Can't undo — this lead already has ${held.join(', ')} attached. Delete it from the Leads page if you really mean to.` }
  }

  const res = await fetch(`${r.url}/rest/v1/${target.table}?id=eq.${id}&company_id=eq.${companyId}`, {
    method: 'DELETE',
    headers: { apikey: r.key, Authorization: `Bearer ${r.key}`, Prefer: 'return=minimal' },
  })
  if (!res.ok) return { ok: false, error: `${res.status} ${await res.text()}` }
  return { ok: true, deleted: id }
}
