// Drift Detector — finds knowledge cards that have gone stale or out
// of sync with the codebase.
//
// Three signal types per card:
//   • route_missing       — card.route doesn't match anything in App.jsx
//   • stale_verification  — lastVerified is past freshUntil days
//   • thin_content        — card is missing FAQs, gotchas, or setup steps
//   • walkthrough_missing — card has no entry in WALKTHROUGHS registry
//   • catalog_orphaned    — card not referenced from featureCatalog.js
//
// The scan is pure JS — no DB calls, no network — so it can run client-
// side in the Data Console OR get wrapped in an Edge Function for a
// nightly cron later. Both consumers call `runDriftScan()` and get the
// same shape.
//
// The result is a list of `DriftReport` objects. Cards with no issues
// are omitted from the output to keep the surface focused on
// actionable items.

import { KNOWLEDGE_CARDS_LIST } from './index.js'
import { WALKTHROUGHS } from '../../components/walkthroughs/index.js'
import { FEATURE_CATALOG } from '../featureCatalog.js'

// Hand-curated list of every top-level route in App.jsx. Update this
// when you add a new page. The drift detector compares card.route
// against this set; mismatches surface as `route_missing`.
//
// Why hardcoded instead of parsed: App.jsx imports a giant tree of
// guarded routes + outlets. A regex-based parse would either miss
// nested routes or false-positive on string literals elsewhere. A
// list of paths is short, readable, and easy to keep current — and
// the detector itself flags when the list is out of date because a
// card pointing to a real new page would trip route_missing until
// someone adds it here.
export const KNOWN_ROUTES = new Set([
  // Public
  '/agent/lenard-az-srp',
  '/agent/lenard-ut-rmp',
  '/quote/:slug',
  '/portal/:token',
  '/onboarding/:token',
  // Auth + legal
  '/login', '/auth/callback', '/terms', '/privacy',
  // Main app
  '/', '/dashboard',
  '/employees', '/customers', '/customers/:id',
  '/leads', '/leads/:id', '/lead-setter', '/pipeline',
  '/products', '/estimates', '/estimates/:id',
  '/jobs', '/jobs/:id', '/jobs/calendar', '/job-board',
  '/invoices', '/invoices/:id',
  '/time-log', '/time-clock', '/field-scout',
  '/inventory', '/communications', '/expenses', '/appointments',
  '/routes', '/routes/calendar', '/bookings',
  '/payroll', '/payroll/inbox', '/payroll-inbox', '/my-pay', '/my-crew',
  '/books', '/lead-payments',
  '/utility-invoices', '/utility-invoices/:id', '/incentives',
  '/lighting-audits', '/lighting-audits/new', '/lighting-audits/:id',
  '/fixture-types', '/utility-providers', '/utility-programs',
  '/utility-programs/:id/rates', '/rebate-measures', '/rebate-rates',
  '/fleet', '/fleet/calendar', '/fleet/:id',
  '/settings', '/document-rules', '/reports',
  '/base-camp', '/robot-marketplace',
  // Agents
  '/agents/lenard', '/agents/freddy', '/agents/zach',
  '/agents/conrad-connect', '/agents/victor', '/agents/arnie',
  '/agents/frankie',
  // Admin
  '/admin', '/admin/data-console', '/admin/videos',
  '/admin/help',
  // Tax filings (new with payroll category)
  '/tax-filings',
])

// Test if a given route (which may contain :params) is in KNOWN_ROUTES.
// We normalize away the params for the lookup so '/customers/123'
// matches '/customers/:id'.
function isKnownRoute(route) {
  if (!route) return true
  // Card routes may carry a hash, e.g. '/settings#subscription'.
  const cleanPath = route.split('#')[0].split('?')[0]
  if (KNOWN_ROUTES.has(cleanPath)) return true
  // Param-normalized match: '/customers/123' → '/customers/:id'.
  const normalized = cleanPath.replace(/\/[^/]+/g, (seg, i) => i === 0 ? seg : '/:x')
  return [...KNOWN_ROUTES].some(known => {
    const knownNorm = known.replace(/:[^/]+/g, ':x')
    return knownNorm === normalized.replace(/:[^/]+/g, ':x')
  })
}

function isStale(lastVerified, freshUntilDays = 90) {
  if (!lastVerified) return true
  const ageMs = Date.now() - new Date(lastVerified).getTime()
  const ageDays = Math.floor(ageMs / 86400000)
  return ageDays > (freshUntilDays || 90)
}

