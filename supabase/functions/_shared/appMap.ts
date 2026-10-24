// THE MAP OF JOBSCOUT — every page, what it is for, and who can open it.
//
// Why this exists: on 2026-10-14 Alayda asked Jenny whether there was a
// feedback page and was told she "didn't know". The answer is on every screen
// she uses. Arnie's knowledge was 55 hand-written feature cards covering 20 of
// the 41 menu pages, and nothing told him which pages the person in front of
// him can actually open — so he either guessed, or offered a Payroll page to
// someone who has never seen it.
//
// ONE RULE, TWO READERS. Layout.jsx filters the sidebar with pageVisible(),
// and arnie-chat describes exactly the same list to the model. The sidebar and
// Arnie cannot disagree, because there is nothing to disagree WITH.
//
// IT LEARNS EVERY UPDATE. scripts/guard.mjs (which runs on every Vercel
// build) fails if App.jsx gains a page route that is not in this file. A page
// cannot ship without Arnie knowing it exists, who can open it, and what it
// is for. Write the `does` line for a person, not a developer.
//
// Visibility here is what the MENU shows. It is not security: every page that
// holds guarded data must refuse on its own (Payroll, Payroll Inbox and
// Payroll setup all do), and Arnie's tools enforce their own permissions on
// the server. What this buys is honesty — Arnie never sends someone to a page
// that is not in their menu, and never says a page does not exist when it does.

export type Who = {
  level: number        // User 0 · Team Lead 1 · Manager 2 · Admin 3 · Super Admin 4 · Developer 5
  fieldTech: boolean   // job title "Field Tech" at User level — gets the short menu
  hr: boolean          // the separate HR flag (Developers always have it)
}

type Rule = 'all' | 'office' | 'manager' | 'admin' | 'payroll' | 'developer'

export type Page = {
  route: string
  label: string
  section: string
  rule: Rule
  does: string
}

const ACCESS: Record<string, number> = {
  'User': 0, 'Team Lead': 1, 'Manager': 2, 'Admin': 3, 'Super Admin': 4, 'Developer': 5, 'Owner': 4,
}

/** The same resolution Layout.jsx has always used for the sidebar. */
export function whoFromEmployee(e: {
  user_role?: string | null; role?: string | null; is_developer?: boolean | null; has_hr_access?: boolean | null
} | null | undefined, developerFlag = false): Who {
  if (!e) return { level: 0, fieldTech: false, hr: false }
  const level = (e.is_developer || developerFlag)
    ? 5
    : (ACCESS[e.user_role || ''] ?? ACCESS[e.role || ''] ?? 0)
  const fieldTech = String(e.role || '').toLowerCase() === 'field tech' && level <= 0
  const hr = level >= 5 || e.is_developer === true || e.has_hr_access === true
  return { level, fieldTech, hr }
}

export function ruleAllows(rule: Rule, who: Who): boolean {
  switch (rule) {
    case 'all': return true
    case 'office': return !who.fieldTech
    case 'manager': return who.level >= 2
    case 'admin': return who.level >= 3
    case 'payroll': return who.level >= 3 && who.hr
    case 'developer': return who.level >= 5
  }
}

