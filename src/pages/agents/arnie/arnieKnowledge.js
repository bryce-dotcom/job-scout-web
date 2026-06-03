// Arnie's feature knowledge — derived from the Knowledge Cards in
// src/lib/featureKnowledge/. Same cards drive the Video Library
// walkthroughs and the Help page Feature Reference. One source of
// truth: edit a card and Arnie, Help, and the walkthrough all stay
// in sync.
//
// Two exports:
//   • JOBSCOUT_KNOWLEDGE   — static overview block (multi-tenant
//                            rules, workflows, AI agents, public
//                            routes) + auto-generated feature index
//                            (title + summary + route per card).
//   • getFeatureContextForMessage(message)
//                          — deep-context bundle for the cards the
//                            user's message mentions. Returns the
//                            full whatItIs / howItWorks / gotchas /
//                            FAQs blob, capped at 3 cards. Empty
//                            string when nothing matches.
//
// The engine prepends JOBSCOUT_KNOWLEDGE once, then appends
// getFeatureContextForMessage(message) per request. Keeps the
// system prompt under control on token count.

import { KNOWLEDGE_CARDS_LIST } from '../../../lib/featureKnowledge/index.js'

// ─── Feature index ─────────────────────────────────────────────────
// One line per card — title, category, route, summary. ~80 chars each
// so 32 cards = ~2.5KB. Cheap enough to include in every Arnie call,
// gives him awareness of every feature without flooding the prompt.
function buildFeatureIndex() {
  const byCategory = new Map()
  for (const card of KNOWLEDGE_CARDS_LIST) {
    const cat = card.category || 'Other'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat).push(card)
  }
  const lines = []
  for (const [cat, cards] of byCategory) {
    lines.push(`\n### ${cat}`)
    for (const c of cards.sort((a, b) => a.title.localeCompare(b.title))) {
      const route = c.route ? ` (${c.route})` : ''
      lines.push(`- **${c.title}**${route} — ${c.summary}`)
    }
  }
  return lines.join('\n')
}

const FEATURE_INDEX = buildFeatureIndex()

// ─── Static knowledge ──────────────────────────────────────────────
// Stuff that isn't per-feature: multi-tenant rules, common workflows,
// public routes, AI agent roster. Kept hand-curated since it's
// cross-cutting.
const STATIC_BLOCK = `
## Multi-tenant rules (always true)
- Every record has a company_id. Users only see their own company's data.
- "Business unit" is a sub-grouping within a company (e.g. Lighting, Fleet, HVAC) for revenue/expense splits.
- Settings are DB-driven (settings table, key/value with JSON arrays).

## AI Agents in JobScout
- **Arnie** (you) — general business assistant with full data access (role-gated).
- **Lenard** — lighting audit analysis + LED quote generation.
- **Freddy** — fleet maintenance scheduling + recommendations.
- **Conrad Connect** — email marketing campaigns, templates, automations.
- **Victor** — photo verification (before/after job photos, completeness checks).
- **Dougie** — OCR/document understanding for utility bills, invoices, audit forms.
- **Frankie** — AI CFO: AR/AP aging, expense anomalies, plain-English finance Q&A.

## Common workflows
- **Convert lead to job**: Pipeline → mark as Won → quote → customer signs → becomes a job (auto-created via trigger).
- **Bill customer**: Job → "Generate Invoice" → invoice created with line items from job.
- **Track utility rebate**: Audit → quote → win deal → on job completion, "Create Utility Invoice" tracks the rebate separately from customer billing.
- **Schedule a tech**: Job detail → assign employee → set scheduled_date. Shows on Calendar + the tech's Field Scout.
- **Onboard a hire**: Employees → New Hire → Send Link → magic SMS → hire walks W-4/I-9/deposit/handbook on their phone.

## Public Routes (no login required)
- /agent/lenard-az-srp — Arizona SRP LED rebate calculator
- /agent/lenard-ut-rmp — Utah Rocky Mountain Power LED rebate calculator
- /portal/:token — customer portal (per-customer magic link)
- /quote/:slug — public quote landing page (per-company)
- /onboard/:token — new-hire onboarding portal (14-day magic link)
`

export const JOBSCOUT_KNOWLEDGE = `
## JobScout Feature Reference (use this to answer "how do I X?" questions)
${FEATURE_INDEX}

${STATIC_BLOCK}
`

