// Knowledge Card — Marketing
// Sourced from src/pages/Marketing.jsx, src/lib/marketing.js and the
// marketing-draft / marketing-publish edge functions. When those change,
// this card needs to follow.

export default {
  id: 'marketing',
  title: 'Marketing',
  category: 'Sales & CRM',
  icon: 'Megaphone',
  route: '/marketing',

  summary:
    "Step 1 of the Sales Flow: be found. Crews share job photos from Field Scout, the AI drafts a post in the company's own voice, someone approves it, and Ayrshare publishes it to every linked network at once. The brand kit starts from the company's EOS answers and the AI learns from what gets approved and how drafts get edited.",

  replaces: ['Hootsuite', 'Buffer', 'Later', 'a marketing agency retainer', 'the owner posting at 10pm'],
  highlights: [
    'Setup walkthrough on the page itself: brand, channels, first post',
    'Brand kit derived from EOS core values, focus and marketing strategy',
    'Field Scout "Share to Marketing" drops job photos into the inbox',
    'AI drafts from photos + a note; approve, schedule or publish',
    'One Ayrshare key covers Facebook, Instagram, Google Business, LinkedIn, X and more',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'hero',    baseDur: 2800, narration: '' },
      { id: 'setup',   baseDur: 6000, narration: 'Marketing opens with three steps right on the page. Brand and messaging, connect your social accounts, publish your first post. No hunting through Settings.' },
      { id: 'brand',   baseDur: 6000, narration: 'Start from EOS. Core values, core focus and marketing strategy become the brand kit. Fix anything that sounds wrong; the AI writes in this voice.' },
      { id: 'inbox',   baseDur: 6000, narration: 'A tech taps Share to Marketing on a job photo in Field Scout. It lands in the inbox with their note.' },
      { id: 'draft',   baseDur: 6500, narration: 'Pick the photo, say what happened, Draft with AI. The caption comes back in your voice. Edit it, and the next draft learns from the edit.' },
      { id: 'publish', baseDur: 5500, narration: 'Approve, then publish now or schedule. Ayrshare posts it to every linked network at once.' },
    ],
  },

  setup: {
    overview:
      "The walkthrough is on the Marketing page: fill the brand kit from EOS, paste an Ayrshare API key and link your networks there, then draft and publish one post. A Manager or above connects the key and publishes; anyone can share photos and draft.",
    introBaseDur: 1200,
    introNarration: 'Three steps, all on the page. Brand, channels, first post.',
    steps: [
      {
        icon: 'Palette',
        title: 'Brand & messaging',
        body: 'Brand tab → Start from EOS. Voice, audience, values, uniques, guarantee, say/never-say lists, house hashtags. Saved to settings key marketing_brand_kit. EOS only fills blanks; it never overwrites an edit.',
        narration: 'Brand tab. Start from EOS, then edit anything. The AI writes in this voice.',
        baseDur: 5500,
      },
      {
        icon: 'Link2',
        title: 'Connect social accounts',
        body: 'Channels tab → tap Connect on Facebook, Instagram, Google Business or LinkedIn → sign in to that network in the popup → it shows as connected. No other account to create; JobScout runs the publisher (Ayrshare) behind the scenes and makes the company its own profile on first Connect. Manager+ only.',
        narration: 'Tap Connect. Sign in to Facebook. Done. Same for the others.',
        baseDur: 6000,
      },
      {
        icon: 'Sparkles',
        title: 'First post',
        body: 'New post → pick inbox photos → note → Draft with AI → edit → Approve → Publish now or Schedule. Instagram needs a photo; X is 280 characters; Google Business takes no hashtags.',
        narration: 'Pick a photo, say what happened, draft, approve, publish.',
        baseDur: 5500,
      },
    ],
  },

  agentKnowledge: {
    whatItIs:
      "Marketing page at /marketing, step 1 of the Sales Flow. Tabs: Queue (posts by status), Inbox (marketing_captures, photos waiting), Brand (settings.marketing_brand_kit), Channels (settings.marketing_ayrshare + linked accounts), Email (link to Conrad Connect). A setup walkthrough card sits at the top until brand + channels + first post are done.",

    howItWorks:
      "Field Scout's photo picker has a third button, Share to Marketing: uploads a COPY to the public marketing-media bucket and inserts a marketing_captures row (status new, job_id, employee_id, note). The Marketing page's Inbox lists those. New post opens the composer: pick up to 5 captures, write a note, Draft with AI → edge function marketing-draft (reads brand kit, EOS keys, the last 20 approved captions and 10 edit pairs from marketing_posts, sends the photos to Claude by URL) → caption + hashtags. Save draft / Approve write marketing_posts; ai_draft keeps the AI's first version beside the caption. Publish → edge function marketing-publish (action publish) → Ayrshare POST /api/post with mediaUrls and optional scheduleDate → row becomes posted or scheduled, captures become used. Manager+ (access level 2) is required to save the key, publish, or unschedule; the gate is in the function, next to the key.",

    examples: [
      "Tech finishes a highbay swap → taps Share to Marketing on the after photo, types 'done in a day' → owner opens Marketing, Inbox shows it, Make a post → Draft with AI → approves → Publish now → Facebook + Google Business + Instagram.",
      "Owner edits 'We're thrilled to announce' to 'Lights on, bill down.' → the next draft stops opening with announcements.",
      "Scheduled for Saturday 9am → Ayrshare holds it; Unschedule brings it back as approved.",
    ],

    gotchas: [
      "Nothing publishes without a human approval. Field techs can share photos and draft; only Manager+ can publish. That is deliberate: field photos carry customer property, faces and addresses.",
      "The publisher is Ayrshare, but the tenant never sees it: JobScout holds one Business-plan key (secret AYRSHARE_API_KEY), makes each company an Ayrshare profile on its first Connect, and the Connect buttons open the network's own sign-in in a popup (Ayrshare link sessions, connect mode). 'Advanced' on the Channels tab still accepts a company's own Ayrshare key for a tenant that already has one. A network that is not connected shows as 'Not connected' and publish refuses it.",
      "If Connect says 'Social publishing is not switched on for this JobScout install yet', the server secret AYRSHARE_API_KEY is missing. X (Twitter) is offered only when AYRSHARE_X_OAUTH1_KEY/SECRET are set too.",
      "The brand kit is derived from EOS but lives in its own settings key (marketing_brand_kit). Editing EOS later does not change it; press Fill blanks from EOS to pull new answers into empty fields only.",
      "Style learning is example-based, not fine-tuning: the drafter reads approved captions and ai_draft-vs-caption edit pairs. Archive a bad post and it stops being an example.",
      "marketing-media is a PUBLIC bucket because Ayrshare fetches media by URL. A capture is a copy the tech chose to share; private job photos stay in project-documents.",
      "Google Ads, website analytics and inbound MMS are NOT built (phase 2+). The Email tab is a link to Conrad Connect.",
    ],

    faqs: [
      { q: 'Where do I set up marketing?', a: 'On the Marketing page itself. The three-step walkthrough at the top stays until brand, channels and a first post are done. Nothing is in Settings.' },
      { q: 'Why does it say a platform is not linked?', a: "The Ayrshare key is connected but that network has not been linked on Ayrshare's Social Accounts page. Link it there, then Refresh under Channels." },
      { q: 'Can a tech post directly?', a: 'No. Techs share photos and can draft; a Manager or above approves and publishes.' },
      { q: 'How does it learn my style?', a: 'Every approved caption and every edit you make to an AI draft is fed back as an example on the next draft. Delete or archive a post to remove it from the examples.' },
      { q: 'Does it post to Google Ads?', a: 'Not yet. Phase 1 is organic posts through Ayrshare. Google Business Profile posts are included; paid ads are a later phase.' },
    ],

    actions: {
      open:     { route: '/marketing', label: 'Open Marketing' },
      newPost:  { route: '/marketing', label: 'New post', hint: 'Top-right New post' },
      brand:    { route: '/marketing', label: 'Edit the brand kit', hint: 'Brand tab' },
      channels: { route: '/marketing', label: 'Connect social accounts', hint: 'Channels tab' },
    },
  },

  lastVerified: '2026-09-24',
  freshUntil: 90,
}