// In menu order. `section` is the heading the person sees in the sidebar.
export const MENU_PAGES: Page[] = [
  { route: '/', label: 'The Lookout', section: 'Top of the menu', rule: 'all', does: 'The key landmarks: numbers, what is due, what needs attention.' },
  { route: '/company-calendar', label: 'Company Calendar', section: 'Top of the menu', rule: 'all', does: 'Sales appointments, scheduled work and time off in one month view.' },
  { route: '/company-map', label: 'Company Map', section: 'Top of the menu', rule: 'all', does: 'Live map of everyone on the clock and every tracked vehicle.' },
  { route: '/customers', label: 'Customers', section: 'Top of the menu', rule: 'office', does: 'Look up any customer: their jobs, estimates, invoices and contact details.' },
  { route: '/rooms', label: 'CampFire', section: 'Top of the menu', rule: 'all', does: 'Video for the team — The Campfire where everyone gathers, plus FireSides a creator names (FireSide-Sales) for a few people at a time. Reached by the fire under Dashboard, not a menu item of its own.' },

  { route: '/marketing', label: 'Marketing', section: 'Sales Flow (step 1)', rule: 'office', does: 'Be found: social posts, brand and channels; field photos become posts.' },
  { route: '/leads', label: 'Leads', section: 'Sales Flow (step 2)', rule: 'office', does: 'Every potential customer starts here.' },
  { route: '/lead-setter', label: 'Lead Setter', section: 'Sales Flow (step 3)', rule: 'office', does: 'Call leads and book appointments.' },
  { route: '/appointments', label: 'Appointments', section: 'Sales Flow (under Lead Setter)', rule: 'office', does: 'Book and reschedule sales visits; they also show on the Company Calendar.' },
  { route: '/pipeline', label: 'Pipeline Trail', section: 'Sales Flow (step 4)', rule: 'office', does: 'Track leads through the sales stages; follow-ups due show as a badge.' },
  { route: '/estimates', label: 'Estimates (Quotes)', section: 'Sales Flow (step 5)', rule: 'office', does: 'Create, send and track estimates/quotes; an approved one becomes a job.' },

  { route: '/jobs', label: 'Jobs', section: 'Work / Operations', rule: 'office', does: 'Every job: won estimates become jobs here.' },
  { route: '/job-board', label: 'Job Board', section: 'Work / Operations', rule: 'all', does: 'Active and scheduled work on a kanban; schedule and dispatch crews.' },
  { route: '/recurring', label: 'Recurring Jobs', section: 'Work / Operations', rule: 'office', does: 'Jobs that repeat weekly, monthly, quarterly or yearly, and membership plans.' },
  { route: '/services/upcoming', label: 'Service Visits', section: 'Work / Operations', rule: 'office', does: 'Upcoming warranty, annual and tune-up visits; schedule them and remind the customer.' },
  { route: '/field-scout', label: 'Field Scout (Clock)', section: 'Work / Operations (also a shortcut at the top)', rule: 'all', does: "Clock in and out, and today's jobs for the field." },

  { route: '/products', label: 'Products & Services', section: 'Supply', rule: 'office', does: 'The product and service catalog with prices.' },
  { route: '/inventory', label: 'The Cache', section: 'Supply', rule: 'office', does: 'Materials, tools and consumables on hand.' },
  { route: '/vendors', label: 'Vendors', section: 'Supply', rule: 'office', does: 'Suppliers you order parts and materials from.' },
  { route: '/procurement', label: 'Procurement Queue', section: 'Supply', rule: 'office', does: 'Jobs that need parts, batched into vendor purchase orders.' },
  { route: '/purchase-orders', label: 'Purchase Orders', section: 'Supply', rule: 'office', does: 'Orders sent to vendors.' },

  { route: '/invoices', label: 'Invoices', section: 'Financial', rule: 'admin', does: 'Customer invoices and utility incentive invoices.' },
  { route: '/lead-payments', label: 'Deposits', section: 'Financial', rule: 'admin', does: 'Deposits and payments taken before a job.' },
  { route: '/expenses', label: 'Expenses', section: 'Financial', rule: 'admin', does: 'Business expenses and receipts.' },
  { route: '/bills', label: 'Bills', section: 'Financial', rule: 'admin', does: 'Accounts payable: bills owed to vendors.' },
  { route: '/books', label: 'Books', section: 'Financial', rule: 'admin', does: 'Accounting: bank feeds, reconciliation, profit and loss.' },

  { route: '/employees', label: 'Employees', section: 'Team', rule: 'office', does: 'The team roster, roles and access levels (pay details only with HR access).' },
  { route: '/time-clock', label: 'Time Clock', section: 'Team', rule: 'office', does: 'Clock in and out and see hours worked.' },
  { route: '/my-pay', label: 'My Pay', section: 'Team', rule: 'all', does: 'Your own commissions, pending payouts, hours, pay stubs and benefits.' },
  { route: '/payroll', label: 'Payroll', section: 'Team', rule: 'payroll', does: 'Commissions, hours, bonuses and pay runs.' },
  { route: '/payroll/inbox', label: 'Payroll Inbox', section: 'Team', rule: 'payroll', does: 'Tax deposits, new-hire reports and filings due.' },
  { route: '/payroll/setup', label: 'Payroll setup', section: 'Team', rule: 'payroll', does: 'Tax accounts, people and bank details for payroll.' },

  { route: '/base-camp', label: 'Base Camp', section: 'AI Crew', rule: 'all', does: 'Browse and recruit AI agents.' },
  { route: '/my-crew', label: 'My Crew', section: 'AI Crew', rule: 'all', does: 'The AI agents your company has recruited.' },

  { route: '/settings', label: 'Settings', section: 'Admin', rule: 'admin', does: 'Company and app settings.' },
  { route: '/document-rules', label: 'Document Rules', section: 'Admin', rule: 'admin', does: 'Form templates and document packages.' },

  { route: '/pricing', label: 'Sign Up a Customer', section: 'Management', rule: 'manager', does: 'Walk a prospect through the JobScout plans and start their account.' },
  { route: '/reports', label: 'Field Notes', section: 'Management', rule: 'manager', does: 'Business reports and analytics.' },
  { route: '/sales-performance', label: 'Sales Performance', section: 'Management', rule: 'manager', does: 'Per-rep funnel: meetings set, estimates written, deals closed.' },
  { route: '/admin/eos', label: 'EOS', section: 'Management', rule: 'manager', does: 'Vision, traction, rocks, scorecard and L10 meetings.' },

  { route: '/admin/help', label: 'Help', section: 'Support', rule: 'all', does: 'How the app works: guides and diagrams.' },
  { route: '/admin/videos', label: 'Video Library', section: 'Support', rule: 'all', does: 'Feature videos.' },

  { route: '/advanced-tools', label: 'Advanced Tools', section: 'Dev & Maint.', rule: 'developer', does: 'System tools and configuration.' },
  { route: '/admin/data-console', label: 'Data Console', section: 'Dev & Maint.', rule: 'developer', does: 'Database management.' },
]

