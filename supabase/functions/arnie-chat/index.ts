import "jsr:@supabase/functions-js/edge-runtime.d.ts"

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
    description: 'Query invoices with filtering and aggregation. Use when answering questions about specific invoices, overdue amounts, customer billing, or revenue breakdowns. Returns top 50 results.',
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
// TOOL EXECUTORS — server-side queries, always company_id scoped
// ============================================================
async function execTool(name: string, input: any, companyId: number, role: string) {
  const sb = (path: string) => `${SUPABASE_URL}/rest/v1/${path}`
  const hdr = { 'apikey': SUPABASE_SERVICE_ROLE_KEY, 'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}` }

  // Role helpers
  const isOwner = ['developer', 'super_admin'].includes(role)
  const isAdmin = isOwner || role === 'admin'

  try {
    if (name === 'query_invoices') {
      const params = new URLSearchParams({ company_id: `eq.${companyId}`, limit: '500' })
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
      const r = await fetch(sb(`invoices?${params}`), { headers: hdr })
      if (!r.ok) return { error: `invoices query failed: ${r.status} ${await r.text()}` }
      const data = await r.json()
      // Add customer_name lookup since invoices don't have it directly — fall back to customer_id
      return aggregate(data, input.group_by, ['amount'])
    }

    if (name === 'query_jobs') {
      const params = new URLSearchParams({ company_id: `eq.${companyId}`, limit: '500' })
      if (input.status) params.append('status', `eq.${input.status}`)
      if (input.assigned_to) params.append('salesperson_id', `eq.${input.assigned_to}`)
      if (input.customer_name) params.append('customer_name', `ilike.*${input.customer_name}*`)
      if (input.start_date) params.append('start_date', `gte.${input.start_date}`)
      if (input.end_date) params.append('start_date', `lte.${input.end_date}`)
      const r = await fetch(sb(`jobs?${params}`), { headers: hdr })
      if (!r.ok) return { error: `jobs query failed: ${r.status} ${await r.text()}` }
      const data = await r.json()
      return aggregate(data, input.group_by, ['job_total', 'expense_amount', 'profit_margin'])
    }

    if (name === 'query_revenue') {
      if (!isOwner) return { restricted: 'Owner access required for revenue data.' }
      const { startDate, endDate } = computePeriod(input.period, input.start_date, input.end_date)
      const params = new URLSearchParams({ company_id: `eq.${companyId}`, limit: '5000' })
      params.append('date', `gte.${startDate}`)
      params.append('date', `lte.${endDate}`)
      const r = await fetch(sb(`payments?${params}`), { headers: hdr })
      if (!r.ok) return { error: `payments query failed: ${r.status} ${await r.text()}` }
      const data = await r.json()
      return {
        period: input.period,
        startDate,
        endDate,
        totalPayments: data.length,
        totalRevenue: data.reduce((s: number, p: any) => s + (parseFloat(p.amount) || 0), 0).toFixed(2),
        ...aggregate(data, input.group_by, ['amount']),
      }
    }

    if (name === 'query_leads') {
      if (!isAdmin) return { restricted: 'Admin access required for leads data.' }
      const params = new URLSearchParams({ company_id: `eq.${companyId}`, limit: '500' })
      if (input.status) params.append('status', `eq.${input.status}`)
      if (input.salesperson_id) params.append('salesperson_id', `eq.${input.salesperson_id}`)
      if (input.start_date) params.append('created_at', `gte.${input.start_date}`)
      if (input.end_date) params.append('created_at', `lte.${input.end_date}`)
      const r = await fetch(sb(`leads?${params}`), { headers: hdr })
      if (!r.ok) return { error: `leads query failed: ${r.status} ${await r.text()}` }
      const data = await r.json()
      return aggregate(data, input.group_by, [])
    }

    if (name === 'query_customers') {
      const params = new URLSearchParams({
        company_id: `eq.${companyId}`,
        limit: String(Math.min(input.limit || 20, 100)),
      })
      // PostgREST 'or' wants no surrounding parens in URLSearchParams form
      if (input.search) {
        const term = input.search.replace(/[*]/g, '')
        params.append('or', `(name.ilike.*${term}*,business_name.ilike.*${term}*,email.ilike.*${term}*)`)
      }
      const r = await fetch(sb(`customers?${params}`), { headers: hdr })
      if (!r.ok) return { error: `customers query failed: ${r.status} ${await r.text()}` }
      const data = await r.json()
      return { count: data.length, customers: data }
    }

    if (name === 'query_employees') {
      const select = isOwner ? '*' : 'id,name,email,role,phone,user_role,created_at'
      const params = new URLSearchParams({ company_id: `eq.${companyId}`, select })
      if (input.role) params.append('role', `eq.${input.role}`)
      const r = await fetch(sb(`employees?${params}`), { headers: hdr })
      const data = await r.json()
      return { count: data.length, employees: data }
    }

    if (name === 'query_inventory') {
      const params = new URLSearchParams({ company_id: `eq.${companyId}`, limit: '300' })
      if (input.location) params.append('location', `eq.${input.location}`)
      if (input.search) params.append('name', `ilike.*${input.search}*`)
      const r = await fetch(sb(`inventory?${params}`), { headers: hdr })
      if (!r.ok) return { error: `inventory query failed: ${r.status} ${await r.text()}` }
      const data = await r.json()
      const items = input.low_stock_only
        ? data.filter((i: any) => (i.quantity || 0) <= (i.min_quantity || i.ordering_trigger || 5))
        : data
      return { count: items.length, items: items.slice(0, 50) }
    }

    return { error: `Unknown tool: ${name}` }
  } catch (e: any) {
    console.error(`[execTool] ${name} failed:`, e)
    return { error: e.message || 'Tool execution failed' }
  }
}

function aggregate(data: any[], groupBy: string | undefined, sumFields: string[] = []) {
  if (!groupBy || groupBy === 'none') {
    return { count: data.length, sample: data.slice(0, 30) }
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
  const entries = Object.entries(groups)
    .sort((a: any, b: any) => b[1].count - a[1].count)
    .slice(0, 30)
  return { groupBy, totalRecords: data.length, groups: Object.fromEntries(entries) }
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

    const { messages, systemPrompt, sessionId, companyId, role, stream } = await req.json()

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return jsonError('messages array is required', 400)
    }

    // Sanitize messages — alternate user/assistant, start with user
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
      return streamWithTools(cleaned, systemPrompt, companyId, role)
    }

    // === NON-STREAMING (with tool support) ===
    const reply = await callWithTools(cleaned, systemPrompt, companyId, role)
    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err: any) {
    console.error('[arnie-chat]', err)
    return jsonError(err.message || 'Internal error', 500)
  }
})

