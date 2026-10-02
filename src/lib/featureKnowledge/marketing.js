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
    "Step 1 of the Sales Flow: be found. Crews share job photos from Field Scout, the AI drafts a post in the company's own voice, someone approves it, and the publisher sends it to every connected network at once. The brand kit starts from the company's EOS answers and the AI learns from what gets approved and how drafts get edited.",

  replaces: ['Hootsuite', 'Buffer', 'Later', 'a marketing agency retainer', 'the owner posting at 10pm'],
  highlights: [
    'Setup walkthrough on the page itself: brand, channels, first post',
    'Brand kit derived from EOS core values, focus and marketing strategy',
    'Field Scout "Share to Marketing" on job photos, and "Snap for Marketing" at the top of the day view for the truck, the crew, anything',
    'AI drafts from photos + a note; approve, schedule or publish',
    'One publisher key covers Facebook, Instagram, Google Business, LinkedIn, X and more',
  ],

  marketing: {
    voice: 'Bill',
    scenes: [
      { id: 'hero',    baseDur: 2800, narration: '' },
      { id: 'setup',   baseDur: 6000, narration: 'Marketing opens with three steps right on the page. Brand and messaging, connect your social accounts, publish your first post. No hunting through Settings.' },
      { id: 'brand',   baseDur: 6000, narration: 'Start from EOS. Core values, core focus and marketing strategy become the brand kit. Fix anything that sounds wrong; the AI writes in this voice.' },
      { id: 'inbox',   baseDur: 6000, narration: 'A tech taps Share to Marketing on a job photo in Field Scout. It lands in the inbox with their note.' },
      { id: 'draft',   baseDur: 6500, narration: 'Pick the photo, say what happened, Draft with AI. The caption comes back in your voice. Edit it, and the next draft learns from the edit.' },
      { id: 'publish', baseDur: 5500, narration: 'Approve, then publish now or schedule. the publisher posts it to every connected network at once.' },
    ],
  },

  setup: {
    overview:
      "The walkthrough is on the Marketing page: fill the brand kit from EOS, tap Connect on each network and sign in, then draft and publish one post. A Manager or above connects accounts and publishes; anyone can share photos and draft.",
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
        body: 'Channels tab → tap Connect on Facebook, Instagram, Google Business or LinkedIn → sign in to that network in the popup → it shows as connected. No other account to create; JobScout runs the publisher (Upload-Post) behind the scenes and makes the company its own profile on first Connect. Manager+ only.',
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
      "Marketing page at /marketing, step 1 of the Sales Flow. Tabs: Queue (posts by status), Inbox (marketing_captures, photos waiting), Brand (settings.marketing_brand_kit), Channels (settings.marketing_publisher + linked accounts), Email (link to Conrad Connect). A setup walkthrough card sits at the top until brand + channels + first post are done.",

    howItWorks:
      "Field Scout's photo picker has a third button, Share to Marketing: uploads a COPY to the public marketing-media bucket and inserts a marketing_captures row (status new, job_id, employee_id, note). The Marketing page's Inbox lists those. New post opens the composer: pick up to 5 captures, write a note, Draft with AI → edge function marketing-draft (reads brand kit, EOS keys, the last 20 approved captions and 10 edit pairs from marketing_posts, sends the photos to Claude by URL) → caption + hashtags. Save draft / Approve write marketing_posts; ai_draft keeps the AI's first version beside the caption. Publish → edge function marketing-publish (action publish) → Upload-Post upload_photos / upload_text with photo URLs and optional scheduled_date → row becomes posted or scheduled, captures become used. Manager+ (access level 2) is required to save the key, publish, or unschedule; the gate is in the function, next to the key.",

    examples: [
      "Tech finishes a highbay swap → taps Share to Marketing on the after photo, types 'done in a day' → owner opens Marketing, Inbox shows it, Make a post → Draft with AI → approves → Publish now → Facebook + Google Business + Instagram.",
      "Owner edits 'We're thrilled to announce' to 'Lights on, bill down.' → the next draft stops opening with announcements.",
      "Scheduled for Saturday 9am → Upload-Post holds it; Unschedule brings it back as approved.",
    ],

    gotchas: [
      "Nothing publishes without a human approval. Field techs can share photos and draft; only Manager+ can publish. That is deliberate: field photos carry customer property, faces and addresses.",
      "The publisher is Upload-Post, but the tenant never sees it: JobScout holds one Upload-Post key (secret UPLOAD_POST_API_KEY, Professional plan $50/mo for 25 tenant profiles), makes each company its own Upload-Post profile (jobscout-<company_id>) on its first Connect, and the Connect buttons open Upload-Post's hosted connect page in a popup filtered to that one network; the network's own sign-in runs there. Manage reopens the same page to reconnect or remove. A network that is not connected shows as 'Not connected' and publish refuses it.",
      "If Connect says 'Social publishing is not switched on for this JobScout install yet', the server secret UPLOAD_POST_API_KEY is missing. marketing_posts.ayrshare_id keeps its old name but holds Upload-Post's job_id or request_id.",
      "The brand kit is derived from EOS but lives in its own settings key (marketing_brand_kit). Editing EOS later does not change it; press Fill blanks from EOS to pull new answers into empty fields only.",
      "Style learning is example-based, not fine-tuning: the drafter reads approved captions and ai_draft-vs-caption edit pairs. Archive a bad post and it stops being an example.",
      "marketing-media is a PUBLIC bucket because the publisher fetches media by URL. A capture is a copy the tech chose to share; private job photos stay in project-documents.",
      "Post by hand: on an approved or failed post, copies the caption + hashtags, saves the photo, and after the person posts it in the network's own app, Mark as posted flips it to posted with no ayrshare_id (that combination reads 'by hand' on the card). It keeps the queue and the learning examples true when no publisher is connected yet.",
      "Text-in (Inbox tab card): techs text a photo + a line to the company's Twilio number and marketing-textin files it in the inbox (source 'text') and tells the managers. Switch on text-in sets the number's SMS webhook via Twilio's API using the company's own credentials from Settings → Integrations; the sender must match an employee's phone or the photo is refused with a reply saying so.",
      "Drafts write themselves: marketing-suggest runs daily at 7:30 Mountain (pg_cron) and on Suggest posts now. It drafts one post per unused inbox photo group and per job finished in the last ~26h that has photos, marks them Suggested in the queue, and notifies managers once a day. A suggested draft's photos stay PRIVATE (project-documents) until a human publishes; only then are copies made in marketing-media.",
      "Brands (Brand tab → Brands card): one company can market several things with different voices and accounts. HHH runs three: HHH Building Services (unit HHH Building Services), Energy Scout (unit Energy Scout) and JobScout (no unit). A brand switcher appears at the top of the page once there are two or more; Brand, Channels and Queue follow the selected brand; the composer has a Posting as picker. Brand-scoped settings are the base key plus ':<brand id>' (marketing_brand_kit:energy-scout); each brand is its own Upload-Post profile (jobscout-<company>-<brand>). The nightly suggester drafts a job under the brand whose business unit it belongs to and leaves unmatched photos for a person to place. Saving the first named brands moves the existing default setup onto the first brand in the list.",
      "Pages: a Facebook login can reach several Pages and a LinkedIn login several company pages (HHH's reaches 3 and 2). The Channels tab shows 'Facebook posts go to' / 'LinkedIn posts go to' pickers whenever there is more than one; publish REFUSES that network until a page is chosen, and sends facebook_page_id / target_linkedin_page_id explicitly. The vendor's account record shows the login's name (a person), not the page — that is normal.",
      "Video: Field Scout's Snap and the page's Upload take video. The browser pulls a poster and up to 4 stills (src/lib/videoFrames.js) at upload; the drafter reads the stills; the queue shows the poster with a play badge; publish uses the vendor's video endpoint (TikTok public, Instagram Reels, Facebook VIDEO, YouTube public) and reports 'still uploading' until the networks have it. A texted video has no stills, so the drafter goes by the note. 50 MB cap per file.",
      "Calendar tab: the month with every post on the day it went out, is due, or was written; a per-brand target (posts a week, brand kit cadence_per_week) and a this-week line; tap an empty day to start a post scheduled 9am that day. Performance tab: per-post views/likes/comments/shares from the vendor's cached analytics, keyed by native post id; posts by hand have no numbers. Website & listings card and Google Ads card live on Channels (brand kit links / ads); live Ads spend waits on Google's developer token.",
      "Camera first: Take photo / Record video buttons (file inputs with capture=environment, which opens the phone camera directly) sit on the Inbox tab, inside the composer (shoot straight into the post) and on Field Scout's Snap card (Photo / Video / library). Upload remains for library picks.",
      "Library tab: everything ever shot or written, filed by the system — brand, then Videos / Photos / Scripts, then month — with tags nobody typed (job service, business unit, who shot it, how it arrived, used/unused, clip length) and search across notes, jobs, captions and names. Select photos → Make a post; Reuse on a script opens the composer with that caption. Items with no brand (no job, no post yet) show under every brand until filed from the tile.",
      "Phone videos: the storage cap is 500 MB (raised from 50 on 2026-09-29). Anything over 6 MB goes up in 6 MB resumable chunks (src/lib/resumableUpload.js) with a progress bar on the Inbox tab, a percentage on the composer's Take photo tile and on Field Scout's snap buttons; a dropped connection resumes from the last chunk rather than starting over. Small photos still use the plain upload.",
      "On a phone, Marketing opens on the capture screen: back arrow, brand chips, Take a photo / Record a video / From my phone's library, an optional note that rides with the next thing sent, a Sent today strip, and one link to 'Posts, queue & settings' (managers) or 'See the queue'. The full page (tabs, queue, walkthrough) is what desktop opens on and what that link reveals; its header carries a back arrow on mobile that returns to the capture screen. Bryce: let the marketer deal with the posts.",
      "Marketing tools are Manager-and-above. A tech (any device) only ever sees the capture screen: shoot, what you've sent (with Waiting / In a post / Posted status and a link to the live post), and Find us online (the brand's Facebook Page, Instagram, TikTok, LinkedIn, Google listing, website — built from the connected accounts and the brand kit's links). Managers get a Marketing tools grid under that (Queue with the waiting count, Calendar, Library, Performance, Brand, Channels), each a tap straight into that tab; on a phone the full page's tabs wrap so none scroll off-screen.",
      "First real publish (2026-09-30) taught three things, all fixed: a double tap published HHH's post twice on every network (posts now lock to status 'publishing' while the vendor is called); three photo URLs became one photo (photos are now downloaded and sent as files, up to 10, 1 for Google Business); Facebook showed no caption (Facebook reads facebook_title, now sent along with description and instagram_title). A phone photo showed sideways (EXIF rotation is now baked into the pixels at upload, long edge capped at 2048). Async publishes return no links at first: sync_post asks the vendor's status endpoint by job_id; the page asks 8 s and 30 s after publishing and the queue card has Get links.",
      "Performance numbers come from two vendor endpoints. Per-NETWORK (live, what the tab leads with): GET /api/analytics/<profile>?platforms=…&page_id=<fb page>&page_urn=<linkedin org> → followers, reach, views/impressions, likes, comments, profile views, 30-day daily reach series; Google Business reports nothing. Per-POST: the vendor's snapshot cache (/post-analytics/cached) stays EMPTY for days after a post and the live per-post call returns the record without metrics, so per-post rows read '–' at first and fill in over the first days. 'No performance data' two days after the first post was exactly that.",
      "Every wait in Marketing is the hiking scout (src/components/ScoutLoader.jsx, the storefront's /scout-walk.gif): page opening, a file going up (with the percentage and a bar), the AI writing, saving, publishing (full-screen with the networks named), the library and the networks loading, and Field Scout's marketing snap. Bryce: all indicators should be the little scout hiking.",
      "iPhone videos first went up with a duration but no stills (metadata loads, but a seek before the first decoded frame never fires and the canvas paints black). The extractor now waits for loadeddata, plays muted for a beat, seeks, waits for a frame callback, and rejects black frames. Videos already missing a poster get one made on the next page open from their public URL (backfillVideoPosters, three per open, any device that can decode the clip); until then tiles show the browser's own frame via <video preload=metadata #t=1> instead of a glyph.",
      "One video per post. Every network takes a single video (Instagram can carousel photos+videos, but Facebook, LinkedIn, TikTok cannot), so a post with several videos sends ONE: primary_capture_id, which the composer shows as 'This one' and the drafter picks as the best match for the caption ('AI pick', best_capture_id). The composer warns in amber, lets you tap another, or 'Split into N posts' (one draft per video, same caption, the original archived). Publish marks only the sent capture used and puts the others back in the inbox. HHH post #8 (5 videos picked, 1 posted) was repaired by hand: capture 15 kept, four returned to the inbox.",
      "Video format: Reel (Instagram Reel + Facebook Reel, default), Video post (Facebook feed video; Instagram still a Reel), Story (24 h on both, no caption). Chosen in the composer; stored as video_format; the queue card shows it.",
      "Clip editor (src/lib/videoEdit.js + VideoEditor in the composer): 'Trim this clip' for one video, 'Cut them into one video' for several. Each clip keeps a start→end stretch, clips reorder, frame is vertical (Reels), square or landscape. 'Let the AI plan the cut' (marketing-draft mode plan_cut) orders the clips from their stills and the caption, keeps the stretch that shows something, drops repeats, under 45 s. Rendering is in the browser in real time (canvas captureStream + Web Audio + MediaRecorder; mp4 on Safari, webm elsewhere, the publisher transcodes), with the scout walking and a cancel; the result uploads as a new capture (source 'edited') and replaces the clips on the post. 90 s hard cap. Text overlays are not built; music and a narrator are, in the AI video maker.",
      "AI video (the Clapperboard tile in the composer, StoryboardMaker): the AI directs a short vertical ad from the selected photos/clips and a line — marketing-draft mode storyboard returns a headline, scenes (compare = before/after reveal of the same spot, photo with slow motion, clip stretch, text card) and a call to action; every scene's text and length is editable; renderStoryboard draws it in the browser with the brand's name/logo badge and colour cards and uploads the result as a capture (source 'generated') that replaces the selection on the post. Bryce's reference was an Instagram lighting ad: same room dark then lit, bold headline, brand card, Shop now. Sound (2026-10-02): a Music row — Auto (the mood the AI chose: calm, upbeat or bold), Calm, Upbeat, Bold, Your track (an audio file the company has the rights to), None, with a volume slider and Hear it. The three moods are synthesised in the browser by src/lib/musicBed.js (pad + bass, drums on upbeat/bold, OfflineAudioContext), so there is nothing to license. A Voiceover row — the AI writes a short script when it plans (storyboard.voiceover), editable, nine ElevenLabs voices (Bill is the house voice), Record & hear; marketing-voice makes the mp3 (eleven_flash_v2_5) into marketing-media/<co>/voice/. renderStoryboard mixes both into the recording: the voice starts 0.4 s in, music ducks to about a third under it and comes back after, fades out at the end; if the narration runs past the picture the closing card holds until it finishes. Clips keep their own sound, lowered to a quarter while the narrator talks. Voiceover needs ELEVENLABS_API_KEY (a real sk_ key) as a Supabase secret; without it the row says so and the music still works.",
      "Website & listings card: 'Use the company settings' pulls companies.website, the Google place (listing + review link) and settings google_review_url into the brand's links; 'Save these to company settings' pushes them back (website, place id parsed from the Maps URL, review URL). The card says whether they match.",
      "The Email tab is a link to Conrad Connect.",
    ],

    faqs: [
      { q: 'Where do I set up marketing?', a: 'On the Marketing page itself. The three-step walkthrough at the top stays until brand, channels and a first post are done. Nothing is in Settings.' },
      { q: 'Why does it say a platform is not connected?', a: 'That network has not been connected yet. Channels tab, tap Connect on it, sign in, close the popup.' },
      { q: 'Can a tech post directly?', a: 'No. Techs share photos and can draft; a Manager or above approves and publishes.' },
      { q: 'How does it learn my style?', a: 'Every approved caption and every edit you make to an AI draft is fed back as an example on the next draft. Delete or archive a post to remove it from the examples.' },
      { q: 'Does it post to Google Ads?', a: 'Not yet. Phase 1 is organic posts through the publisher. Google Business Profile posts are included; paid ads are a later phase.' },
    ],

    actions: {
      open:     { route: '/marketing', label: 'Open Marketing' },
      newPost:  { route: '/marketing', label: 'New post', hint: 'Top-right New post' },
      brand:    { route: '/marketing', label: 'Edit the brand kit', hint: 'Brand tab' },
      channels: { route: '/marketing', label: 'Connect social accounts', hint: 'Channels tab' },
    },
  },

  lastVerified: '2026-10-02',
  freshUntil: 90,
}
