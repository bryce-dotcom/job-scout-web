// Knowledge Card schema (informal — JS, not TS).
//
// One file per feature in this folder. The card is the single source
// of truth that drives:
//   • Video Library catalog rendering (icon / summary / replaces)
//   • Walkthrough narration (marketing scenes + setup steps)
//   • Help page sections (setup.overview + setup.steps + faqs)
//   • Arnie's "what does this feature do" knowledge
//   • ElevenLabs audio generation (one MP3 per narration line)
//
// Adding a new feature walkthrough? Drop a new card here, add it to
// index.js, run the audio generator, and (optionally) build a custom
// Stage component for the visuals.
//
// Card shape:
//
// export default {
//   id: 'kebab-case-id',              // Must match folder name in
//                                     // /audio/walkthroughs/<id>/
//   title: 'Display name',
//   category: 'Sales & CRM',          // matches Video Library category
//   icon: 'Sparkles',                 // any lucide-react icon name
//   route: '/lead-setter',            // in-app deep link (optional)
//   summary: 'One-line pitch',
//   replaces: ['Apollo.io', 'ZoomInfo'],
//   highlights: ['Cited sources', 'No API key needed'],
//
//   // — Marketing reel —
//   // Five short scenes that play in order. baseDur = minimum visible
//   // time per scene (the runner extends it to fit narration audio).
//   marketing: {
//     voice: 'Bill',                  // ElevenLabs voice name
//     scenes: [
//       { id: 'empty',  baseDur: 4500, narration: 'It's 9am and...' },
//       ...
//     ],
//   },
//
//   // — Setup phase —
//   setup: {
//     overview: 'Plain-English summary of how to set this up.',
//     introBaseDur: 1200,
//     introNarration: "Here's how to turn it on.",
//     steps: [
//       {
//         icon: 'KeyRound',          // lucide icon for the step
//         title: 'Step title',
//         body: 'Longer how-to text shown in the active step.',
//         narration: 'What Bill says while this step is highlighted.',
//         baseDur: 5000,
//       },
//       ...
//     ],
//   },
//
//   // — Agent knowledge —
//   // Arnie reads this when answering questions about the feature.
//   // Also rendered on the Help page.
//   agentKnowledge: {
//     whatItIs: 'One-paragraph plain-English description.',
//     howItWorks: 'Technical mechanism (Edge Function names, RLS, tier,
//                  quota, etc.) — for power users and Arnie.',
//     examples: ['example query 1', 'example query 2'],
//     gotchas: ['Watch out for X', 'Y trips people up'],
//     faqs: [
//       { q: 'Common question?', a: 'Answer.' },
//       ...
//     ],
//     actions: {
//       open:    { route: '/lead-setter', label: 'Open feature' },
//       upgrade: { route: '/settings#subscription', label: 'Upgrade' },
//     },
//   },
//
//   // — Maintenance —
//   lastVerified: '2026-05-28',        // Date last manually confirmed
//   freshUntil: 90,                    // Days until "may be stale"
// }

// No exports — this file is documentation.
