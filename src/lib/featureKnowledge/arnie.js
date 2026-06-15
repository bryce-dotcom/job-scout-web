// Knowledge Card — Arnie
// In-app Claude-powered AI assistant with full feature knowledge and live data context.

export default {
  id: 'arnie',
  title: 'Arnie',
  category: 'AI Crew',
  icon: 'Bot',
  route: '/agents/arnie',

  summary:
    'Arnie is your in-app AI assistant — type any question about Job Scout, your data, or your business and he answers with full feature knowledge and live database context.',

  replaces: ['Google search for app questions', 'calling support', 'training new hires manually'],
  highlights: [
    'Knows every Job Scout feature',
    'Context-aware answers',
    'Works inside the app',
    'Remembers conversation history',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'chat',
        baseDur: 4500,
        narration: 'Type a question. Arnie answers instantly — with real feature knowledge and a direct link to go act on it.',
      },
      {
        id: 'context',
        baseDur: 6500,
        narration: 'Forty-seven features loaded. Arnie knows the whole app — not just docs, but how your data is actually wired together.',
      },
      {
        id: 'insight',
        baseDur: 6500,
        narration: 'Ask a data question. Arnie pulls live numbers — job margins, open invoices, top customers — and formats them right in the chat.',
      },
      {
        id: 'action',
        baseDur: 6500,
        narration: '"Open the Northbridge audit." Arnie finds it, surfaces the summary, and drops a link. One tap and you\'re there.',
      },
      {
        id: 'history',
        baseDur: 4500,
        narration: 'Every conversation is saved. Great for auditing guidance, onboarding new hires, or picking up where you left off.',
      },
    ],
  },

  setup: {
    overview:
      'Enable Arnie in Settings, grant the data access level you want, then ask anything from the top-nav robot icon or any search bar.',
    introBaseDur: 1200,
    introNarration: 'Enable, grant access, start asking.',
    steps: [
      {
        icon: 'Bot',
        title: 'Enable Arnie',
        body: 'Settings → AI Agents → Arnie. Toggle on. He activates immediately — no training required.',
        narration: 'Toggle Arnie on in Settings. No training needed — he is ready immediately.',
        baseDur: 4500,
      },
      {
        icon: 'Brain',
        title: 'Grant data access',
        body: 'Arnie can read your company data when you grant access in Settings → AI Agents → Arnie → Data Access. He never writes without your confirmation.',
        narration: 'Grant read access. Arnie never writes to your data without confirmation.',
        baseDur: 5000,
      },
      {
        icon: 'MessageSquare',
        title: 'Ask anything',
        body: 'Top-nav robot icon or /arnie in any search. Ask in plain English — "how does payroll work", "show me open invoices", "what does Victor check for".',
        narration: 'Hit the robot icon or type /arnie anywhere. Plain English — no commands to memorize.',
        baseDur: 5000,
      },
      {
        icon: 'History',
        title: 'Review history',
        body: 'Arnie → History. Every conversation is logged. Great for auditing what you asked and what guidance was given.',
        narration: 'Full conversation history. Audit guidance, onboard staff, or just pick up where you left off.',
        baseDur: 4500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      'In-app AI chat assistant backed by Claude. Knows all 47+ features, can query live data, answers questions in plain English, and suggests navigation links.',

    howItWorks:
      'Backed by arnie_conversations and arnie_messages tables. Each message stores role, content, and optionally a JSON context blob with the active feature cards. System prompt is dynamically assembled from KNOWLEDGE_CARDS for the features the user mentions or the page they are on. Arnie does NOT have write access by default — all actions are surfaced as suggested navigation links. Context injection uses the feature knowledge card registry; the assembler picks cards by keyword match on the user message plus the current route.',

    examples: [
      '"How do I add a rebate measure to a lighting audit?" → step-by-step answer with Go to Rebate Measures link',
      '"Which jobs have the highest margin this month?" → inline mini-table with job name, customer, margin %',
      '"Open the Northbridge audit" → Found Lighting Audit #120 with summary card and direct link',
    ],

    gotchas: [
      'Arnie reads live data only when Data Access is granted in Settings. Without it, answers are knowledge-only — no live numbers.',
      'Write actions (creating records, updating fields) require explicit user confirmation. Arnie surfaces a link card, not a silent mutation.',
      'Context injection is keyword-based — if a question spans an unusual combination of features, Arnie may not pull the right cards automatically. Mentioning the feature name explicitly helps.',
    ],

    faqs: [
      {
        q: 'Does Arnie have access to all my company data by default?',
        a: 'No. Data access is off by default. Enable it per-scope in Settings → AI Agents → Arnie → Data Access.',
      },
      {
        q: 'Can Arnie create records or update things?',
        a: 'No. Arnie is read-only. He surfaces suggested action links but never writes to the database without you explicitly acting on the link.',
      },
      {
        q: 'How is Arnie different from the other AI agents like Lenard or Freddy?',
        a: 'Lenard and Freddy are domain specialists that run automated workflows. Arnie is a general assistant — he answers questions, explains features, and helps you navigate. Think help desk, not automation.',
      },
    ],

    actions: {
      open: { route: '/agents/arnie', label: 'Open Arnie' },
      settings: { route: '/settings', label: 'AI Agent Settings' },
    },
  },

  lastVerified: '2026-06-11',
  freshUntil: 90,
}
