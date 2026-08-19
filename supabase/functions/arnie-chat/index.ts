import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { callAnthropic, reportAnthropicFailure, logAnthropicSuccess } from '../_shared/anthropic.ts'
import { resolveCaller } from '../_shared/auth.ts'
import { proposeChange, targetsSentence } from '../_shared/arnieConfig.ts'

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
    description: 'Query invoices with filtering and aggregation. Use when answering questions about specific invoices, overdue amounts, customer billing, or revenue breakdowns. `count` is the exact number of matching invoices; `sample` is a subset for detail. If a WARNING field comes back, the totals are partial — say so.',
    input_schema: {
      type: 'object',
      properties: {
        status: { type: 'string', enum: ['paid', 'sent', 'overdue', 'draft', 'all'], description: 'Filter by invoice status' },
        customer_name: { type: 'string', description: 'Filter by customer name (partial match)' },
        start_date: { type: 'string', description: 'ISO date — only invoices on/after this date' },
        end_date: { type: 'string', description: 'ISO date — only invoices on/before this date' },
        group_by: { type: 'string', enum: ['customer', 'month', 'status', 'none'], description: 'Aggregate results by this field' },
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

// Admins get the write tool; everyone else never sees it exists, so the
// model cannot offer a change the caller has no standing to make.
function toolsFor(role: string) {
  const isAdmin = ['developer', 'super_admin', 'admin'].includes(role)
  return isAdmin ? [...TOOLS, PROPOSE_TOOL] : TOOLS
}

// ============================================================
// TOOL EXECUTORS — server-side queries, always company_id scoped
// ============================================================
async function execTool(name: string, input: any, companyId: number, role: string, email = '') {
  const sb = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`
  const hdr = { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }

  // Role helpers
  const isOwner = ['developer', 'super_admin'].includes(role)
  const isAdmin = isOwner || role === 'admin'

  try {
    if (name === 'query_invoices') {
      const params = new URLSearchParams({ company_id: `eq.${companyId}` })
      if (input.status && input.status !== 'all') {
        // Map common synonyms to actual values: Pending, Paid, Open, Partially Paid
        const statusMap: Record<string, string> = {
          paid: 'Paid', pending: 'Pending', open: 'Open',
          overdue: 'Pending', // Treated as pending past-due in app
          draft: 'Open',
        }
        const status = statusMap[input.status.toLowerCase()] || input.status
        params.append('payment_status', `eq.${status}`)
      }
      if (input.customer_name) params.append('customer_name', `ilike.*${input.customer_name}*`)
      if (input.start_date) params.append('created_at', `gte.${input.start_date}`)
      if (input.end_date) params.append('created_at', `lte.${input.end_date}`)
      const got = await fetchRows(sb('invoices'), params, hdr)
      if ('error' in got) return { error: `invoices query failed: ${got.error}` }
      return aggregate(got, input.group_by, ['amount'])
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
      const d = row.created_at || row.date || row.start_date
      if (d) key = String(d).slice(0, 7) // YYYY-MM
    } else if (groupBy === 'customer') {
      key = row.customer_name || (row.customer_id ? `Customer #${row.customer_id}` : 'Unknown')
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

    const { messages, systemPrompt, stream } = await req.json()

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
      return streamWithTools(cleaned, systemPrompt, companyId, role, caller.email)
    }

    // === NON-STREAMING (with tool support) ===
    const reply = await callWithTools(cleaned, systemPrompt, companyId, role, caller.email)
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
async function callWithTools(messages: any[], systemPrompt: string, companyId: number, role: string, email = ''): Promise<string> {
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
        ...(includeTools ? { tools: toolsFor(role) } : {}),
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
      const result = await execTool(tu.name, tu.input, companyId, role, email)
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
    }
    convo.push({ role: 'user', content: toolResults })
  }
  return 'Sorry boss, I got tangled up trying to look that up. Try asking me a different way.'
}

// Streaming version with tool support — emits SSE
async function streamWithTools(messages: any[], systemPrompt: string, companyId: number, role: string, email = '') {
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
              ...(includeTools ? { tools: toolsFor(role) } : {}),
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
            const result = await execTool(tu.name, tu.input, companyId, role, email)
            // A drafted change has to reach the UI as a card, not as prose —
            // the model describing a diff is not the same as the admin seeing
            // one and clicking approve.
            if (tu.name === 'propose_change' && result?.proposal && result?.preview) {
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
