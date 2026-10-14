// Arnie's feature knowledge — derived from the Knowledge Cards in
// src/lib/featureKnowledge/. Same cards drive the Video Library
// walkthroughs and the Help page Feature Reference. One source of
// truth: edit a card and Arnie, Help, and the walkthrough all stay
// in sync.
//
// Since 2026-10-14 Arnie's instructions are built on the SERVER (arnie-chat),
// from _shared/arnieKnowledgeCards.ts — a rendering of these same cards that
// scripts/build-arnie-knowledge.mjs writes and guard.mjs keeps current. The
// matching and rendering rules live in _shared/arnieKnowledgeMatch.ts so the
// browser and the server pick the same cards for the same words. This file
// stays for the Help page and the Data Console ("what does Arnie see for
// this message?").
//
// Exports:
//   • JOBSCOUT_KNOWLEDGE   — feature index + the static overview block
//   • getFeatureContextForMessage(message) — deep context, top 3 cards
//   • getMatchedCardsForMessage(message)   — the matched cards themselves

import { KNOWLEDGE_CARDS_LIST } from '../../../lib/featureKnowledge/index.js'
import { ARNIE_STATIC_KNOWLEDGE } from '../../../../supabase/functions/_shared/arnieKnowledgeStatic.ts'
import { featureIndex, cardTriggers, rankCards, renderCard } from '../../../../supabase/functions/_shared/arnieKnowledgeMatch.ts'

const FEATURE_INDEX = featureIndex(KNOWLEDGE_CARDS_LIST)

export const JOBSCOUT_KNOWLEDGE = `
## JobScout Feature Reference (use this to answer "how do I X?" questions)
${FEATURE_INDEX}

${ARNIE_STATIC_KNOWLEDGE}
`

// Each card with its triggers, keeping a handle on the card itself so the
// Help page gets real card objects back.
const CARD_TRIGGERS = KNOWLEDGE_CARDS_LIST.map((card) => ({ card, ...cardTriggers(card) }))

export function getFeatureContextForMessage(message) {
  const hits = rankCards(message, CARD_TRIGGERS)
  if (hits.length === 0) return ''
  const header = '\n## Active Feature Context (cite these accurately — they are the source of truth)\n'
  return header + hits.map((h) => renderCard(h.card)).join('\n\n---\n\n')
}

export function getMatchedCardsForMessage(message) {
  return rankCards(message, CARD_TRIGGERS).map((h) => h.card)
}
