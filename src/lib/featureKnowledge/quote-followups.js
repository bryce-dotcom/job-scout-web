// Knowledge Card — Quote Follow-ups
// Sourced from supabase/functions/estimate-followup/index.ts
// No dedicated settings page — configuration is in Conrad automations.
// When the Edge Function changes, this card needs to follow.

export default {
  id: 'quote-followups',
  title: 'Quote Follow-ups',
  category: 'Sales & CRM',
  icon: 'Send',
  route: '/estimates',

  summary:
    "Automated email drip for estimates that sit in 'Sent' status without a signature. The estimate-followup Edge Function runs nightly and sends three nudges — Day 3, Day 7, Day 14 — each with the portal link button. All pending nudges cancel the moment the estimate is Approved or Rejected.",

  replaces: ['Mailchimp drip campaigns', 'Constant Contact automations', "manual 'just following up' emails"],
  highlights: [
    'Day 3: "Just checking in — Estimate EST-xxx"',
    'Day 7: "Following up on your estimate"',
    'Day 14: "Last chance to lock in your pricing"',
    'Auto-cancels on Approved / Rejected / Expired',
    'Portal link button in every email — one click to sign',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'sent',   baseDur: 5000, narration: "Estimate sent on June fifth. No response. Job Scout's nightly cron watches for exactly this — a Sent estimate with no signature after three days." },
      { id: 'nudge1', baseDur: 6500, narration: 'Day three — the first follow-up fires. Subject: "Just checking in — Estimate EST-041". A friendly note with a View and Approve button pointing straight to the portal link.' },
      { id: 'nudge2', baseDur: 6500, narration: 'Day seven — a second nudge. Different subject, more urgency. "Following up on your estimate. Our team is ready to get started as soon as you give the green light."' },
      { id: 'nudge3', baseDur: 6000, narration: 'Day fourteen — the final touch. "Last chance to lock in your pricing." After this one, the sequence stops chasing regardless of response.' },
      { id: 'signed', baseDur: 6500, narration: "Customer clicks the Day 7 portal link and signs. EST-041 flips to Approved, the Day 14 nudge is cancelled automatically, and a Job record is created." },
    ],
  },

  setup: {
    overview:
      "Quote Follow-ups run automatically once the estimate-followup Edge Function is deployed (it ships with the app). The email templates are hard-coded in the function — customize them by editing the FOLLOWUP_SUBJECTS and FOLLOWUP_BODIES constants in supabase/functions/estimate-followup/index.ts.",
    introBaseDur: 1200,
    introNarration: "Follow-ups run automatically. Here's what you can change.",
    steps: [
      {
        icon: 'Settings',
        title: 'Check the cron schedule',
        body: 'The estimate-followup function is triggered by a Vercel or Supabase cron. Confirm it is scheduled in vercel.json or the Supabase cron dashboard to run daily.',
        narration: 'Confirm the cron runs daily in your Vercel or Supabase cron dashboard.',
        baseDur: 5500,
      },
      {
        icon: 'PenTool',
        title: 'Customize the email templates',
        body: 'Open supabase/functions/estimate-followup/index.ts. Edit FOLLOWUP_SUBJECTS and FOLLOWUP_BODIES. Three templates: Day 3 friendly check-in, Day 7 urgency, Day 14 final touch. Portal URL button is auto-included.',
        narration: 'Edit the three templates in the Edge Function — subject line and body for each day.',
        baseDur: 5500,
      },
      {
        icon: 'Power',
        title: 'Change the send days (optional)',
        body: 'FOLLOWUP_DAYS = [3, 7, 14] in the function. Change to [2, 5, 10] for a faster sequence, or [5, 10, 21] for a slower one.',
        narration: 'Change FOLLOWUP_DAYS in the function if you want a faster or slower cadence.',
        baseDur: 5000,
      },
      {
        icon: 'UserX',
        title: 'Suppress for a customer (optional)',
        body: 'On the customer record, toggle "Suppress automated emails". Affects all estimates and invoices for that customer — no cron emails will fire.',
        narration: "Toggle 'Suppress automated emails' on the customer record to opt them out.",
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Automated email drip for quotes with status='Sent' that haven't been signed. The estimate-followup Edge Function (supabase/functions/estimate-followup/index.ts) runs nightly, finds Sent quotes past each FOLLOWUP_DAYS threshold, and sends via SendGrid. Three emails: Day 3 'Just checking in', Day 7 'Following up', Day 14 'Last chance to lock in'. Each email contains a portal URL button. Cancels automatically when quote.status changes to Approved, Rejected, or Expired.",

    howItWorks:
      "FOLLOWUP_DAYS = [3, 7, 14]. Nightly query: SELECT quotes WHERE status='Sent' AND sent_date <= NOW - N days AND followup_count < N. Sends via SendGrid using FOLLOWUP_SUBJECTS[n] and FOLLOWUP_BODIES[n] templates. After each send, increments quote.followup_count and sets quote.last_followup_at. All three templates include a portal link button (View & Approve / Review Your Estimate / Approve Before Pricing Changes). Portal URL format: /portal/:token.",

    examples: [
      "EST-041 sent Jun 5 → Day 3 nudge Jun 8 → customer opens Jun 9 → signs Jun 11 → Day 14 nudge never fires",
      "EST-038 sent May 24 → 3 nudges fire → no response → quote expires after Day 14",
      "Customer has suppress_emails=true → no nudges fire regardless of estimate status",
    ],

    gotchas: [
      "Email templates are hard-coded in the Edge Function source, not in a database settings table.",
      "Cron runs in UTC — 'Day 3' means 72 hours after sent_date in UTC, not local time.",
      "Email open tracking pixel may be blocked by Gmail privacy proxy — opens under-report.",
      "followup_count on the quotes table tracks how many have fired — useful for debugging.",
    ],

    faqs: [
      {
        q: 'Can I turn off follow-ups for one specific customer?',
        a: "Yes — on the Customer Detail page, toggle 'Suppress automated emails'. This prevents all automated cron emails (follow-ups + invoice reminders) for that customer.",
      },
      {
        q: "Why didn't a follow-up fire for an estimate?",
        a: "Check: (1) is the estimate status exactly 'Sent'? Draft, Approved, Rejected, Expired skip. (2) Was sent_date set? (3) Is the cron actually running? Check the Supabase or Vercel cron logs.",
      },
    ],

    actions: {
      open: { route: '/estimates', label: 'Open Estimates' },
    },
  },

  lastVerified: '2026-06-04',
  freshUntil: 90,
}
