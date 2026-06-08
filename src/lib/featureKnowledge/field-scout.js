// Knowledge Card — Field Scout
// Sourced from src/pages/FieldScout.jsx — the mobile field-tech home base.
// When that page changes, this card needs to follow.

export default {
  id: 'field-scout',
  title: 'Field Scout',
  category: 'Project & Job Management',
  icon: 'Compass',
  route: '/field-scout',

  summary:
    "The field tech's mobile daily home base. Opens to a greeting + live clock + week-hours card. Today's jobs expand to show scope and Before/After camera buttons per line item. Clock In starts a live 36px monospace timer with allotted-hour progress. Victor gates clock-out with a 60-second photo check. Efficiency bonuses accumulate in purple when techs finish under allotted hours.",

  replaces: ['HousecallPro mobile', 'Jobber mobile', 'ServiceTitan Mobile', 'CompanyCam', 'paper timesheets'],
  highlights: [
    'Live elapsed timer with allotted-hour progress bar',
    'Job Briefing in the clock banner — scope + Before/After camera per line item',
    'Victor photo check gates clock-out and protects efficiency bonuses',
    'Purple efficiency bonus card accumulates as crew finishes under budget',
    'Week-to-date hours with 7-day S M T W T F S grid',
    'Lunch break turns banner yellow, pauses billing',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'morning', baseDur: 5500, narration: "Six forty-five AM. The tech opens Field Scout — Good Morning, Doug. Live clock. Week hours. Today's two jobs. Tap the first one and it expands showing the scope, address, and a Clock In button." },
      { id: 'working', baseDur: 7000, narration: "Clock In. The banner goes green. 36-pixel monospace timer starts counting. The allotted-hours bar fills as time ticks. Inside Job Briefing — the line items are right there: 24 fixtures, Before and After camera buttons on every one." },
      { id: 'lunch',   baseDur: 5500, narration: "Hit Take Lunch. Banner goes yellow. Timer pauses. Time stops billing the job. The crew eats. Tap End Lunch and the green banner is back." },
      { id: 'victor',  baseDur: 6500, narration: "Time to leave. Tap Clock Out — and Victor blocks it. Purple card: Run Quick Check, 60 seconds. A few photos, a couple questions. This confirms the job is done so the efficiency bonus gets paid." },
      { id: 'bonus',   baseDur: 6000, narration: "Down in the purple bonus card — 84 dollars and fifty cents. Two jobs, both finished under allotted hours. Every hour saved earns a cut. The crew sees it update in real time." },
    ],
  },

  setup: {
    overview:
      'Field Scout is a PWA — installable from any phone browser without an app store. Have your techs add it to their home screen once and they are ready. The PM schedules work on the Job Board; it appears on the tech\'s Field Scout instantly.',
    introBaseDur: 1200,
    introNarration: 'Set up takes one tap on each phone.',
    steps: [
      {
        icon: 'Smartphone',
        title: 'Open on the tech\'s phone',
        body: 'Tech navigates to job-scout.app in Safari or Chrome on their phone, signs in once with their employee credentials.',
        narration: 'Tech opens job-scout dot app on their phone and signs in.',
        baseDur: 4500,
      },
      {
        icon: 'Download',
        title: 'Add to Home Screen',
        body: 'In Safari, tap Share → Add to Home Screen. In Chrome, tap the install prompt. Now it launches full-screen like a native app with no browser chrome.',
        narration: 'Tap Share, Add to Home Screen. Launches like a native app from then on.',
        baseDur: 5000,
      },
      {
        icon: 'Briefcase',
        title: 'PM schedules the crew',
        body: 'On the Job Board (/job-board), the PM assigns jobs to each tech with a start date. The jobs appear on the tech\'s Field Scout that morning sorted by time.',
        narration: 'PM assigns work on the Job Board. Jobs appear on the tech\'s Field Scout that morning.',
        baseDur: 5500,
      },
      {
        icon: 'DollarSign',
        title: 'Set allotted hours for bonuses',
        body: 'On each job, set allotted_time_hours. The Field Scout progress bar fills as time ticks — and when the crew finishes UNDER allotted, the efficiency bonus calculates automatically.',
        narration: 'Set allotted hours on the job. Finish under budget and the bonus calculates itself.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The field tech's mobile PWA. Layout: greeting (Compass + name + RankBadge + date + 36px monospace clock), week card (total hours + S M T W T F S 7-day grid), active clock banner (green linear-gradient #22c55e→#16a34a when working, yellow #eab308→#ca8a04 on lunch), quick stats strip (Jobs Today / Hours Used/Allotted / Completed), efficiency bonus card (purple gradient #a855f7→#7c3aed), Victor check gate, Today's Jobs list.",

    howItWorks:
      "PWA installable via Add to Home Screen. Reads jobs WHERE assigned to current employee + status NOT completed + start_date today. Active clock banner shows when time_log entry is open (no clock_out). Job Briefing (collapsible, inside green banner) shows: customer + address (Google Maps link), notes, audit locations (area name, fixture count, ceiling height, wattage), line items each with Camera button (Before/After picker). Action buttons: Take Lunch (Coffee icon, rgba(255,255,255,0.25)), Clock Out (red rgba(239,68,68,0.9)). Clock-out can be gated by Victor photo check. Efficiency bonus = saved hours × bonus rate, accumulates in purple card.",

    examples: [
      "Tech opens 7am → sees JOB-041 LED Retrofit + JOB-039 Parking Lot LED → taps JOB-041 → Clock In → green banner starts counting",
      "Inside banner → Job Briefing → 24x Type A fixtures → taps Camera → Before button (blue) → snaps photo before touching anything",
      "After 6h finishing the 6h allotted → Victor check → 2 photos + 2 questions → clock out unlocked → bonus $0 (finished exactly on time)",
      "After 4.5h on a 6h job → finished under → efficiency bonus $52.50 shows in purple card",
    ],

    gotchas: [
      "The Victor gate fires when: (a) the job has a job_id AND verifiedJobs doesn't include it, OR (b) tech is in a field role AND has no daily verification.",
      "Efficiency bonus requires allotted_time_hours to be set on the job. Without it, no progress bar and no bonus.",
      "Lunch break pauses the time billing but does NOT clock out — the time entry stays open.",
      "The week card shows Sun–Sat with today highlighted in accentBg. Hours come from confirmed time_clock entries.",
    ],

    faqs: [
      {
        q: 'What does the progress bar in the clock banner show?',
        a: 'Time used vs allotted hours for the current job. Red when over budget, white when under. When under allotted at clock-out, efficiency bonus pays.',
      },
      {
        q: 'Can techs take photos offline?',
        a: 'Yes — photos queue in IndexedDB photoQueue. When LTE returns, the sync queue replays all uploads. Techs never lose a photo.',
      },
      {
        q: 'Why does the Clock Out button show a Lock icon?',
        a: "Victor requires a photo check before clock-out. The lock appears when the tech hasn't run the completion check yet. The purple card explains exactly why and how to unlock it.",
      },
    ],

    actions: {
      open:  { route: '/field-scout', label: 'Open Field Scout' },
      board: { route: '/job-board',   label: 'PM Job Board' },
    },
  },

  lastVerified: '2026-06-08',
  freshUntil: 90,
}
