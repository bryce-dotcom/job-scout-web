# Marketing page review — 2026-10-15

Scope: `src/pages/Marketing.jsx` (2,857 lines), the eight `marketing-*` edge functions, `_shared/marketing.ts`, the marketing tables and policies, plus the pieces a campaign feature would touch: Prospect Scout, Conrad, `send-sms` / `inbound-sms`, Resend email, and the Lead Setter board.

Three questions were asked: is it built safely, how could it be simpler, and how does Prospect Scout become a campaign tool that feeds the setters board without becoming Apollo.

---

## 1. Security

### Fixed and live today (commits c435fccf, 948142f4; migration 20261015130000)

| # | Finding | What was open | Fix |
|---|---------|---------------|-----|
| 1 | Cross-tenant file read through captures | Any employee can insert a `marketing_captures` row with any `bucket`/`path`. The drafter downloaded it with the service key and showed it to Claude; a manager's publish copied it into the public bucket. Any tenant's private job file. | `captureFileAllowed`: a capture may only point at `marketing-media/<company>/…` or a job photo that company attached (`file_attachments`). Checked in the drafter and the publish copy. |
| 2 | Nightly suggester ran for everyone on an unauthenticated call | The cron sent the public anon key and the function trusted the `role` claim it decoded, unverified. Anyone could make every tenant's drafts, paintings and digest emails, repeatedly. | pg_cron now sends a secret it reads from Vault (`marketing_internal_key`); the function compares it with the `MARKETING_INTERNAL_KEY` edge secret. The anon-key path returns 403. |
| 3 | Forged identity on `verify_jwt=false` functions | `marketing-textin` and `marketing-suggest` take a token the gateway never checked. A token with someone else's email became that employee (could repoint a tenant's Twilio webhook). | `resolveCaller(…, { verify: true })` asks Auth whether the token is real. Forged tokens get 401. |
| 4 | Service-role maintenance path trusted a string in the token | `isServiceRole` only decodes the role claim. | `isServiceCaller`: the runtime's own key, or a service JWT that PostgREST accepts (it checks the signature). Side finding: the runtime's service key is not the legacy JWT in `.env`, so plain `token === SERVICE_KEY` checks elsewhere (arnie-routines, sal-ingest, benny-bid-intake) never match a maintenance script. |
| 5 | A manager could drive another tenant's social accounts | `profile_username` from the settings row was used as-is; set it to `jobscout-<other>` and you post as them. | Only `jobscout-<co>` or `jobscout-<co>-…` is honoured; anything else is ignored and logged. (HHH's Building Services brand legitimately uses the bare `jobscout-3`, so this is a prefix rule, not a pin.) |
| 6 | Any employee could notify any colleague of anything | INSERT policy was company-only. | Below Manager, only `marketing_capture` (tech shares a photo) and `fleet_request_*` (driver files a repair) may be inserted. |
| 7 | Any employee could approve, mark posted, or rewrite an approved post | UPDATE policy was company-only; the Manager gate lived in the UI and the edge function. | `guard_marketing_posts` trigger: below Manager a post is a draft (or archived) and stays one; approval and posting columns cannot be set. |

Verification: six forged-caller requests (anon key, forged service role, wrong internal key, forged employee on suggest and textin, forged service role on publish) all refused; the real scheduler key and a genuine service JWT accepted; `SET ROLE` tests as the demo tech (blocked) and the demo admin (allowed), all rolled back.

### Reported, not fixed

- **Every employee can read every `settings` row**, including `twilio_config.auth_token` and the publisher config. The Marketing page loads settings wholesale. With the Twilio token an employee could forge inbound texts or use the account directly. Fix is to move secrets out of tenant-readable rows (a `company_secrets` table readable by edge functions only) and have the client load named keys.
- **Five other cron jobs** (collections-autopilot, frankie-daily-brief, health-check, crash-alert, payroll-deadline-reminders) still carry the anon JWT. Same Vault pattern applies; each function's own check needs the same look.
- **Other `verify_jwt=false` functions** that also answer signed-in people (zach-instant-quote, public-company-card, arnie-pair) were outside this scope.
- Vendor `post_urls[].postUrl` is rendered as an href from a column employees can edit (a `javascript:` URL would render). Media caps are checked before and recorded after the vendor call, so parallel requests slip past the cap together. The Twilio signature compare is not constant-time.

---

## 2. Making it simpler

The structure agent mapped the page and the journeys. Short version: the page does the right things, but says them in too many words, in too many places, with too many doors.

**Top ten, in order of payoff**

1. **Drop "Approve."** Only managers ever see the composer, so Approve is a second word for "ready to publish" addressed to nobody. Keep Save draft and Publish now / Schedule.
2. **Eight tabs to five.** Email is a tab that leaves the page (move it to nav). Fold Inbox into Library as its default "Unused" filter. Merge Brand + Channels into one Setup tab.
3. **One vocabulary for the three ways in**, everywhere: Take a photo / Record a video / Choose a file. Today the same three buttons have three names in three places.
4. **One video door.** "Edit video, music & voice" and "Make a video with AI" become Edit video and Make a video; "Directing…/Painting…" become Working…; the two-clip banner's "Cut them into one video" folds into the same button.
5. **Note above the buttons** on the phone capture screen, labelled "What is it? (optional)". First-timers shoot before they see it.
6. **One home for website, phone, logo, colour.** They live in the brand kit, in the links card and in company settings, with push/pull buttons between them. Read company settings directly.
7. **Delete the Google Ads card** until the API exists.
8. **Hide the sound extras** (Library, Your track, gain, the no-key Auto chip) behind one More toggle. Default is Compose / None.
9. **Format and Frame are the same choice** (Reel/Video post/Story vs Vertical/Square/Landscape). Ask once.
10. **Replace the three-column walkthrough card** with a Queue empty state, and make its hint match the real network list.

