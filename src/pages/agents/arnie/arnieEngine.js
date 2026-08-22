import { getUserRole, assembleDataContext, getDataLoadStatus, isClockedIn } from './arnieTools'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'
import { JOBSCOUT_KNOWLEDGE, getFeatureContextForMessage } from './arnieKnowledge'
import { toApiMessages, withCurrentTurn } from '../../../lib/chatAttachments'

/**
 * The approval-card types this build can render, declared to the server on
 * every request. It only offers tools whose output we can draw.
 *
 * The reason this exists: propose_bulk_change was deployed to the edge
 * function before the card that renders it had shipped. The client of the day
 * routed every non-'record' preview into the settings-list card, which calls
 * .map() on `after` — and a bulk preview's `after` is a string, so the whole
 * message list threw mid-render. Nothing was written and nothing could be
 * approved, but the panel broke.
 *
 * Keep this list honest: a card type belongs here in the same commit that
 * teaches ArnieChat to draw it, never earlier.
 */
export const RENDERABLE_CARDS = ['config', 'record', 'bulk']

/**
 * Field or office — the same Arnie, answering very differently.
 *
 * These are not the same product. A tech clocked into a job is holding a
 * phone, probably wearing gloves, quite possibly listening rather than
 * reading; a markdown table is useless to them and a four-paragraph answer is
 * worse than silence. An owner at a desk wants the table.
 *
 * Being clocked in is the strongest signal we have and it outranks role: a
 * manager up a ladder is in the field, whatever their access level says.
 */
export function detectMode(role, userId) {
  if (isClockedIn(userId)) return 'field'
  return role === 'user' || role === 'team_lead' ? 'field' : 'office'
}

const FIELD_BLOCK = `## You are talking to someone ON A JOB RIGHT NOW — field mode
- They are on a phone, probably one-handed, quite possibly just listening. Answer like you are standing next to them.
- **One or two sentences.** No tables. No headings. No more than three bullets, ever.
- Lead with the action, not the wind-up. "North bay next — twelve highbays, 150 watt." NOT "Let me walk you through what's coming up."
- One step at a time. Give the next thing, then stop and let them ask. Never dump the whole list.
- Say numbers, part numbers, addresses and phone numbers plainly and completely — they may be writing it on their hand.
- If they sound stuck, ask one short question rather than guessing at five possibilities.
- Never send them to a screen they cannot reach with dirty hands. If it truly needs the office, say who to call.`

const OFFICE_BLOCK = `## You are talking to someone at a desk — office mode
- Screen and keyboard. Structure helps here: tables, short bullet lists, bold numbers.
- Lead with the figure, then the breakdown underneath it. Max 8-10 rows in a table.
- When a number has a story behind it (a big month, a customer carrying the total), say so in one line.
- Offer the next cut — "want it split by rep?" — instead of pre-emptively printing every view.`

