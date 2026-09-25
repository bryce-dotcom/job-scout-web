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
        body: 'Arnie → Settings → Morning brief. Pick email or text and the hour in your zone. Owners get the company day; techs get their own — their jobs, their hours, an open shift to close. Leave "Nudges between briefs" on and he also taps you the day something happens: a quote quiet ten days, an invoice that just tipped overdue, your own shift still open at night — 7am to 9pm, never the same thing twice.',
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
      "One edge function (arnie-chat) with the identity taken from the login token, never from the request. Read tools are role-gated: own pay for everyone, everyone's pay for HR, payments and revenue for owners, purchase orders for admins. Four write rails share one lifecycle — propose → approve → apply → rollback — through arnie_proposals and arnie-config: (1) admin settings (business units, lead sources, service types, upsells); (2) one field on one record (job/lead status, a note, a start date, clocking in or switching jobs, closing an open shift, merging a duplicate lead, putting a person on a job section for a day — the job page's section editor, clashes shown not decided); (3) the same field across many rows — the price book (a manufacturer spelt two ways, a category retyped, a batch deactivated; the filter matches the WHOLE value, whitespace included) and the expense book: “every Chevron charge is Fuel” finds the word in the vendor, the merchant and the description at once, because a real book names the shop in a column on one row and buries it in free text on the next. Every affected row is listed on the card with its date, amount and description, the 200-row ceiling still applies, apply refuses if any one of them moved, and rollback puts every previous category back. Admin only; it changes how money is REPORTED, never the amount, the date or the job; (4) creating something new — a lead (duplicate-checked against similar_leads()), an appointment (with the setter fee and every side effect the Lead Setter page has), a Draft quote from the price book, a diagnosis on a job, a bug/feature ticket, a follow-up on a quiet quote sent in the rep's voice, a payment on an invoice (admin — the invoice page's write, status from the one rule, receipt sent), or a memory — one line about the person (a nickname for a job, a preference) kept on approval in arnie_memories and read into every later conversation from the login, forgettable one tap at a time from Arnie → Settings. Or an expense from a receipt photo: the model reads merchant, date and total off the paper, the card shows what it read, and the photo is attached to the expense on approve — Pending on Expenses, same bucket the page uses. Or the whole company, on day one: Onboarding offers Talk to Arnie — the owner gives the name, the address, the trade and the entity type, and companySetup.ts derives the rest from stateProfiles.ts (50 states + DC): time zone, the state income-tax rule, the sales-tax floor and whether services are taxed there, the SUI wage base and new-employer rate as a flagged estimate, deposit schedules, NAICS, service types, warranty defaults, the first business unit and which AI crew to turn on; every line on the card names its source, and rollback restores the company row, the settings and the crew exactly. Day two: the first employee by voice (arnieEmployee.ts — the Employees page row plus the invite-employee login email; admin only; a pay rate lands only when the caller could see pay on the page, i.e. owner or has_hr_access, otherwise the card says the rate waits on the page; access never above Admin; rollback removes the row, the invitation and an unused login) and the price book from a photo, PDF or spreadsheet (arniePriceBook.ts — the model reads rows off the document, the server checks every one: no price = skipped, already in the book = skipped, cost equal to price flagged; up to 80 a card; manager+; rollback removes exactly those rows unless a quote or job already uses one). And the sentence that runs the business — “Halifax signed”: the won target (arnieWon.ts) runs the SAME approve + convert the estimate page and the customer portal run (_shared/estimateConvert.ts, one conversion since 2026-09-20 — before that the page and the portal each had their own and the portal's had drifted): estimate to Approved, the deposit payment if a check was taken, the job made with its lines (in_utility_scope kept), the deposit invoice per the proposal (paid if the check covers it), coverage dates, the lead to the delivery column, the company told; the rep's own estimate or a manager's; rollback undoes it only while the job is unscheduled, unclocked and uninvoiced. Then “schedule it Thursday at 8 with Jordan and Carlos” (arnieSchedule.ts, manager+): the Job Board’s Schedule modal by voice — the day taken as said in the company zone (no time = 8 AM), start/end, the company’s Scheduled status, assigned_team, the first person as job lead for clock-in, one calendar entry per person with job_id, the lead mirrored; a clash (a section, an appointment, time off that day) is on the card, never decided; rollback puts the job back and removes its appointments unless someone clocked in. One customer, one read: “what’s the history with Halifax” → query_account (arnieAccount.ts) — who they are, jobs open and last, open estimates, next appointment, last contact, and for an admin the money: what they owe now (customer_owes + card fee, less what is paid — an invoice the utility settled is not a balance), what is overdue, open invoices, lifetime paid, last payment. A tech gets the work and one sentence saying the money needs admin access. For the owner, Arnie → Settings has “Arnie at work” (admin+, lib/arnieUsage.js): conversations and questions by person, every draft by kind and status with its approval rate, what he cost (ai_usage), and the latest drafts with what was asked — counts and the audit trail, never transcripts — and never the nightly eval, whose drafts are stamped source='eval' so the approval rate is people, not the harness. Apply re-reads the record and refuses if it changed since the draft. A daily brief (query_daily_brief) is also pushed by email or SMS on a Vercel cron (arnie-brief-push) per subscription, and between briefs arnie-nudge (hourly, 7am–9pm local) sends one message the day a quote goes quiet ten days, an invoice tips overdue, or the person's own shift is open twelve hours — each item once (arnie_nudges), no model in the loop. Field mode switches on when the person is clocked in. Vision reads attached photos, bills and screenshots. Diagnose answers troubleshooting in any trade from general knowledge.",

    examples: [
      '"How many highbays do we have in stock?" → the real count, fuzzy-matched across product names',
      '"Move the Drinkle job to Friday" → a card: JOB-2214 · Thu → Fri. Approve.',
      '"Book Halifax Flooring for Thursday at 2 with Noah" → a card: appointment, lead to Appointment Set, setter fee created',
      '"Follow up on the Halifax estimate" → a note in your voice, to the address on the quote. Send.',
      '"Clock me out at 5:30 yesterday" → hours worked out, entry marked adjusted',
      '"Merge the Haliflax lead into Halifax Flooring" → everything moves, both setter fees stay, copy removed',
      '"What did I earn last week?" → your own pay; a tech asking about someone else\'s is told who can see it',
      '"Halifax paid $1,000 by check" → a card: balance $3,200 → $2,200, Pending → Partially Paid, receipt to the address on file. Record.',
      '"From now on, the car wash means the Westside Auto Wash job" → a card. Approve, and "clock me in on the car wash" just works next week.',
      '"Summit Field Co, 1600 E Main St, Mesa AZ 85203, lawn care, S corp" on day one → a card: America/Phoenix (no DST), NAICS 561730, AZ flat 2.5% withholding, SUI 2% on $8,000 [estimate — confirm], TPT 5.6% floor with the Mesa add-on still yours, Zach on the crew. Set up.',
      '"Add Casey Morgan, field tech, casey@…, $28 an hour, starts Monday" → a card: Field Tech, User access, W-2, starts 9/21, $28.00 an hour (or "pay needs HR access" if you cannot see pay), invite on approve. Add.',
      'A photo of a supplier price sheet + "load my price book" → a card: 6 items with price, cost and SKU; the line with a blank price listed as skipped, never priced at cost. Add to price book.',
      '"Halifax Flooring signed — they gave us a $330 check" → a card: the job (Chillin, unscheduled, Energy Scout), $3,300 after a $200 discount, 3 lines (1 out of utility scope), the $330 deposit invoice paid by the check, lead Quote Sent → Job Scheduled. Mark won.',
      '"Schedule the Halifax job Thursday at 8 with Jordan and Carlos, 6 hours" → a card: Thu 8:00 AM–2:00 PM, Jordan (job lead) and Carlos each on the calendar, Chillin → Scheduled — and "Jordan already has an estimate visit at 1" if he does. Schedule.',
      '"What’s the history with Halifax? Do they owe us anything?" → one answer: two jobs (one open), an open estimate, $800 overdue since the 13th, $12,000 paid lifetime, last spoke a week ago. A tech asking the same thing gets the work and "the money needs admin access".',
      '"All our Chevron expenses are filed as Materials — they should be Fuel" → a card listing all four: the two that only say Chevron in the description, the one with a vendor, and the car wash (Arnie says look at that one). Approve re-files them; the Domino'+String.fromCharCode(39)+'s and Home Depot rows are untouched.',
      'A photo of a Chevron receipt + "log this on the Auto Wash job" → a card: $96.41, Chevron, 9/16, Fuel, the job. Log, and the photo rides along.',
      '"Who is free Thursday?" → the roster for the day: sections, appointments, time off, who is unbooked. "Put Mike on the Halifax bays Thursday" → a card, clash shown if he has something that day.',
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
