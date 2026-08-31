import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { callAnthropic, reportAnthropicFailure, logAnthropicSuccess } from '../_shared/anthropic.ts'
import { resolveCaller, type Caller } from '../_shared/auth.ts'
import { proposeChange, targetsSentence } from '../_shared/arnieConfig.ts'
import { recordTargetsSentence } from '../_shared/arnieRecords.ts'
import { proposeRecordChange } from '../_shared/arnieRecordPropose.ts'
import { bulkTargetsSentence, BULK_MAX, proposeBulkChange } from '../_shared/arnieBulk.ts'

// Still read directly here: the SSE streaming path keeps its own fetch
// (the shared wrapper buffers responses, which would break streaming).
const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY') || ''
const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') || ''
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || ''

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

// ============================================================
// TOOL DEFINITIONS — canonical, scoped data fetchers Arnie can call
// All tools auto-filter by company_id (no cross-tenant access)
// All tools are READ-ONLY
// ============================================================
const TOOLS = [
  {
    name: 'query_invoices',
    description: 'Query invoices. `count` is the exact number matching; `invoice_numbers` lists real invoice ids so anything you claim can be checked. ALWAYS read the `scope` field back to the user — it says what was filtered out. Unpaid is NOT the same as overdue: every returned row carries its own `overdue` boolean, and the result carries `as_of`, `overdue_count` and `overdue_total_amount`. Call an invoice overdue only when its own `overdue` flag is true, and take overdue totals from `overdue_total_amount` — never from `count` or a sum of every unpaid row. An invoice record holds customer_id, NOT a customer name: if you need a name, look it up with query_customers. NEVER name a customer that the tool did not return.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['paid', 'sent', 'overdue', 'draft', 'all'], description: 'overdue = unpaid AND past its due date. Pass this whenever the question is about overdue invoices — without it the result is every invoice of that status, past due or not.' },
        customer_name: { type: 'string', description: 'Resolved through the customers table. If no customer matches, the result says so — report that, do not substitute a name.' },
        exclude_zero: { type: 'boolean', description: 'Default true. Most zero-amount invoices are migration artefacts; set false to include them.' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        group_by: { type: 'string', enum: ['customer', 'month', 'status', 'none'] },
      },
    },
  },
  {
    name: 'query_jobs',
    description: 'Query jobs with filtering and aggregation. Use for questions about job counts, schedules, completion rates, or jobs by employee/customer/status.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by job status (e.g. Complete, In Progress, Scheduled)' },
        assigned_to: { type: 'integer', description: 'Filter by employee ID' },
        customer_name: { type: 'string', description: 'Filter by customer name (partial match)' },
        start_date: { type: 'string', description: 'ISO date — only jobs scheduled on/after this date' },
        end_date: { type: 'string', description: 'ISO date — only jobs scheduled on/before this date' },
        group_by: { type: 'string', enum: ['status', 'month', 'employee', 'customer', 'none'] },
      },
    },
  },
  {
    name: 'query_revenue',
    description: 'Get revenue breakdown by period. Use for "this month", "last month", "YTD", or custom-range revenue questions. OWNER/SUPER_ADMIN only.',
    input_schema: {
      type: 'object',
      properties: {
        period: { type: 'string', enum: ['this_month', 'last_month', 'this_quarter', 'this_year', 'last_year', 'custom'] },
        start_date: { type: 'string', description: 'For period=custom' },
        end_date: { type: 'string', description: 'For period=custom' },
        group_by: { type: 'string', enum: ['month', 'customer', 'employee', 'product', 'none'] },
      },
      required: ['period'],
    },
  },
  {
    name: 'query_leads',
    description: 'Query leads/deals with filtering. Use for pipeline questions, conversion rates, or salesperson performance. ADMIN+ only.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Filter by lead status' },
        salesperson_id: { type: 'integer', description: 'Filter by salesperson employee ID' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        group_by: { type: 'string', enum: ['status', 'salesperson', 'month', 'source', 'none'] },
      },
    },
  },
  {
    name: 'query_customers',
    description: 'Search customers by name, location, or other attributes. Returns customer details with their job/invoice summary.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Search customer name, business name, or email' },
        limit: { type: 'integer', description: 'Max results (default 20, max 100)' },
      },
    },
  },
  {
    name: 'query_employees',
    description: 'Query employees with their stats (jobs assigned, hours logged, revenue generated). ADMIN+ to see pay rates.',
    input_schema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Filter by role' },
        include_stats: { type: 'boolean', description: 'Include job count, hours logged' },
      },
    },
  },
  {
    name: 'query_inventory',
    description: 'Query inventory items, low stock, or items by location.',
    input_schema: {
      type: 'object',
      properties: {
        low_stock_only: { type: 'boolean' },
        location: { type: 'string' },
        search: { type: 'string', description: 'Search by name' },
      },
    },
  },
  {
    name: 'query_quotes',
    description: 'Query quotes and estimates — counts, dollar totals, win/loss, by salesperson or month. Use for "how many quotes did we send", "what is out for signature", "who is quoting the most". ADMIN+ only.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', description: 'Quote status as stored, e.g. Sent, Approved, Rejected, Draft' },
        salesperson_id: { type: 'integer' },
        start_date: { type: 'string', description: 'ISO date — quotes created on/after' },
        end_date: { type: 'string', description: 'ISO date — quotes created on/before' },
        group_by: { type: 'string', enum: ['status', 'month', 'salesperson', 'service_type', 'none'] },
      },
    },
  },
  {
    name: 'query_expenses',
    description: 'Query expenses by category, vendor, job or date range. Use for cost and spend questions — the other half of revenue. OWNER/SUPER_ADMIN only.',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string' },
        vendor: { type: 'string', description: 'Partial vendor name match' },
        job_id: { type: 'integer' },
        start_date: { type: 'string' },
        end_date: { type: 'string' },
        group_by: { type: 'string', enum: ['category', 'month', 'vendor', 'status', 'none'] },
      },
    },
  },
  {
    name: 'query_appointments',
    description: 'Query the appointment calendar — what is booked, for whom, and how it went. Use for "what is on the calendar", "how many appointments did we run", "what were the outcomes". A non-manager only ever sees their own.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string' },
        appointment_type: { type: 'string' },
        employee_id: { type: 'integer', description: 'Ignored for non-managers, who are always scoped to themselves' },
        start_date: { type: 'string', description: 'ISO date — appointments starting on/after' },
        end_date: { type: 'string', description: 'ISO date — appointments starting on/before' },
        group_by: { type: 'string', enum: ['status', 'appointment_type', 'outcome', 'month', 'none'] },
      },
    },
  },
  {
    name: 'query_time_clock',
    description: 'Query time clock entries and hours worked. Set open_only=true to find shifts that were clocked IN and never clocked OUT — those carry no hours and drop silently out of pay, so they are worth surfacing whenever someone asks about hours. A non-manager only ever sees their own.',
    input_schema: {
      type: 'object',
      properties: {
        employee_id: { type: 'integer', description: 'Ignored for non-managers, who are always scoped to themselves' },
        open_only: { type: 'boolean', description: 'Only shifts with no clock_out — the missed clock-outs' },
        start_date: { type: 'string', description: 'ISO date — shifts starting on/after' },
        end_date: { type: 'string', description: 'ISO date — shifts starting on/before' },
        group_by: { type: 'string', enum: ['employee', 'month', 'none'] },
      },
    },
  },
  {
    name: 'query_products',
    description: 'Search the product and service catalogue — price, cost, manufacturer, model number, category. Also AUDITS it: set group_by=manufacturer to see every distinct value with its count, which is how you spot inconsistent data (the same manufacturer spelled two ways, or with a trailing space, reads as two separate values). Use exclude_manufacturer to answer "which products are NOT made by X". Cost and margin are shown to ADMIN+ only.',
    input_schema: {
      type: 'object',
      properties: {
        search: { type: 'string', description: 'Match name, model number or manufacturer' },
        manufacturer: { type: 'string', description: 'Exact manufacturer match. Values can differ only by trailing whitespace — group_by=manufacturer shows you the real ones.' },
        exclude_manufacturer: { type: 'string', description: 'Only products whose manufacturer is NOT this. Use for "which ones are not MES".' },
        missing_manufacturer: { type: 'boolean', description: 'Only products with no manufacturer set at all' },
        product_category: { type: 'string' },
        type: { type: 'string', description: 'e.g. Product or Service' },
        active_only: { type: 'boolean', description: 'Default true. Set false to include inactive products.' },
        group_by: { type: 'string', enum: ['manufacturer', 'product_category', 'type', 'active', 'none'], description: 'Aggregate instead of listing. Reads the WHOLE matching set, not a page of it — always use this before making any claim about "all" or "every" product.' },
        limit: { type: 'integer', description: 'Max products listed (default 25, max 200). Ignored when group_by is set.' },
      },
    },
  },
]