// ─── Per-message deep context ──────────────────────────────────────
// Builds a per-card trigger list (title words + route slug parts +
// example keywords from agentKnowledge.examples) so the matcher can
// detect when the user is asking about a specific feature without
// requiring exact title matches.

function tokenize(s) {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(w => w.length >= 3)
}

const STOP_WORDS = new Set([
  'the','and','for','with','that','this','from','your','our','can','how','what',
  'when','who','use','using','have','has','will','are','was','were','were','its',
  'they','their','about','into','out','off','set','get','put','add','new','one',
  'two','three','any','all','some','more','most','less','very','just','also',
  'feature','features','app','page','tab','open','close','show','see','help',
  'arnie','jobscout','job','scout',
])

const CARD_TRIGGERS = KNOWLEDGE_CARDS_LIST.map(card => {
  const titleTokens = tokenize(card.title)
  const routeTokens = card.route ? tokenize(card.route) : []
  const exampleTokens = (card.agentKnowledge?.examples || [])
    .flatMap(tokenize).slice(0, 20)
  const replacesTokens = (card.replaces || []).flatMap(tokenize)
  // Phrases like "lead setter", "customer portal" — let users hit on
  // exact UI labels. Stored as lowercase strings.
  const phrases = new Set([
    card.title.toLowerCase(),
    ...(card.replaces || []).map(s => s.toLowerCase()),
  ])
  const allWords = new Set(
    [...titleTokens, ...routeTokens, ...exampleTokens, ...replacesTokens]
      .filter(w => !STOP_WORDS.has(w)),
  )
  return { card, words: allWords, phrases }
})

// Returns the cards most likely being discussed in the given message.
// Scoring: phrase hit = 5, word hit = 1. Top 3 by score, threshold 2.
function rankCardsForMessage(message) {
  if (!message) return []
  const text = String(message).toLowerCase()
  const words = new Set(tokenize(text).filter(w => !STOP_WORDS.has(w)))
  const scored = []
  for (const { card, words: cardWords, phrases } of CARD_TRIGGERS) {
    let score = 0
    for (const phrase of phrases) {
      if (phrase && text.includes(phrase)) score += 5
    }
    for (const w of words) {
      if (cardWords.has(w)) score += 1
    }
    if (score >= 2) scored.push({ card, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3).map(s => s.card)
}

function renderCard(card) {
  const lines = [`## Deep context: ${card.title}`]
  if (card.route) lines.push(`Route: ${card.route}`)
  lines.push(`Summary: ${card.summary}`)
  const ak = card.agentKnowledge || {}
  if (ak.whatItIs)    lines.push(`\n**What it is** — ${ak.whatItIs}`)
  if (ak.howItWorks)  lines.push(`\n**How it works** — ${ak.howItWorks}`)
  if (ak.examples?.length) {
    lines.push(`\n**Examples**`)
    for (const ex of ak.examples) lines.push(`- ${ex}`)
  }
  if (ak.gotchas?.length) {
    lines.push(`\n**Gotchas (warn the user about these)**`)
    for (const g of ak.gotchas) lines.push(`- ${g}`)
  }
  if (ak.faqs?.length) {
    lines.push(`\n**FAQs**`)
    for (const f of ak.faqs) lines.push(`- Q: ${f.q}\n  A: ${f.a}`)
  }
  if (card.setup?.steps?.length) {
    lines.push(`\n**Setup steps**`)
    card.setup.steps.forEach((s, i) => {
      lines.push(`${i + 1}. ${s.title} — ${s.body}`)
    })
  }
  return lines.join('\n')
}

// Public API used by arnieEngine.js — per-request deep context bundle.
// Inject the result right after JOBSCOUT_KNOWLEDGE in the system
// prompt. Empty string when no card matches (cheap no-op).
export function getFeatureContextForMessage(message) {
  const cards = rankCardsForMessage(message)
  if (cards.length === 0) return ''
  const header = '\n## Active Feature Context (cite these accurately — they are the source of truth)\n'
  return header + cards.map(renderCard).join('\n\n---\n\n')
}

// Convenience for the Help page / Data Console — what does Arnie
// "see" when the user types this message? Returns the matched cards
// (just metadata, no rendering).
export function getMatchedCardsForMessage(message) {
  return rankCardsForMessage(message)
}
