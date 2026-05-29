// Knowledge Card registry.
//
// Add new feature cards by importing them here. Order doesn't matter
// — consumers index by `id`. The exported map drives:
//   • walkthroughScripts.js (narration shim — back-compat with old API)
//   • Video Library catalog (live walkthrough features)
//   • Help page sections
//   • Arnie's per-feature context injection (Task #2)
//   • Audio generator (one MP3 per narration line per card)
//
// Adding a new walkthrough = drop a card here, run the audio gen, and
// (optionally) build a custom <Stage /> component for the visuals.

import prospectScout  from './prospect-scout.js'
import yardMeasure    from './yard-measure.js'
import zachProperties from './zach-properties.js'
import zachVisits     from './zach-visits.js'
import zachTreatments from './zach-treatments.js'
import zachPricing    from './zach-pricing.js'

const CARDS = [
  prospectScout,
  yardMeasure,
  zachProperties,
  zachVisits,
  zachTreatments,
  zachPricing,
]

export const KNOWLEDGE_CARDS = Object.fromEntries(
  CARDS.map(c => [c.id, c]),
)

export const KNOWLEDGE_CARDS_LIST = CARDS

// Convenience: pull the narration lines for a card in the shape the
// runtime walkthroughs + audio generator expect.
// Returns { voice, lines: { sceneKey: narrationText } } with marketing
// scene ids + 'setup-intro' + 'setup-0', 'setup-1', ...
export function getNarrationForCard(cardOrId) {
  const card = typeof cardOrId === 'string' ? KNOWLEDGE_CARDS[cardOrId] : cardOrId
  if (!card) return null
  const lines = {}
  for (const s of card.marketing?.scenes || []) lines[s.id] = s.narration
  if (card.setup?.introNarration) lines['setup-intro'] = card.setup.introNarration
  card.setup?.steps?.forEach((step, i) => { lines[`setup-${i}`] = step.narration })
  return { voice: card.marketing?.voice || 'Bill', lines }
}

// Convenience: every narration line as a flat list (for token counts /
// audio budget estimates).
export function getAllNarrationLines() {
  const out = []
  for (const card of CARDS) {
    const n = getNarrationForCard(card)
    if (!n) continue
    for (const [key, text] of Object.entries(n.lines)) {
      out.push({ cardId: card.id, sceneKey: key, text })
    }
  }
  return out
}
