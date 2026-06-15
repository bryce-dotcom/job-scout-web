// Knowledge Card — Victor The Verification Agent
// AI photo QA: before/after, completeness checks, grade scoring.

export default {
  id: 'victor',
  title: 'Victor The Verification Agent',
  category: 'Project & Job Management',
  icon: 'ShieldCheck',
  route: '/agents/victor',

  summary:
    "AI photo quality control — uploads job photos, scores completeness and workmanship, flags missing shots, gives a letter grade. The pre-payroll sanity check that catches half-done work before the customer does.",

  replaces: ['CompanyCam Insights', 'manual PM walk-throughs', 'after-the-fact callbacks'],
  highlights: [
    'AI quality scoring',
    'Missing-shot detection',
    'Before/after pairing',
    'Letter-grade report',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'upload',   baseDur: 4500, narration: 'Job is done. Tech opens Victor and uploads the photos.' },
      { id: 'grade',    baseDur: 6500, narration: 'Victor reads every shot. Counts fixtures. Pairs before with after. Score: eighty-two. Grade B.' },
      { id: 'check',    baseDur: 6500, narration: 'Six checks: Before, After, Completed Work, Cleanliness, Work Quality, General. Green, yellow, or red for each.' },
      { id: 'notes',    baseDur: 6500, narration: 'Two missing shots — Bay six end-of-row, no after photo. Tech goes back and grabs them before he leaves the site.' },
      { id: 'block',    baseDur: 5500, narration: 'Below threshold? Payroll holds the efficiency bonus until the PM signs off. The gate pays for itself.' },
    ],
  },

  setup: {
    overview:
      "Victor unlocks in Settings → Agents. Once on, point him at any job and he scores it. Set a quality threshold so jobs below the bar block until they're fixed.",
    introBaseDur: 1200,
    introNarration: 'Unlock Victor. Set a threshold. He guards the gate.',
    steps: [
      {
        icon: 'Bot',
        title: 'Unlock Victor',
        body: 'Settings → AI Agents → Victor → Enable. He needs read on job_photos + write on victor_reports.',
        narration: 'Unlock Victor in Settings, AI Agents.',
        baseDur: 4500,
      },
      {
        icon: 'Sliders',
        title: 'Set quality threshold',
        body: 'Default 80/100. Jobs scoring below it require admin review before payroll closes. Pick the bar your team can hit.',
        narration: 'Set the quality threshold. Default eighty.',
        baseDur: 5000,
      },
      {
        icon: 'List',
        title: 'Define photo checklist per job type',
        body: 'Settings → Victor → Photo checklists. Per service type, list required shots. "Lighting retrofit" = before + after per area + final wiring close-up.',
        narration: 'Define a photo checklist per job type. Victor checks against it.',
        baseDur: 5500,
      },
      {
        icon: 'CheckCircle2',
        title: 'Verify and approve',
        body: 'On job complete, tech opens Victor → uploads photos → gets the grade. PM reviews the report. Below threshold? Re-shoot or override with a note.',
        narration: 'Tech uploads. PM reviews. Below threshold means re-shoot.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "AI photo verification agent. Takes job_photos, runs Gemini Vision to assess workmanship + completeness, scores against the per-job-type photo checklist, returns a letter grade + per-photo notes + a final report PDF.",

    howItWorks:
      "victor_reports table (per-job report rows). victor-verify Edge Function takes job_id, fetches photos from project-documents bucket, runs Gemini Vision with a quality rubric prompt, computes a 0-100 score across (a) checklist coverage, (b) photo quality, (c) workmanship signals (wires tight, fixtures aligned, area clean). PDF rendered via pdfme + attached to job and signed off in the customer portal.",

    examples: [
      'JOB-2147 retrofit → 32 photos → Victor: 94/100 grade A, all 8 bays covered, wiring clean',
      'JOB-2150 → 18 photos → Victor: 62/100 grade D, missing Bay 6 after, fixture 4-2 misaligned',
      'Below 80 threshold → blocks payroll commission until PM signs off with override note',
    ],

    gotchas: [
      'Victor needs at least 1 before + 1 after photo per area to pair them. Bare-minimum coverage scores low.',
      'AI grading isn\'t perfect — a great photo of bad work can still score high. PM should spot-check below 85.',
      'Re-running Victor on the same job overwrites the previous report. Old reports survive in victor_report_history.',
    ],

    faqs: [
      {
        q: 'Does the customer see the grade?',
        a: 'Optional — toggle "Share with customer" on the report. Good for upsell / trust building.',
      },
      {
        q: 'What if a tech disputes a low score?',
        a: 'PM can override with a note. Override + reason logged in victor_overrides for audit.',
      },
    ],

    actions: {
      open: { route: '/agents/victor', label: 'Open Victor' },
      verify: { route: '/agents/victor/verify', label: 'Verify a job' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
