// Knowledge Card — Document Rules & Packages
// Auto-attach docs (W-9, COI, MSDS, warranty) to quotes by trigger rules.

export default {
  id: 'document-rules',
  title: 'Document Rules',
  category: 'Operations',
  icon: 'FileStack',
  route: '/document-rules',

  summary:
    "Auto-attach the right paperwork to every quote — W-9 if it's a B2B, COI if the job site requires it, warranty sheet on every LED job, MSDS on chemical work. Set the rule once; it fires on every quote that matches.",

  replaces: ['Manual document attachment', 'Dropbox folder digs', 'forgetting the COI again'],
  highlights: [
    'Rule-based triggers',
    'Per-trigger doc package',
    'Signed-or-not tracking',
    'Customer + tech access',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'rule',    baseDur: 4500, narration: 'Three rules. B-two-B quotes need W-nine. Lighting jobs need warranty. School-district jobs need COI.' },
      { id: 'fire',    baseDur: 6500, narration: 'New quote for a school district. Rule fires automatically — COI attached. No reminder needed.' },
      { id: 'rule',    baseDur: 6500, narration: 'A package can hold multiple docs. The "Lighting Retrofit" package — DLC spec sheet, warranty, install instructions, rebate form.' },
      { id: 'fire',    baseDur: 6500, narration: 'Each attached doc tracks signature status. Three of four signed. The fourth — chase the customer.' },
      { id: 'rule',    baseDur: 5500, narration: 'Signed docs land in the vault. Auditable, searchable, downloadable. CPAs, regulators, lawyers all happy.' },
    ],
  },

  setup: {
    overview:
      "Build rules that match how your business actually runs. Each rule has a trigger (B2B, lighting, certain customer, certain region) and a doc package (one or more docs).",
    introBaseDur: 1200,
    introNarration: 'Build rules that match how your business runs.',
    steps: [
      {
        icon: 'FileText',
        title: 'Upload your standard docs',
        body: 'Settings → Documents → upload W-9, COI, warranty sheets, DLC specs, MSDS — every doc you ever attach.',
        narration: 'Upload your standard docs. W-9, COI, warranties.',
        baseDur: 5000,
      },
      {
        icon: 'FileStack',
        title: 'Build packages',
        body: 'Group related docs into a package. "Lighting Retrofit" = DLC + warranty + install + rebate. One name, multiple files.',
        narration: 'Group related docs into packages.',
        baseDur: 5000,
      },
      {
        icon: 'Filter',
        title: 'Create trigger rules',
        body: 'Settings → Document Rules → New. Trigger: "service_type = Lighting Retrofit" → Package: "Lighting Retrofit". Quote matches → auto-attach.',
        narration: 'Create trigger rules. Service type matches, doc auto-attaches.',
        baseDur: 5500,
      },
      {
        icon: 'PenLine',
        title: 'Customer signs in the portal',
        body: 'Attached docs surface in the customer portal. Sign one tap. Signature + IP + UA captured for the audit log.',
        narration: 'Customer signs in the portal. Audit log captured.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Rule-based document attachment engine. Every quote and job evaluates against your document_rules; matching rules attach the rule's document_package (one or more docs) to the record. Customers sign in the portal; signed_documents lands in the vault with ESIGN audit fields.",

    howItWorks:
      "document_rules table (trigger jsonb, package_id, company_id). document_packages table (package_id, name, document_ids[]). On quote/job create trigger, evaluator walks the rules and attaches matching packages. signed_documents holds the per-customer signed copies with IP, UA, timestamp. Customer portal renders unsigned docs at the top of their view.",

    examples: [
      'Rule: service_type=Lighting AND customer.type=Commercial → Package "Lighting Retrofit" → 4 docs auto-attached',
      'Rule: customer.requires_coi=true → Package "Insurance Certs" → COI + workers comp cert attached',
      'Rule: state=CA AND service_type=Solar → Package "CA Solar Package" → 6 California-required forms',
    ],

    gotchas: [
      'Multiple matching rules ALL apply (additive). Use rule priority + de-dup if you don\'t want both versions of a doc.',
      'Doc packages are versioned. Updating a package doesn\'t affect already-attached quotes — re-attach to upgrade.',
      'Customer portal won\'t let them sign unsigned docs until they\'re scrolled-to-end. ESIGN compliance.',
    ],

    faqs: [
      {
        q: 'Can I attach docs manually too?',
        a: 'Yes — Job/Quote → Documents → Add. Manual attachments coexist with rule-based.',
      },
      {
        q: 'What about doc expiration (COI, W-9)?',
        a: 'Each doc carries expires_at. Auto-attach skips expired docs and surfaces a "renew" task to admin.',
      },
    ],

    actions: {
      open: { route: '/document-rules', label: 'Open Document Rules' },
      settings: { route: '/settings#documents', label: 'Settings · Documents' },
    },
  },

  lastVerified: '2026-06-03',
  freshUntil: 90,
}
