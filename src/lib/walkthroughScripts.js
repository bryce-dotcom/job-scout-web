// Walkthrough narration scripts — single source of truth.
//
// Each entry maps a walkthrough id to:
//   - voice: ElevenLabs voice name (used by the audio generator)
//   - lines: { sceneKey: 'spoken text', ... }
//
// Two consumers:
//   1. The walkthrough React components import `lines` for runtime
//      playback (TTS via Web Speech API, or MP3 via the URL helper).
//   2. `scripts/generate-walkthrough-audio.cjs` reads this file via
//      a tiny CJS shim so it can pre-generate MP3s through ElevenLabs.
//
// Update narration text here → re-run the generator → MP3s refresh.

export const WALKTHROUGH_SCRIPTS = {
  'prospect-scout': {
    voice: 'Adam',          // ElevenLabs default — confident male narrator
    lines: {
      // Marketing reel
      empty:   "It's nine A.M. and your setter's lead board is empty. Let's fix that.",
      filter:  'Type what you want in plain English. Industry, region, headcount — whatever filter you can describe.',
      results: 'Claude searches the live web and returns real businesses with cited sources.',
      reveal:  'Tap a result to enrich it. Email, phone, and the decision-maker appear in seconds.',
      import:  'Multi-select, assign a salesperson, and import. Leads land in your pipeline with full source attribution.',
      // Setup
      'setup-intro': "Here's how to get the most out of it.",
      'setup-0':     'There is no setup. Open Lead Setter and click Find Prospects.',
      'setup-1':     'Be specific in plain English. Industry plus geography plus size beats vague queries.',
      'setup-2':     'Multi-select first, then enrich. Each enrichment burns one credit from your monthly quota.',
      'setup-3':     "On import, pick the assignee. The new leads show up in that rep's board.",
    },
  },
  'yard-measure': {
    voice: 'Adam',
    lines: {
      // Marketing reel
      address:   'Your prospect drops their address into your public quote page.',
      zoom:      'We pull up their lot from satellite imagery.',
      trace:     'Our AI traces the turf and measures it down to the square foot — no site visit.',
      quote:     'A per-mow quote calculates instantly with a full breakdown.',
      delivered: 'The quote hits their inbox and the lead lands in your pipeline. Total time: under thirty seconds.',
      // Setup
      'setup-intro': "Here's how to turn it on.",
      'setup-0':     'Enable the public quote page in Settings.',
      'setup-1':     'Open Zach, then Pricing, and set your per-square-foot rates.',
      'setup-2':     'Define your service area by ZIP code.',
      'setup-3':     'Share your public URL on your website or ads. New quotes land in your pipeline automatically.',
    },
  },
}

// URL where the audio generator writes MP3s. The runtime checks this
// path and uses the MP3 if present, otherwise falls back to Web Speech.
export function audioUrlFor(walkthroughId, sceneKey) {
  if (!walkthroughId || !sceneKey) return null
  return `/audio/walkthroughs/${walkthroughId}/${sceneKey}.mp3`
}
