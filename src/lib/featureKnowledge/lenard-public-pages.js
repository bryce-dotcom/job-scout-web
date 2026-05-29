// Knowledge Card — Public Lenard Agent Pages
// Per-utility public pages where prospects upload a photo and get an
// instant LED rebate estimate.

export default {
  id: 'lenard-public-pages',
  title: 'Public Lenard Pages',
  category: 'Lighting & Energy',
  icon: 'Sparkles',
  route: '/agent/lenard-ut-rmp',

  summary:
    'Per-utility public landing pages (/agent/lenard-az-srp, /agent/lenard-ut-rmp) where prospects upload a photo and get an instant LED rebate estimate. No login, no friction.',

  replaces: ['Custom marketing landing pages', 'EnergySavvy widgets', 'manual lead-gen forms'],
  highlights: [
    'Public no-auth',
    'Per-utility branding',
    'Instant rebate quote',
    'Anonymous signature capture',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'landing', baseDur: 4500, narration: 'Prospect lands from your ad. Custom URL, your utility branding.' },
      { id: 'upload',  baseDur: 6500, narration: 'They snap a photo of their existing fixtures. No login, no friction.' },
      { id: 'analyze', baseDur: 6500, narration: 'Lenard identifies fixtures and runs the rebate math live — same engine that powers your full audits.' },
      { id: 'quote',   baseDur: 6500, narration: 'Within seconds: estimated rebate, payback, savings per year. Prospect taps Get My Free Quote.' },
      { id: 'lead',    baseDur: 5500, narration: 'A fresh lead lands in your pipeline with the photo, the fixture estimate, and contact info. Setter calls within the hour.' },
    ],
  },

  setup: {
    overview:
      'Each public Lenard page is bound to one company and one utility program. You can deep-link to any page and use it as your ad landing — Google, Facebook, anywhere.',
    introBaseDur: 1200,
    introNarration: "Here's how to set up your public Lenard.",
    steps: [
      {
        icon: 'Zap',
        title: 'Pick the utility',
        body: 'Utility programs already loaded — RMP Wattsmart, SRP Custom, APS, PG&E. Choose which program drives the rebate estimate.',
        narration: 'Pick the utility program. Drives the rebate estimate.',
        baseDur: 4500,
      },
      {
        icon: 'Palette',
        title: 'Brand the page',
        body: 'In Settings → Public Agents, upload your logo, set the headline + CTA, pick the accent color.',
        narration: 'Brand the page — logo, headline, accent color.',
        baseDur: 5000,
      },
      {
        icon: 'Link',
        title: 'Grab the URL',
        body: 'Each page gets a clean URL like /agent/lenard-ut-rmp or /agent/lenard-az-srp/your-company. Plug it into your Google / Facebook ads.',
        narration: 'Grab the URL. Plug it into your ads.',
        baseDur: 4500,
      },
      {
        icon: 'UserPlus',
        title: 'Submissions become leads',
        body: 'Every photo + contact form lands as a new lead with source=public_lenard. Setter follows up within the hour.',
        narration: 'Submissions become leads with source equals public Lenard.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Customer-facing public pages that let a prospect upload a fixture photo and get an instant LED rebate estimate. No login. Doubles as your ad landing page and a lead-capture engine for the lighting business.",

    howItWorks:
      "Per-utility public route under /agent/lenard-<state>-<utility>. Photo uploaded to a public bucket. Gemini Vision identifies fixture type + count. Rebate math reuses rebate_measures + utility_programs (same engine as audits). Submission inserts a lead with source='public_lenard', lead.photo_url, lead.estimated_rebate. Anonymous signature capture for instant proposals.",

    examples: [
      'Facebook ad → /agent/lenard-ut-rmp → 30 visitors a day',
      '12 photo uploads → 12 leads with estimated rebates pre-attached',
      'Setter calls within the hour with the rebate number ready',
    ],

    gotchas: [
      'Public pages can be abused — rate-limit photo uploads per IP. Default is 5 per hour.',
      'Estimated rebate is conservative (assumes prescriptive only). Custom calc may yield more once the full audit runs.',
    ],

    faqs: [
      {
        q: 'Do I need a separate marketing site?',
        a: 'No — the public page IS your landing page. Brand it, point your ads at it, done.',
      },
      {
        q: 'Can I run multiple pages for different utilities?',
        a: 'Yes — one per utility you serve. Each has its own URL and rebate engine.',
      },
    ],

    actions: {
      open: { route: '/agent/lenard-ut-rmp', label: 'Open Public Page' },
      settings: { route: '/settings#public-agents', label: 'Configure' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