// ============================================================
// ROW FETCHING — exact counts, paged reads
//
// Every tool below used to pass a bare `limit` and then report
// `data.length` as the answer. On a tenant with 7,121 jobs Arnie
// confidently replied "500" — the cap, presented as a fact, by an agent
// whose prompt forbids guessing numbers. Revenue was worse: it summed
// only the first 5,000 payments and called it the total.
//
// fetchRows asks PostgREST for an exact count (Prefer: count=exact, read
// back off Content-Range) and pages until it has the rows or hits a
// ceiling. The count is therefore always true; only the row sample is
// ever capped, and when it is, the caller says so out loud.
// ============================================================
const PAGE = 1000
const MAX_ROWS = 10000

async function fetchRows(
  url: string,
  params: URLSearchParams,
  hdr: Record<string, string>,
  max = MAX_ROWS,
): Promise<{ rows: any[]; total: number; truncated: boolean } | { error: string }> {
  const rows: any[] = []
  let total = 0
  // Offset paging over an unordered result set can repeat or skip rows between
  // pages, so pin an order the caller has not already chosen.
  if (!params.has('order')) params.set('order', 'id')
  for (let from = 0; from < max; from += PAGE) {
    const to = Math.min(from + PAGE, max) - 1
    const res = await fetch(`${url}?${params}`, {
      headers: {
        ...hdr,
        Range: `${from}-${to}`,
        'Range-Unit': 'items',
        // count=exact is a full scan; one on the first page is enough.
        Prefer: from === 0 ? 'count=exact' : 'count=none',
      },
    })
    if (!res.ok && res.status !== 206) return { error: `${res.status} ${await res.text()}` }
    const page = await res.json()
    rows.push(...page)
    // Content-Range looks like "0-999/7121"; the tail is the exact count.
    const cr = res.headers.get('content-range') || ''
    const declared = Number(cr.split('/')[1])
    if (Number.isFinite(declared)) total = declared
    if (page.length < to - from + 1) break
    if (rows.length >= total) break
  }
  if (!total) total = rows.length
  return { rows, total, truncated: rows.length < total }
}

// The one tool that changes anything. It does NOT apply the change: it
// drafts a proposal and the UI renders an approve/reject card, so a human
// still makes every decision. Living on the tool rail is what matters —
// routing used to be a regex over the message text, which meant Arnie
// could only hear a change request phrased three specific ways.
const PROPOSE_TOOL = {
  name: 'propose_change',
  description:
    'Draft a change to this company\'s configuration for an admin to approve. Use this whenever an admin asks to add, rename or remove one of: ' +
    targetsSentence() +
    '. Pass their request through in their own words — do not reformat it. The change is NOT applied: an approval card appears and the admin decides. Say briefly what you drafted; never claim it is done.',
  input_schema: {
    type: 'object',
    properties: {
      request: {
        type: 'string',
        description: 'The admin\'s change request, verbatim, e.g. "add a lead source called Trade Show".',
      },
    },
    required: ['request'],
  },
}

