export default {
  id: 'photos-signatures',
  title: 'Photos & Signatures',
  category: 'Project & Job Management',
  icon: 'Camera',
  route: null,
  summary: 'Capture before/after photos per job line item and collect customer signatures on-glass — every photo and sig saved with timestamp, GPS, and IP for ESIGN compliance.',
  replaces: ['CompanyCam', 'DocuSign signatures', 'Adobe Sign', 'paper sign-off sheets'],
  highlights: [
    'Per-line-item photos',
    'Draw-on-glass signature',
    'ESIGN compliant',
    'Offline queue',
  ],
  marketing: {
    voice: 'Bill',
    scenes: [
      {
        id: 'photos',
        baseDur: 4500,
        narration: 'Every job gets a full photo record — before, after, and completed work organized by category so nothing gets lost.',
      },
      {
        id: 'capture',
        baseDur: 6500,
        narration: 'Field crew taps their category, snaps the photo, and keeps moving. Photos queue offline and sync the moment signal returns.',
      },
      {
        id: 'signature',
        baseDur: 6500,
        narration: 'Hand the customer your phone and they sign on-glass. JobScout captures the timestamp, IP, and device info automatically for ESIGN compliance.',
      },
      {
        id: 'signed',
        baseDur: 4500,
        narration: 'The signed record is locked with a hash, stored immutably, and ready to download as a PDF — no paperwork, no follow-up.',
      },
    ],
  },
  setup: {
    overview: 'Enable required photo categories per job type, then field crew captures and customers sign — compliance is automatic.',
    introBaseDur: 1200,
    introNarration: 'Set up photos and signatures in a few steps.',
    steps: [
      {
        icon: 'Camera',
        title: 'Field crew: use the app',
        body: 'Field Scout → Job → Photos tab. Category pre-selected. Tap camera to capture. Photos queue offline and sync when signal returns.',
        narration: 'Field crew opens the job, taps Photos, and captures. Works offline — syncs automatically when back online.',
        baseDur: 4500,
      },
      {
        icon: 'CheckSquare',
        title: 'Set required photo categories',
        body: 'Settings → Photos → Required Categories per job type. Victor uses these requirements to grade the submission A–F.',
        narration: 'Define which categories are required per job type so Victor can grade every submission objectively.',
        baseDur: 5000,
      },
      {
        icon: 'FileSignature',
        title: 'Send signature request',
        body: 'Job → Signatures → Request. Customer gets a link they open on any device. Or hand them your phone on-site.',
        narration: 'Request a signature by link or hand the customer your phone — they sign on any device, anywhere.',
        baseDur: 5000,
      },
      {
        icon: 'ShieldCheck',
        title: 'ESIGN compliance auto',
        body: 'Every signature captures timestamp, IP, device fingerprint, and geo automatically. Stored immutably — no action needed from your team.',
        narration: 'Timestamp, IP, geo, and device fingerprint are captured automatically. Your team does nothing extra.',
        baseDur: 4500,
      },
    ],
  },
  agentKnowledge: {
    whatItIs: 'Photo capture (per job line, per category) and digital signature collection with ESIGN compliance fields. Offline-first with sync queue. Victor grades photo submissions.',
    howItWorks: 'job_photos table: id, job_id, category (before/after/completed/cleanliness/general), storage_path, taken_by, taken_at, lat, lng, notes, synced_at (null if still in offline queue). job_signatures table: id, job_id, signed_by_name, signed_by_email, signature_image_path, signed_at, ip_address, user_agent, lat, lng, esign_hash. Files stored in the audit-photos bucket (public read). Offline: photos go into photoQueue (IndexedDB) and upload on reconnect. Victor reads job_photos.category counts against required categories config to run the A–F grading algorithm.',
    examples: [
      'Show me all before photos for job #1042',
      'Has the customer signed off on the Henderson job?',
      'Download the signature PDF for Marcus Okafor',
      'What photos are still pending upload?',
      'What is the photo grade for the last 10 jobs?',
    ],
    gotchas: [
      'synced_at is null while the photo is still in the offline IndexedDB queue — do not report it as missing, it will sync',
      'signature_image_path is a Supabase storage path, not a direct URL — use the storage API to generate a signed URL',
      'esign_hash is computed server-side on insert; never recompute or overwrite it',
      'Required categories are stored in the settings table as JSON arrays keyed by job type — check there before flagging a submission as incomplete',
    ],
    faqs: [
      {
        q: 'Can customers sign remotely instead of on-site?',
        a: 'Yes. Job → Signatures → Request sends the customer a link they can open on any device. The same ESIGN fields are captured regardless.',
      },
      {
        q: 'What happens to photos taken with no internet?',
        a: 'They go into photoQueue in IndexedDB and upload automatically when connectivity returns. synced_at is null until the upload succeeds.',
      },
      {
        q: 'How does Victor grade photo submissions?',
        a: 'Victor compares the categories present in job_photos against the required categories from settings for that job type and assigns a letter grade A–F.',
      },
      {
        q: 'Is the ESIGN compliance legally sufficient?',
        a: 'JobScout captures all fields required by the E-SIGN Act (intent, timestamp, IP, user agent, geo) and stores them with an immutable hash. Consult your attorney for jurisdiction-specific requirements.',
      },
    ],
    actions: {
      openPhotos: { route: null, label: 'Go to Job → Photos tab' },
      openSignatures: { route: null, label: 'Go to Job → Signatures tab' },
    },
  },
  lastVerified: '2026-06-11',
  freshUntil: 90,
}
