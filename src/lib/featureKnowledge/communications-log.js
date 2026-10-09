// Knowledge Card — Communications Log
// Unified timeline of every email, SMS, signature, and invoice
// conversation tied to a customer or job.

export default {
  id: 'communications-log',
  title: 'Communications Log',
  category: 'Sales & CRM',
  icon: 'MessageSquare',
  route: '/communications',

  summary:
    'A unified timeline of every email, SMS, signature event, and invoice-conversation thread tied to the customer or job. No more "what did we tell them last week?"',

  replaces: ['HubSpot conversations', 'OpenPhone history', 'sticky-note CRM', "phone notepad"],
  highlights: [
    'Emails, SMS, signatures, invoice replies — one timeline',
    'Per-customer and per-job views',
    'Email open + click tracking',
    'Searchable across all comms',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'customer',  baseDur: 5500, narration: "Open a customer. Hit the Comms tab and you see every email and text you've exchanged." },
      { id: 'email',     baseDur: 6500, narration: 'Each row shows when it sent, when they opened it, and when they clicked — across every campaign.' },
      { id: 'sms',       baseDur: 5500, narration: 'Outbound SMS reminders and appointment confirmations land in the same feed.' },
      { id: 'reply',     baseDur: 6500, narration: "When a customer replies to an invoice email, the thread shows up here — no inbox-spelunking." },
      { id: 'search',    baseDur: 6500, narration: "Search across all communications by customer, date, or content. No more 'what did we tell them last week?'" },
    ],
  },

  setup: {
    overview:
      "Communications Log is automatic. Every email and SMS Job Scout sends gets logged. The only setup is wiring up Twilio for SMS and SendGrid for emails — and Job Scout does that for you when you connect those integrations.",
    introBaseDur: 1200,
    introNarration: "Almost no setup. Here's what to know.",
    steps: [
      {
        icon: 'Mail',
        title: 'Connect SendGrid (email)',
        body: "Settings → Integrations → SendGrid. Already done for most accounts; this enables email open tracking.",
        narration: 'Connect SendGrid in Settings, Integrations. Done for most accounts already.',
        baseDur: 5500,
      },
      {
        icon: 'MessageSquare',
        title: 'Connect Twilio (SMS)',
        body: "Settings → Integrations → Twilio. Drops your account SID and auth token in, picks your sending number.",
        narration: 'Connect Twilio for SMS. Settings, Integrations, Twilio.',
        baseDur: 5500,
      },
      {
        icon: 'BarChart3',
        title: 'Open + click tracking on by default',
        body: "Every email gets a tracking pixel and click-wrapped links. View the metrics on each row.",
        narration: 'Open and click tracking are on by default. Every email gets the pixel.',
        baseDur: 5500,
      },
      {
        icon: 'Search',
        title: 'Search anytime',
        body: "Top of the Communications page searches every message, sent and received. Filter by customer or type.",
        narration: 'Search at the top. Filter by customer or type.',
        baseDur: 5000,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Per-company log of text messages: the ones Job Scout sent, and the ones customers texted back. Renders as a timeline on the customer detail page (Comms tab) and as a standalone Communications page, where rows can also be logged by hand.",

    howItWorks:
      "Backed by communications_log (company_id, communication_id, direction, type, trigger, customer_id, employee_id, recipient, sent_date, status, response). Outbound rows are written by the send-sms Edge Function; inbound ones by inbound-sms, which Twilio posts an arriving text to. direction is 'in' or 'out'; recipient holds the other party's number whichever way it went; communication_id is Twilio's message id, which makes a webhook retry a no-op. An arriving text is matched to a customer, lead or employee by the last ten digits of the number and raises a notification for the rep who owns them.",

    examples: [
      "Owner asks 'when did we last talk to Smith?' → Comms tab shows the texts both ways, newest first",
      "Customer texts back 'can you come Thursday instead?' → it lands on their customer page and the rep gets a notification",
      "Setter logs in Monday → overnight replies are in the bell and on /communications",
    ],

    gotchas: [
      "Texts only. Emails are NOT logged here — nothing writes an email row, so an empty log does not mean nobody was emailed.",
      "Only messages that went through Job Scout. A text from someone's personal phone does not appear.",
      "Inbound needs the company's Twilio number pointed at the inbound-sms webhook, and US numbers need an approved A2P 10DLC campaign before carriers deliver anything at all.",
      "STOP, START and HELP are carrier keywords, not messages: they are recorded but raise no notification, and a STOP clears that customer's sms_consent.",
    ],

    faqs: [
      {
        q: 'Does this work with my Gmail / Outlook account directly?',
        a: 'No. This log is text messages, through your own Twilio number. Email is sent elsewhere in Job Scout and is not recorded here.',
      },
    ],

    actions: {
      open: { route: '/communications', label: 'Open Communications' },
    },
  },

  lastVerified: '2026-05-29',
  freshUntil: 90,
}