// Tier B: change one field on one record. The model deliberately CANNOT pass
// a row id it made up — it describes the record and the server looks it up.
// Handed thousands of job ids a model will eventually pick a plausible wrong
// one, and a valid change to the wrong job looks exactly like a correct one
// on the approval card.
const PROPOSE_RECORD_TOOL = {
  name: 'propose_record_change',
  description:
    'Draft a change to ONE field on ONE record, for a human to approve. Targets: ' +
    recordTargetsSentence() +
    '. Describe the record in words via record_query (a name, address, job number) — do NOT invent a record_id. If the reply comes back with needs_choice, ask the user which one they meant and call again passing record_id. Nothing is written until they approve, so never say the change is done.',
  input_schema: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'One of: job_status, job_note, job_schedule, lead_status, lead_note' },
      record_query: { type: 'string', description: 'How the user identified the record, e.g. "the Drinkle insurance job" or "JOB-ABC123"' },
      record_id: { type: 'integer', description: 'Only after a needs_choice reply, or when the user gave an exact id' },
      value: { type: 'string', description: 'The new status, the note text, or a YYYY-MM-DD date' },
    },
    required: ['target', 'value'],
  },
}

// The plural of propose_record_change. The model gives a FILTER, never a list
// of rows — the server resolves it, so no invented id can become a write, and
// the card lists every affected product rather than a count.
const PROPOSE_BULK_TOOL = {
  name: 'propose_bulk_change',
  description:
    'Draft the SAME change to one field across many products at once, for an admin to approve. Targets: ' +
    bulkTargetsSentence() +
    '. Use this for catalogue clean-up — normalising a manufacturer spelt two ways, retyping a category, or deactivating a batch. You give a filter (filter_field + filter_value, matched EXACTLY, including whitespace) and the new value; the server finds the rows. Run query_products with group_by=manufacturer FIRST so you are filtering on a value that really exists. Refuses above ' +
    BULK_MAX +
    ' rows. Nothing is written until the admin approves, and every affected product is listed on the card. Deactivating is how you "remove" a product — never claim you deleted one.',
  input_schema: {
    type: 'object',
    properties: {
      target: { type: 'string', description: 'product_manufacturer, product_category or product_active' },
      filter_field: { type: 'string', description: 'Column to match on: manufacturer, product_category, type or name' },
      filter_value: { type: 'string', description: 'Exact value to match, whitespace included. Pass "" to match rows where it is empty.' },
      value: { type: 'string', description: 'The new value. For product_active use true or false.' },
    },
    required: ['target', 'filter_field', 'filter_value', 'value'],
  },
}

// Some tool results are only useful if the caller can DRAW them. A proposal
// comes back as an approval card, and a client that has never heard of that
// card type cannot render it — in the worst case it crashes trying.
//
// This is not hypothetical. propose_bulk_change was deployed here before the
// UI that draws its card had shipped; the then-current client routed anything
// that was not a 'record' preview into the settings-list card, which calls
// .map() on `after`. A bulk preview's `after` is a string, so the message list
// threw mid-render.
//
// So the client declares what it can draw and the server only advertises tools
// whose output fits. A stale tab simply is not offered the tool and Arnie says
// he cannot do it — honest and harmless. This also means server and client
// halves of a feature can deploy in either order, which is the general fix:
// nobody has to remember to sequence them.
const CARD_TOOLS: Record<string, string> = {
  propose_change: 'config',
  propose_record_change: 'record',
  propose_bulk_change: 'bulk',
}

function toolsFor(role: string, cards: string[]) {
  const isAdmin = ['developer', 'super_admin', 'admin'].includes(role)
  const offered = isAdmin
    ? [...TOOLS, PROPOSE_TOOL, PROPOSE_RECORD_TOOL, PROPOSE_BULK_TOOL]
    : [...TOOLS, PROPOSE_RECORD_TOOL]
  return offered.filter((t: any) => {
    const needs = CARD_TOOLS[t.name]
    return !needs || cards.includes(needs)
  })
}

/**
 * What can this client draw?
 *
 * Absent field = a client from before the handshake existed. Those shipped
 * with the config and record cards, so they are credited with exactly those
 * and nothing newer. Anything added later has to ask for itself.
 */
function cardsFor(body: Record<string, unknown>): string[] {
  const declared = (body as { supports?: unknown }).supports
  if (!Array.isArray(declared)) return ['config', 'record']
  return declared.filter((x): x is string => typeof x === 'string')
}

