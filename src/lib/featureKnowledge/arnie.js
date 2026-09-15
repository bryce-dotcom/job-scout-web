// Knowledge Card — OG Arnie
// The assistant that answers from live data and makes the change on your OK.
//
// This card is what Arnie reads when someone asks "what can you do?", and
// what the Help page and Video Library show. Keep it to what is BUILT —
// every line below is backed by a tool or a rail in
// supabase/functions/arnie-chat and _shared/arnie*.ts, and exercised by
// `npm run arnie:eval`. Add a capability here the same PR it ships.

export default {
  id: 'arnie',
  title: 'OG Arnie',
  category: 'AI Crew',
  icon: 'Bot',
  route: '/agents/arnie',

  summary:
    "Ask anything about your business in plain English — jobs, money, hours, stock. Arnie answers from your live numbers, then drafts the change and waits for your OK: move a job, book an appointment, draft a quote, chase a quiet estimate, close a missed clock-out, merge a duplicate lead.",

  replaces: ['a business analyst', 'an office manager', 'hours of admin busywork'],
  highlights: [
    'Answers from live data',
    'Acts on your OK — with rollback',
    'Morning brief, pushed',
    'Field mode + any-trade diagnose',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'ask',      baseDur: 5000, narration: 'Ask Arnie the way you would ask a person. When is the Drinkle job? How many highbays do we have? What is overdue?' },
      { id: 'answer',   baseDur: 6000, narration: 'He answers from your live data — the real job, the real count, the real balance. Nothing made up.' },
      { id: 'draft',    baseDur: 6500, narration: 'Then ask for the change. He drafts it as a card: which record, what it was, what it becomes. Nothing moves until you tap approve.' },
      { id: 'field',    baseDur: 6000, narration: 'Clocked in? Arnie switches to field mode — short answers, hands-free, and he can walk a tech through a fault in any trade.' },
      { id: 'brief',    baseDur: 6000, narration: 'Every morning, your day in one message: the schedule, the money, what is stuck — pushed by email or text at the hour you pick.' },
    ],
  },

  setup: {
    overview:
      'Arnie is on for every plan and every role — there is nothing to install. He knows who is asking from the login, so a tech and an owner get different answers to the same question.',
    introBaseDur: 1200,
    introNarration: 'Arnie is already on. Here is how to get the most out of him.',
    steps: [
      {
        icon: 'MessageSquare',
        title: 'Tap the Ask Arnie pill',
        body: 'Bottom-right of every page. Ask in plain English — "how many overdue invoices?", "who is on the Halifax job Thursday?", "what did I earn last week?". He finds the record; you never type an ID.',
        narration: 'Tap the Ask Arnie pill on any page and ask in plain English.',
        baseDur: 5000,
      },
      {
        icon: 'ClipboardCheck',
        title: 'Approve the card, or discard it',
        body: 'Every change — a status, a note, a booking, a quote, a merge — arrives as a card with before and after. Approve applies it. Discard drops it. Applied changes can be rolled back from Arnie → Settings. The one exception is a follow-up message: once sent, it cannot be unsent, and the card says so.',
        narration: 'Every change is a card. Approve it, discard it, or roll it back later.',
        baseDur: 6000,
      },
      {
        icon: 'Sunrise',
        title: 'Turn on the morning brief',
        body: 'Arnie → Settings → Morning brief. Pick email or text and the hour in your zone. Owners get the company day; techs get their own — their jobs, their hours, an open shift to close.',
        narration: 'Turn on the morning brief and pick your hour.',
        baseDur: 5000,
      },
      {
        icon: 'Wrench',
        title: 'Give the field crew the pill too',
        body: 'When a tech is clocked in, Arnie goes hands-free: two sentences, the next step, no tables. "Clock me out at 5:30 yesterday", "add a note to this job", "the compressor trips on start — what do I check?" all work from a ladder.',
        narration: 'When a tech is clocked in, Arnie goes hands-free.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The general assistant in JobScout. Arnie reads the company's live data (jobs, leads, quotes, invoices, inventory, products, customers, appointments, time clock, pay, payments, purchase orders) and answers in plain English. He also makes changes — but only as a drafted card the person approves, and everything except a sent message can be rolled back.",

    howItWorks:
      "One edge function (arnie-chat) with the identity taken from the login token, never from the request. Read tools are role-gated: own pay for everyone, everyone's pay for HR, payments and revenue for owners, purchase orders for admins. Four write rails share one lifecycle — propose → approve → apply → rollback — through arnie_proposals and arnie-config: (1) admin settings (business units, lead sources, service types, upsells); (2) one field on one record (job/lead status, a note, a start date, clocking in or switching jobs, closing an open shift, merging a duplicate lead); (3) the same field across many products; (4) creating something new — a lead (duplicate-checked against similar_leads()), an appointment (with the setter fee and every side effect the Lead Setter page has), a Draft quote from the price book, a diagnosis on a job, a bug/feature ticket, a follow-up on a quiet quote sent in the rep's voice, or a payment on an invoice (admin — the invoice page's write, status from the one rule, receipt sent). Apply re-reads the record and refuses if it changed since the draft. A daily brief (query_daily_brief) is also pushed by email or SMS on a Vercel cron (arnie-brief-push) per subscription. Field mode switches on when the person is clocked in. Vision reads attached photos, bills and screenshots. Diagnose answers troubleshooting in any trade from general knowledge.",

    examples: [
      '"How many highbays do we have in stock?" → the real count, fuzzy-matched across product names',
      '"Move the Drinkle job to Friday" → a card: JOB-2214 · Thu → Fri. Approve.',
      '"Book Halifax Flooring for Thursday at 2 with Noah" → a card: appointment, lead to Appointment Set, setter fee created',
      '"Follow up on the Halifax estimate" → a note in your voice, to the address on the quote. Send.',
      '"Clock me out at 5:30 yesterday" → hours worked out, entry marked adjusted',
      '"Merge the Haliflax lead into Halifax Flooring" → everything moves, both setter fees stay, copy removed',
      '"What did I earn last week?" → your own pay; a tech asking about someone else\'s is told who can see it',
      '"Halifax paid $1,000 by check" → a card: balance $3,200 → $2,200, Pending → Partially Paid, receipt to the address on file. Record.',
    ],

    gotchas: [
      'Arnie drafts; he does not do. "Here is the change" means nothing has changed yet — tap approve.',
      'He never invents a record. If several match ("the Halifax job" when there are two), he asks which.',
      'Money is gated by role, and the gate is on the server: a tech cannot get another person\'s pay out of him by rephrasing.',
      'A follow-up message is the one change that cannot be rolled back. The card says Send, not Create, for that reason.',
      'A merge never decides pay. Two setter fees on one lead is a Lead Setter decision, not Arnie\'s.',
      'The brief is only as good as the schedule: an unstaffed section shows up as unstaffed.',
    ],

    faqs: [
      {
        q: 'Which plans include Arnie?',
        a: 'All of them, every role. He is the front door to JobScout, not an add-on.',
      },
      {
        q: 'Can a tech see the company\'s money through Arnie?',
        a: 'No. Pay is own-only below HR, payments and revenue are owner-only, purchase orders are admin-only. Identity comes from the login token, not from what the person types.',
      },
      {
        q: 'What happens if two people change the same thing?',
        a: 'Apply re-reads the record and refuses if it moved since the card was drafted. Ask again and Arnie redrafts from what is there now.',
      },
      {
        q: 'Does Arnie send anything to customers?',
        a: 'Only a follow-up on a quiet quote, only when the person approves the card, only to the address already on the quote or lead — never one the model chose.',
      },
      {
        q: 'Can he create invoices or purchase orders?',
        a: 'Not yet. He can read both, and he can record a payment that arrived on an invoice (admin) — the status updates and the receipt goes out, the same as the invoice page. Creating an invoice or a PO stays on those pages for now.',
      },
    ],

    actions: {
      open: { route: '/agents/arnie', label: 'Ask Arnie' },
      settings: { route: '/agents/arnie/settings', label: 'Arnie settings & rollbacks' },
    },
  },

  lastVerified: '2026-09-15',
  freshUntil: 90,
}
