// What Arnie knows about JobScout, on the server — the same knowledge the
// browser used to send, built from the same cards (see arnieKnowledgeMatch.ts
// and scripts/build-arnie-knowledge.mjs).

import { ARNIE_STATIC_KNOWLEDGE } from './arnieKnowledgeStatic.ts'
import { FEATURE_INDEX, INDEXED_CARDS } from './arnieKnowledgeCards.ts'
import { featureContextFor } from './arnieKnowledgeMatch.ts'

export const JOBSCOUT_KNOWLEDGE = `
## JobScout Feature Reference (use this to answer "how do I X?" questions)
${FEATURE_INDEX}

${ARNIE_STATIC_KNOWLEDGE}
`

/** Deep context for the cards this message is about; '' when none match. */
export function featureContextForMessage(message: unknown): string {
  return featureContextFor(message, INDEXED_CARDS)
}