// ============================================================
// TOOL EXECUTORS — server-side queries, always company_id scoped
// ============================================================
async function execTool(name: string, input: any, caller: Caller) {
  const { companyId, role, email, employeeId } = caller
  const sb = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`
  const hdr = { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }

  // Role helpers
  const isOwner = ['developer', 'super_admin'].includes(role)
  const isAdmin = isOwner || role === 'admin'
  const isManager = isAdmin || role === 'manager'

  try {
    if (name === 'query_invoices') {
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      const notes: string[] = []
      // due_date is named here on purpose. A row that comes back without it
      // cannot say whether it is overdue, and the model fills that gap by
      // assuming — which is the bug this branch is built around. The rest is
      // what the aggregate and the answer are made of; the columns left out
      // (conversation_log, pdf_url, portal_token …) only crowd the context.
      params.set('select', 'id,invoice_id,invoice_date,created_at,due_date,customer_id,job_id,'
        + 'amount,discount_applied,down_payment_applied,payment_status,payment_method,'
        + 'business_unit,invoice_type,job_description')
      const asOf = new Date().toISOString().slice(0, 10)
      const askedOverdue = String(input.status || '').toLowerCase() === 'overdue'

      if (input.status && input.status !== 'all') {
        const statusMap: Record<string, string> = {
          paid: 'Paid', pending: 'Pending', open: 'Open', draft: 'Open', overdue: 'Pending',
        }
        const status = statusMap[input.status.toLowerCase()] || input.status
        params.append('payment_status', `eq.${status}`)
        // "Overdue" used to mean nothing more than payment_status = Pending,
        // which on this tenant is 292 invoices of which 233 are zero-dollar
        // rows carried over from the old system. Reporting that as "294
        // overdue" is a number with no meaning. Overdue now also means past
        // its due date.
        if (askedOverdue) {
          params.append('due_date', `lt.${asOf}`)
          notes.push(`Overdue = unpaid AND past due_date, as of ${asOf}. This filter covers payment_status '${status}' only, so a part-paid invoice that is past due is not in here.`)
        }
      }

      // invoices has NO customer_name column — only customer_id. Filtering on
      // it 400d the whole query, which is why asking for one customer's
      // invoices produced an error and then an invented answer. Resolve names
      // through the customers table instead.
      if (input.customer_name) {
        const term = String(input.customer_name).replace(/[*,()]/g, '')
        const matches = await fetchRows(
          sb('customers'),
          new URLSearchParams({
            select: 'id',
            company_id: `eq.${companyId}`,
            or: `(name.ilike.*${term}*,business_name.ilike.*${term}*)`,
          }), hdr, 200)
        if ('error' in matches) return { error: `customer lookup failed: ${matches.error}` }
        if (!matches.rows.length) {
          return { count: 0, customers_matched: 0, note: `No customer matches "${input.customer_name}", so there are no invoices to show. Say that plainly — do not name a customer that was not found.` }
        }
        params.append('customer_id', `in.(${matches.rows.map((c: any) => c.id).join(',')})`)
        notes.push(`Matched ${matches.rows.length} customer(s) named like "${input.customer_name}".`)
      }

      if (input.exclude_zero !== false) {
        params.append('amount', 'gt.0')
        notes.push('Zero-amount invoices excluded (most are migration artefacts); pass exclude_zero=false to include them.')
      }
      if (input.start_date) params.append('created_at', `gte.${input.start_date}`)
      if (input.end_date) params.append('created_at', `lte.${input.end_date}`)

      const got = await fetchRows(sb('invoices'), params, hdr)
      if ('error' in got) return { error: `invoices query failed: ${got.error}` }

      // Unpaid is not overdue, and nothing in a row that only says "Pending"
      // draws the line. Asked how many invoices were overdue on 2026-08-29,
      // Arnie fetched the unpaid ones without the overdue filter and called
      // all five of them overdue — real invoices, real amounts, wrong label.
      // Passing the filter is still the right move; carrying the verdict on
      // the row is what makes the label impossible to get wrong when it is
      // not passed.
      for (const r of got.rows) {
        r.overdue = String(r.payment_status || '').toLowerCase() !== 'paid'
          && !!r.due_date && String(r.due_date).slice(0, 10) < asOf
      }
      const overdue = got.rows.filter((r: any) => r.overdue)

      const agg: any = aggregate(got, input.group_by, ['amount'])
      agg.as_of = asOf
      agg.overdue_count = overdue.length
      agg.overdue_total_amount = overdue
        .reduce((sum: number, r: any) => sum + (parseFloat(r.amount) || 0), 0).toFixed(2)
      // Every claim about a specific invoice must be checkable by the user,
      // so hand back the invoice numbers rather than only totals.
      agg.invoice_numbers = got.rows.slice(0, 40).map((r: any) => r.invoice_id).filter(Boolean)
      if (got.truncated) {
        notes.push(`overdue_count and overdue_total_amount cover only the ${got.rows.length} of ${got.total} matching rows that could be read.`)
      }
      if (!askedOverdue) {
        notes.push(`This result is NOT filtered to overdue: ${got.total} invoice(s) match, of which ${overdue.length} are past due as of ${asOf} (overdue_total_amount ${agg.overdue_total_amount}). Do not call the whole result overdue — only the rows whose own \`overdue\` flag is true.`)
      }
      if (notes.length) agg.scope = notes.join(' ')
      return agg
    }

    if (name === 'query_jobs') {
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      if (input.status) params.append('status', `eq.${input.status}`)
      if (input.assigned_to) params.append('salesperson_id', `eq.${input.assigned_to}`)
      if (input.customer_name) params.append('customer_name', `ilike.*${input.customer_name}*`)
      if (input.start_date) params.append('start_date', `gte.${input.start_date}`)
      if (input.end_date) params.append('start_date', `lte.${input.end_date}`)
      const got = await fetchRows(sb('jobs'), params, hdr)
      if ('error' in got) return { error: `jobs query failed: ${got.error}` }
      return aggregate(got, input.group_by, ['job_total', 'expense_amount', 'profit_margin'])
    }

    if (name === 'query_revenue') {
      if (!isOwner) return { restricted: 'Owner access required for revenue data.' }
      const { startDate, endDate } = computePeriod(input.period, input.start_date, input.end_date)
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      params.append('date', `gte.${startDate}`)
      params.append('date', `lte.${endDate}`)
      // Revenue must never be computed from a partial read — a short sum
      // reads as a real number and nothing about it looks wrong.
      const got = await fetchRows(sb('payments'), params, hdr, 50000)
      if ('error' in got) return { error: `payments query failed: ${got.error}` }
      return {
        period: input.period,
        startDate,
        endDate,
        totalPayments: got.total,
        totalRevenue: got.rows.reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0).toFixed(2),
        ...(got.truncated
          ? { WARNING: `Only ${got.rows.length} of ${got.total} payments could be read — totalRevenue is INCOMPLETE. Say so; do not present it as the figure.` }
          : {}),
        ...aggregate(got, input.group_by, ['amount']),
      }
    }

    if (name === 'query_leads') {
      if (!isAdmin) return { restricted: 'Admin access required for leads data.' }
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      if (input.status) params.append('status', `eq.${input.status}`)
      if (input.salesperson_id) params.append('salesperson_id', `eq.${input.salesperson_id}`)
      if (input.start_date) params.append('created_at', `gte.${input.start_date}`)
      if (input.end_date) params.append('created_at', `lte.${input.end_date}`)
      const got = await fetchRows(sb('leads'), params, hdr)
      if ('error' in got) return { error: `leads query failed: ${got.error}` }
      return aggregate(got, input.group_by, ['value', 'amount'])
    }

    if (name === 'query_customers') {
      const params = new URLSearchParams({
        company_id: `eq.${companyId}`,
      })
      // PostgREST 'or' wants no surrounding parens in URLSearchParams form
      if (input.search) {
        const term = input.search.replace(/[*]/g, '')
        params.append('or', `(name.ilike.*${term}*,business_name.ilike.*${term}*,email.ilike.*${term}*)`)
      }
      const got = await fetchRows(sb('customers'), params, hdr, Math.min(input.limit || 20, 100))
      if ('error' in got) return { error: `customers query failed: ${got.error}` }
      // count is the number of MATCHES, not the number shown — otherwise a
      // search that hits 300 customers reports "20 customers".
      return {
        matches: got.total,
        showing: got.rows.length,
        customers: got.rows,
        ...(got.truncated ? { note: `Showing ${got.rows.length} of ${got.total} matches.` } : {}),
      }
    }

    if (name === 'query_employees') {
      const select = isOwner ? '*' : 'id,name,email,role,phone,user_role,created_at'
      const params = new URLSearchParams({ company_id: `eq.${companyId}`, select })
      if (input.role) params.append('role', `eq.${input.role}`)
      const got = await fetchRows(sb('employees'), params, hdr, 2000)
      if ('error' in got) return { error: `employees query failed: ${got.error}` }
      return { count: got.total, employees: got.rows }
    }

    if (name === 'query_inventory') {
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      if (input.location) params.append('location', `eq.${input.location}`)
      if (input.search) params.append('name', `ilike.*${input.search}*`)
      const got = await fetchRows(sb('inventory'), params, hdr)
      if ('error' in got) return { error: `inventory query failed: ${got.error}` }
      const items = input.low_stock_only
        ? got.rows.filter((i: any) => (i.quantity || 0) <= (i.min_quantity || i.ordering_trigger || 5))
        : got.rows
      // low_stock_only filters in memory, so its count is only exact while the
      // underlying read was complete.
      return {
        count: items.length,
        items: items.slice(0, 50),
        ...(items.length > 50 ? { note: `Showing the first 50 of ${items.length}.` } : {}),
        ...(got.truncated ? { WARNING: `Read ${got.rows.length} of ${got.total} inventory rows — this count is a floor, not a total.` } : {}),
      }
    }

    if (name === 'query_quotes') {
      if (!isAdmin) return { restricted: 'Admin access required for quote data.' }
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      if (input.status) params.append('status', `eq.${input.status}`)
      if (input.salesperson_id) params.append('salesperson_id', `eq.${input.salesperson_id}`)
      if (input.start_date) params.append('created_at', `gte.${input.start_date}`)
      if (input.end_date) params.append('created_at', `lte.${input.end_date}`)
      const got = await fetchRows(sb('quotes'), params, hdr)
      if ('error' in got) return { error: `quotes query failed: ${got.error}` }
      return aggregate(got, input.group_by, ['quote_amount', 'job_total'])
    }

    if (name === 'query_expenses') {
      // Expenses are the cost side of the books; the prompt already tells
      // admins this is owner-level, so the gate matches what Arnie says.
      if (!isOwner) return { restricted: 'Owner access required for expense data.' }
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      if (input.category) params.append('category', `eq.${input.category}`)
      if (input.vendor) params.append('vendor', `ilike.*${input.vendor}*`)
      if (input.job_id) params.append('job_id', `eq.${input.job_id}`)
      if (input.start_date) params.append('date', `gte.${input.start_date}`)
      if (input.end_date) params.append('date', `lte.${input.end_date}`)
      const got = await fetchRows(sb('expenses'), params, hdr)
      if ('error' in got) return { error: `expenses query failed: ${got.error}` }
      return {
        totalAmount: got.rows.reduce((s: number, e: any) => s + (parseFloat(e.amount) || 0), 0).toFixed(2),
        ...aggregate(got, input.group_by, ['amount']),
      }
    }

    if (name === 'query_appointments') {
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      // A tech asking about "the calendar" means THEIR calendar. Scoping is
      // forced rather than merely defaulted, so a stray employee_id in the
      // tool call cannot widen it.
      if (!isManager) {
        if (!employeeId) return { restricted: 'No employee record for this login, so there is no personal calendar to read.' }
        params.append('employee_id', `eq.${employeeId}`)
      } else if (input.employee_id) {
        params.append('employee_id', `eq.${input.employee_id}`)
      }
      if (input.status) params.append('status', `eq.${input.status}`)
      if (input.appointment_type) params.append('appointment_type', `eq.${input.appointment_type}`)
      if (input.start_date) params.append('start_time', `gte.${input.start_date}`)
      if (input.end_date) params.append('start_time', `lte.${input.end_date}`)
      const got = await fetchRows(sb('appointments'), params, hdr)
      if ('error' in got) return { error: `appointments query failed: ${got.error}` }
      return aggregate(got, input.group_by, ['duration_minutes'])
    }

    if (name === 'query_time_clock') {
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      if (!isManager) {
        if (!employeeId) return { restricted: 'No employee record for this login, so there are no hours to read.' }
        params.append('employee_id', `eq.${employeeId}`)
      } else if (input.employee_id) {
        params.append('employee_id', `eq.${input.employee_id}`)
      }
      if (input.open_only) params.append('clock_out', 'is.null')
      if (input.start_date) params.append('clock_in', `gte.${input.start_date}`)
      if (input.end_date) params.append('clock_in', `lte.${input.end_date}`)
      const got = await fetchRows(sb('time_clock'), params, hdr)
      if ('error' in got) return { error: `time_clock query failed: ${got.error}` }
      const open = got.rows.filter((t: any) => !t.clock_out)
      return {
        totalHours: got.rows.reduce((s: number, t: any) => s + (parseFloat(t.total_hours) || 0), 0).toFixed(2),
        openShifts: open.length,
        ...(open.length && !input.open_only
          ? { NOTE: `${open.length} of these shifts were never clocked out, so they carry no hours and will not be paid. Mention this.` }
          : {}),
        ...aggregate(got, input.group_by, ['total_hours']),
      }
    }

    if (name === 'query_products') {
      const grouping = input.group_by && input.group_by !== 'none'
      // Never `*`. products_services carries ~50 columns including
      // datasheet_json and a handful of URLs, none of which help answer a
      // question about the catalogue. Selecting everything for 200 products
      // produced a 232 KB tool result — roughly 64,000 tokens — and the next
      // request to the model failed outright, which surfaced as "AI analysis
      // failed" with no clue that size was the cause. Ask for the columns the
      // answer needs.
      const select = isAdmin
        ? 'id,item_id,name,description,type,unit_price,cost,markup_percent,product_category,'
          + 'manufacturer,model_number,active,vendor_sku,default_vendor_id,lead_time_days'
        : 'id,item_id,name,description,type,unit_price,product_category,manufacturer,model_number,active'
      const params = new URLSearchParams({ company_id: `eq.${companyId}`, select })
      if (input.active_only !== false) params.append('active', 'eq.true')
      if (input.product_category) params.append('product_category', `eq.${input.product_category}`)
      if (input.type) params.append('type', `eq.${input.type}`)
      if (input.manufacturer) params.append('manufacturer', `eq.${input.manufacturer}`)
      if (input.exclude_manufacturer) params.append('manufacturer', `neq.${input.exclude_manufacturer}`)
      if (input.missing_manufacturer) params.append('manufacturer', 'is.null')
      if (input.search) {
        const term = String(input.search).replace(/[*,()]/g, '')
        params.append('or', `(name.ilike.*${term}*,model_number.ilike.*${term}*,manufacturer.ilike.*${term}*)`)
      }
      // Grouping has to read the WHOLE matching set. Answering "is every
      // product made by MES?" off the first page is how a catalogue audit
      // becomes a confident wrong answer.
      const cap = grouping ? MAX_ROWS : Math.min(input.limit || 25, 200)
      const got = await fetchRows(sb('products_services'), params, hdr, cap)
      if ('error' in got) return { error: `products query failed: ${got.error}` }

      if (grouping) {
        const agg: any = aggregate(got, input.group_by, ['unit_price', 'cost'])
        // Values differing only by surrounding whitespace are a data problem,
        // not a grouping artefact — and they are invisible when rendered.
        if (input.group_by === 'manufacturer') {
          const keys = Object.keys(agg.groups || {})
          const collisions: Record<string, string[]> = {}
          for (const k of keys) {
            const norm = k.trim().toLowerCase()
            ;(collisions[norm] ||= []).push(k)
          }
          const dupes = Object.values(collisions).filter((v) => v.length > 1)
          if (dupes.length) {
            agg.INCONSISTENT_VALUES = dupes.map((v) => v.map((x) => JSON.stringify(x)))
            agg.INCONSISTENT_NOTE =
              'These spell the same manufacturer more than one way (usually stray whitespace), so they filter and report as separate manufacturers. Show the user the quoted forms so the difference is visible, and then OFFER TO FIX IT IN THE SAME MESSAGE using propose_bulk_change — name the number of products and ask if they want it done. Do not simply report the problem and stop: fixing it by hand is exactly what this tool exists to save them.'
          }
        }
        return agg
      }

      // Say what was left out. Reporting "there are no products with
      // manufacturer X" when two exist but are inactive is how a false
      // premise became a confidently-filed bug report.
      let inactiveNote: Record<string, unknown> = {}
      if (input.active_only !== false) {
        const inactiveParams = new URLSearchParams(params)
        inactiveParams.set('active', 'eq.false')
        const inact = await fetchRows(sb('products_services'), inactiveParams, hdr, 1)
        const n = 'error' in inact ? 0 : inact.total
        inactiveNote = n > 0
          ? { inactive_matches: n, scope: `Active products only. ${n} INACTIVE product(s) also match — say so rather than "there are none".` }
          : { scope: 'Active products only; no inactive ones match either.' }
      } else {
        inactiveNote = { scope: 'Active and inactive products.' }
      }

      return {
        matches: got.total,
        showing: got.rows.length,
        products: got.rows,
        ...inactiveNote,
        ...(got.truncated
          ? { WARNING: `Listing ${got.rows.length} of ${got.total} matches. Do NOT draw a conclusion about all of them from this page — re-run with group_by to cover the whole set.` }
          : {}),
      }
    }

    if (name === 'propose_bulk_change') {
      if (!isAdmin) return { restricted: 'Only an admin can make catalogue-wide changes.' }
      return await proposeBulkChange(
        { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY },
        caller,
        {
          target: String(input?.target || ''),
          filter_field: String(input?.filter_field || ''),
          filter_value: String(input?.filter_value ?? ''),
          value: String(input?.value ?? ''),
        },
      )
    }

    if (name === 'propose_record_change') {
      return await proposeRecordChange(
        { url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY },
        caller,
        { target: String(input?.target || ''), record_query: input?.record_query, record_id: input?.record_id, value: String(input?.value ?? '') },
      )
    }

    if (name === 'propose_change') {
      // Re-checked here rather than trusted from toolsFor(): the tool list is
      // an affordance, this is the gate.
      if (!isAdmin) return { restricted: 'Only an admin can change company settings.' }
      const request = String(input?.request || '').trim()
      if (!request) return { error: 'Nothing to propose — no request text.' }
      return await proposeChange({ url: SUPABASE_URL, key: SUPABASE_SERVICE_ROLE_KEY }, companyId, email, request)
    }

    return { error: `Unknown tool: ${name}` }
  } catch (e: any) {
    console.error(`[execTool] ${name} failed:`, e)
    return { error: e.message || 'Tool execution failed' }
  }
}

