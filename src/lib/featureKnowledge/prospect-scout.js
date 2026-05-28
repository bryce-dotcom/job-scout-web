// Knowledge Card — Prospect Scout
//
// AI-powered prospect researcher. Setter types plain English; Claude
// does live web research with citations; results enrich into the lead
// pipeline. No third-party API key required (powered by the in-house
// prospect-research Edge Function, ANTHROPIC_API_KEY server-side).

export default {
  id: 'prospect-scout',
  title: 'Prospect Scout',
  category: 'Sales & CRM',
  icon: 'Sparkles',
  route: '/lead-setter',

  summary:
    'Your setters type plain English — "warehouses in Salt Lake County over 50 employees" — and Claude does the live web research, returning real businesses with cited sources. Tap to enrich with email + phone, multi-select, and bulk-import to the pipeline.',

  replaces: ['Apollo.io', 'ZoomInfo', 'Lusha', 'ChatGPT prospecting prompts'],
  highlights: [
    'Natural-language queries',
    'Claude + live web search',
    'Cited sources on every result',
    'Per-candidate enrichment cache',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'empty',
        baseDur: 4500,
        narration: "It's nine A.M. and your setter's lead board is empty. Let's fix that.",
      },
      {
        id: 'filter',
        baseDur: 7500,
        narration:
          'Type what you want in plain English. Industry, region, headcount — whatever filter you can describe.',
      },
      {
        id: 'results',
        baseDur: 5000,
        narration:
          'Claude searches the live web and returns real businesses with cited sources.',
      },
      {
        id: 'reveal',
        baseDur: 6000,
        narration:
          'Tap a result to enrich it. Email, phone, and the decision-maker appear in seconds.',
      },
      {
        id: 'import',
        baseDur: 6500,
        narration:
          'Multi-select, assign a salesperson, and import. Leads land in your pipeline with full source attribution.',
      },
    ],
  },

  setup: {
    overview:
      'Prospect Scout has no configuration — it ships on. The Find Prospects button is built into Lead Setter and powered by Job Scout (no third-party API key required). Your monthly search + enrichment quota is determined by your subscription tier.',
    introBaseDur: 1200,
    introNarration: "Here's how to get the most out of it.",
    steps: [
      {
        icon: 'Compass',
        title: 'Open Lead Setter → Find Prospects',
        body:
          'No keys, no integrations, no monthly fees on top — it ships on. The Find Prospects button is in the Lead Setter toolbar.',
        narration: 'There is no setup. Open Lead Setter and click Find Prospects.',
        baseDur: 4500,
      },
      {
        icon: 'MessageSquare',
        title: 'Be specific in plain English',
        body:
          'Industry + geography + size beats one of those. Example: "auto repair shops in Northern Utah with 5+ bays" lands better than "auto repair shops".',
        narration:
          'Be specific in plain English. Industry plus geography plus size beats vague queries.',
        baseDur: 6000,
      },
      {
        icon: 'CheckCircle2',
        title: 'Multi-select then enrich',
        body:
          'Each enrichment burns one credit. Tap only the candidates worth a call before you reveal email + phone.',
        narration:
          'Multi-select first, then enrich. Each enrichment burns one credit from your monthly quota.',
        baseDur: 5000,
      },
      {
        icon: 'UserPlus',
        title: 'Pick the assignee on import',
        body:
          "Choose which setter owns the new leads — they show up in that rep's board with full source citation.",
        narration:
          "On import, pick the assignee. The new leads show up in that rep's board.",
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      'In one sentence: Claude-powered AI prospect researcher built into Lead Setter. A setter types a natural-language description of who they want to find ("warehouses in Salt Lake County over 50 employees") and Claude does the live web research, returning 5–15 real businesses with cited sources.',

    howItWorks:
      'Frontend: ProspectResearchDrawer.jsx invoked from LeadSetter via the Find Prospects toolbar button. Backend: supabase/functions/prospect-research/index.ts Edge Function calls Claude (claude-sonnet-4-5-20250929 via Anthropic API, ANTHROPIC_API_KEY server-side) with the web_search tool. Three actions: `search` (NL query → 5–15 candidates with cited sources), `enrich` (single candidate → email/phone/LinkedIn/decision-maker), `import` (candidate ids → lead rows with prospect_enrichments stamps). Candidates are keyed by SHA-256 of company+city+state so re-imports dedupe. Tier-based monthly quota stored in prospect_research_usage, scoped per company.',

    examples: [
      'warehouses in Salt Lake County over 50 employees',
      'auto repair shops in Northern Utah with 5+ bays',
      'restaurants with 20+ locations in Idaho',
      'manufacturing plants near Lehi with old lighting',
      'commercial property managers in Utah County',
    ],

    gotchas: [
      'Tier-based monthly quota: free (3 searches / 10 enrichments), pro (50 / 200), field_boss (effectively unlimited). Hitting the limit returns 402 with an upgrade prompt.',
      'Enrichment burns a credit even if the contact info is unavailable.',
      'Imports dedupe automatically — same prospect twice is fine, it just imports once.',
      'Vague queries return weak matches. The more constraints (industry + geography + size), the better.',
    ],

    faqs: [
      {
        q: 'Do I need an Apollo.io or ZoomInfo API key?',
        a: 'No. Prospect Scout is powered by Claude with live web search — no third-party API key required. It ships on with your Job Scout subscription.',
      },
      {
        q: 'How are duplicates handled?',
        a: 'Each candidate is keyed by a deterministic hash of company name + city + state. Re-importing the same prospect dedupes automatically.',
      },
      {
        q: 'What happens when I hit my monthly limit?',
        a: 'You get an upgrade prompt. Searches and enrichments are tracked separately and reset on the first of each month. Field Boss tier is effectively unlimited.',
      },
      {
        q: 'Where do imported leads show up?',
        a: "In the New column of the assignee's Lead Setter board, with source_system set to 'prospect_scout' for attribution.",
      },
    ],

    actions: {
      open: { route: '/lead-setter', label: 'Open Prospect Scout', hint: 'Click Find Prospects in the Lead Setter toolbar' },
      upgrade: { route: '/settings#subscription', label: 'Upgrade plan' },
    },
  },

  lastVerified: '2026-05-28',
  freshUntil: 90,
}
