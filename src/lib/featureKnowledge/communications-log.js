// Knowledge Card — Communications Log
// Unified timeline of every email, SMS, signature, and invoice
// conversation tied to a customer or job.

export default {
  id: 'communications-log',
  title: 'Communications Log',
  category: 'Sales & CRM',
  icon: 'MessageSquare',
  route: '/communications',

  summary:
    'A unified timeline of every email, SMS, signature event, and invoice-conversation thread tied to the customer or job. No more "what did we tell them last week?"',

  replaces: ['HubSpot conversations', 'OpenPhone history', 'sticky-note CRM', "phone notepad"],
  highlights: [
    'Emails, SMS, signatures, invoice replies — one timeline',
    'Per-customer and per-job views',
    'Email open + click tracking',
    'Searchable across all comms',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'customer',  baseDur: 5500, narration: "Open a customer. Hit the Comms tab and you see every email and text you've exchanged." },
      { id: 'email',     baseDur: 6500, narration: 'Each row shows when it sent, when they opened it, and when they clicked — across every campaign.' },
      { id: 'sms',       baseDur: 5500, narration: 'Outbound SMS reminders and appointment confirmations land in the same feed.' },
      { id: 'reply',     baseDur: 6500, narration: "When a customer replies to an invoice email, the thread shows up here — no inbox-spelunking." },
      { id: 'search',    baseDur: 6500, narration: "Search across all communications by customer, date, or content. No more 'what did we tell them last week?'" },
    ],
  },

  setup: {
    overview:
      "Communications Log is automatic. Every email and SMS Job Scout sends gets logged. The only setup is wiring up Twilio for SMS and SendGrid for emails — and Job Scout does that for you when you connect those integrations.",
    introBaseDur: 1200,
    introNarration: "Almost no setup. Here's what to know.",
    steps: [
      {
        icon: 'Mail',
        title: 'Connect SendGrid (email)',
        body: "Settings → Integrations → SendGrid. Already done for most accounts; this enables email open tracking.",
        narration: 'Connect SendGrid in Settings, Integrations. Done for most accounts already.',
        baseDur: 5500,
      },
      {
        icon: 'MessageSquare',
        title: 'Connect Twilio (SMS)',
        body: "Settings → Integrations → Twilio. Drops your account SID and auth token in, picks your sending number.",
        narration: 'Connect Twilio for SMS. Settings, Integrations, Twilio.',
        baseDur: 5500,
      },
      {
        icon: 'BarChart3',
        title: 'Open + click tracking on by default',
        body: "Every email gets a tracking pixel and click-wrapped links. View the metrics on each row.",
        narration: 'Open and click tracking are on by default. Every email gets the pixel.',
        baseDur: 5500,
      },
      {
        icon: 'Search',
        title: 'Search anytime',
        body: "Top of the Communications page has full-text search across every email and SMS. Filter by customer or date.",
        narration: 'Full-text search at the top. Filter by customer or date.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Unified per-company log of every outbound and inbound communication: emails, SMS, signature events, invoice email replies, and quote portal opens. Renders as a timeline on the customer detail page (Comms tab) and as a standalone Communications page.",

    howItWorks:
      "Backed by the communications_log table (company_id, customer_id, optional job_id and quote_id). Email opens land via tracking pixel at /api/email-open. SMS replies via Twilio webhook. Signature events from signing-capture Edge Function. Each row carries direction (in/out), channel (email/sms/portal), content snippet, metadata (open_count, click_count, IP for signatures).",

    examples: [
      "Owner asks 'when was the last time we talked to Smith?' → Comms tab shows last email + open time",
      "Customer claims they never got the invoice → log shows it sent, opened twice, link clicked",
      "Setter logs in Monday → sees inbox of overnight SMS replies from prospects",
    ],

    gotchas: [
      "Email opens under-count for customers on Gmail with privacy proxy — they show as 'unopened' even if they did open.",
      "SMS log only captures messages sent through Job Scout — manual texts from a personal phone don't appear.",
      "Signature events are read-only — they're audit records, not editable notes.",
    ],

    faqs: [
      {
        q: 'Does this work with my Gmail / Outlook account directly?',
        a: 'Not directly — we use SendGrid for outbound and parse replies via inbound webhook. The customer sees your branded From: address, not Gmail/Outlook.',
      },
    ],

    actions: {
      open: { route: '/communications', label: 'Open Communications' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