// Takes the fetchRows() result rather than a bare array, so `count` is the
// exact number of matching rows and never the size of the page we happened to
// read. When the sample is short of the total, the shortfall is stated in the
// payload — the model cannot notice a silent truncation on its own.
function aggregate(
  got: { rows: any[]; total: number; truncated: boolean },
  groupBy: string | undefined,
  sumFields: string[] = [],
) {
  const { rows: data, total, truncated } = got
  const partial = truncated
    ? { WARNING: `Totals below cover only ${data.length} of ${total} matching rows. State that the figure is partial.` }
    : {}
  if (!groupBy || groupBy === 'none') {
    return { count: total, sample: data.slice(0, 30), ...partial }
  }
  const groups: Record<string, any> = {}
  for (const row of data) {
    let key: string = 'unknown'
    if (groupBy === 'month') {
      const d = row.created_at || row.date || row.start_date || row.start_time || row.clock_in
      if (d) key = String(d).slice(0, 7) // YYYY-MM
    } else if (groupBy === 'customer') {
      // invoices carry customer_id only. Never guess a name from elsewhere in
      // the conversation — an invented customer with a real-looking total is
      // exactly what happened here.
      key = row.customer_name || (row.customer_id ? `customer_id ${row.customer_id} (name not on this record)` : 'Unknown')
    } else if (groupBy === 'status') {
      key = row.status || row.payment_status || 'unknown'
    } else if (groupBy === 'employee' || groupBy === 'salesperson') {
      key = row.salesperson || row.salesperson_name || row.assigned_to_name
        || (row.salesperson_id ? `Emp #${row.salesperson_id}` : null)
        || (row.assigned_to ? `Emp #${row.assigned_to}` : 'Unassigned')
    } else if (groupBy === 'product') {
      key = row.product_name || row.name || 'Unknown'
    } else if (groupBy === 'source') {
      key = row.lead_source || row.lead_source_name || row.source || 'Unknown'
    } else if (row[groupBy] != null && row[groupBy] !== '') {
      // Plain column grouping (category, vendor, service_type, outcome …) so a
      // new tool does not need a new branch here just to group by its own field.
      key = String(row[groupBy])
    }
    if (!groups[key]) {
      groups[key] = { count: 0 }
      sumFields.forEach(f => { groups[key][`total_${f}`] = 0 })
    }
    groups[key].count++
    sumFields.forEach(f => {
      groups[key][`total_${f}`] += parseFloat(row[f] || 0)
    })
  }
  // Sort by count desc, take top 30
  const all = Object.entries(groups).sort((a: any, b: any) => b[1].count - a[1].count)
  const entries = all.slice(0, 30)
  return {
    groupBy,
    totalRecords: total,
    groups: Object.fromEntries(entries),
    ...(all.length > 30 ? { note: `Showing the 30 largest of ${all.length} groups.` } : {}),
    ...partial,
  }
}