function buildSystemPrompt(user, company, role, mode = 'office') {
  const roleNames = { developer: 'Developer', super_admin: 'Owner/Super Admin', admin: 'Admin', manager: 'Manager', team_lead: 'Team Lead', user: 'User' }
  const roleName = roleNames[role] || 'User'

  return `You are OG Arnie — the wise, funny, old-school AI assistant for JobScout.

## Your Identity & Personality
- Name: OG Arnie (or just Arnie). You're named after the user's grandpa — a sharp, witty old guy who always had the answer.
- You talk like a seasoned old-timer who's seen it all. Warm, direct, a little salty. Think of a wise grandpa running a business from his favorite chair.
- You call people "boss", "chief", "kid", "amigo" — whatever feels right in the moment.
- You say **"Ye gawds!"** when something is surprising, impressive, or when the numbers are wild. Use it naturally, not every message.
- You're lively and fun — crack jokes, give encouragement, throw in old-school wisdom. But you're also sharp and get straight to business when asked.
- Keep it conversational and warm. You're not a corporate robot — you're Arnie.

## Singing
- When someone asks you to sing, you ALWAYS sing "Rancho Grande" by Freddy Fender FIRST — in ENGLISH. Belt it out with enthusiasm and heart. Format the lyrics nicely with verses.
- Sing the English version of Rancho Grande (e.g. "I love my rancho grande, oh give me the wide open range..."). Keep it fun and lively.
- After Rancho Grande, if they ask for another song, you can sing whatever they request. Ham it up.
- You love music. Freddy Fender is your guy. You might throw in a "Wasted Days and Wasted Nights" reference too.

## Greeting Style
- Open with something like "Ay, what's good? O.G. Arnie here." or "Hey chief, what can the old man do for ya?" or "Arnie's in the house. What do you need, boss?"
- Be warm and inviting. Make people feel like they're talking to someone who genuinely cares.

## STRICT FORMAT RULES
- NEVER use roleplay actions, stage directions, or asterisk actions like *adjusts glasses*, *leans back*, *chuckles*, etc. You are a voice — not an actor on a stage. Just talk naturally.
- NEVER use brackets, parentheses, or any other notation for physical actions or emotions.
- Express personality through your WORDS and tone, not through described actions.

## Current User
- Name: ${user?.email || 'Unknown'}
- Role: ${roleName}
- Company: ${company?.name || company?.company_name || 'Unknown'}

## What You Can Do
- Answer questions about company data (jobs, customers, products, employees, etc.)
- Provide summaries and reports from available data
- Guide users through JobScout features and workflows
- Explain how things work in the app
- Help with general business questions
- Entertain, motivate, and keep morale up
- **Help techs on the job** — you know what job they're clocked into and what page they're viewing. You can see their assigned sections/tasks, line items (what to install/service), customer info, and job details. Walk them through their work step by step if they ask.

## Attachments — people send you screenshots, photos and PDFs
- You can SEE images and read PDFs the user attaches. Look at them properly before answering.
- A screenshot of an error or a weird screen: say what it shows, what caused it, and the exact next step in JobScout. Name the page and the button.
- A photo from the field (a fixture, a panel, a label, a nameplate): read the numbers off it and tell them what it means for the job.
- A bill, invoice, or utility statement: pull the real figures out of it and lay them out. Never invent a number that isn't visible — if it's cut off or blurry, say so and ask for a better shot.
- **Spreadsheets (.xlsx / .csv) arrive already parsed** — you get the sheet names, the columns and the rows as text. Read the actual values; never guess at what a column probably contains.
- A **supplier price list** is the common one. The useful answer is a comparison, not a recital: run \`query_products\` and tell them which items are NEW to the catalogue, which have a DIFFERENT price or cost, and which rows are missing data you'd need. Lead with the counts, then the interesting rows.
- Match on a real key — model number, item code, vendor SKU — and say which key you used. If two rows could be the same product, say so rather than deciding.
- **If the sheet carries a WARNING that it was cut short, say so before answering.** Never total a column or describe "all" the rows from a truncated view.
- **You cannot create records.** You can change fields on things that already exist (see below), but nothing in JobScout lets you add a new product, customer, quote or inventory item. Say that plainly and point them at the import tool on the page instead of implying you'll do it.
- If an image is too dark, cropped, or unreadable, say that plainly instead of guessing.

## Job Context Awareness
- When a tech asks for help, you automatically see what job they're clocked into and what page they're on.
- You can see their assigned sections, what's complete, what's next.
- You know the line items (products/services to install), quantities, and specs.
- You know the customer name, address, phone — so you can help them find the site or call the customer.
- If they ask "what should I do next?" or "help me with this job", walk them through their sections in order.
- If they ask about a specific product on the job, give them details from the line items.

## CRITICAL: Data Accuracy Rules
- **Never invent a number, name, count or status.** Every figure you say comes from the data context below or from a tool call. If the data shows 3 jobs, say 3 — never "about 15", never a guess.
- **Missing from the context is not the same as missing.** The context is a snapshot of what the app happened to load; the tools read the database directly. If something isn't in the context, CALL THE TOOL. Do not tell someone you don't have their data when a tool would fetch it.
- Only say you can't see something after a tool has actually come back empty or there is no tool for it. "I don't have that loaded" is a last resort, not a first answer.
- When a tool genuinely returns nothing, say so plainly — "looks like there's nothing there right now" — and do NOT fabricate entries to fill the gap.
- **A count of 0 in "Data Load Status" means not preloaded, NOT that none exist.** That is a reason to call a tool, never a reason to report zero.
- If a tool result carries a WARNING or note about partial data, say that out loud. A partial total presented as a total is the same as making it up.
- It's fine to give general business advice, explain features, or just chat without data. The rules above are about answering questions about THIS company.

## Changing things — you draft, a human approves
You have exactly two write tools, and **neither one changes anything by itself**. Both draft a change and put an approve/discard card in front of the user.

**propose_change** — settings lists, ADMIN ONLY: business units, lead sources, service types, upsells.

**propose_bulk_change** — ADMIN ONLY. The same field on MANY products at once: \`product_manufacturer\`, \`product_category\`, \`product_active\`. This is the catalogue clean-up tool.
- **Audit before you change.** Run \`query_products\` with \`group_by=manufacturer\` FIRST. It reads the whole catalogue, not a page, and it flags values that differ only by stray whitespace — "MES" and "MES " are two different manufacturers to every filter in the app, and you cannot see the difference by eye. Quote the values back so the user can.
- You give a filter and a new value; the server finds the rows. The card lists every affected product.
- **There is no delete.** Set \`product_active\` to false instead — products are referenced by old quotes, jobs and invoices, and deleting one breaks that history. Say "deactivate", never "delete".

**propose_record_change** — one field on one record:
- \`job_status\` / \`lead_status\` — move a job or lead along
- \`job_note\` / \`lead_note\` — add a note (it is ADDED to any existing note, never replaces it)
- \`job_schedule\` — set a job's start date (YYYY-MM-DD)

Rules that matter:
- **Never invent a record_id.** Describe the record the way the user did — "the Drinkle insurance job", "JOB-ABC123" — and let the lookup find it.
- If the result comes back with **needs_choice**, several records matched. Read the options out and ask which one, then call again with that record_id. Do not pick for them.
- If a status is rejected as not-in-use, tell them the ones that ARE in use. Don't retry with a synonym.
- **You are drafting.** Say "here's the change, give it a look" — NEVER "done", NEVER "I've updated it", NEVER "that's been changed". It is not changed until they tap approve.
- A tech who is clocked into a job can add a note to THAT job. Anything else needs a manager — if they can't do it, say who can.

## What You Cannot Do
- Everything outside those two tools — invoices, payments, prices, employees, customers, deleting anything — you cannot touch. Say so plainly and point them at the right page in JobScout.
- You cannot access data outside the user's role permissions
- You do not have real-time external data (weather, traffic, etc.)
- You CANNOT guess or estimate data you don't have — always be honest about gaps

## Role Permissions (${roleName})
${role === 'user' || role === 'team_lead' ? `- Can see: assigned jobs, products, assigned inventory, assigned customers, team names, your schedule
- Cannot see: leads/deals, all jobs, financials, payroll, fleet. If they ask, say something like "Ah, that's above my pay grade for your login, kid. Talk to your admin."` : ''}${role === 'manager' ? `- Can see: all jobs, products, inventory, customers, employees, schedule
- Cannot see: full financials, pay rates. If they ask, say "That's above your clearance, boss."` : ''}${role === 'admin' ? `- Can see: all jobs, products, inventory, customers, leads, employees (no pay rates), fleet
- Cannot see: payroll details, pay rates, expense reports. If they ask, say "That's owner-level stuff, boss. I can't peek behind that curtain."` : ''}${role === 'super_admin' || role === 'developer' ? `- Full access to all data including financials, payroll, and pay rates. You're talking to the big boss — give 'em everything.` : ''}

## Response Length — CRITICAL
- **Be CONCISE.** Short enough to speak aloud comfortably.
- NEVER repeat what the user just said back to them. NEVER start with "Great question!" or similar filler.
- Get to the point FAST. Arnie is sharp and direct — not a rambler.
- If someone asks "how many jobs?" — say the number, not a paragraph about it.

${mode === 'field' ? FIELD_BLOCK : OFFICE_BLOCK}

## Formatting
- Use markdown for formatting (tables, bold, lists, code blocks)${mode === 'field' ? ' — but see field mode above: on a job site, plain sentences beat any of it' : ''}
- When showing numbers, format currency with $ and 2 decimal places
- Add personality to data responses — a quick quip, not a monologue.

## About JobScout
JobScout is a business management platform for field service companies. It handles the full business lifecycle: leads, quotes, jobs, invoices, payments, team & fleet management, plus specialized AI Agents (Lenard for lighting, Freddy for fleet, Conrad for email, Victor for verification). You know it all inside and out.

${JOBSCOUT_KNOWLEDGE}

## Tools You Can Call
You have access to live database query tools. USE THEM when the data context doesn't have what you need:
- **query_invoices** — overdue/by-customer/by-month invoice questions
- **query_jobs** — job filtering by status/employee/date range
- **query_revenue** — revenue by period (this_month, last_month, this_quarter, this_year, last_year, custom) — OWNER ONLY
- **query_leads** — lead/deal questions, salesperson stats — ADMIN+ ONLY
- **query_customers** — customer search/lookup
- **query_employees** — employee details with stats
- **query_inventory** — stock levels, low-stock alerts
- **query_quotes** — quotes/estimates sent, won, still out, by rep or month — ADMIN+ ONLY
- **query_expenses** — spend by category, vendor or job — OWNER ONLY
- **query_appointments** — the calendar: what's booked, for whom, how it went
- **query_time_clock** — hours worked, and shifts nobody clocked out of
- **query_products** — catalogue: price, cost, manufacturer, model number. \`group_by\` audits the WHOLE set — use it before any claim about "all" or "every" product
- **propose_bulk_change** — ADMIN ONLY. Catalogue clean-up across many products at once
- **propose_change** — ADMIN ONLY. Drafts a settings-list change for approval.
- **propose_record_change** — drafts a change to one field on one job or lead, for approval. See the rules above.

When someone asks about hours or payroll, check **query_time_clock** for open shifts even if they didn't ask — a shift with no clock-out carries no hours and quietly goes unpaid.

When in doubt, call a tool rather than guessing. Tools return the live truth from the database. The "Data Load Status" section shows you what's preloaded — anything missing or filtered, get it via a tool call.`
}

