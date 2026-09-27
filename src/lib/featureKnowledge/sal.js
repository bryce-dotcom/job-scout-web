// Knowledge Card — Sal The Solicitation Scout
// Finds the bids; Benny builds them. Phase 0 (2026-09-26): the inbox and the
// address. Says only what is built; the board, scoring and the hand-off to
// Benny are in SAL_SCOUT_PLAN.md and listed under gotchas as not yet built.

export default {
  id: 'sal',
  title: 'Sal The Solicitation Scout',
  category: 'Sales',
  icon: 'Radar',
  route: '/agents/sal',

  summary:
    "Point every procurement portal's bid alerts at Sal's address and the bids come to you — Bonfire, the Arizona Procurement Portal, OpenGov, BidNet, DemandStar, PlanHub, GC invitations — plus SAM.gov polled each morning and any RSS notice feed. He reads each one, scores it against your Profile (trade, area, size, certifications, deadline), and puts it on the Board. You Shortlist, Dismiss or Choose; Choose makes the lead, puts the deadlines on the calendar, and drops the package on Benny to build the bid.",

  replaces: ['checking six portals every morning', 'a mailbox of bid alerts nobody reads', 'losing the addendum email'],
  highlights: [
    'One address for every portal + SAM.gov + RSS',
    'Scored against your profile',
    'Choose → lead, deadlines, Benny',
    'Never scrapes a portal',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'address',  baseDur: 4500, narration: 'Sal gives you one address. Paste it into Bonfire, the Arizona portal, BidNet, DemandStar, PlanHub — every portal you are registered on.' },
      { id: 'arrive',   baseDur: 5500, narration: 'From then on every bid alert lands in JobScout, with the notice attached, the moment the portal sends it.' },
      { id: 'choose',   baseDur: 5500, narration: 'Sal scores each one against what you do and where you work. You choose the ones worth your week.' },
      { id: 'benny',    baseDur: 5000, narration: 'Choose one and Sal makes the lead, puts the deadlines on the calendar, and drops the package on Benny to build the bid.' },
    ],
  },

  setup: {
    overview:
      "Recruit Sal under Settings → AI Agents and he appears under Marketing. Fill the Profile (what you do, where, how big, what you hold), copy his address from Sources and paste it into each portal's notification settings, add SAM.gov states and any RSS feeds. What arrives is scored on the Board.",
    introBaseDur: 1200,
    introNarration: 'Copy the address. Paste it into your portals. The bids come to you.',
    steps: [
      { icon: 'Bot', title: 'Recruit Sal', body: 'Settings → AI Agents → Sal → Recruit. He shows up under Marketing in the sidebar.', narration: 'Recruit Sal in Settings, AI Agents.', baseDur: 4500 },
      { icon: 'Mail', title: 'Copy his address', body: 'Sal → Sources. The address is signed to your company; anything sent to it lands on your inbox and nobody else\'s.', narration: 'Copy the address from the Sources tab.', baseDur: 4500 },
      { icon: 'Radar', title: 'Point the portals at it', body: 'On each portal (Bonfire, APP, OpenGov, BidNet, DemandStar, PlanHub) set the notification email to Sal\'s address, or add a mail rule that forwards their alerts to it.', narration: 'Set each portal\'s notification email to Sal\'s address.', baseDur: 6000 },
      { icon: 'Inbox', title: 'Watch the inbox', body: 'Every alert lands on Sal\'s Inbox tab with its attachments. Open one to read it and download the notice.', narration: 'Alerts land on the Inbox tab.', baseDur: 4500 },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Sal finds solicitations for the company to bid on and hands the chosen ones to Benny the Bid Builder. He is the marketing side of bidding; Benny is the estimating side. Feeds: the signed bids+<token>@appsannex.com address per company (portal alerts, forwarded invitations), SAM.gov (official API, polled each morning by state and NAICS), RSS feeds (Utah Public Notice Website bodies, Google Alerts), and a pasted link. Tabs: Board (scored opportunities), Inbox (raw alerts), Sources (address, SAM states/NAICS, feeds, health), Profile (what a fit means).",

    howItWorks:
      "The address is bids+<base36 company id><HMAC signature>@appsannex.com (sal-inbox-address, REPLY_TOKEN_SECRET, namespaced so tokens never cross). inbound-email files a bids+ alert on bid_inbox (attachments in project-documents/bids/{co}/inbox/…; the bids route runs BEFORE the auto-reply filter because portals send Auto-Submitted headers) and kicks sal-ingest. The sal-ingest Vercel cron (every 10 min) re-reads anything still 'received' and polls RSS sources every 2 h into bid_inbox as 'rss:<guid>' rows; bid-sam-poll (daily 06:10 UTC, needs SAM_API_KEY) writes SAM rows straight to bid_opportunities. sal-ingest: bid-parse (Claude, metered as sal) turns an alert into opportunity fields; _shared/bidFit.prefilter decides the cheap things deterministically (state, radius, exclusions, set-asides held, size band, deadline margin) with the reason written down; bid-fit (Claude) scores what survives 0–100 with reasons/blockers/effort. dedupe_hash (solicitation number, else buyer+title+due day) makes two feeds one card; an amendment updates the row and notifies if it is chosen. Thresholds on bid_profiles: auto_dismiss_below (kept, viewable under Dismissed), notify_at (company_notifications bid_match). sal-choose: shortlist/dismiss (any roster member; the reason feeds profile.learned), choose/build (Manager+): a leads row (lead_source 'Bid Finder', source_system 'sal'), Bid Deadline appointments (direct insert, no setter, excluded from set-meeting counts), then benny-bid-intake with the caller's JWT → quote_id, status ready. A blocker (set-aside not held) refuses Choose without an explicit override.",

    examples: [
      'Bonfire alert "New opportunity: Lorin Farr Park LED Retrofit — City of Ogden" → Inbox → minutes later on the Board at 88/100: "Exactly a lighting retrofit · Ogden inside area · size in band"',
      'A Phoenix SDVOSB set-aside → dismissed automatically: "Service-disabled veteran-owned set-aside — not held" (still visible under Dismissed, Reopen puts it back)',
      'Choose the Ogden one → lead LEAD-… on the pipeline (source Bid Finder), "Bid due" and "Pre-bid" on the calendar, Benny builds the bid from the attached notice → "Open the bid Benny built"',
      'Arnie: "what did Sal find this week" → the Board, Open filter; "why did Sal dismiss the Provo one" → that row\'s fit reasons',
    ],

    gotchas: [
      'Sal never logs into a portal and never scrapes one. Every portal forbids automated access; the feed is the email alerts the tenant points at his address, SAM.gov\'s official API, and RSS. If a tenant asks Sal to "check Bonfire", the answer is to set Bonfire\'s notifications to his address.',
      'SAM.gov polling needs SAM_API_KEY on Vercel (a personal key allows ~10 calls/day, an entity-registered key ~1,000). Until it is set, the SAM source shows that error on the Sources tab and nothing federal arrives.',
      'The score is fit, never price. Nothing in Sal estimates or sets a price; Benny prices from the catalog and the web, redlined until verified.',
      'A person\'s decision stands: rescoring never touches chosen/building/ready/submitted rows, and an auto-dismiss is reversible (Reopen).',
      'Choose is Manager and above (a bid is a week of someone\'s time). Shortlist and Dismiss are anyone on the roster.',
      'If the notice carried no PDF (login-walled portal), Choose still makes the lead and dates and the card asks for the package; drop the PDF on the card and Benny builds it.',
      'The address is a capability, not a secret of consequence: a leaked one can only put junk on the Inbox tab. Attachments over 30 MB are recorded with an error, not stored.',
      'Not built yet (SAL_SCOUT_PLAN.md phases 2–3): the requirements checklist, the packet (cover letter, quals, forms, signature), the approval gate, the email send with delivery tracking, portal hand-off, outcome tracking. Do not promise any of it as working.',
    ],

    actions: {
      open: { route: '/agents/sal', label: "Sal's board" },
      inbox: { route: '/agents/sal/inbox', label: 'Raw alerts' },
      sources: { route: '/agents/sal/sources', label: "Sal's address and sources" },
      profile: { route: '/agents/sal/profile', label: 'What a fit means' },
      benny: { route: '/agents/benny', label: 'Benny builds the bids' },
    },
  },

  lastVerified: '2026-09-26',
  freshUntil: 60,
}
