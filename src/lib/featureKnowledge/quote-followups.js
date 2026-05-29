// Knowledge Card — Quote Follow-ups
// Auto-drips emails to customers who let a quote sit.

export default {
  id: 'quote-followups',
  title: 'Quote Follow-ups',
  category: 'Sales & CRM',
  icon: 'Send',
  route: '/estimates',

  summary:
    "A cron job auto-emails customers who let a quote sit. Three nudges over two weeks; stops the moment they sign. Arnie can recommend an add-on service based on what they're looking at.",

  replaces: ['Mailchimp drip campaigns', 'Constant Contact automations', "manual 'just following up' emails"],
  highlights: [
    'Three nudges over two weeks',
    'Stops on signature',
    'Arnie suggests add-ons',
    'Per-template open rate',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'sent',     baseDur: 5000, narration: 'Quote sent on Monday. No response by Thursday.' },
      { id: 'nudge1',   baseDur: 6500, narration: 'Day three — Job Scout sends a polite nudge. "Hey, just making sure this didn\'t get lost in your inbox."' },
      { id: 'nudge2',   baseDur: 6500, narration: 'Day seven — a second nudge with an Arnie-suggested add-on the customer might also want.' },
      { id: 'nudge3',   baseDur: 6000, narration: 'Day fourteen — the last nudge. After this, the quote stops chasing.' },
      { id: 'signed',   baseDur: 6500, narration: 'Customer signs. All future nudges cancel automatically. The pipeline flips to Won.' },
    ],
  },

  setup: {
    overview:
      "Quote Follow-ups runs automatically. The only setup is picking which templates to use and whether Arnie should add add-on suggestions. Templates live in Settings → Quote Follow-up.",
    introBaseDur: 1200,
    introNarration: "Here's how to turn it on.",
    steps: [
      {
        icon: 'Settings',
        title: 'Open Settings → Quote Follow-up',
        body: "Three templates, three send days. Defaults are pre-written; edit to match your voice.",
        narration: 'Open Settings, Quote Follow-up. Three templates, three send days. Edit to match your voice.',
        baseDur: 5500,
      },
      {
        icon: 'PenTool',
        title: 'Customize the templates',
        body: "Subject, body, signature. Use merge fields like {{customer_name}} and {{quote_total}}.",
        narration: 'Customize subject, body, signature. Merge fields fill in the customer details.',
        baseDur: 5500,
      },
      {
        icon: 'Sparkles',
        title: 'Enable Arnie add-ons (optional)',
        body: "Arnie reads the quote and suggests a related service the customer might also want — drop it into the second nudge.",
        narration: 'Optional — let Arnie suggest a related add-on in the second nudge.',
        baseDur: 5500,
      },
      {
        icon: 'Power',
        title: 'Flip the switch',
        body: "Toggle Follow-ups On. The cron picks it up tomorrow morning. Stops the moment a customer signs.",
        narration: "Flip it on. Stops the moment a customer signs.",
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Automated email drip for quotes that haven't been signed. Three templates send on day 3, day 7, and day 14 after quote_sent_at. Cancels automatically on signature or quote_status = won/lost. Optional Arnie integration suggests an add-on service in the day-7 nudge.",

    howItWorks:
      "Backed by a Vercel cron + the followups-cron Edge Function. Runs nightly: SELECT quotes WHERE status='sent' AND last_followup_at < (NOW - send_day_days). Sends via SendGrid using templates from quote_followup_templates table. quote_followup_log tracks every send + open. Arnie suggestions call the arnie-chat Edge Function with the quote context.",

    examples: [
      "Customer ghosts after a $2,400 quote — nudge 1 lands Thursday, customer responds Friday",
      "Quote signed on day 4 — nudge 2 (day 7) never fires",
      "Arnie sees quote has 'lawn maintenance' line, adds 'You might also want our fertilizer program' to nudge 2",
    ],

    gotchas: [
      "Cron runs in UTC; send_day_days is in days not hours.",
      "Email tracking pixel may be blocked by Gmail privacy proxy — opens under-report.",
      "Cancel triggers fire on status change (signed, lost), not on quote_id deletion.",
    ],

    faqs: [
      {
        q: 'Can I turn off follow-ups for one specific customer?',
        a: 'Yes — on the customer record, toggle "Suppress automated emails". Affects all quotes for that customer.',
      },
    ],

    actions: {
      settings: { route: '/settings#quote-followups', label: 'Open Settings → Quote Follow-up' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