function computePeriod(period: string, customStart?: string, customEnd?: string) {
  const now = new Date()
  const yr = now.getFullYear()
  const mo = now.getMonth()
  let startDate = '', endDate = now.toISOString().slice(0, 10)
  if (period === 'this_month') startDate = new Date(yr, mo, 1).toISOString().slice(0, 10)
  else if (period === 'last_month') {
    startDate = new Date(yr, mo - 1, 1).toISOString().slice(0, 10)
    endDate = new Date(yr, mo, 0).toISOString().slice(0, 10)
  } else if (period === 'this_quarter') {
    const q = Math.floor(mo / 3) * 3
    startDate = new Date(yr, q, 1).toISOString().slice(0, 10)
  } else if (period === 'this_year') startDate = new Date(yr, 0, 1).toISOString().slice(0, 10)
  else if (period === 'last_year') {
    startDate = new Date(yr - 1, 0, 1).toISOString().slice(0, 10)
    endDate = new Date(yr - 1, 11, 31).toISOString().slice(0, 10)
  } else if (period === 'custom') {
    startDate = customStart || new Date(yr, 0, 1).toISOString().slice(0, 10)
    endDate = customEnd || endDate
  }
  return { startDate, endDate }
}

// ============================================================
// MAIN HANDLER — supports streaming + tool use
// ============================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    if (!ANTHROPIC_API_KEY) {
      return jsonError('ANTHROPIC_API_KEY not configured', 500)
    }

    const body = await req.json()
    const { messages, systemPrompt, stream } = body
    const cards = cardsFor(body)

    // Identity comes from the JWT — NEVER from the body. `companyId` and
    // `role` used to be read off the request and handed straight to the
    // service-role queries below, so any signed-in user could retarget them
    // at another tenant by editing two fields in devtools. Whatever the
    // client sends for these is now ignored outright.
    const caller = await resolveCaller(req, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
    // No user token at all (anon key, or none) — refuse rather than burn
    // model spend for an unauthenticated caller.
    if (!caller) return jsonError('Sign in to talk to Arnie.', 401)
    // A signed-in user with no employee row keeps chatting, just without
    // tools: companyId stays null, so includeTools below is false and no
    // service-role query can run. Degrading beats locking them out.
    const companyId = caller.companyId
    const role = caller.role

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonError('messages array is required', 400)
    }

    // Sanitize messages — alternate user/assistant, start with user.
    // `content` may be a string or an array of blocks (a message carrying an
    // image or PDF attachment); the array passes through untouched, which is
    // why attachments needed no change on this side.
    const cleaned: any[] = []
    for (const msg of messages) {
      const r = msg.role === 'user' ? 'user' : 'assistant'
      const content = typeof msg.content === 'string' ? msg.content.trim() : msg.content
      if (!content || (Array.isArray(content) && content.length === 0)) continue
      if (cleaned.length > 0 && cleaned[cleaned.length - 1].role === r && typeof content === 'string' && typeof cleaned[cleaned.length - 1].content === 'string') {
        cleaned[cleaned.length - 1].content += '\n\n' + content
      } else {
        cleaned.push({ role: r, content })
      }
    }
    if (cleaned.length > 0 && cleaned[0].role !== 'user') cleaned.shift()
    if (cleaned.length === 0) return jsonError('No valid messages', 400)

    // === STREAMING + TOOL USE LOOP ===
    if (stream) {
      return streamWithTools(cleaned, systemPrompt, caller, cards)
    }

    // === NON-STREAMING (with tool support) ===
    const reply = await callWithTools(cleaned, systemPrompt, caller, cards)
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[arnie-chat]', err)
    return jsonError(
      err.message || 'Internal error',
      500,
      typeof err?.ai_unavailable === 'boolean' ? { ai_unavailable: err.ai_unavailable } : undefined,
    )
  }
})

