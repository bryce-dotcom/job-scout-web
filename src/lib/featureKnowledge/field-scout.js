// Knowledge Card — Field Scout
// The mobile field-tech home base.

export default {
  id: 'field-scout',
  title: 'Field Scout',
  category: 'Project & Job Management',
  icon: 'Compass',
  route: '/field-scout',

  summary:
    "The mobile field-tech home base — today's jobs, one-tap clock in/out tied to a specific job, photo capture, and signature-on-glass. Works offline with a sync queue.",

  replaces: ['HousecallPro mobile', 'Jobber mobile', 'ServiceTitan Mobile', 'CompanyCam'],
  highlights: [
    'Offline-first',
    'Job-linked clock',
    'Photo + signature capture',
    'Sync queue replays on reconnect',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'today',     baseDur: 4500, narration: 'Tech opens Field Scout in the truck. Today\'s jobs, sorted by time, address, customer.' },
      { id: 'clockin',   baseDur: 6000, narration: 'Taps Clock In on the first job. GPS stamps the punch, lunch timer starts when it should.' },
      { id: 'photo',     baseDur: 6000, narration: 'Snaps a before photo. Even with no signal — the queue holds it and uploads later.' },
      { id: 'sign',      baseDur: 6500, narration: 'Customer signs on the glass. IP, browser, timestamp captured for the audit log.' },
      { id: 'complete',  baseDur: 5500, narration: 'Tech taps Complete. The job closes out, the invoice goes out, and the truck rolls.' },
    ],
  },

  setup: {
    overview:
      'Field Scout is a PWA — installable from any phone browser without an app store. Have your techs add it to their home screen once and they are ready.',
    introBaseDur: 1200,
    introNarration: 'Set up takes one tap on each phone.',
    steps: [
      {
        icon: 'Smartphone',
        title: 'Open on the tech\'s phone',
        body: 'Tech navigates to job-scout.app in Safari or Chrome on their phone, signs in once.',
        narration: 'Tech opens job-scout dot app on their phone and signs in.',
        baseDur: 4500,
      },
      {
        icon: 'Download',
        title: 'Add to Home Screen',
        body: 'In Safari, tap Share → Add to Home Screen. In Chrome, tap the install prompt. Now it launches like a native app.',
        narration: 'Tap Share, Add to Home Screen. Launches like a native app from then on.',
        baseDur: 5000,
      },
      {
        icon: 'Briefcase',
        title: 'PM schedules them',
        body: 'On the Job Board, the PM drags sections onto this tech for today. They appear on Field Scout instantly.',
        narration: 'PM drags work onto the tech in Job Board. Sections appear on Field Scout instantly.',
        baseDur: 5500,
      },
      {
        icon: 'WifiOff',
        title: 'Drive into a dead zone',
        body: 'Photos, time entries, signatures queue locally in IndexedDB. The truck pulls back into LTE — the queue replays in the background.',
        narration: 'Drive into a dead zone. Photos and entries queue locally. Back on LTE, the queue replays.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "The mobile workspace for field techs. Shows the day\'s assigned jobs and sections, one-tap clock in/out tied to a specific job (GPS captured), photo and signature capture, and a sync queue so everything works offline.",

    howItWorks:
      "PWA installable via standard A2HS flow. Reads job_sections WHERE lead_tech_id = current_user AND scheduled_date = today. Photos uploaded to project-documents bucket. Signatures captured as PNG dataURLs + ESIGN audit fields (ip, user_agent, timestamp). Offline writes go to IndexedDB syncQueue + photoQueue, replayed by registerPeriodicSync when online.",

    examples: [
      'Tech opens Field Scout 7am, sees 3 jobs scheduled',
      'Clocks in on Job #1 — time_log.job_id + GPS captured',
      'Snaps 4 photos, customer signs — all queue offline, sync when LTE returns',
    ],

    gotchas: [
      'Push notifications require A2HS install + permission grant on iOS. Without that, no background nudges.',
      'Large photo libraries (>200) can hit per-origin storage quotas. The queue compresses on capture to keep it light.',
    ],

    faqs: [
      {
        q: 'Does it need a separate app?',
        a: 'No — it is a PWA. Installs from the browser, runs full-screen, no app store review.',
      },
      {
        q: 'What happens if I forget to clock out?',
        a: 'Admin gets a flagged unverified-clockout in the payroll inbox. You can adjust it from the Time Log with an audit trail.',
      },
    ],

    actions: {
      open: { route: '/field-scout', label: 'Open Field Scout' },
      board: { route: '/job-board', label: 'PM Job Board' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