// Real pages that are NOT in the menu — reached from a button on another page.
// `from` is how a person gets there, so Arnie can give directions.
export const OFF_MENU_PAGES: (Page & { from: string })[] = [
  { route: '/jobs/calendar', label: 'Job Calendar', section: '', rule: 'office', from: 'the Calendar button on Jobs or the Dashboard, or Search', does: 'Jobs on a calendar.' },
  { route: '/time-log', label: 'Time Log', section: '', rule: 'office', from: 'its address only, /time-log (no button links to it)', does: 'Hours logged against jobs.' },
  { route: '/communications', label: 'Communications', section: '', rule: 'office', from: 'Search ("Communications")', does: 'Calls, texts and emails sent to customers.' },
  { route: '/routes', label: 'Routes', section: '', rule: 'office', from: 'Search ("Routes") or the Company Calendar', does: 'Service routes and driving order.' },
  { route: '/bookings', label: 'Bookings', section: '', rule: 'office', from: 'its address only, /bookings (no button links to it)', does: 'Online bookings customers made themselves.' },
  { route: '/incentives', label: 'Incentives', section: '', rule: 'admin', from: 'its address only, /incentives (no button links to it)', does: 'Utility incentives owed and received.' },
  { route: '/utility-invoices', label: 'Utility invoices', section: '', rule: 'admin', from: 'Invoices (it opens Invoices filtered to Utility)', does: 'Invoices billed to the utility for incentives.' },
  { route: '/fleet', label: 'Fleet', section: '', rule: 'office', from: 'Freddy in the AI Crew, if the company recruited him, or Search', does: 'Trucks and equipment, mileage and maintenance.' },
  { route: '/lighting-audits', label: 'Lighting Audits', section: '', rule: 'office', from: 'Lenard in the AI Crew, if the company recruited him, or Search', does: 'Lighting audits that become estimates.' },
  { route: '/fixture-types', label: 'Fixture Types', section: '', rule: 'office', from: 'Lenard', does: 'Fixture catalogue for lighting audits.' },
  { route: '/utility-providers', label: 'Utility Providers', section: '', rule: 'office', from: 'Lenard', does: 'Utilities and their rebate programs.' },
  { route: '/utility-programs', label: 'Utility Programs', section: '', rule: 'office', from: 'Lenard', does: 'Rebate programs and their rates.' },
  { route: '/robot-marketplace', label: 'Robot Marketplace', section: '', rule: 'all', from: 'Base Camp', does: 'More AI agents to recruit.' },
]

