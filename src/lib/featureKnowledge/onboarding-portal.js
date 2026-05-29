// Knowledge Card — Employee Onboarding Portal
// Phone-first new-hire onboarding: W-4 → I-9 → direct deposit → handbook.

export default {
  id: 'onboarding-portal',
  title: 'Onboarding Portal',
  category: 'Payroll, HR & Onboarding',
  icon: 'UserPlus',
  route: '/employees',

  summary:
    "Admin clicks Send onboarding link → the new hire's phone walks them through W-4, state withholding, direct deposit, I-9 Section 1, handbook acknowledgment, and training videos. Mobile-first, magic-link auth, every signature ESIGN-compliant.",

  replaces: ['BambooHR onboarding', 'Gusto onboarding', 'Rippling', 'paper W-4/I-9 packets'],
  highlights: [
    '14-day magic link',
    'Per-step audit',
    'Phone-first',
    'ESIGN-compliant signatures',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'invite',   baseDur: 4500, narration: 'Admin clicks Send onboarding link. SMS lands on the new hire\'s phone with a magic URL.' },
      { id: 'w4',       baseDur: 6500, narration: 'They tap through W-4 questions on the phone. Filing status, allowances, extra withholding. Form fills itself.' },
      { id: 'i9',       baseDur: 6500, narration: 'I-9 Section 1 — citizenship, address, signature on glass. Section 2 deadline ticks onto your admin inbox.' },
      { id: 'deposit',  baseDur: 6500, narration: 'Direct deposit. Account and routing encrypted with pgcrypto. You only see last four.' },
      { id: 'handbook', baseDur: 6500, narration: 'Scroll the handbook, training videos at the end, finish. Signed PDFs land in the vault — W-4, I-9, deposit auth, handbook ack.' },
    ],
  },

  setup: {
    overview:
      'Onboarding is template-driven. Set your handbook, training videos, and policies once — every new hire walks the same flow. Admin only acts on Section 2 of the I-9 (physical ID inspection).',
    introBaseDur: 1200,
    introNarration: 'Set the template once. Every hire walks the same flow.',
    steps: [
      {
        icon: 'BookMarked',
        title: 'Upload handbook',
        body: 'Settings → Onboarding → Handbook PDF. Scroll-to-sign — new hires must scroll through before they can sign.',
        narration: 'Upload your handbook. Scroll-to-sign protects you.',
        baseDur: 5000,
      },
      {
        icon: 'PlayCircle',
        title: 'Drop in training videos',
        body: 'Loom or YouTube URLs in Settings. New hires watch as the final step. Acknowledgment recorded with completion timestamp.',
        narration: 'Drop in training videos. Acknowledgment auto-recorded.',
        baseDur: 5000,
      },
      {
        icon: 'Mail',
        title: 'Send the link',
        body: 'Employees → New Hire → Send Link. Magic URL via SMS + email. Valid 14 days.',
        narration: 'Send the link. Valid for 14 days.',
        baseDur: 4500,
      },
      {
        icon: 'AlertCircle',
        title: 'You only act on I-9 Section 2',
        body: 'New hire finishes Section 1 → deadline = hire date + 3 business days → payroll inbox task to inspect their ID in person.',
        narration: 'You only act on I-9 Section 2 — inspect the ID in person within three days.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "A phone-first new-hire portal that captures W-4, state withholding, I-9 Section 1, direct deposit, handbook acknowledgment, and training acknowledgment in one mobile flow. Magic-link auth (14-day expiry), every signature ESIGN-grade.",

    howItWorks:
      "Magic-link token in employee_onboarding_tokens (encrypted, 14-day expiry). Each step writes to a step-specific table (w4_records, i9_section1, direct_deposits, handbook_acks, training_acks). Signatures captured as PNG dataURLs + ESIGN audit fields (IP, UA, timestamp). Direct deposit pgcrypto-encrypted account + routing; only last 4 visible after capture. Bank routing validated via Plaid Auth. I-9 Section 2 deadline trigger writes payroll_inbox_tasks.",

    examples: [
      'Admin sends link → SMS arrives 30 seconds later → hire opens on phone',
      'Hire fills W-4 + I-9 + direct deposit + handbook + training in 18 minutes',
      'PDFs auto-generated → signed_documents vault: W-4-Marcus.pdf, I-9-Marcus.pdf, etc.',
    ],

    gotchas: [
      'Magic link expires at 14 days. Re-send if hire delays. Old link 410s.',
      'I-9 Section 2 deadline is automatic — admin must physically inspect ID within 3 business days of hire start.',
      'Handbook supersession — uploading a new version requires all current employees to re-acknowledge.',
    ],

    faqs: [
      {
        q: 'Can a 1099 contractor use the same portal?',
        a: 'Yes — the portal detects classification and swaps W-4 for W-9 and adds the ICA step.',
      },
      {
        q: 'What if the new hire can\'t finish in one sitting?',
        a: 'Progress saves per step. They can resume from the same link any time within the 14 days.',
      },
    ],

    actions: {
      open: { route: '/employees', label: 'Open Employees' },
      send: { route: '/employees', label: 'Send Onboarding Link', hint: 'New Hire button' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
