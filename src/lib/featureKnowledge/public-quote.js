// Knowledge Card — Public Quote Landing
// Per-company public URL that captures quote requests before they're leads.

export default {
  id: 'public-quote',
  title: 'Public Quote Landing',
  category: 'Sales & CRM',
  icon: 'ExternalLink',
  route: null, // /quote/:slug (public)

  summary:
    "Per-company public landing page (job-scout.app/quote/your-slug) where prospects request a quote — even before they're a lead. Drops a fresh lead in your pipeline with everything they typed.",

  replaces: ['custom marketing landing pages', 'Calendly intake forms', 'paper request forms'],
  highlights: [
    'Per-company URL slug',
    'No login required',
    'Auto-creates a lead',
    'Mobile-first form',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'visit',     baseDur: 5500, narration: "A prospect lands on your public quote page from a Google ad or your website." },
      { id: 'fill',      baseDur: 7000, narration: "Name, phone, address, what they need. The form is short on purpose." },
      { id: 'submit',    baseDur: 5500, narration: "They tap Submit. A polite thank-you appears with your phone number for urgent jobs." },
      { id: 'lead',      baseDur: 6500, narration: "Behind the scenes, a fresh lead lands in your pipeline with every field they filled in." },
      { id: 'route',     baseDur: 6500, narration: "Your setter sees it on the board within seconds — same flow as any other lead from there." },
    ],
  },

  setup: {
    overview:
      "Public Quote is a public page (no login required for prospects) that submits straight into your lead pipeline. Configure your URL slug and which fields to ask for, then share the URL.",
    introBaseDur: 1200,
    introNarration: "Here's how to turn it on.",
    steps: [
      {
        icon: 'Settings',
        title: 'Open Settings → Public Quote',
        body: "Top of Settings. Toggle the feature on.",
        narration: 'Open Settings, Public Quote, and toggle it on.',
        baseDur: 4500,
      },
      {
        icon: 'Link',
        title: 'Pick your URL slug',
        body: "It looks like job-scout.app/quote/your-slug. Keep it short and brandable. \"hhh-services\" not \"hhh-services-llc-utah\".",
        narration: "Pick your URL slug. Short and brandable beats long and accurate.",
        baseDur: 6000,
      },
      {
        icon: 'Edit',
        title: 'Choose the fields',
        body: "Toggle which fields the form asks for. Name and phone are required; address, email, service type are optional.",
        narration: "Choose which fields the form asks for. Less is more — phone is the only one you really need.",
        baseDur: 6500,
      },
      {
        icon: 'Share2',
        title: 'Share the URL',
        body: "Drop it in Google Ads, on your website, in cold emails, on the back of business cards. Every submission lands in your lead pipeline.",
        narration: "Share the URL anywhere. Every submission lands in your lead pipeline automatically.",
        baseDur: 6000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Public per-company landing page rendered at /quote/:slug. No auth required. Carries an intake form whose submissions land as fresh leads in the company's lead pipeline. Form fields are configurable per company. Used as the destination for ad campaigns and website CTAs.",

    howItWorks:
      "Public route serves PublicQuoteLanding.jsx without auth. Form submission POSTs to the public-quote-submit Edge Function, which inserts a leads row with source='public_quote', source_id=slug. Honeypot field guards against bots. companies.public_quote_slug holds the slug; companies.public_quote_config holds the field toggles + branding.",

    examples: [
      "Google Ads campaign points at /quote/hhh-services → every click that fills the form = one lead",
      "Website footer has 'Get a free quote' button → links to /quote/your-slug",
      "Business card QR code → /quote/your-slug",
    ],

    gotchas: [
      "Slug is globally unique across all Job Scout companies — pick early.",
      "Bot submissions show up with empty honeypot but obvious fake names — clean them up via the lead status filter.",
      "Public Quote does NOT do AI yard measure by default — that's a separate Zach feature.",
    ],

    faqs: [
      {
        q: "Can I brand the page with my colors and logo?",
        a: "Yes — Settings → Public Quote → Branding. Pulls from your company's logo URL and primary_color.",
      },
    ],

    actions: {
      settings: { route: '/settings#public-quote', label: 'Open Settings → Public Quote' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
