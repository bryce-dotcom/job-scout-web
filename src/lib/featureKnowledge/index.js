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

import prospectScout      from './prospect-scout.js'
import yardMeasure        from './yard-measure.js'
import zachProperties     from './zach-properties.js'
import zachVisits         from './zach-visits.js'
import zachTreatments     from './zach-treatments.js'
import zachPricing        from './zach-pricing.js'
import customers          from './customers.js'
import leads              from './leads.js'
import salesPipeline      from './sales-pipeline.js'
import leadSetter         from './lead-setter.js'
import estimates          from './estimates.js'
import quoteFollowups     from './quote-followups.js'
import customerPortal     from './customer-portal.js'
import publicQuote        from './public-quote.js'
import communicationsLog  from './communications-log.js'
// — Project & Job Management —
import jobs               from './jobs.js'
import jobSections        from './job-sections.js'
import jobBoard           from './job-board.js'
import fieldScout         from './field-scout.js'
import routes             from './routes.js'
// — Lighting & Energy —
import lightingAudits     from './lighting-audits.js'
import lenardPublicPages  from './lenard-public-pages.js'
import utilityPrograms    from './utility-programs.js'
import rebateMeasures     from './rebate-measures.js'
// — Books & Accounting —
import books              from './books.js'
import plaidSync          from './plaid-sync.js'
import invoices           from './invoices.js'
import frankie            from './frankie.js'
// — Payroll, HR & Onboarding —
import onboardingPortal   from './onboarding-portal.js'
import payroll            from './payroll.js'
import timeClock          from './time-clock.js'
import taxFilings         from './tax-filings.js'
// — Operations / Fleet / Marketing —
import fleet              from './fleet.js'
import inventory          from './inventory.js'
import productsServices   from './products-services.js'
import expenses           from './expenses.js'
import conrad             from './conrad.js'
// — Round 3: AI agents + employee/finance corner —
import victor             from './victor.js'
import dougie             from './dougie.js'
import myPay              from './my-pay.js'
import utilityInvoices    from './utility-invoices.js'

const CARDS = [
  prospectScout,
  yardMeasure,
  zachProperties,
  zachVisits,
  zachTreatments,
  zachPricing,
  customers,
  leads,
  salesPipeline,
  leadSetter,
  estimates,
  quoteFollowups,
  customerPortal,
  publicQuote,
  communicationsLog,
  jobs,
  jobSections,
  jobBoard,
  fieldScout,
  routes,
  lightingAudits,
  lenardPublicPages,
  utilityPrograms,
  rebateMeasures,
  books,
  plaidSync,
  invoices,
  frankie,
  onboardingPortal,
  payroll,
  timeClock,
  taxFilings,
  fleet,
  inventory,
  productsServices,
  expenses,
  conrad,
  victor,
  dougie,
  myPay,
  utilityInvoices,
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
