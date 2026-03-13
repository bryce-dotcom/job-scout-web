import { GoogleGenerativeAI } from '@google/generative-ai'
import { getUserRole, assembleDataContext, getDataLoadStatus } from './arnieTools'
import { supabase } from '../../../lib/supabase'
import { useStore } from '../../../lib/store'

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY || '')
const GEMINI_TIMEOUT_MS = 30000

function buildSystemPrompt(user, company, role) {
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

## Job Context Awareness
- When a tech asks for help, you automatically see what job they're clocked into and what page they're on.
- You can see their assigned sections, what's complete, what's next.
- You know the line items (products/services to install), quantities, and specs.
- You know the customer name, address, phone — so you can help them find the site or call the customer.
- If they ask "what should I do next?" or "help me with this job", walk them through their sections in order.
- If they ask about a specific product on the job, give them details from the line items.

## CRITICAL: Data Accuracy Rules
- **ONLY quote numbers, names, counts, and facts from the "Current Data Context" section below.** If data is provided, use it exactly.
- **If data is NOT in the context, say so honestly.** Say something like "I don't have that data loaded right now, boss" or "That info ain't in my view right now, kid." NEVER guess or make up numbers, counts, names, or statuses.
- Do NOT invent job counts, revenue figures, customer names, employee details, or any other specifics. If the data shows 3 jobs, say 3 — don't say "about 15" or guess.
- When data shows zero results or an empty list, say "Looks like there's nothing there right now" — do NOT fabricate entries.
- It's OK to give general business advice, explain features, or chat casually without data. But when answering data questions, stick to what's provided.
- **Check the "Data Load Status" section first.** If a record count is 0, that data simply hasn't loaded — tell the user honestly.

## What You Cannot Do
- You cannot modify data — you are read-only
- You cannot access data outside the user's role permissions
- You do not have real-time external data (weather, traffic, etc.)
- You CANNOT guess or estimate data you don't have — always be honest about gaps

## Role Permissions (${roleName})
${role === 'user' || role === 'team_lead' ? `- Can see: assigned jobs, products, assigned inventory, assigned customers, team names, your schedule
- Cannot see: leads/deals, all jobs, financials, payroll, fleet. If they ask, say something like "Ah, that's above my pay grade for your login, kid. Talk to your admin."` : ''}${role === 'manager' ? `- Can see: all jobs, products, inventory, customers, employees, schedule
- Cannot see: full financials, pay rates. If they ask, say "That's above your clearance, boss."` : ''}${role === 'admin' ? `- Can see: all jobs, products, inventory, customers, leads, employees (no pay rates), fleet
- Cannot see: payroll details, pay rates, expense reports. If they ask, say "That's owner-level stuff, boss. I can't peek behind that curtain."` : ''}${role === 'super_admin' || role === 'developer' ? `- Full access to all data including financials, payroll, and pay rates. You're talking to the big boss — give 'em everything.` : ''}

## Formatting
- Use markdown for formatting (tables, bold, lists, code blocks)
- When showing numbers, format currency with $ and 2 decimal places
- Keep responses concise but complete — don't ramble, but don't be dry either
- Add personality to data responses. Don't just dump numbers — comment on them like a wise business partner would.

## About JobScout
JobScout is a business management platform for field service companies. It handles the full business lifecycle: leads, quotes, jobs, invoices, payments, team & fleet management, plus specialized AI Agents (Lenard for lighting, Freddy for fleet, Conrad for email, Victor for verification). You know it all inside and out.`
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
  if (/\b(overview|summary|dashboard|how many|report|status|everything|total|count|all)\b/.test(lower)) {
    domains.add('jobs')
    domains.add('customers')
    domains.add('employees')
    domains.add('schedule')
    domains.add('company')
    domains.add('products')
    domains.add('leads')
    domains.add('quotes')
    domains.add('inventory')
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

// Streaming Gemini call — calls onChunk with each text delta for instant UI updates
// Wrapped in try-catch: if stream errors mid-way and we have partial text, return it instead of throwing
export async function callGeminiStream(conversationHistory, systemPrompt, dataContext, onChunk) {
  const contextMessage = dataContext
    ? `\n\n## Current Data Context (REAL DATA — use ONLY these facts)\nBelow is the ACTUAL company data pulled from the database. Use ONLY these numbers and facts when answering data questions. If something is not listed here, you do NOT have it.\n\n${dataContext}`
    : '\n\n## Current Data Context\nNo data was loaded for this query. If the user asks about specific numbers or records, let them know you don\'t have that data available right now.'

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    systemInstruction: { parts: [{ text: systemPrompt + contextMessage }] }
  })

  const chat = model.startChat({
    history: conversationHistory.slice(0, -1).map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    }))
  })

  const lastMessage = conversationHistory[conversationHistory.length - 1]

  // 30s timeout via Promise.race around the Gemini call
  const streamPromise = chat.sendMessageStream(lastMessage.content)
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Gemini response timed out after 30s')), GEMINI_TIMEOUT_MS)
  )
  const result = await Promise.race([streamPromise, timeoutPromise])

  let fullText = ''
  try {
    for await (const chunk of result.stream) {
      const text = chunk.text()
      if (text) {
        fullText += text
        onChunk(fullText)
      }
    }
  } catch (streamErr) {
    console.error('[Arnie Engine] Stream error mid-response:', streamErr)
    // If we got partial text, return it rather than losing everything
    if (fullText.length > 0) {
      console.warn('[Arnie Engine] Returning partial response (' + fullText.length + ' chars)')
      return fullText
    }
    throw streamErr
  }
  return fullText
}

// Send a message through the full pipeline with streaming
export async function sendMessageStream(message, history = [], onChunk) {
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
    systemPrompt = buildSystemPrompt(user, company, role)
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

    // If no data domains detected, include basic context so Arnie has something
    if (domains.length <= 2) {
      domains.push('jobs', 'schedule', 'company')
    }

    dataContext = assembleDataContext(domains, role, userId)
  } catch (e) {
    console.error('[Arnie] Data assembly failed:', e)
    // Don't crash — just proceed without data
    dataContext = ''
  }

  // If data context is empty/minimal, tell Gemini explicitly
  if (!dataContext || dataContext.trim().length < 50) {
    const loadStatus = getDataLoadStatus()
    const totalRecords = Object.values(loadStatus).reduce((a, b) => a + b, 0)
    if (totalRecords === 0) {
      dataContext = '### Data Load Status\nWARNING: No data has loaded yet. The store is still initializing. Tell the user their data is still loading and to try again in a moment.'
    }
  }

  const conversationHistory = [
    ...history,
    { role: 'user', content: message }
  ]

  const response = await callGeminiStream(conversationHistory, systemPrompt, dataContext, onChunk)
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

export async function updateSessionTitle(sessionId, title) {
  if (!sessionId) return
  const existing = await supabase
    .from('ai_sessions')
    .select('context_json')
    .eq('session_id', sessionId)
    .single()

  let ctx = {}
  try { ctx = JSON.parse(existing.data?.context_json || '{}') } catch {}
  ctx.title = title

  await supabase
    .from('ai_sessions')
    .update({ context_json: JSON.stringify(ctx) })
    .eq('session_id', sessionId)
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

  // Parse title from context_json for display
  return (data || []).map(s => {
    let title = 'Untitled conversation'
    try { title = JSON.parse(s.context_json || '{}').title || title } catch {}
    return { ...s, title }
  })
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