// Keyword-based intent detection to determine which data domains to fetch
export function detectIntent(message) {
  const lower = message.toLowerCase()
  const domains = new Set()

  // Jobs
  if (/\b(job|jobs|work order|task|assignment)\b/.test(lower)) {
    domains.add('jobs')
  }

  // Schedule / appointments
  if (/\b(schedule|today|this week|calendar|upcoming|next|tomorrow|when|appointment)\b/.test(lower)) {
    domains.add('schedule')
    domains.add('jobs')
    domains.add('appointments')
  }

  // Products
  if (/\b(product|service|offering|catalog|price|pricing|item)\b/.test(lower)) {
    domains.add('products')
  }

  // Inventory
  if (/\b(inventory|stock|supply|supplies|warehouse|parts|reorder)\b/.test(lower)) {
    domains.add('inventory')
  }

  // Customers
  if (/\b(customer|client|account|contact)\b/.test(lower)) {
    domains.add('customers')
  }

  // Leads / Sales — fixed regex: removed misplaced \b inside group for "rep"
  if (/\b(lead|leads|deal|deals|pipeline|prospect|opportunity|sales|sell|sold|selling|make|made|commission|salesperson|rep)\b/.test(lower)) {
    domains.add('leads')
    domains.add('employees')
  }

  // Employees
  if (/\b(employee|team|staff|crew|member|worker|technician|tech)\b/.test(lower)) {
    domains.add('employees')
  }

  // Financials — added sell/sold/make/made/commission to also pull financials
  if (/\b(invoice|payment|expense|revenue|financial|money|profit|cost|billing|payroll|income|earnings|sell|sold|make|made|commission)\b/.test(lower)) {
    domains.add('financials')
  }

  // Quotes
  if (/\b(quote|quotes|estimate|proposal|bid)\b/.test(lower)) {
    domains.add('quotes')
  }

  // Fleet
  if (/\b(fleet|vehicle|truck|van|car|mileage|maintenance)\b/.test(lower)) {
    domains.add('fleet')
  }

  // Lighting audits
  if (/\b(audit|audits|lighting audit|fixture|rebate|utility)\b/.test(lower)) {
    domains.add('audits')
  }

  // Routes
  if (/\b(route|routes|routing|stops|dispatch)\b/.test(lower)) {
    domains.add('routes')
  }

  // Communications
  if (/\b(communication|email|message|sent|outreach|campaign)\b/.test(lower)) {
    domains.add('communications')
  }

  // Time tracking
  if (/\b(time log|time clock|clocked|hours|timesheet|time sheet|punch)\b/.test(lower)) {
    domains.add('timeLogs')
  }

  // Agents
  if (/\b(agent|lenard|freddy|conrad|victor|ai|robot|base camp)\b/.test(lower)) {
    domains.add('agents')
  }

  // Company
  if (/\b(company|business|about us|our company)\b/.test(lower)) {
    domains.add('company')
  }

  // Person-specific questions — if asking about a person, pull employees + leads + jobs + financials
  if (/\b(did|how much|how many)\b.*\b(he|she|they|sell|make|get|close|do)\b/.test(lower)) {
    domains.add('employees')
    domains.add('leads')
    domains.add('jobs')
    domains.add('financials')
  }

  // General / overview — send everything relevant
  if (/\b(overview|summary|dashboard|how many|report|status|everything|total|count|all|going on|what's up|whats up|how are we|how we doing|how's business|hows business|update|rundown|breakdown)\b/.test(lower)) {
    domains.add('jobs')
    domains.add('customers')
    domains.add('employees')
    domains.add('schedule')
    domains.add('company')
    domains.add('products')
    domains.add('leads')
    domains.add('quotes')
    domains.add('inventory')
    domains.add('financials')
  }

  // Help with current task / job context
  if (/\b(help|how do i|how to|what should|what do i|this job|current job|working on|clocked in|my task|my section|what next|next step|walk me through|guide me|stuck)\b/.test(lower)) {
    domains.add('activeJob')
    domains.add('currentPage')
  }

  // This/the job, task, section — pull current context
  if (/\b(this|the) (job|task|section|customer|address|line item)\b/.test(lower)) {
    domains.add('activeJob')
    domains.add('currentPage')
  }

  return Array.from(domains)
}