// Things on every screen that are not pages. These are what people ask about
// most ("is there a feedback page?") and what nothing used to tell Arnie.
export const ALWAYS_ON_SCREEN = [
  'Feedback — YES, there is one, on every page: the "Feedback" button in the top bar on a phone, the round chat bubble at the bottom right on a computer. It has two tabs: "Send Feedback" (Bug Report, Feature Request, Question or General Feedback, sent to the JobScout team) and "My Feedback", which lists everything they sent with the team\'s replies; replies also arrive by email. You can also file one for them as a ticket card.',
  'Search — "Search everything..." at the top of the menu (Ctrl+K on a computer) finds customers, leads, estimates, jobs, invoices, team, products, fleet, inventory, appointments, audits, and pages by name.',
  'Refresh — at the bottom of the menu; reloads the app onto the newest version. Use it when something looks out of date.',
  'Sign Out — at the bottom of the menu, next to Refresh.',
  'Your assistant — the button that opens you, from any page. Your own pages: Chat, Computer (connect a computer and set what you may do on it), Routines (things you do on a schedule), Taught (jobs they have shown you), History, and Settings (your name, voice, and what you remember).',
  'Talking to you — the mic button in your chat. TAKEOFF MODE is for counting a building: say "<your name>, go into takeoff mode" (or tap the clipboard button next to the mic) and you stay completely silent, however long the pauses, until they say "<your name>, are you ready?" (or "that\'s it", or tap the tick). Then the whole count arrives at once and you read it back before building anything. While you are talking they can tap the red Stop button, or — on a computer or an Android phone, with the mic on — just say "stop".',
  'On a phone the menu is the ☰ button; the bar at the bottom holds their favourite pages and can be rearranged.',
]

export function pageVisible(route: string, who: Who): boolean {
  const p = MENU_PAGES.find((x) => x.route === route) || OFF_MENU_PAGES.find((x) => x.route === route)
  // A route the map does not know is shown — the map hides, it never grants,
  // and guard.mjs makes an unknown route fail the build anyway.
  return p ? ruleAllows(p.rule, who) : true
}

/** Every route a person can open, in menu order — what the sidebar renders. */
export function visiblePages(who: Who): Page[] {
  return MENU_PAGES.filter((p) => ruleAllows(p.rule, who))
}

const LEVEL_NAME = ['User', 'Team Lead', 'Manager', 'Admin', 'Super Admin', 'Developer']

/**
 * The block arnie-chat appends to the prompt: the app as THIS person sees it.
 * Built on the server from the caller's own employee row, never from anything
 * the browser sent.
 */
export function appMapBlock(who: Who, firstName = 'They'): string {
  const mine = visiblePages(who)
  const hidden = MENU_PAGES.filter((p) => !ruleAllows(p.rule, who))
  const off = OFF_MENU_PAGES.filter((p) => ruleAllows(p.rule, who))
  const lines: string[] = []
  lines.push('## JOBSCOUT — THE APP AS THIS PERSON SEES IT (settled here; the app map wins over any guess)')
  lines.push(`${firstName} is ${LEVEL_NAME[who.level] || 'User'} level${who.fieldTech ? ', on the field-tech menu' : ''}${who.hr ? ', with HR access' : ''}. These are the pages in their menu, by section:`)
  let section = ''
  for (const p of mine) {
    if (p.section !== section) { section = p.section; lines.push(`${section}:`) }
    lines.push(`- ${p.label} (${p.route}) — ${p.does}`)
  }
  if (off.length) {
    lines.push('Also reachable, not in the menu:')
    for (const p of off) lines.push(`- ${p.label} (${p.route}) — ${p.does} Reached from ${p.from}.`)
  }
  lines.push('On every screen:')
  for (const s of ALWAYS_ON_SCREEN) lines.push(`- ${s}`)
  if (hidden.length) {
    lines.push(`Pages that exist but are NOT in ${firstName === 'They' ? 'their' : firstName + "'s"} menu (their access level does not include them): ${hidden.map((p) => p.label).join(', ')}. If they ask for one, say it exists and that an Admin can change their access from Employees — never walk them toward it and never read its contents out to them.`)
  }
  lines.push('Rules: when asked "is there a page for X" or "where do I X", answer from this list with the menu section to tap — never say you do not know whether something exists. If it is truly not here, say JobScout does not have it and offer to file a feature request.')
  return lines.join('\n')
}
