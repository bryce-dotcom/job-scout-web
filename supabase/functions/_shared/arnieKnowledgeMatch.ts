// Matching a message to the feature cards it is about — ONE copy, used by the
// browser (src/pages/agents/arnie/arnieKnowledge.js) and the server
// (_shared/arnieKnowledge.ts), so both pick the same cards for the same words.
//
// It lived only in the browser until 2026-10-14, when Arnie's instructions
// moved to the server: a phone running last week's bundle was sending last
// week's rules. The cards themselves are browser-side source files, so
// scripts/build-arnie-knowledge.mjs renders them into
// _shared/arnieKnowledgeCards.ts with these functions, and guard.mjs fails the
// build if that file is stale.

// deno-lint-ignore-file no-explicit-any
type Any = any

export type IndexedCard = {
  id: string
  title: string
  category: string
  route: string | null
  summary: string
  words: string[]
  phrases: string[]
  text: string
}

export function tokenize(s: unknown): string[] {
  return String(s || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 3)
}

export const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'your', 'our', 'can', 'how', 'what',
  'when', 'who', 'use', 'using', 'have', 'has', 'will', 'are', 'was', 'were', 'its',
  'they', 'their', 'about', 'into', 'out', 'off', 'set', 'get', 'put', 'add', 'new', 'one',
  'two', 'three', 'any', 'all', 'some', 'more', 'most', 'less', 'very', 'just', 'also',
  'feature', 'features', 'app', 'page', 'tab', 'open', 'close', 'show', 'see', 'help',
  'arnie', 'jobscout', 'job', 'scout',
])

/** Words and phrases that mean a message is about this card. */
export function cardTriggers(card: Any): { words: string[]; phrases: string[] } {
  const titleTokens = tokenize(card.title)
  const routeTokens = card.route ? tokenize(card.route) : []
  const exampleTokens = (card.agentKnowledge?.examples || []).flatMap(tokenize).slice(0, 20)
  const replacesTokens = (card.replaces || []).flatMap(tokenize)
  // Phrases like "lead setter", "customer portal" — exact UI labels.
  const phrases = [...new Set([
    String(card.title || '').toLowerCase(),
    ...(card.replaces || []).map((s: string) => String(s).toLowerCase()),
  ])]
  const words = [...new Set(
    [...titleTokens, ...routeTokens, ...exampleTokens, ...replacesTokens].filter((w) => !STOP_WORDS.has(w)),
  )]
  return { words, phrases }
}

/** The full deep-context text for one card. */
export function renderCard(card: Any): string {
  const lines = [`## Deep context: ${card.title}`]
  if (card.route) lines.push(`Route: ${card.route}`)
  lines.push(`Summary: ${card.summary}`)
  const ak = card.agentKnowledge || {}
  if (ak.whatItIs) lines.push(`\n**What it is** — ${ak.whatItIs}`)
  if (ak.howItWorks) lines.push(`\n**How it works** — ${ak.howItWorks}`)
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
    card.setup.steps.forEach((s: Any, i: number) => {
      lines.push(`${i + 1}. ${s.title} — ${s.body}`)
    })
  }
  return lines.join('\n')
}

/** One line per card, grouped by category — what every prompt carries. */
export function featureIndex(cards: Array<{ title: string; category?: string; route?: string | null; summary: string }>): string {
  const byCategory = new Map<string, typeof cards>()
  for (const card of cards) {
    const cat = card.category || 'Other'
    if (!byCategory.has(cat)) byCategory.set(cat, [])
    byCategory.get(cat)!.push(card)
  }
  const lines: string[] = []
  for (const [cat, list] of byCategory) {
    lines.push(`\n### ${cat}`)
    for (const c of [...list].sort((a, b) => a.title.localeCompare(b.title))) {
      const route = c.route ? ` (${c.route})` : ''
      lines.push(`- **${c.title}**${route} — ${c.summary}`)
    }
  }
  return lines.join('\n')
}

/** A card, reduced to what matching and rendering need. */
export function indexCard(card: Any): IndexedCard {
  const t = cardTriggers(card)
  return {
    id: String(card.id || ''),
    title: String(card.title || ''),
    category: String(card.category || 'Other'),
    route: card.route || null,
    summary: String(card.summary || ''),
    words: t.words,
    phrases: t.phrases,
    text: renderCard(card),
  }
}

/** The cards most likely being discussed. Phrase hit 5, word hit 1; top 3 at 2+. */
export function rankCards<T extends { words: string[]; phrases: string[] }>(message: unknown, cards: T[]): T[] {
  if (!message) return []
  const text = String(message).toLowerCase()
  const words = new Set(tokenize(text).filter((w) => !STOP_WORDS.has(w)))
  const scored: { card: T; score: number }[] = []
  for (const card of cards) {
    let score = 0
    for (const phrase of card.phrases) if (phrase && text.includes(phrase)) score += 5
    const cw = new Set(card.words)
    for (const w of words) if (cw.has(w)) score += 1
    if (score >= 2) scored.push({ card, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, 3).map((s) => s.card)
}

/** The deep-context block for a message — empty when nothing matches. */
export function featureContextFor(message: unknown, cards: IndexedCard[]): string {
  const hits = rankCards(message, cards)
  if (!hits.length) return ''
  return '\n## Active Feature Context (cite these accurately — they are the source of truth)\n'
    + hits.map((c) => c.text).join('\n\n---\n\n')
}
