// Permission parity — what a person can SEE in JobScout, Arnie can LOOK UP
// (Bryce, 2026-10-27: "the entire premise of arnie is that he is the head AI
// and that if the user has permissions or access to anything in jobscout then
// so should Arnie/Jenny").
//
// Every page on the app map (appMap.ts) is listed here with the lookups that
// read what it shows. Each lookup checks the person's own access when it runs,
// so a tech's Arnie still cannot see Books — because the tech cannot. A page
// with nothing to look up says why; a page Arnie cannot read yet is a GAP, and
// the test (src/lib/arnieParity.test.js) fails when a new page arrives with no
// line here, so the next one cannot drift unnoticed the way the books did.

export type Parity =
  | { reads: string[] }               // the lookups that read this page's data
  | { nothing: string }               // nothing on it to look up, and why
  | { gap: string }                   // data a person can see that Arnie cannot reach yet

export const PARITY: Record<string, Parity> = {
  '/': { reads: ['query_daily_brief', 'query_jobscout_refresh', 'query_revenue'] },
  '/company-calendar': { reads: ['query_appointments', 'query_crew'] },
  '/company-map': { gap: 'live positions of people and vehicles on the map (who is on the clock, and the fleet, can be looked up)' },
  '/customers': { reads: ['query_customers', 'query_account'] },
  '/rooms': { nothing: 'live video rooms — conversations, not records' },
  '/marketing': { gap: 'social posts, channels and the brand kit' },
  '/leads': { reads: ['query_leads'] },
  '/lead-setter': { reads: ['query_leads', 'query_appointments'] },
  '/appointments': { reads: ['query_appointments'] },
  '/pipeline': { reads: ['query_leads', 'query_quotes', 'query_closed', 'query_sold'] },
  '/estimates': { reads: ['query_quotes'] },
  '/jobs': { reads: ['query_jobs'] },
  '/job-board': { reads: ['query_jobs', 'query_crew'] },
  '/crew-sheet': { reads: ['query_crew_sheet'] },
  '/recurring': { reads: ['query_recurring_jobs'] },
  '/services/upcoming': { reads: ['query_service_visits'] },
  '/field-scout': { reads: ['query_time_clock', 'query_daily_brief'] },
  '/products': { reads: ['query_products', 'query_lighting_products'] },
  '/inventory': { reads: ['query_inventory'] },
  '/vendors': { reads: ['query_table'] },
  '/procurement': { reads: ['query_purchase_orders', 'query_bills_and_pos'] },
  '/purchase-orders': { reads: ['query_purchase_orders'] },
  '/invoices': { reads: ['query_invoices'] },
  '/lead-payments': { reads: ['query_payments'] },
  '/expenses': { reads: ['query_expenses', 'query_material_receipts'] },
  '/bills': { reads: ['query_bills_and_pos'] },
  '/books': { reads: ['query_bank_balances', 'query_bank_transactions', 'query_pnl', 'query_liabilities'] },
  '/employees': { reads: ['query_employees'] },
  '/time-clock': { reads: ['query_time_clock'] },
  '/my-pay': { reads: ['query_my_pay'] },
  '/payroll': { reads: ['query_payroll', 'query_payroll_runs', 'query_bonuses'] },
  '/payroll/inbox': { reads: ['query_table'] },
  '/payroll/setup': { nothing: 'tax and pay settings — set up on the page, not records to look up' },
  '/base-camp': { nothing: 'the AI agents to recruit' },
  '/my-crew': { nothing: 'the AI agents the company has recruited' },
  '/settings': { nothing: 'company settings — changed with an approval card (propose_change), not looked up' },
  '/document-rules': { gap: 'form templates and document packages' },
  '/pricing': { nothing: 'a sign-up walkthrough for a prospect' },
  '/reports': { reads: ['query_revenue', 'query_pnl', 'query_job_profitability'] },
  '/sales-performance': { reads: ['query_sold', 'query_closed', 'query_rep_goals'] },
  '/admin/eos': { reads: ['query_eos'] },
  '/admin/help': { nothing: 'help articles — Arnie knows the app already' },
  '/admin/videos': { nothing: 'training videos' },
  '/advanced-tools': { nothing: 'developer tools' },
  '/admin/data-console': { nothing: 'developer tools' },
  '/jobs/calendar': { reads: ['query_jobs'] },
  '/time-log': { reads: ['query_time_log'] },
  '/communications': { reads: ['query_communications'] },
  '/routes': { gap: 'service routes and driving order' },
  '/bookings': { gap: 'online bookings customers made themselves' },
  '/incentives': { reads: ['query_utility_incentives'] },
  '/utility-invoices': { reads: ['query_utility_incentives'] },
  '/fleet': { reads: ['query_fleet'] },
  '/lighting-audits': { reads: ['query_lighting_audits'] },
  '/fixture-types': { reads: ['query_fixture_types'] },
  '/utility-providers': { reads: ['query_utility_programs'] },
  '/utility-programs': { reads: ['query_utility_programs'] },
  '/robot-marketplace': { nothing: 'more AI agents to recruit' },
}

/** What Arnie cannot reach yet, for a person and for Monday's list. */
export function parityGaps(): { route: string; what: string }[] {
  return Object.entries(PARITY).filter(([, p]) => 'gap' in p).map(([route, p]) => ({ route, what: (p as { gap: string }).gap }))
}