function isThin(card) {
  const ak = card.agentKnowledge || {}
  const missing = []
  if (!card.setup?.steps?.length) missing.push('setup.steps')
  if (!ak.gotchas?.length)        missing.push('agentKnowledge.gotchas')
  if (!ak.faqs?.length)           missing.push('agentKnowledge.faqs')
  if (!ak.whatItIs)               missing.push('agentKnowledge.whatItIs')
  if (!ak.howItWorks)             missing.push('agentKnowledge.howItWorks')
  return missing
}

function inCatalog(card) {
  for (const cat of FEATURE_CATALOG || []) {
    for (const feature of (cat.features || [])) {
      if (feature.walkthrough === card.id) return true
    }
  }
  return false
}

// Severity ordering — drives sort + summary counts.
// Higher number = more attention needed.
const SEVERITY = {
  route_missing:       3,
  stale_verification:  2,
  walkthrough_missing: 2,
  catalog_orphaned:    2,
  thin_content:        1,
}

export function runDriftScan({ now = new Date() } = {}) {
  const reports = []
  for (const card of KNOWLEDGE_CARDS_LIST) {
    const issues = []

    // Route check
    if (card.route && !isKnownRoute(card.route)) {
      issues.push({
        type: 'route_missing',
        severity: SEVERITY.route_missing,
        message: `card.route "${card.route}" is not in KNOWN_ROUTES. Either the page was removed or the route was renamed.`,
        suggestion: 'Update the card.route or add the new route to KNOWN_ROUTES in driftDetector.js.',
      })
    }

    // Freshness
    if (isStale(card.lastVerified, card.freshUntil)) {
      const ageDays = card.lastVerified
        ? Math.floor((now.getTime() - new Date(card.lastVerified).getTime()) / 86400000)
        : null
      issues.push({
        type: 'stale_verification',
        severity: SEVERITY.stale_verification,
        message: card.lastVerified
          ? `lastVerified is ${ageDays} days old (freshUntil ${card.freshUntil || 90}).`
          : `Card has no lastVerified date.`,
        suggestion: 'Walk through the feature in-app, confirm the card is still accurate, and bump lastVerified to today.',
      })
    }

    // Walkthrough registry
    if (!WALKTHROUGHS[card.id]) {
      issues.push({
        type: 'walkthrough_missing',
        severity: SEVERITY.walkthrough_missing,
        message: `No walkthrough component registered for card id "${card.id}".`,
        suggestion: 'Add a <Name>Walkthrough.jsx and register it in components/walkthroughs/index.js.',
      })
    }

    // Catalog wiring
    if (!inCatalog(card)) {
      issues.push({
        type: 'catalog_orphaned',
        severity: SEVERITY.catalog_orphaned,
        message: `Card is not referenced from FEATURE_CATALOG. The Video Library will not surface it.`,
        suggestion: 'Add a catalog entry with walkthrough: "' + card.id + '" so the feature appears in the Video Library.',
      })
    }

    // Thin content
    const thinFields = isThin(card)
    if (thinFields.length > 0) {
      issues.push({
        type: 'thin_content',
        severity: SEVERITY.thin_content,
        message: `Card is missing: ${thinFields.join(', ')}.`,
        suggestion: 'Fill in the missing fields — they power Help, Arnie, and the walkthrough setup phase.',
      })
    }

    if (issues.length > 0) {
      // Aggregate severity = the max of any issue on the card.
      const cardSeverity = Math.max(...issues.map(i => i.severity))
      reports.push({
        cardId: card.id,
        title: card.title,
        category: card.category,
        route: card.route || null,
        lastVerified: card.lastVerified || null,
        severity: cardSeverity,
        issues,
      })
    }
  }
  // Sort by severity descending, then by title.
  reports.sort((a, b) => (b.severity - a.severity) || a.title.localeCompare(b.title))
  return {
    scannedAt: now.toISOString(),
    totalCards: KNOWLEDGE_CARDS_LIST.length,
    flaggedCards: reports.length,
    reports,
  }
}

// Pretty labels for the UI.
export const ISSUE_LABELS = {
  route_missing:       { label: 'Route missing',       color: '#ef4444' },
  stale_verification:  { label: 'Stale verification',  color: '#eab308' },
  walkthrough_missing: { label: 'No walkthrough',      color: '#eab308' },
  catalog_orphaned:    { label: 'Not in catalog',      color: '#eab308' },
  thin_content:        { label: 'Thin content',        color: '#7d8a7f' },
}

export const SEVERITY_LABELS = {
  1: { label: 'Low',  color: '#7d8a7f' },
  2: { label: 'Med',  color: '#eab308' },
  3: { label: 'High', color: '#ef4444' },
}