function jsonError(msg: string, status: number) {
  return new Response(JSON.stringify({ error: msg }), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

// Run a non-streaming completion with tool use support (multi-turn)
async function callWithTools(messages: any[], systemPrompt: string, companyId: number, role: string): Promise<string> {
  let convo = [...messages]
  // Only advertise tools if we have a companyId to scope queries safely
  const includeTools = !!companyId
  for (let i = 0; i < 5; i++) { // up to 5 tool rounds
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
        ...(includeTools ? { tools: TOOLS } : {}),
        messages: convo,
      }),
    })
    if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`)
    const data = await res.json()
    const blocks = data.content || []
    const toolUses = blocks.filter((b: any) => b.type === 'tool_use')
    if (toolUses.length === 0) {
      return blocks.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n')
    }
    convo.push({ role: 'assistant', content: blocks })
    const toolResults = []
    for (const tu of toolUses) {
      const result = await execTool(tu.name, tu.input, companyId, role)
      toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(result) })
    }
    convo.push({ role: 'user', content: toolResults })
  }
  return 'Sorry boss, I got tangled up trying to look that up. Try asking me a different way.'
}

// Streaming version with tool support — emits SSE
async function streamWithTools(messages: any[], systemPrompt: string, companyId: number, role: string) {
  const encoder = new TextEncoder()
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: string, data: any) => {
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`))
      }
      try {
        let convo = [...messages]
        const includeTools = !!companyId
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
              ...(includeTools ? { tools: TOOLS } : {}),
              messages: convo,
              stream: true,
            }),
          })
          if (!res.ok || !res.body) {
            send('error', { message: `Anthropic ${res.status}: ${await res.text()}` })
            controller.close()
            return
          }

          // Parse SSE from Anthropic, forward text, accumulate tool_use blocks
          const reader = res.body.getReader()
          const dec = new TextDecoder()
          let buf = ''
          const blocks: any[] = []
          let stopReason = ''

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
                } else if (evt.type === 'message_delta') {
                  if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason
                }
              } catch {}
            }
          }

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
            const result = await execTool(tu.name, tu.input, companyId, role)
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