function jsonError(msg: string, status: number, extra?: Record<string, unknown>) {
  return new Response(JSON.stringify({ error: msg, ...(extra || {}) }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Run a non-streaming completion with tool use support (multi-turn)
async function callWithTools(messages: any[], systemPrompt: string, caller: Caller, cards: string[]): Promise<string> {
  const { companyId, role } = caller
  let convo = [...messages]
  // Only advertise tools if we have a companyId to scope queries safely
  const includeTools = !!companyId
  for (let i = 0; i < 5; i++) { // up to 5 tool rounds
    const ai = await callAnthropic(
      { feature: 'arnie-chat', companyId: companyId ?? null },
      {
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: systemPrompt || '',
        ...(includeTools ? { tools: toolsFor(role, cards) } : {}),
        messages: convo,
      },
    )
    if (!ai.ok) {
      // Bubbles up to the main catch -> jsonError keeps the { error } shape.
      const err = new Error(ai.friendly) as Error & { ai_unavailable?: boolean }
      err.ai_unavailable = ai.unavailable === true
      throw err
    }
    const data = ai.data
    const blocks = data.content || []
    const toolUses = blocks.filter((b: any) => b.type === 'tool_use')
    if (toolUses.length === 0) {
      return blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    }
    convo.push({ role: 'assistant', content: blocks })
    const toolResults = []
    for (const tu of toolUses) {
      const result = await execTool(tu.name, tu.input, caller)
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
    }
    convo.push({ role: 'user', content: toolResults })
  }
  return 'Sorry boss, I got tangled up trying to look that up. Try asking me a different way.'
}

// Streaming version with tool support — emits SSE
async function streamWithTools(messages: any[], systemPrompt: string, caller: Caller, cards: string[]) {
  const { companyId, role } = caller
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        let convo = [...messages]
        const includeTools = !!companyId
        const aiMeta = { feature: 'arnie-chat', companyId: companyId ?? null }
        for (let round = 0; round < 5; round++) {
          const res = await fetch(ANTHROPIC_URL, {
            method: 'POST',
            headers: {
              'x-api-key': ANTHROPIC_API_KEY,
              'anthropic-version': '2023-06-01',
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: 'claude-sonnet-4-5-20250929',
              max_tokens: 4096,
              system: systemPrompt || '',
              ...(includeTools ? { tools: toolsFor(role, cards) } : {}),
              messages: convo,
              stream: true,
            }),
          })
          if (!res.ok || !res.body) {
            const failure = await reportAnthropicFailure(aiMeta, res.status, await res.text())
            send('error', { message: failure.friendly, ai_unavailable: failure.unavailable === true })
            controller.close()
            return
          }

          // Parse SSE from Anthropic, forward text, accumulate tool_use blocks
          const reader = res.body.getReader()
          const dec = new TextDecoder()
          let buf = ''
          const blocks: any[] = []
          let stopReason = ''
          let usage: any = null

          while (true) {
            const { value, done } = await reader.read()
            if (done) break
            buf += dec.decode(value, { stream: true })
            const lines = buf.split('\n')
            buf = lines.pop() || ''
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue
              try {
                const evt = JSON.parse(line.slice(6))
                if (evt.type === 'content_block_start') {
                  blocks[evt.index] = { ...evt.content_block }
                  if (evt.content_block.type === 'tool_use') {
                    blocks[evt.index].input_buf = ''
                  } else if (evt.content_block.type === 'text') {
                    blocks[evt.index].text = ''
                  }
                } else if (evt.type === 'content_block_delta') {
                  const b = blocks[evt.index]
                  if (!b) continue
                  if (evt.delta.type === 'text_delta') {
                    b.text = (b.text || '') + evt.delta.text
                    send('text', { delta: evt.delta.text })
                  } else if (evt.delta.type === 'input_json_delta') {
                    b.input_buf = (b.input_buf || '') + evt.delta.partial_json
                  }
                } else if (evt.type === 'content_block_stop') {
                  const b = blocks[evt.index]
                  if (b?.type === 'tool_use' && b.input_buf !== undefined) {
                    try { b.input = JSON.parse(b.input_buf) } catch { b.input = {} }
                    delete b.input_buf
                    send('tool_call', { name: b.name })
                  }
                } else if (evt.type === 'message_start') {
                  if (evt.message?.usage) usage = { ...(usage || {}), ...evt.message.usage }
                } else if (evt.type === 'message_delta') {
                  if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason
                  if (evt.usage) usage = { ...(usage || {}), ...evt.usage }
                }
              } catch {}
            }
          }

          // Usage metering for this streamed round — fire-and-forget.
          if (usage) logAnthropicSuccess(aiMeta, 'claude-sonnet-4-5-20250929', usage).catch(() => {})

          const toolUses = blocks.filter((b: any) => b?.type === 'tool_use')
          if (stopReason !== 'tool_use' || toolUses.length === 0) {
            send('done', {})
            controller.close()
            return
          }

          // Push assistant turn + tool results, loop
          convo.push({ role: 'assistant', content: blocks })
          const toolResults = []
          for (const tu of toolUses) {
            const result = await execTool(tu.name, tu.input, caller)
            // A drafted change has to reach the UI as a card, not as prose —
            // the model describing a diff is not the same as the admin seeing
            // one and clicking approve.
            if (['propose_change', 'propose_record_change', 'propose_bulk_change'].includes(tu.name)
                && result?.proposal && result?.preview) {
              send('proposal', { proposal: result.proposal, preview: result.preview })
            }
            toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
          }
          convo.push({ role: 'user', content: toolResults })
        }
        send('done', {})
        controller.close()
      } catch (e: any) {
        send('error', { message: e.message || 'stream failed' })
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
}
