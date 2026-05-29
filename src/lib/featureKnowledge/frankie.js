// Knowledge Card — Frankie The AI CFO
// Plain-English finance Q&A, AR/AP aging, anomaly detection.

export default {
  id: 'frankie',
  title: 'Frankie The AI CFO',
  category: 'Books & Accounting',
  icon: 'Bot',
  route: '/agents/frankie',

  summary:
    "Ask Frankie 'why is cash tight this month?' in plain English. He tracks AR/AP aging, runs job profitability, detects expense anomalies, and auto-sends collection reminders — the CFO you don't have to hire.",

  replaces: ['Pilot.com', 'Bench', 'fractional CFO', 'manual cash-flow spreadsheets'],
  highlights: [
    'Plain-English Q&A',
    'AR/AP aging + auto-collections',
    'Job profitability',
    'Expense anomaly detection',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'ask',       baseDur: 4500, narration: 'Ask Frankie: why is cash tight this month?' },
      { id: 'answer',    baseDur: 6500, narration: 'He pulls the data. Three customers are sixty days late, materials spend is up eighteen percent. Plain English, with the receipts.' },
      { id: 'aging',     baseDur: 6500, narration: 'AR aging by customer. Frankie ranks them by how long they have owed you.' },
      { id: 'collect',   baseDur: 6500, narration: 'Hit Send Reminders. Frankie drafts the message, sends to all three, logs the touch on each invoice.' },
      { id: 'profit',    baseDur: 5500, narration: 'Per-job profitability. He spots the one that bled margin and tells you why.' },
    ],
  },

  setup: {
    overview:
      'Frankie reads your books. He works best after Books is connected to Plaid and you have at least 30 days of activity to learn from.',
    introBaseDur: 1200,
    introNarration: 'Frankie works best when your books have data to read.',
    steps: [
      {
        icon: 'Landmark',
        title: 'Make sure Plaid is connected',
        body: 'Frankie reads bank_transactions for cash flow. Without Plaid, his answers are blind.',
        narration: 'Make sure Plaid is connected. Frankie reads transactions.',
        baseDur: 4500,
      },
      {
        icon: 'Sliders',
        title: 'Set collection cadence',
        body: 'Settings → Agents → Frankie. Pick when reminders go out (30/60/90 days past due).',
        narration: 'Pick when collection reminders go out.',
        baseDur: 5000,
      },
      {
        icon: 'Bell',
        title: 'Turn on anomaly alerts',
        body: 'Frankie flags expense anomalies (vehicle expense up 40% week over week, materials spend triple last month). Pick channel — in-app, email, SMS.',
        narration: 'Turn on anomaly alerts. Pick the channel.',
        baseDur: 5000,
      },
      {
        icon: 'MessageSquare',
        title: 'Ask him something',
        body: 'Open Frankie, type a question. "What was my best margin job in May?" "Which customers owe me the most?" He answers with the data behind it.',
        narration: 'Ask Frankie a question. He answers with the data behind it.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "An AI CFO agent that answers finance questions in plain English, monitors AR/AP aging, sends automated collection reminders, detects expense anomalies, and computes per-job profitability. Backed by the same data Books reads.",

    howItWorks:
      "Frankie is a Gemini-powered agent with tool calls into Books data: query_general_ledger, ar_aging_by_customer, job_profitability, expense_anomalies, send_collection_reminder. Conversation history per company in agent_conversations. Anomaly detection runs nightly via cron — z-score against trailing 90-day mean.",

    examples: [
      'User: "why is cash tight?" → Frankie: 3 customers 60+ days late ($18k), materials up 18% → here are the customers',
      'Daily: anomaly check flags vehicle expense 3x normal → in-app alert',
      'Weekly: auto-send collection reminder to 60+ day late accounts',
    ],

    gotchas: [
      'Frankie answers from data, not opinions. Ambiguous questions get clarifying questions back.',
      'Auto-collection reminders use your invoice template — make sure the from-email is set up.',
      'Job profitability needs job_costing rollups (materials, labor, expenses) to be allocated. Un-allocated jobs report zero margin.',
    ],

    faqs: [
      {
        q: 'Is Frankie HIPAA / SOC2 compliant?',
        a: 'Job Scout is SOC2 Type II. Frankie\'s LLM calls are routed through Gemini Enterprise with no training-data retention.',
      },
      {
        q: 'Can Frankie file my taxes?',
        a: 'No — taxes go to your CPA. Frankie produces the books your CPA wants to see.',
      },
    ],

    actions: {
      open: { route: '/agents/frankie', label: 'Open Frankie' },
      books: { route: '/books', label: 'Open Books' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