**Structural:** the file should split into `src/pages/marketing/` (every tab already takes `theme`, `isMobile`, `invoke` as props); the modal shell is hand-built six times; mm:ss formatting and the reorder arrows are written twice; the quota status is fetched in four places. Correctness nits worth a small ticket: a `Field` component defined inside a render (drops typing on re-render), `load()` has no error path, the tab badge and the "Needs attention" filter disagree about failed posts, no Escape/focus handling on any sheet, and the tab strip wraps to three rows at 375px.

---

## 3. Prospect Scout in Marketing: campaigns that feed the setters board

### What exists today

- **Prospect Scout** (`prospect-research` function, drawer opened from Lead Setter and the Liahona map) searches with Claude + web search, enriches a pick, and **imports straight into `leads`** with `external_prospect_id`, enrichment data and a salesperson. Metered per company (free 3/10, pro 50/200).
- **Lead Setter board**: New → Contacted → Callback → Appointment Set. Booking writes the appointment, flips the lead, and the setter fee trigger pays the setter.
- **Texting**: `send-sms` sends through Twilio with no consent check, rate limit or quiet hours; `inbound-sms` matches the sender to a customer/lead/employee and notifies the salesperson or managers. Consent exists on customers only (`sms_consent`); leads have no consent field.
- **Email**: everything goes out through Resend from `*@appsannex.com`; replies come back through `reply+<token>@`; opens and clicks land in `email_events`. There is **no unsubscribe list, no List-Unsubscribe header, no footer helper**.
- **Conrad** is a Constant Contact integration (not SendGrid; its knowledge card is wrong about that). Segments and manual audiences fall through to "all"; automations only run from a button; its send function has no auth check. It is a separate world from the rest of the app.

### Why Apollo is confusing, and what to keep out

Apollo makes you learn six objects (contacts, accounts, lists, sequences, plays, workflows) before you can send one email. The JobScout version has **one object, a Campaign**, and three screens that read like a sentence: *find these people → send them this → they land on the board.*

### The shape

**Find** (Prospect Scout, moved into Marketing as the first tab)
- One box: "Who do you want?" in plain words. Results are cards with the why-it-matches line Prospect Scout already writes.
- Tick the ones you like → one button: **Add to a campaign**. (Importing to leads is what happens underneath; nothing to learn.)
- Audiences besides prospects, picked from a short list, no filter builder: *leads by status*, *customers by last job older than N months*, *everyone from a job type*.

**Campaign** (one card, no branching)
- Name, brand, audience.
- Touches, at most four, each one line: **Day 0 email · Day 3 text · Day 7 call**. The AI writes the email and the text from the brand kit the way the post drafter does; you edit in place. A call touch is not sent; it makes a card on the board.
- One switch: **Stop when they reply.** On by default.
- Start / Pause. That is the whole screen.

**Board** (Lead Setter, unchanged)
- A reply or a click moves the lead to Contacted and notifies its setter; a call touch creates a Callback card with the campaign's suggested script; booking and setter fees work exactly as today.
- Prospect Scout's `imported_as_lead_id` already links a prospect to its lead, so results roll back up to the campaign.

### What has to be built underneath (the part that cannot be skipped)

- **Consent and law before the first send.** Cold *texts* to prospects need prior written consent; the campaign engine must only send a text touch to a contact with `sms_consent` (add `leads.sms_consent`, set when a prospect replies START or opts in on a form). Prospects get email and call touches. Every campaign email needs an unsubscribe link and a List-Unsubscribe header, a physical address footer, and an `email_suppressions` table that every sender checks. Quiet hours and a per-company daily send cap in the engine, not left to callers.
- **Tables:** `marketing_campaigns` (company, brand, name, audience, touches, status, stats), `campaign_members` (lead or customer, touch index, next due, state: queued / sent / replied / stopped / bounced / unsubscribed), `campaign_events` (sent / opened / clicked / replied / unsubscribed).
- **Engine:** a `campaign-tick` cron every 15 minutes sends what is due (through Resend and `send-sms`, with the proofs above). `inbound-sms` and `inbound-email` already identify the sender; they gain one step: mark the member replied, flip the lead, notify the setter.
- **Performance** joins the existing Performance tab: sent / replied / booked per campaign, next to post performance.

### Order of work

1. **Week one:** Find tab in Marketing (the existing drawer, re-homed), Add to a campaign, email-only campaigns with suppression + unsubscribe, replies to the board.
2. **Week two:** text touches for opted-in contacts with quiet hours and the daily cap; call touches as board cards; Stop-on-reply.
3. **Then:** campaign numbers in Performance; decide whether Conrad stays as a newsletter tool or retires.

Small Prospect Scout fixes found on the way: the address-research cache writes `source='ai_address'`, which the table's CHECK constraint rejects, and the error is swallowed (the cache never fills); its knowledge card names the wrong usage table and hash scheme.

---

## 4. Decisions for Bryce

- Move Twilio and publisher secrets out of tenant-readable settings (recommended; a day's work).
- Apply the Vault cron pattern to the other five jobs (half a day).
- Approve the campaign shape above, especially: prospects get email and calls, texts only with consent.
- Connect the JobScout brand's Facebook page under an account that admins it, and rotate the keys that were pasted in chat.
