export default {
  id: 'payroll-inbox',
  title: 'Payroll Inbox',
  category: 'Payroll, HR & Onboarding',
  icon: 'Inbox',
  route: '/payroll-inbox',
  summary: 'Before every payroll run, the Inbox surfaces everything that needs human eyes — missing time, bonus flags, commission disputes, and OT exceptions — so nothing slips through.',
  replaces: ['manual payroll review checklists', 'spreadsheet pre-payroll audits', 'email approvals'],
  highlights: [
    'Pre-payroll review queue',
    'Flag anomalies before processing',
    'One-click approve/reject',
    'Audit trail',
  ],
  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'inbox',
        baseDur: 4500,
        narration: 'Before every payroll close, the Inbox lines up every issue that needs a human decision — OT exceptions, missing punches, disputes, and bonus approvals all in one place.',
      },
      {
        id: 'item',
        baseDur: 6500,
        narration: 'Tap any item to see the full context — Marcus Webb logged 6.5 hours of OT on a single job, adding $214.50 to this run. Approve it, reject it, or kick it to his manager in one click.',
      },
      {
        id: 'approve',
        baseDur: 6500,
        narration: 'Approved items get a green checkmark and move out of your queue. The inbox tracks your progress in real time — four down, two to go — and auto-advances to the next item.',
      },
      {
        id: 'summary',
        baseDur: 4500,
        narration: 'When the inbox clears, the pre-payroll summary shows exactly what you approved and what it costs. One unresolved dispute is the only thing standing between you and running payroll.',
      },
    ],
  },
  setup: {
    overview: 'Connect your pay period schedule, configure flagging rules, assign reviewers by item type, and require inbox clearance before every payroll run.',
    introBaseDur: 1200,
    introNarration: 'Four steps and your Payroll Inbox is live.',
    steps: [
      {
        icon: 'Bell',
        title: 'Set payroll close date',
        body: 'Settings → Payroll → Pay Period. Choose weekly, bi-weekly, or semi-monthly. The close date determines when the Inbox populates and when the run locks.',
        narration: 'Pick your pay period cadence — the close date is what triggers the inbox to populate.',
        baseDur: 4500,
      },
      {
        icon: 'Filter',
        title: 'Configure what gets flagged',
        body: 'Settings → Payroll Inbox Rules. Choose your OT threshold, whether commission disputes surface, which manual adjustments require approval, and how to handle missing clock-outs.',
        narration: 'You control exactly which anomalies land in the inbox — set the rules once and let the system do the watching.',
        baseDur: 5000,
      },
      {
        icon: 'Users',
        title: 'Assign inbox reviewers',
        body: 'Settings → Payroll → Inbox Approvers. Designate who approves each flag type: OT goes to the operations manager, bonuses to the owner, commissions to the sales manager.',
        narration: 'Each flag type routes to the right approver automatically — no more chasing down the wrong person.',
        baseDur: 5000,
      },
      {
        icon: 'CheckSquare',
        title: 'Clear inbox before running',
        body: 'Payroll → Run. The system requires every inbox item to be resolved — approved or rejected — before a run can be initiated. An empty inbox means no surprises.',
        narration: 'The run button stays locked until every item is resolved, so payroll never goes out with open questions.',
        baseDur: 4500,
      },
    ],
  },
  agentKnowledge: {
    whatItIs: 'Pre-payroll review queue. Every anomaly — OT, disputes, manual adjustments, missing punches — surfaces here before the run is allowed to execute. Approval audit trail logged per item.',
    howItWorks: 'Table payroll_inbox_items: id, company_id, item_type (ot_exception | missing_clockout | commission_dispute | bonus_approval | manual_adjustment), employee_id, amount_impact, description, status (pending | approved | rejected | dismissed), reviewed_by, reviewed_at, payroll_run_id (set when the run executes). Items auto-populate from time_log (OT detection), commissions (disputed state), and payroll_adjustments (manual entries). A payroll run is gated: all items in the period must be resolved before execution is permitted.',
    examples: [
      'Show me all pending inbox items for this pay period',
      'How much OT has been approved so far this cycle?',
      'Mark the commission dispute for Sarah Lin as rejected',
      'What items are still blocking the June 15 payroll run?',
    ],
    gotchas: [
      'Payroll run is hard-blocked until every item reaches approved, rejected, or dismissed status — pending items prevent execution.',
      'payroll_run_id is null until the run executes; use it to trace which run consumed each approved item.',
      'OT detection reads from time_log, not manually entered hours — if punches are missing, OT math may be wrong until corrected.',
      'Dismissed status bypasses the approval requirement but still logs reviewed_by and reviewed_at for audit purposes.',
    ],
    faqs: [
      {
        q: 'Can I run payroll if one item is still disputed?',
        a: 'No. All items must reach a terminal status (approved, rejected, or dismissed) before the run is allowed. Resolve or dismiss the dispute first.',
      },
      {
        q: 'Who can approve inbox items?',
        a: 'Only employees assigned as Inbox Approvers for that item type in Settings → Payroll → Inbox Approvers. The reviewed_by field records who acted.',
      },
      {
        q: 'Does the inbox carry items over to the next period if unresolved?',
        a: 'Items stay open and tied to their original period. They must be resolved before that period\'s run; they do not roll forward automatically.',
      },
      {
        q: 'How does OT get detected?',
        a: 'The system sums hours from time_log per employee per work week. Any week exceeding the configured threshold (default 40h) creates an ot_exception item automatically.',
      },
    ],
    actions: {
      open: { route: '/payroll-inbox', label: 'Open Payroll Inbox' },
    },
  },
  lastVerified: '2026-06-11',
  freshUntil: 90,
}