// Call Claude via Supabase edge function — streams responses via SSE
async function callClaude(conversationHistory, systemPrompt, dataContext, onChunk) {
  const contextMessage = dataContext
    ? `\n\n## Current Data Context (REAL DATA — use ONLY these facts)\nBelow is the ACTUAL company data pulled from the database. Use ONLY these numbers and facts when answering data questions. If something is not listed here AND no tool can fetch it, you do NOT have it.\n\n${dataContext}`
    : '\n\n## Current Data Context\nNo preloaded data — call a query_* tool to fetch what you need.'

  const messages = toApiMessages(conversationHistory)

  const fullSystemPrompt = systemPrompt + contextMessage

  // Stream via fetch directly so we can read SSE
  const session = await supabase.auth.getSession()
  const accessToken = session?.data?.session?.access_token
  const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/arnie-chat`

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken || import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
    },
    // companyId and role are deliberately NOT sent. The edge function
    // resolves both from the caller's JWT — a client-supplied tenant id is
    // exactly the hole that let one company read another's data.
    body: JSON.stringify({
      messages,
      systemPrompt: fullSystemPrompt,
      stream: true,
      // Approval cards this build knows how to draw. The server withholds any
      // tool whose result we could not render, so the two halves of a feature
      // can deploy in either order. Add to this list in the SAME commit that
      // adds the card — never ahead of it.
      supports: RENDERABLE_CARDS,
    }),
  })

  if (!res.ok || !res.body) {
    const errText = await res.text().catch(() => 'stream failed')
    throw new Error(`arnie-chat error: ${res.status} ${errText}`)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  let full = ''
  let currentEvent = ''

  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop() || ''
    for (const line of lines) {
      if (line.startsWith('event: ')) {
        currentEvent = line.slice(7).trim()
      } else if (line.startsWith('data: ')) {
        try {
          const payload = JSON.parse(line.slice(6))
          if (currentEvent === 'text' && payload.delta) {
            full += payload.delta
            onChunk(full) // pass cumulative text for replace-style rendering
          } else if (currentEvent === 'tool_call') {
            const hint = payload.name === 'propose_change' ? 'writing that up' : `looking that up (${payload.name})`
            onChunk(full + `\n\n_…${hint}_`, { tool: payload.name })
          } else if (currentEvent === 'proposal') {
            // Arnie drafted a config change. Nothing is applied — the caller
            // renders an approve/reject card from this payload.
            onChunk(full, { proposal: payload })
          } else if (currentEvent === 'error') {
            throw new Error(payload.message || 'stream error')
          }
        } catch (e) {
          if (currentEvent === 'error') throw e
        }
      }
    }
  }

  // Final clean send (without the "looking that up" hint)
  if (full) onChunk(full)
  return full
}

// Send a message through the full pipeline with streaming.
// `attachments` are screenshots/photos/PDFs the user added to THIS turn.
export async function sendMessageStream(message, history = [], onChunk, attachments = []) {
  let role, userId
  try {
    const ur = getUserRole()
    role = ur.role
    userId = ur.userId
  } catch (e) {
    console.error('[Arnie] getUserRole failed:', e)
    throw new Error('Failed to get user role: ' + e.message)
  }

  const { user, company } = useStore.getState()

  let systemPrompt
  try {
    systemPrompt = buildSystemPrompt(user, company, role, detectMode(role, userId))
  } catch (e) {
    console.error('[Arnie] buildSystemPrompt failed:', e)
    throw new Error('Failed to build prompt: ' + e.message)
  }

  let dataContext
  try {
    const domains = detectIntent(message)

    // Always include activeJob and currentPage for context awareness
    if (!domains.includes('activeJob')) domains.push('activeJob')
    if (!domains.includes('currentPage')) domains.push('currentPage')

    // If no data domains detected, include broad context so Arnie has something
    if (domains.length <= 2) {
      domains.push('jobs', 'schedule', 'company', 'customers', 'employees')
    }

    dataContext = assembleDataContext(domains, role, userId)
  } catch (e) {
    console.error('[Arnie] Data assembly failed:', e)
    // Don't crash — just proceed without data
    dataContext = ''
  }

  // A cold store is a reason to reach for a tool, not a reason to give up.
  // This used to instruct Arnie to tell the user their data was still loading
  // and to try again in a moment — on a hard refresh, or on a slow phone in
  // the field, that turned every first question into a brush-off, while the
  // tools sitting next to him could have answered it from the database.
  if (!dataContext || dataContext.trim().length < 50) {
    const loadStatus = getDataLoadStatus()
    const totalRecords = Object.values(loadStatus).reduce((a, b) => a + b, 0)
    if (totalRecords === 0) {
      dataContext = '### Data Load Status\n'
        + 'The app has not finished loading its local snapshot, so there is NO preloaded data in this turn.\n'
        + 'This says nothing about what exists — it only means you must get it yourself.\n'
        + 'Use your query_* tools to answer anything factual. Do NOT tell the user their data is still loading, '
        + 'and do NOT report zero for anything: a tool call is available and is the correct move.'
    }
  }

  // Feature-specific deep context — if the user's message names a
  // feature in our knowledge cards, prepend the full card so Arnie
  // cites setup steps + gotchas + FAQs accurately instead of
  // improvising from the high-level feature index. Empty string when
  // nothing matches (cheap no-op for casual chitchat).
  try {
    const featureContext = getFeatureContextForMessage(message)
    if (featureContext) {
      dataContext = featureContext + '\n\n' + (dataContext || '')
    }
  } catch (e) {
    console.error('[Arnie] feature context injection failed:', e)
  }

  const conversationHistory = withCurrentTurn(history, message, attachments)

  const response = await callClaude(conversationHistory, systemPrompt, dataContext, onChunk)
  return response
}

// Generate a unique session ID
function generateId() {
  return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2)
}

// Session management — uses ai_sessions table (session_id is text, not auto PK)
export async function createSession(title) {
  const { companyId, user } = useStore.getState()
  const sessionId = generateId()
  const now = new Date().toISOString()

  const { data, error } = await supabase
    .from('ai_sessions')
    .insert({
      company_id: companyId,
      session_id: sessionId,
      user_email: user?.email,
      started: now,
      last_activity: now,
      status: 'active',
      current_module: 'arnie',
      context_json: JSON.stringify({ title: title || 'New conversation' })
    })
    .select()
    .single()

  if (error) {
    console.error('Error creating session:', error)
    return null
  }
  return data
}

export async function saveMessage(sessionId, role, content) {
  if (!sessionId) return null
  const { companyId } = useStore.getState()
  const now = new Date().toISOString()

  const { error } = await supabase
    .from('ai_messages')
    .insert({
      company_id: companyId,
      message_id: generateId(),
      session_id: sessionId,
      timestamp: now,
      role,
      content,
      module_used: 'arnie'
    })

  if (error) console.error('Error saving message:', error)

  // Update last_activity on the session
  await supabase
    .from('ai_sessions')
    .update({ last_activity: now })
    .eq('session_id', sessionId)
}

/**
 * Merge keys into a session's context_json.
 *
 * Everything we keep about a conversation beyond its messages — the title,
 * whether it's pinned, when it was renamed — lives in this one JSON column.
 * Read-modify-write rather than overwrite, so adding a pin never drops the
 * title, and so this needs no migration (which matters: other sessions have
 * unpushed migrations sitting in front of `db push`).
 */
async function patchSessionContext(sessionId, patch) {
  if (!sessionId) return
  const existing = await supabase
    .from('ai_sessions')
    .select('context_json')
    .eq('session_id', sessionId)
    .single()

  let ctx = {}
  try { ctx = JSON.parse(existing.data?.context_json || '{}') } catch { /* corrupt context reads as empty */ }

  await supabase
    .from('ai_sessions')
    .update({ context_json: JSON.stringify({ ...ctx, ...patch }) })
    .eq('session_id', sessionId)
}

/** Auto-title from the opening message — never over a name someone chose. */
export async function updateSessionTitle(sessionId, title) {
  if (!sessionId) return
  const { data } = await supabase
    .from('ai_sessions')
    .select('context_json')
    .eq('session_id', sessionId)
    .single()
  try {
    if (JSON.parse(data?.context_json || '{}').renamed === true) return
  } catch { /* corrupt context is not a rename */ }
  return patchSessionContext(sessionId, { title })
}

/**
 * Rename a conversation by hand.
 *
 * Kept separate from updateSessionTitle because that one is called
 * automatically from the first message of every chat. Without the flag, the
 * auto-titler would quietly overwrite a name someone chose.
 */
export async function renameSession(sessionId, title) {
  const clean = String(title || '').trim().slice(0, 120)
  if (!clean) return
  return patchSessionContext(sessionId, { title: clean, renamed: true })
}

export async function setSessionPinned(sessionId, pinned) {
  return patchSessionContext(sessionId, { pinned: !!pinned })
}

export async function loadSessions() {
  const { companyId, user } = useStore.getState()
  const { data, error } = await supabase
    .from('ai_sessions')
    .select('*')
    .eq('company_id', companyId)
    .eq('user_email', user?.email)
    .eq('current_module', 'arnie')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    console.error('Error loading sessions:', error)
    return []
  }

  // Unpack what we keep about each conversation, then float the pinned ones.
  // A pinned conversation is one someone deliberately kept; burying it under
  // whatever they happened to ask this morning defeats the point of pinning.
  return (data || [])
    .map(s => {
      let ctx = {}
      try { ctx = JSON.parse(s.context_json || '{}') } catch { /* corrupt context reads as empty */ }
      return {
        ...s,
        title: ctx.title || 'Untitled conversation',
        pinned: ctx.pinned === true,
        renamed: ctx.renamed === true,
      }
    })
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0))
}

/**
 * Find conversations by name OR by something said inside them.
 *
 * Searching titles alone is close to useless here: titles are auto-generated
 * from the first message, so the thing you remember saying is usually in the
 * middle of a chat called something else entirely.
 *
 * Content matching is restricted to the session ids already loaded for this
 * user, so it can never surface a colleague's conversation.
 */
export async function searchSessions(term, sessions) {
  const q = String(term || '').trim()
  if (!q) return sessions

  const lower = q.toLowerCase()
  const hits = new Map()
  for (const s of sessions) {
    if ((s.title || '').toLowerCase().includes(lower)) hits.set(s.session_id, 'title')
  }

  const ids = sessions.map(s => s.session_id).filter(Boolean)
  if (ids.length) {
    const { data, error } = await supabase
      .from('ai_messages')
      .select('session_id, content')
      .in('session_id', ids)
      .ilike('content', `%${q}%`)
      .limit(400)
    if (error) console.error('[Arnie] message search failed:', error)
    for (const m of data || []) {
      if (!hits.has(m.session_id)) hits.set(m.session_id, 'message')
      // Keep a short excerpt so the result explains why it matched.
      if (!hits.get(`${m.session_id}:snippet`)) {
        const i = (m.content || '').toLowerCase().indexOf(lower)
        if (i >= 0) {
          const from = Math.max(0, i - 40)
          hits.set(`${m.session_id}:snippet`,
            (from > 0 ? '…' : '') + m.content.slice(from, i + q.length + 60).replace(/\s+/g, ' ').trim() + '…')
        }
      }
    }
  }

  return sessions
    .filter(s => hits.has(s.session_id))
    .map(s => ({ ...s, matchedOn: hits.get(s.session_id), snippet: hits.get(`${s.session_id}:snippet`) || null }))
}

export async function loadSessionMessages(sessionId) {
  const { data, error } = await supabase
    .from('ai_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('timestamp', { ascending: true })

  if (error) {
    console.error('Error loading messages:', error)
    return []
  }
  return data || []
}

export async function deleteSession(sessionId) {
  // Delete messages first, then session
  await supabase.from('ai_messages').delete().eq('session_id', sessionId)
  await supabase.from('ai_sessions').delete().eq('session_id', sessionId)
}
