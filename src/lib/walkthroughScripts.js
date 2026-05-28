// Walkthrough narration scripts — derived from Knowledge Cards.
//
// This file is now a thin compatibility shim. The actual scripts live
// in src/lib/featureKnowledge/<id>.js. Update narration text there;
// this file rebuilds the WALKTHROUGH_SCRIPTS map automatically.
//
// Why keep this file at all:
//   1. Existing imports across the codebase reference WALKTHROUGH_SCRIPTS
//   2. The ElevenLabs audio generator reads from this shape via dynamic
//      import (kept stable so generation flows don't break)
//   3. The audioUrlFor() helper has always lived here

import { KNOWLEDGE_CARDS, getNarrationForCard } from './featureKnowledge/index.js'

export const WALKTHROUGH_SCRIPTS = Object.fromEntries(
  Object.values(KNOWLEDGE_CARDS).map(card => {
    const n = getNarrationForCard(card)
    return [card.id, { voice: n.voice, lines: n.lines }]
  }),
)

// URL where the audio generator writes MP3s. The runtime checks this
// path and uses the MP3 if present, otherwise falls back to Web Speech.
export function audioUrlFor(walkthroughId, sceneKey) {
  if (!walkthroughId || !sceneKey) return null
  return `/audio/walkthroughs/${walkthroughId}/${sceneKey}.mp3`
}
