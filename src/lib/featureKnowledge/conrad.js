// Knowledge Card — Conrad Connect (Email Marketing)
// AI-powered email campaigns, templates, contact segmentation.

export default {
  id: 'conrad',
  title: 'Conrad Connect',
  category: 'Sales & CRM',
  icon: 'Mail',
  route: '/agents/conrad-connect',

  summary:
    "AI-powered email marketing built on your customer book. Conrad writes the campaign, segments the contacts, sends via SendGrid, tracks opens and clicks. Mailchimp without the per-contact fee.",

  replaces: ['Mailchimp', 'Constant Contact', 'Klaviyo', 'HubSpot Marketing Hub'],
  highlights: [
    'AI-drafted campaigns',
    'Smart segments',
    'Open + click tracking',
    'Drip automations',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'idea',     baseDur: 4500, narration: 'New campaign. "Tell our spring customers about the summer maintenance special."' },
      { id: 'draft',    baseDur: 6500, narration: 'Conrad writes the subject line, the email body, the call to action. Tone matches your brand. Edit anywhere.' },
      { id: 'segment',  baseDur: 6500, narration: 'Pick the audience. Customers who had service in March or April. Conrad shows the count — eighty-six people.' },
      { id: 'send',     baseDur: 6500, narration: 'Hit Send. SendGrid delivers. Open and click tracking starts feeding back in real time.' },
      { id: 'auto',     baseDur: 6000, narration: 'Build a drip. Day one welcome, day seven check-in, day thirty review request. Set it once, runs forever.' },
    ],
  },

  setup: {
    overview:
      "Conrad needs your SendGrid sender authenticated, then he's ready. Once authenticated, the AI drafts emails that match your brand — give him a few examples to learn from.",
    introBaseDur: 1200,
    introNarration: 'Authenticate sender. Feed Conrad your tone. Send.',
    steps: [
      {
        icon: 'Bot',
        title: 'Unlock Conrad',
        body: 'Settings → AI Agents → Conrad Connect → Enable. He needs read access to customers + jobs for segmentation.',
        narration: 'Unlock Conrad. He needs read access to customers and jobs.',
        baseDur: 4500,
      },
      {
        icon: 'AtSign',
        title: 'Authenticate your sender',
        body: 'SendGrid DNS authentication on your domain — SPF + DKIM. Settings → Email → Verify Sender. Takes 15 minutes once your DNS is set.',
        narration: 'Authenticate your sender domain. Fifteen minutes once DNS is set.',
        baseDur: 5500,
      },
      {
        icon: 'Pencil',
        title: 'Feed Conrad your tone',
        body: 'Drop in 2-3 past emails you sent that hit the right tone. Conrad uses them as few-shot examples for future drafts.',
        narration: 'Drop in past emails. Conrad learns your tone from them.',
        baseDur: 5000,
      },
      {
        icon: 'Send',
        title: 'Send your first campaign',
        body: 'Campaigns → New → describe the goal. Conrad drafts. You edit. Pick a segment. Send.',
        narration: 'Describe the goal. Conrad drafts. Pick the segment. Send.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The marketing-email agent. Drafts subject + body from a goal prompt + your tone examples, segments contacts from the customer book by tags / source / activity, sends through SendGrid with tracking pixels, runs drip automations triggered by customer events (lead won, job complete, X days post-service).",

    howItWorks:
      "cc_campaigns + cc_campaign_sends + cc_contacts + cc_automations tables. SendGrid integration via SENDGRID_API_KEY. Tracking pixel + click redirect URLs proxied through cc-tracking Edge Function so opens/clicks land in cc_campaign_events. Drip automations defined as JSON DAGs in cc_automations.config, evaluated nightly by cc-run-automations cron. AI drafting via Gemini with tone examples + brand voice prompt.",

    examples: [
      'Spring maintenance promo → segment "customers with HVAC service Mar-May" → 86 sends → 38 opens (44%) → 6 clicks → 2 leads',
      'Drip: "new customer" → day 0 welcome, day 14 maintenance reminder, day 30 review ask',
      'Job-complete trigger: Conrad sends a personalized "thanks + leave a review" email 48h after Job → Closed',
    ],

    gotchas: [
      'SendGrid requires DNS authentication for >100 emails/day. Without it, deliverability tanks.',
      'Segment counts are computed at send time, not save time. The 86 customers today might be 92 tomorrow if you ran 6 more service appointments.',
      'Unsubscribe link is auto-injected — required by CAN-SPAM. Don\'t remove it.',
    ],

    faqs: [
      {
        q: 'Can I send transactional emails through Conrad too?',
        a: 'No — Conrad is for marketing. Transactional emails (invoices, receipts, appointment reminders) go through the regular send-email Edge Function.',
      },
      {
        q: 'What about SMS marketing?',
        a: 'Roadmap item. The infra exists (Twilio webhook), Conrad just doesn\'t do SMS campaigns yet.',
      },
    ],

    actions: {
      open: { route: '/agents/conrad-connect', label: 'Open Conrad' },
      campaigns: { route: '/agents/conrad-connect/campaigns', label: 'Campaigns' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
