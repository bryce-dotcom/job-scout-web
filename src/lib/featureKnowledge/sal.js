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
    "Point every procurement portal's bid alerts at Sal's address and they land in JobScout instead of a mailbox nobody reads — Bonfire, the Arizona Procurement Portal, OpenGov, BidNet, DemandStar, PlanHub, GC invitations — with the files they attached. Scoring the fit, the board where you choose, and dropping the chosen ones on Benny are being built on top.",

  replaces: ['checking six portals every morning', 'a mailbox of bid alerts nobody reads', 'losing the addendum email'],
  highlights: [
    'One address for every portal',
    'Alerts and attachments kept',
    'Never scrapes a portal',
    'Hands chosen bids to Benny',
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
      "Recruit Sal under Settings → AI Agents and he appears under Marketing. Open his Sources tab, copy his address, and paste it into each portal's notification settings. Alerts arrive on his Inbox tab.",
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
      "Sal finds solicitations for the company to bid on and, once the rest is built, hands the chosen ones to Benny the Bid Builder. He is the marketing side of bidding; Benny is the estimating side. Today (Phase 0) Sal is an inbox: a signed bids+<token>@appsannex.com address per company, and the Inbox tab that shows every email sent to it with its attachments in storage.",

    howItWorks:
      "The address is bids+<base36 company id><HMAC signature>@appsannex.com, built by the sal-inbox-address Edge Function from REPLY_TOKEN_SECRET (the same secret and token pattern as estimate reply addresses and feedback tickets; namespaced so tokens never cross). Resend's inbound webhook (inbound-email) recognises the bids+ recipient, verifies the token to a company, fetches the body and the attachments from Resend's receiving API, stores attachments under project-documents/bids/{company}/inbox/{email}/, writes a bid_inbox row, and raises a company_notifications row of type bid_alert. Portal alerts carry auto-generated headers, so the bids route is checked BEFORE the auto-reply filter that protects estimates. A webhook retry is a no-op (unique on company_id + email_id).",

    examples: [
      'Bonfire alert "New opportunity: Lorin Farr Park LED Retrofit — City of Ogden" → Inbox row from noreply@gobonfire.com with the notice PDF attached',
      'A GC forwards an ITB with a 14-page package → Inbox row with the PDF stored, ready for Benny',
      'Arnie: "what did Sal get this week" → the Inbox tab, newest first',
    ],

    gotchas: [
      'Sal never logs into a portal and never scrapes one. Every portal forbids automated access; the feed is the email alerts the tenant points at his address. If a tenant asks Sal to "check Bonfire", the answer is to set Bonfire\'s notifications to his address.',
      'The address is a capability, not a secret of consequence: the worst a leaked one can do is put junk on the Inbox tab. It grants no access.',
      'Attachments over 30 MB (Benny\'s read limit) are recorded on the row with an error, not stored.',
      'Not built yet (SAL_SCOUT_PLAN.md phases 1–3): reading an alert into a scored opportunity, the board with Shortlist / Dismiss / Choose, SAM.gov polling, RSS feeds, making the lead and calendar dates, dropping the package on Benny, the packet, the approval, and the send. Do not promise any of it as working.',
    ],

    actions: {
      open: { route: '/agents/sal', label: 'Open Sal' },
      sources: { route: '/agents/sal/sources', label: "Sal's address and sources" },
      benny: { route: '/agents/benny', label: 'Benny builds the bids' },
    },
  },

  lastVerified: '2026-09-26',
  freshUntil: 60,
}
