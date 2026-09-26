# Sal The Solicitation Scout → Benny The Bid Builder — Build Plan

**Agent:** Sal The Solicitation Scout · slug `sal-scout` · route `/agents/sal` · under Marketing · price TBD (Freddy/Don shelf $39.99)
**Feature:** Sal finds legitimate solicitations for a tenant, a person chooses which to pursue, the chosen ones are dropped on **Benny the Bid Builder** (live, `/agents/benny`, slug `benny-bids`), and the finished bid is packeted, approved, and sent.
**Branch:** `feat/bid-finder` · **Worktree:** `C:\JobScout\js-bid-wt` (on `origin/main` at `1b845bef`, "The bid builder is Benny, not Dougie")
**Written:** 2026-09-25, revised 2026-09-26 for Benny · **Author:** Claude (Fable 5.1) for Bryce

---

## 0. Read this first

Three facts found while researching that change the shape of the build:

1. **The builder is live: Benny.** Commits `87a59947` (2026-09-25) and `1b845bef` (2026-09-26, the rename from Dougie) put Benny the Bid Builder on main: `benny-bid-intake` reads an ITB/RFQ PDF, matches every schedule item to the tenant's catalog (exact / equivalent / must-source), prices must-source items from the web with the supplier page on the line, writes the bid through the estimate-intake contract, and `send-estimate` refuses to send a bid with an unverified sourced price. `quotes.bid_intake`, `lib/bidSchedule.js`, `lib/bidPdf.js`, `_shared/sourcedPricing.ts`, the `BidIntakeCard`, and the `/agents/benny` workspace (one tab, "Bid Packages") are live. Dougie stays the handwritten-takeoff reader inside Lenard. **This plan builds everything to the LEFT of Benny (finding, scoring, choosing, fetching the package, dropping it on him) and everything to the RIGHT of him (the packet, the approval, the send, the outcome).**
2. **Utah's state portal moved.** U3P left SciQuest/Jaggaer for Bonfire (Euna) in April 2025 (`utah.bonfirehub.com`). Phoenix moved to OpenGov Procurement the same month. Maricopa County is on BidNet Direct. Any list of "where to look" older than 18 months is wrong for both of HHH's home markets.
3. **No portal offers a public API and every portal's terms forbid scraping.** The one official API is SAM.gov. Everything else reaches us the way it reaches every other vendor: **email alerts by commodity code**, plus a few legitimate RSS feeds (Utah's Public Notice Website is RSS per public body). The design therefore rides on the inbound-email pipeline that already files feedback replies, not on a scraper. The Watchdog work is the reminder of what happens when a plan rests on a data source we don't actually have.

---

## 0.5 Does finding need AI? Yes, in three places

| Step | AI or code | Why |
|---|---|---|
| Reading a SAM.gov API row | Code | Structured JSON: NAICS, deadline, place, contacts, links. No model. |
| Reading a Bonfire / APP / OpenGov / BidNet / DemandStar / PlanHub alert email, a Public Notice page, a forwarded GC email | **AI** | Every portal words its alerts differently and changes them without notice; the due time, the submission method, the bond line, and the pre-bid meeting are prose. A regex per portal is the scraper problem in a different coat. One metered read per alert. |
| Dedupe, distance, expiry, set-aside eligibility, keyword and value prefilters | Code | Pure functions, unit-tested (`lib/bidFit.js`). |
| Fit score, reasons, blockers, effort | **AI** | "Is a 240-fixture gym retrofit for a district 40 miles out worth this contractor's week" is judgment over the profile and the notice. Roughly a cent per opportunity. |
| Requirements checklist from the package | **AI** | Already Benny's kind of read; a third pass on the same document. |
| Choosing, approving, sending | People and code | Never the model. |

So it is an agent: recruited, named, metered on its own ledger line, with a knowledge card Arnie can read.

## 1. What it is, in one picture

```
 SOURCES                    FINDER (new)                          BUILDER (exists)            SUBMIT (new)
 ─────────                  ────────────                          ────────────────            ────────────
 SAM.gov API ──┐            ingest → normalize → dedupe            Benny reads the             packet = bid PDF
 Bonfire alert ─┤ email     → prefilter (deterministic)            package, matches            + cover letter
 APP alert ─────┤ to        → fit score (AI, metered)              the catalog, prices,        + quals + certs
 OpenGov alert ─┤ bids+     → Bid Board (person CHOOSES)           writes the bid              + filled forms
 BidNet alert ──┤ token@    → lead + calendar dates                (quotes.bid_intake)         + signature
 DemandStar ────┤ appsannex → fetch package (API / link /          → sourced prices            → checklist gate
 PlanHub ITB ───┤           upload)                                 redlined until             → approver signs off
 BC ITB ────────┘                                                   verified                   → email leg sent
 Utah PMN RSS ──── rss                                                                          for you / portal
 Google Alerts ─── rss                                                                          packet handed over
 paste a link ──── manual                                                                      → delivery tracked
                                                                                               → outcome → learning
```

Who it is for: any tenant that answers public or GC solicitations. At HHH that is lighting retrofits (agency and GC bid packages) and janitorial contracts (school districts, counties, property managers). The demo tenant (company 25) gets a seeded feed so the storefront can show it.

What it replaces: a person checking six portals every morning, a spreadsheet of due dates, and a 9 pm scramble to assemble a packet that is missing the W-9.

---

## 2. Non-negotiables

| Rule | Why |
|---|---|
| **No scraping. Official APIs, email alerts, RSS, and files a person uploads.** | Every portal's terms forbid automated access. An account ban would take the tenant's own bidding ability with it, not just ours. |
| **A person chooses, and a person authorizes the send.** | A bid is a binding offer. The agent proposes and prepares; a Manager or above ticks "I reviewed this bid and authorize submission", and that click is in `audit_log`. This is the same propose → approve rail Arnie already uses. |
| **The LLM never sets a price.** | Benny's rule, kept: catalog prices come from `products_services`, sourced prices land redlined, `send-estimate` refuses an unverified one. The finder's AI only scores fit and drafts prose. |
| **Every opportunity carries its source and a URL.** | `bid_opportunities.source_kind`, `source_ref`, `url`, `raw`. Nothing appears from nowhere; a person can always open the original. |
| **Set-aside and license eligibility are hard blocks, not warnings.** | Bidding an SDVOSB set-aside you don't hold, or a job needing a license class you don't carry, is a wasted week at best and a false certification at worst. |
| **Deadlines are stored with the buyer's time zone and shown with a margin.** | A 2:00 PM MST due time read as UTC is a missed bid. `due_at timestamptz` + `due_tz`, and the board shows "due in 2d 4h" not a date. Follow the calendar-day rule (`lib/localDate.js`) everywhere a date is displayed. |
| **`company_id` on every row, RLS on every table, from the first migration.** | Same as Don. Tables ship RLS-on. |
| **All AI through `_shared/anthropic.ts` with a `FEATURE_AGENTS` entry.** | Metering into `ai_usage` + `compute_ledger`; `benny-bid-intake` already maps to `benny`. The finder's features (`bid-parse`, `bid-fit`) map to the finder's slug; `bid-requirements` and `bid-cover-letter` run on Benny's bid and map to `benny`. Each agent's cost is its own ledger line. |
| **One intake contract.** | The bid is written by `benny-bid-intake` through `_shared/estimateIntakeRest`. This plan adds no second `quotes + quote_lines` writer. |
| **The email leg sends from a JWT-identified function, never `send-email`.** | `send-email` accepts the anon key and takes `from`, `to`, and attachments from the body: it is an open relay. A new `bid-submit` function resolves the caller like `dougie-bid-intake` does (`/auth/v1/user` + roster check). |

---

## 3. Sources — what is real, and how each one reaches us

The honest table. "Legit path" is the only column that matters for the build.

| Source | Covers | Legit path in | Cost | Package fetch | Submit method |
|---|---|---|---|---|---|
| **SAM.gov Get Opportunities API v2** | All federal. `ptype`, `state`, `ncode` (NAICS), `postedFrom/To` (required, ≤ 1 yr), `rdlfrom/rdlto`, `limit` ≤ 1000. Returns `noticeId`, `solicitationNumber`, `type`, `naicsCode`, `setAside`, `responseDeadLine`, `placeOfPerformance`, `pointOfContact[]`, `description` (a URL, second call), `resourceLinks[]` (attachments), award data. | Poll (cron). **Rate limit is the design constraint:** a personal key gets ~10 calls/day, an entity-registered key ~1,000/day. | Free. Appsannex should register in SAM as an entity (UEI) for the 1,000/day key; fallback is a per-tenant key field. | `resourceLinks` downloaded with the key into storage. Description fetched lazily, only for shortlisted rows. | Almost always **email to the contracting officer** (`pointOfContact`), signed SF-1449 / SF-33 + price schedule. This is the leg we can automate end-to-end. |
| **Utah U3P on Bonfire** (`utah.bonfirehub.com`) | State of Utah, DFCM, Salt Lake County, Salt Lake City, most Utah cities, districts, UTA. | Vendor registers, picks commodity codes, gets **email alerts**. Tenant sets the alert address to their JobScout bid address. | Free. | Docs are behind the vendor login: the person downloads and uploads. Public portal pages are readable if the alert links to a public project page (fetch text, no login). | Electronic response **in the portal**. We hand over a packet; the person uploads. |
| **Arizona Procurement Portal (APP, `app.az.gov`)** | State of Arizona agencies. | Register, commodity codes, email alerts. | Free. | Behind login → upload. | Portal. |
| **City of Phoenix on OpenGov** (`procurement.opengov.com/portal/phoenix`) and other OpenGov cities | Phoenix and hundreds of cities nationally. | Subscribe by category, email alerts. | Free. | OpenGov project pages are public: fetchable. | Portal only. |
| **Maricopa County + BidNet Direct** (Arizona and Utah Purchasing Groups) | Maricopa County, University of Utah, many counties and districts in both states. | Free "Limited Access" account → email alerts. | Free (paid tiers add regions). | Behind login → upload. | Portal (EBS) or as the notice says. |
| **DemandStar** | Small cities, districts, special districts. | Free account → email alerts by commodity. | Free (paid tiers add regions). | Behind login → upload. | Portal or email/mail as the notice says. |
| **Utah Public Notice Website** (`utah.gov/pmn`) | Every Utah public body is legally required to post there, including invitations to bid. | **RSS per body** (and email, and iCal). The agent subscribes to the bodies inside the tenant's service area. | Free. | Notice pages are public: fetchable, often with the bid PDF attached. | As the notice says. |
| **PlanHub** | Regional GC invitations to bid. | Free sub account → ITB emails. | Free basic. | Plan room behind login → upload. | Upload in PlanHub or reply to the GC's estimator by email. |
| **BuildingConnected** (Autodesk) | National GC invitations. | Free account → ITB emails. Bid Board Pro (paid) has an API (3-legged OAuth, `GET opportunities`) → Phase 4 connector. | Free; API needs Bid Board Pro. | Plan room → upload. | Submit in BC or email the estimator. |
| **Dodge / ConstructConnect** | Pre-bid project intelligence. | Paid subscribers get a REST API (Dodge) → Phase 4 connector. | $200+/mo. | n/a (leads, not packages). | n/a. |
| **Google Alerts** (RSS) | "invitation to bid" + trade + county, catches agencies that post only on their own site. | RSS. | Free. | Public page. | As the notice says. |
| **Paste a link / forward an email / upload a PDF** | Anything else: a GC's email, a property manager's RFP. | Manual, on the board. | Free. | Upload. | As the notice says. |

Trade-ally lists (Wattsmart, SRP, APS) are lead sources, not solicitation feeds; they stay in the storefront copy, not in this build.

**The email-first design in one sentence:** each tenant gets `bids+<signed company token>@appsannex.com`; they paste it into every portal's notification settings (or forward alerts to it with a mail rule), and from then on the agent owns the feed without touching any portal.

---

## 4. Data model

New tables, all `company_id` + RLS, written by the migration in Phase 1. Each follows the template in `20260911150000_job_diagnoses.sql:46-63`: `tenant_isolation` for all to authenticated via `current_user_company_ids()`, **plus the three restrictive `require_writable_*` policies on `company_can_write(company_id)`** so the trial read-only gate covers them. No column guards are needed (nothing here is pay or privilege), but `bid_profiles` writes are Manager+ in the edge functions, matching `guard_company_settings`.

### 4.1 `bid_profiles` — one row per company (what "a fit" means)

| Column | Notes |
|---|---|
| `service_lines jsonb` | `[{ label, naics: ['238210'], commodity_codes: ['285-xx'], keywords: [...], exclusions: [...] }]` |
| `service_area jsonb` | `{ home: {lat,lng}, radius_km, states: ['UT','AZ'], counties: [...] }`. Home comes from `companies` address the same way `homeFor` does on the geocode cron; stored here so it is not recomputed. |
| `value_min, value_max numeric` | Job size band. |
| `set_asides text[]` | Certifications actually held: `sb`, `wosb`, `sdvosb`, `8a`, `hubzone`, `dbe`. Anything else is a hard block. |
| `licenses jsonb` | `[{ state, type, number, limit, expires }]`. `companies.license_number` holds one; contractors carry several. |
| `bonding jsonb` | `{ single_limit, aggregate_limit, surety_agent: {name,email,phone} }`. `companies.bonded` / `bond_amount` already exist; this adds the agent and the limits. |
| `federal jsonb` | `{ uei, cage, sam_expires }`. **Neither UEI nor CAGE exists anywhere in the schema today**; `companies.duns_number` and `naics_code` do. |
| `capability_statement text` | The "about us" paragraph every cover letter and qualification page reuses. |
| `past_performance jsonb` | `[{ project, buyer, value, year, contact }]` |
| `key_personnel jsonb` | `[{ employee_id, title, years }]` |
| `signer_employee_id`, `signer_signature_path` | Who signs bids (Manager+) and their drawn signature PNG, captured once with the existing `SignatureModal` and stored under `project-documents/signatures/company-{id}/`. `signed_documents` cannot hold it (employee-only, fixed `document_kind` list) and `document_approvals` is the customer's side. |
| `thresholds jsonb` | `{ auto_dismiss_below: 30, notify_at: 70, due_margin_hours: 24 }` |
| `learned jsonb` | Aggregated from dismissals and outcomes (section 6.9). |
| `bid_email_token text` | The plus-address capability. Rotatable. |

### 4.2 `bid_sources` — the feeds a company has switched on

`kind` (`sam` | `email` | `rss` | `manual` | `buildingconnected` | `dodge`), `label`, `config jsonb` (SAM: states + NAICS; RSS: feed URL + body name; BC: OAuth refresh token), `enabled`, `last_polled_at`, `last_item_at`, `health` (`ok` | `stale` | `error`), `error_text`. The "Sources" tab renders this table so a tenant can see that Bonfire has gone quiet for two weeks (usually meaning their registration lapsed).

### 4.3 `bid_opportunities` — one row per solicitation

| Group | Columns |
|---|---|
| Identity | `source_id`, `source_kind`, `source_ref` (noticeId, email id, RSS guid), `dedupe_hash` (unique with `company_id`), `url` |
| What | `title`, `buyer`, `buyer_level` (`federal` `state` `county` `city` `district` `utility` `gc` `private`), `solicitation_number`, `notice_type` (`ifb` `rfp` `rfq` `itb` `sources_sought` `presolicitation` `amendment` `award`), `summary`, `naics text[]`, `commodity_codes text[]`, `set_aside`, `estimated_value_low/high` |
| Where | `place jsonb` (address, city, state, zip), `latitude`, `longitude`, `distance_km` |
| When | `posted_at`, `due_at timestamptz`, `due_tz`, `questions_due_at`, `prebid_at`, `prebid_mandatory bool`, `amended_at` |
| Requirements | `requirements jsonb` (from the AI read: bond %, license, insurance, prevailing wage, page limits, copies, sealed, forms to sign, acknowledgements) |
| Submission | `submit_method` (`email` `portal` `mail` `sealed` `unknown`), `submit_to jsonb` (email / address / portal URL / contact) |
| Documents | `documents jsonb` `[{ name, url, storage_path, bytes, fetched_at }]` |
| Fit | `fit_score`, `fit_reasons jsonb`, `blockers jsonb`, `effort_estimate`, `scored_at`, `score_model` |
| Lifecycle | `status` (`new` `shortlisted` `dismissed` `chosen` `building` `ready` `submitted` `won` `lost` `no_award` `expired`), `dismissed_reason`, `dismissed_by`, `chosen_by`, `chosen_at`, `lead_id`, `quote_id`, `submission_id` |
| Raw | `raw jsonb` (the API row or the email as received) |

An amendment matches by `solicitation_number` and updates the row (new `due_at`, new documents), raising a notification if the row is `chosen` or later. That is the difference between "we missed the addendum" and not.

### 4.4 `bid_submissions` — what went out, how, and what happened

`opportunity_id`, `quote_id`, `method` (`email` `portal` `mail` `buildingconnected` `planhub`), `packet jsonb` `[{ kind, file_name, storage_path, bytes }]`, `cover_letter text`, `checklist jsonb` `[{ item, required, done, done_by, waived_reason }]`, `approved_by`, `approved_at`, `approval_text` (the exact sentence they ticked), `signed_document_id`, `sent_to`, `sent_at`, `email_id` (Resend), `delivery_status`, `bounce_reason`, `confirmation jsonb` (portal receipt: screenshot path, confirmation number, uploaded_by), `status` (`draft` `approved` `sent` `delivered` `bounced` `confirmed` `withdrawn`), `outcome` (`won` `lost` `no_award` `unknown`), `award_amount`, `low_bid_amount`, `outcome_notes`, `outcome_at`.

One live submission per opportunity (partial unique index on `opportunity_id where status not in ('withdrawn')`).

### 4.5 The certificate library already exists on `companies`

The packet needs the same six files every time: COI, W-9, business license, contractor license, bonding letter, workers' comp certificate. Migration `20260306140000` already put them on `companies`: `insurance_cert_url`, `workers_comp_cert_url`, `w9_url`, `business_license_url`, `bond_cert_url`, `tax_exempt_cert_url`, `operating_agreement_url`, uploaded from `Settings.jsx:1109-1130` into `project-documents/{co}/docs/`, with `insurance_expiration` and `workers_comp_expiration` beside them. **No new table.** The checklist reads these columns and expiry dates; the Profile tab links to the Settings uploader rather than growing a second one. Those columns are behind `guard_company_identity` (Admin only), which is right: the bid agent reads them, never writes them.

### 4.6 What is NOT new

- The bid itself is a `quotes` row with `document_type = 'bid'` and `bid_intake`, lines in `quote_lines` with `bid_item_no` / `price_source`. Unchanged.
- The package PDF rides on `file_attachments` with `photo_context = 'bid_package'`. Unchanged. The packet we send is filed the same way with `photo_context = 'bid_packet'`.
- The lead is a normal `leads` row: `lead_source = 'Bid Finder'`, `source_system = 'bid_finder'`, `source_id = opportunity id`, status `New`. The pipeline needs nothing new to show it.
- Calendar rows are normal `appointments` (no recurrence): due date, pre-bid, questions deadline, each `job_id null`, `appointment_type = 'Bid Deadline'`. **Inserted directly, never through `bookAppointment.js` or `arnieAppointment.ts`**: both set the lead to "Appointment Set" and create setter and lead-source commissions. The $75 setter fee is also a database trigger on `appointments` since 2026-09-22 (`setter_fee_for_appointment`), but it returns early when `setter_id` is null, so a deadline row inserted with no `setter_id` writes no fee; the test suite asserts that. Two renderers need the new type excluded too: `eosMetrics.js` `isSetMeeting` counts every non-Job/Block type as a set meeting, and `companyCalendar.js:162-179` paints every such row as a sales appointment.

---

## 5. The pipeline, stage by stage

### 5.1 Ingest

| Path | Mechanism | Notes |
|---|---|---|
| **SAM.gov** | `api/cron/bid-sam-poll.js`, daily at 06:10 UTC. One call per (state) with `postedFrom = yesterday`, `limit 1000`, `ptype` = `o,k,p,r,s` (solicitation, combined synopsis, presolicitation, sources sought, special notice). Rows fan out to every tenant whose `bid_sources` SAM config includes that state; NAICS filtering happens in-app so one call serves every tenant. | With a personal key (10/day) that is ≤ 5 states. With an entity key (1,000/day) it can also poll `rdlfrom` for deadline changes and fetch descriptions for shortlisted rows. **Bryce: register Appsannex in SAM.** |
| **Email alerts** | `inbound-email` gets a new `recipientKind` `bids` (a fourth branch in `_shared/inboundWebhook.ts:111-118`) and a new token namespace `bids:<company_id>` in `_shared/replyToken.ts`. The handler stores the mail on `bid_inbox` (subject, from, text, html, attachments) and calls `bid-ingest-email`. | Attachments are **not read today**; the Resend receiving API exposes them and the handler must fetch them into storage. A `bid_inbox` row that fails to parse stays visible on the Inbox tab so nothing silently disappears. |
| **RSS** | `api/cron/bid-rss-poll.js` every 2 h: Utah PMN bodies, Google Alerts feeds, any agency feed a tenant pastes in. GUID is the `source_ref`. | Feed items link to a public page; the page text is fetched (no login) and handed to the same parser as email. |
| **Manual** | "Add an opportunity" on the board: paste a URL, forward an email, or upload a PDF. | The same parser. |

### 5.2 Parse and normalize (`bid-ingest-email` edge function, feature `bid-parse`)

One AI pass, Haiku-class model, per email or page: "is this one or more solicitations? for each, give title, buyer, number, type, due date **with time zone**, place, submit method, submit-to, document links, set-aside, bond/license mentions". Output is validated against the column shapes; anything missing stays null rather than invented. Direct file links (`.pdf`, `.docx`) get fetched into storage if they are public; login-walled links are recorded as `{url, fetched_at: null}` so the board can say "download from Bonfire and drop it here".

`dedupe_hash = sha1(normalize(solicitation_number) || normalize(buyer + title + due date))`. An existing row is updated, not duplicated; a changed `due_at` or a new document on a chosen row raises `company_notifications` + `employee_notifications` for the chooser.

### 5.3 Score (`bid-score`, feature `bid-fit`)

Two layers, in this order, so the model is only asked about rows worth asking about:

1. **Deterministic prefilter** (`src/lib/bidFit.js`, pure, unit-tested, shared with the edge function the way `sourcedPricing` has a browser twin):
   - expired or due inside `due_margin_hours` → `expired`
   - state not in `service_area.states`, or `distance_km > radius` when the place geocodes → score 0, reason "outside area"
   - set-aside not held → **blocker**
   - NAICS / commodity / keyword hit → +, exclusion hit → 0
   - value band → ±
2. **AI fit** on what survives: profile + opportunity text → `{ score 0-100, reasons[], blockers[], effort: 'small'|'medium'|'large', go_no_go, why }`. About a cent a row. The model never sees a price and never sets one.

Thresholds from the profile: below `auto_dismiss_below` the row is `dismissed` with reason `auto` (still on the board under a filter, never deleted); at or above `notify_at` the chooser gets a notification. Every dismissal a person makes carries a reason from a fixed list (`too_far`, `too_small`, `too_big`, `wrong_trade`, `bond`, `license`, `no_time`, `other`) and the reason feeds `learned` (5.9).

### 5.4 The Bid Board (the choosing surface)

Route `/agents/sal` (Sal's workspace, under Marketing), mobile first (44 px targets, `minmax(0,1fr)` tracks, verified at 375 px with `scripts/ui-test-user.cjs`). Tabs: **Board**, **Inbox** (raw alerts and parse failures), **Sources**, **Profile** (the settings tab, no gear).

Card: title · buyer + level badge · **due in 2d 4h** (red under 3 days, grey when expired) · value band · fit score chip that expands to the reasons and blockers · source badge · document count ("3 docs, 1 needs download"). Actions on every card: **Shortlist**, **Dismiss** (reason picker), **Choose**. Filters: status, due window, score floor, source, level.

**Choose** does, in one transaction through a new `bid-choose` edge function (JWT identity, Manager+ or the profile's allowed roles):
1. `leads` insert (`lead_source 'Bid Finder'`, `source_system`, `source_id`, contact from `submit_to` / `pointOfContact`, address from `place`) — party-sync triggers fill the rest.
2. `appointments` for `due_at` (minus margin), `prebid_at`, `questions_due_at`, type `Bid Deadline`, assigned to the chooser; direct insert (see 4.6), no recurrence.
3. `bid_opportunities.status = 'chosen'`, `lead_id`, `chosen_by`, `chosen_at`.
4. Kick off the package fetch (5.5). If every document is already in storage, kick off the build (5.6) immediately.

### 5.5 Package fetch

| Situation | What happens |
|---|---|
| SAM `resourceLinks` | Downloaded with the API key into `project-documents/bids/{companyId}/opps/{oppId}/`. |
| Public link (OpenGov, PMN, agency site) | Fetched server-side, content-type checked, stored. |
| Login-walled (Bonfire, APP, BidNet, DemandStar, PlanHub, BC) | The opportunity shows **"Download the package from <portal> and drop it here"** with the portal link. The upload uses the existing `BidIntakeCard` path. The agent nudges once a day until the documents are in or the due date is inside the margin. |
| Excel / Word bid forms | Not readable by Benny today (PDF and images only). Phase 4 adds SheetJS on the client for `.xlsx` bid schedules. Until then the card says so and asks for the PDF. |

The agent never logs in anywhere. That is the line.

### 5.6 Drop it on Benny (existing) — with three small additions

This is the handoff the whole feature exists for. Today Benny is fed by a person on `/agents/benny` picking a lead or customer and choosing a file; `BidIntakeCard` uploads to `project-documents/bids/{companyId}/…` and POSTs `benny-bid-intake` with `{ company_id, mode: 'create', storage_path, storage_bucket, file_name, media_type, lead_id | customer_id, salesperson_id?, business_unit?, service_type? }` under the user's JWT. The finder does the same thing without the person: on **Choose**, once the package is in storage (5.5), `bid-choose` calls `benny-bid-intake` with the lead it just created, the package's storage path, and the chooser's identity, and Benny builds the bid exactly as if the file had been dropped on his page. The opportunity card then shows "Benny built it: 9 lines, 2 to verify" and links to the estimate. Additions to Benny:

1. **Several documents in one read.** Packages arrive as bid form + specifications + addenda. The function takes `storage_paths[]` and sends them as several document blocks in the READ pass (30 MB cap stays, per file).
2. **A requirements pass.** A third read, prompt: "list every submission requirement as a checklist item: forms to sign (with page), bond and %, acknowledgements, references count, insurance limits, license, W-9, page limits, copies, sealed/labelled, delivery method". Output lands on `bid_opportunities.requirements` and seeds `bid_submissions.checklist`. This is the compliance matrix the GovCon tools sell; here it is one more metered call.
3. **`quotes.bid_opportunity_id`** so the estimate page can show the opportunity card and the board can show the bid's readiness ("3 to verify").
4. **Sal is his own agent, under Marketing.** Bryce, 2026-09-26: finding projects to bid on is marketing, so he lives like Freddy and Frankie do, recruited from Settings → AI Agents, and sits under Marketing the way Lenard sits under Estimates. Benny keeps his one tab; Sal's workspace (`/agents/sal`) carries the board, Inbox, Sources, and Profile tabs from 5.4. Rows: an `agents` row (`sal-scout`, name `Sal`, title `Solicitation Scout`, full name `Sal The Solicitation Scout`, `trade_category 'all'`, icon `Radar`, price), an `ai_modules` row with `default_menu_section 'SALES_FLOW'` and `default_menu_parent 'Marketing'` (Conrad's migration `20260220200000` is the template; Benny's row uses `'Estimates'` the same way), a `company_agents` row for the demo tenant, a `featureKnowledge` card, and a `featureCatalog` entry. The hand-off to Benny is a server-side call from Sal's `bid-choose` (above); the user never leaves Sal's page to start the build, and Benny's page shows what arrived.

Everything else (catalog match, web sourcing, redlines, the send gate) is unchanged.

### 5.7 Packet assembly (`bid-packet`, server side)

The packet is the set of files the buyer asked for, in the order they asked for them:

| Piece | Source | Built by |
|---|---|---|
| Bid schedule / bid form | `lib/bidPdf.js` (exists, client-side) | Rendered in the browser on the estimate page and uploaded, as the estimate PDF already is. |
| Buyer's fillable forms (SF-1449, bid form, non-collusion affidavit, acknowledgement of addenda) | The package | `lib/pdfFormFiller.js` (`fillPdfForm`, `fillPdfFormWithImages`, pdf-lib, exists) with a field map the requirements pass produced; the signer's PNG stamped by `attachmentSignatureFiller.js` `stampSignatureOnPdf` (exists); flattened. `document_templates` + `documentGenerator.js` already do this for our own templates; `buildDataContext` needs a `company` key. Non-fillable scans stay a human step and the checklist says which page. |
| Transmittal / cover letter | AI draft (feature `bid-cover-letter`) from the profile's capability statement, the opportunity, and the bid total; editable on the page. | New `lib/bidPacketPdf.js` (jsPDF). There is **no shared branding header**: eight renderers each draw their own. This one lifts the logo/business-unit header out of `estimatePdf.js:33-101` into a helper both use, rather than becoming the ninth copy. |
| Qualification statement | Profile: capability statement, past performance, key personnel, licenses, bonding, insurance, plus `companies.legal_name / entity_type / state_of_incorporation / ein / naics_code`. | Same renderer. |
| Certificates | `companies.*_url` columns (4.5) | Copied as-is; `insurance_expiration` / `workers_comp_expiration` checked against `due_at`. |
| Bid bond | Cannot be issued by us. If `requirements.bond_pct > 0` the checklist item "Bid bond" opens a prefilled email to the surety agent in the profile (project, obligee, amount, due date) and the tenant drops the bond PDF in when it arrives. Surety2000 / Tinubu e-bonds are the agent's tools, not ours. | Human. |
| Combined packet | One merged PDF **and** the individual files, because Bonfire wants separate uploads and a contracting officer wants one attachment. | The utility submittal package already does exactly this: `JobDetail.jsx:3098` builds a manifest from `doc_package_items` and `:3352-3420` merges with pdf-lib, `pdfPages.js` picks pages. Extract that merge into `lib/pdfPackage.js` and call it from both. |

### 5.8 Approve and submit (`bid-submit`)

The send button is enabled only when all of these are true, and the reasons are listed on the page when they are not:

1. `sendGate` passes (no unverified sourced price) — exists.
2. Every `required` checklist item is `done` or `waived` with a reason.
3. Every certificate in the packet is unexpired at `due_at`.
4. No `blockers` on the opportunity (set-aside, license).
5. `due_at` is in the future. Inside the margin the button turns red and says so; it still works, because a person may be racing the clock on purpose.
6. The approver is Manager+ and ticks the exact sentence: *"I have reviewed this bid, its prices and its attachments, and I authorize its submission on behalf of <company>."* Stored on `bid_submissions.approval_text`, `approved_by`, `approved_at`, mirrored to `audit_log`.

Then, by `submit_method`:

| Method | What the agent does | What the person does |
|---|---|---|
| **email** (SAM contracting officers, GC estimators, many small agencies) | Sends from `bids@appsannex.com` with the tenant's display name, `reply_to` = the tenant's bid address so the buyer's reply files onto the opportunity, the packet attached (Resend's 40 MB cap checked; over it, the combined PDF is replaced by a signed link and the checklist says so), the approver and the signer in CC. `email_id` stored; `resend-webhook` already writes `email_events`, and a new branch maps `delivered` / `bounced` onto `bid_submissions`. **A bounce raises an immediate notification** because the deadline has not moved. | Nothing. This is the automated leg. |
| **portal** (Bonfire, APP, OpenGov, BidNet, DemandStar, PlanHub, BC) | Marks the submission `approved`, shows the packet as a download-all plus each file, the portal URL, and the checklist's upload order. Reminds at 24 h and 4 h before due until a confirmation is recorded. | Uploads in the portal, then records the confirmation number or a screenshot on the submission. Bonfire and Jaggaer send no confirmation email; the checklist says to call the buyer contact to confirm receipt. |
| **mail / sealed** | Prints a label sheet (buyer address, solicitation number, "SEALED BID — DO NOT OPEN" as the notice words it), computes the ship-by date. | Prints, seals, ships, records the tracking number. |

`bid-submit` resolves the caller from the JWT and checks the roster, like `benny-bid-intake`. It does not accept `from`, `to`, or attachments from the body; it reads them from the submission row.

### 5.9 Track, close out, learn

- After `due_at`: `submitted` rows get a weekly nudge to record the outcome. SAM award notices arrive through the same poll (`ptype a`, matched on `solicitationNumber`) and set `outcome` automatically with `award_amount` and the awardee.
- `learned` on the profile aggregates: dismissal reasons by keyword and buyer, win rate by buyer level and value band, the tenant's typical margin versus the low bid where it is known. The prefilter reads `learned.exclusions`; the AI fit prompt gets `learned.summary` as one paragraph. Nothing in `learned` changes a price.
- Dashboard tile on the agent's home: open opportunities, due this week, submitted, win rate, dollars awarded, cost of AI per opportunity from the compute ledger.

---

## 6. Where it plugs into what exists

| Existing piece | How this build uses it | Change needed |
|---|---|---|
| `inbound-email` + `_shared/inboundWebhook.ts` + `_shared/replyToken.ts` | The bid address | New `recipientKind` `bids`, new token namespace, attachment fetch from the Resend receiving API |
| `resend-webhook` → `email_events` | Delivery of the email leg | Map events onto `bid_submissions` by `email_id` |
| `_shared/anthropic.ts` + `computeConfig.ts` | All AI calls | `FEATURE_AGENTS`: `bid-parse`, `bid-fit` → `sal`; `bid-requirements`, `bid-cover-letter` → `benny` |
| `benny-bid-intake` + `BidIntakeCard` | The build | `storage_paths[]`, `opportunity_id`, requirements pass; `bid-choose` calls it server-side |
| `BennyWorkspace.jsx` / `AgentRequired` / `AgentHeader` | Sal's workspace copies this shape | New `SalWorkspace.jsx` with Board, Inbox, Sources, Profile tabs; routes in `App.jsx` beside Benny's |
| `agents`, `ai_modules`, `company_agents` | Recruit + sidebar under Marketing | New rows (`SALES_FLOW` / `Marketing`) |
| `_shared/estimateIntakeRest.ts` | Writing the bid | None |
| `_shared/sourcedPricing.ts` + `send-estimate` gate | Price verification | None (the gate is reused, not the send) |
| `lib/bidPdf.js`, `lib/bidSchedule.js`, `BidSchedule.jsx`, `BennyBids.jsx` | The bid document | Show the opportunity card on the bid; readiness counts on the board |
| `arnie_proposals` rail (`arnieCreate.ts`) | Pattern for choose/approve | Not reused directly: `bid-choose` and `bid-submit` are their own functions with the same shape (JWT identity, `minLevel`, `audit_log`) |
| `leads`, `appointments`, party-sync triggers | The chosen opportunity becomes pipeline work | None; `lead_source` value `Bid Finder` added to the `lead_sources` setting on first choose |
| `employee_notifications`, `company_notifications` | Nudges and alerts | `MyNotifications` is only mounted in FieldScout today; the Board shows its own notification list |
| `api/cron/*` + `vercel.json` | Polling | Two new crons (`bid-sam-poll`, `bid-rss-poll`) with the `CRON_SECRET` bearer check |
| `pdfFormFiller.js`, `attachmentSignatureFiller.js`, the submittal-package merge in `JobDetail.jsx`, `SignatureModal.jsx` | Form fill, signature capture and stamp, merge | Extract the merge into a lib; the packet builds in the browser like every other PDF here, then uploads |
| `companies` qualification + certificate columns (`20260306140000`) | The packet's certificates and legal identity | None; add UEI/CAGE on `bid_profiles` |
| `SalesPipeline.jsx` `getSourceStyle` (2225) + settings `lead_sources` | The source badge on the card | One colour case for `Bid Finder` |
| `eosMetrics.js` `isSetMeeting`, `companyCalendar.js` | Deadline appointments must not count as set meetings or render as sales visits | Exclude `Bid Deadline` |
| `agents` + `company_agents` + `featureCatalog.js` + `featureKnowledge/*.js` | Recruit, nav, storefront, Arnie | New agent row, knowledge card, catalog entry |
| `homeFor` (`api/_lib/geocodeAddress.js`) | The tenant's home point | Called once when the profile is created; stored |
| `scripts/seed-demo.mjs` | Demo tenant | Seed a dozen opportunities across sources and statuses for company 25 |

---

## 7. Legal and risk register

| Risk | Handling |
|---|---|
| Portal terms forbid automated access | No logins, no scraping, ever. Feeds are email, RSS, SAM API, and files a person uploads. Written into the knowledge card so Arnie says it too. |
| An AI-drafted bid is still the contractor's representation (False Claims Act exposure on federal work) | The approval sentence, the redline gate, the requirements checklist, and the human upload for portals. The cover letter and qualification text are editable and the approver sees the final PDFs, not a summary. |
| Bidding a set-aside the tenant does not hold | Hard block from `set_asides`. |
| Prevailing wage / Davis-Bacon on federal and some state work | The requirements pass flags it as a blocker-class item; the checklist item says "confirm labor rates include DB wage determination" and cannot be waived silently. |
| Missed deadline from a time-zone error | `due_at` + `due_tz` stored from the read; the board shows countdowns; margin reminders at 24 h and 4 h; a bounce is a red alert. |
| Bid bonds | Not issued by us; surety-agent email template; checklist blocks the send until the bond PDF is attached when required. |
| SAM.gov rate limit | Platform key strategy (entity registration) and lazy description/attachment fetches. Polls are logged to `bid_sources.health`. |
| `send-email` open relay | Not used for bids. `bid-submit` is JWT-identified and reads recipients from the row. (Fixing `send-email` itself is a separate ticket; it is a real hole.) |
| Deliverability to government mail servers | Existing appsannex SPF/DKIM via Resend; the approver is CC'd so the tenant has their own copy; bounces alert. |
| Duplicate submissions | One live submission per opportunity; a second send requires withdrawing the first with a reason. |
| The bid address token leaks | It is a capability, not a secret of consequence: the worst case is junk on the Inbox tab. Rotatable from the Sources tab. |
| Test data in company 3 | Rehearse in company 20 / 25 only; the seed script targets 25. |
| A bid quote promotes a setter's commission | Inserting any `quotes` row fires `quotes_promote_setter_commissions`. Bid Finder leads carry no setter, so nothing promotes; a bid built on a setter's existing lead does, and that is correct. |
| Existing holes touched in passing | `send-estimate`, `generate-proposal-layout`, `ai-extract-pdf`, `lenard-capture-signature` check no caller; `dougie-analyze` / `dougie-corrections` file every tenant's corrections under `LENARD_COMPANY_ID`; the intake writers default a lead to `'Estimate Sent'` which the pipeline never fetches (`'Quote Sent'` is the status). None block this build; all are tickets. |

---

## 8. Phases and effort

| Phase | Scope | Effort | Done when |
|---|---|---|---|
| **0 · Prerequisites** — DONE 2026-09-26 (live: demo tenant alert → inbox row + PDF in storage + notification) | `FEATURE_AGENTS` entries; `agents` row + catalog + knowledge card stub; inbound attachment fetch; `bids+` route and token; Appsannex SAM entity registration (Bryce, business step) or per-tenant key field | 2–3 days | An alert forwarded to the bid address lands on the Inbox tab with its attachment in storage |
| **1 · Finder** | `bid_profiles`, `bid_sources`, `bid_opportunities` migration (RLS on); Profile tab; SAM poll; email + RSS ingest and parser; `lib/bidFit.js` prefilter + AI fit; Board with Shortlist / Dismiss / Choose; lead + calendar on choose; notifications | 1.5–2 weeks | HHH's real Bonfire, APP, BidNet and SAM alerts flow in, score, and a chosen one shows on the pipeline with its dates on the calendar |
| **2 · Builder bridge** | Package fetch (SAM links, public links, upload prompt); multi-document + requirements pass in `benny-bid-intake`; `bid-choose` drops the package on Benny; `quotes.bid_opportunity_id`; cover letter + qualification renderers; `bid-packet` (form fill, signature, merge); checklist UI | 1–1.5 weeks | A chosen SAM opportunity becomes a redlined bid, then a complete packet, with no retyping |
| **3 · Submit + learn** | `bid_submissions`; `bid-submit` email leg with delivery tracking and bounce alerts; portal packet + confirmation + reminders; mail/sealed label sheet; outcome recording + SAM award matching; `learned`; dashboard tile; knowledge card final; Arnie eval cases; demo seed | 1 week | A federal RFQ is sent by email from the app, its delivery is confirmed on the page, and the award notice closes it out |
| **4 · Later** | BuildingConnected Bid Board Pro connector (3LO OAuth); Dodge API connector; `.xlsx` bid forms; PlanHub; per-buyer submission memory ("Ogden wants two copies") | as pulled | — |

Roughly four to five weeks of build for Phases 0–3 on the existing stack, sequential. Phase 1 alone is useful on its own and is where the "is this worth it" measurement happens (section 9).

---

## 9. Tests and proof

- **Money-suite additions** (`vitest`, run by the guard and `npm run ship`): `bidFit.test.js` (prefilter cases: outside area, set-aside block, exclusion hit, due inside margin, value band), `bidDedupe.test.js` (same solicitation from SAM and email collapses; an amendment updates), `bidChecklist.test.js` (send gate: required item undone, expired COI, blocker present, past due), `bidDates.test.js` (a "2:00 PM MST" due time round-trips through `due_at`/`due_tz` and the calendar-day rule).
- **Parser fixtures**: one real alert each from Bonfire, APP, OpenGov, BidNet, DemandStar, PlanHub, BuildingConnected, a SAM API row, a PMN RSS item, in `supabase/functions/_shared/fixtures/bids/`. The parser test asserts the normalized columns, not the prose.
- **`schema:check`** passes with the new filter columns; migrations pushed with `supabase db push --linked`, policies wrapped in `DO $$ … duplicate_object … $$`. **It skips empty tables**, so the demo seed runs before the check or the new tables go unchecked.
- **`npm run ship` does not run vitest.** Run `npm run check` (guard + tests) before every ship of this branch. The guard's `no-undef` rule knows only browser globals: tests that touch `Buffer` or `process` fail it.
- **Rehearsal**: company 25 (demo) for the seed and the storefront; company 20 for a live alert round-trip. Never company 3 until HHH switches it on for real.
- **Live proof** (per the verify-live rule): a throwaway SAM opportunity chosen on the demo tenant, built, packet assembled, sent to a mailbox we control, delivery event seen on the submission row.
- **Arnie eval** (`npm run arnie:eval`): three conversations — "what bids are due this week", "why did you dismiss the Ogden one", "send the SMC bid" (must refuse: Arnie proposes, the approver clicks).

---

## 10. What to measure (Phase 1 decides whether Phases 2–3 are worth it)

| Metric | Where |
|---|---|
| Opportunities ingested per week, per source | `bid_sources` + `bid_opportunities` |
| Share auto-dismissed vs person-dismissed vs shortlisted vs chosen | board stats |
| Median hours from ingest to choose, and from choose to packet ready | timestamps |
| Bids submitted, win rate, dollars awarded | `bid_submissions` |
| AI cost per opportunity and per submitted bid | `compute_ledger` |

If HHH chooses fewer than one in fifty and submits fewer than one a month after four weeks, the finder is a feed reader and Phases 2–3 wait.

---

## 11. Decisions for Bryce

1. **Decided 2026-09-26: a separate, named agent under Marketing, and the name is Sal.** *Sal The Solicitation Scout*, slug `sal-scout`, route `/agents/sal`. Finding needs AI (section 0.5), so he is an agent in the house style, recruited like Freddy and Frankie, parented under Marketing. **Still open: price.** Benny is free; Sal carries the running cost (polls, parsing, scoring, roughly a cent per opportunity), so $39.99/mo like Freddy and Don is the natural shelf.
2. **SAM key.** Register Appsannex as a SAM entity (UEI) for the 1,000/day platform key, or ask each tenant for their own key (10/day, enough for one state). Recommendation: **register Appsannex**; tenants bidding federally already have their own UEI and the profile records it.
3. **Auto-send.** This plan never sends without an approver's click. If you want a "send at approval" mode for email-method bids that pass every gate, that is one flag, but I would not ship it in Phase 3.
4. **Launch states.** UT and AZ (HHH's markets) for the RSS body lists and the demo seed; SAM and email alerts are national from day one.
5. **Which HHH portals to register first.** Bonfire (U3P), APP, BidNet (Maricopa + Utah groups), DemandStar, OpenGov (Phoenix), SAM. All free. Someone at HHH does the registrations and points the alerts at the bid address; the plan cannot do that step.

---

## 12. Sources consulted

- SAM.gov Get Opportunities Public API: https://open.gsa.gov/api/get-opportunities-public-api/ (parameters, response fields, 1-year date window); rate limits per key role: https://api.sam.gov/docs/rate-limits/
- U3P moved to Bonfire, April 2025: https://dfcm.utah.gov/dfcm-is-moving-to-a-new-utah-public-procurement-place-platform and https://utah.bonfirehub.com/portal/?tab=openOpportunities
- Utah Public Notice Website subscriptions (RSS per body): https://www.utah.gov/pmn/help.html
- Arizona Procurement Portal supplier notifications and electronic submission: https://spo.az.gov/suppliers/how-do-business-state-arizona
- City of Phoenix on OpenGov Procurement (April 2025): https://www.phoenix.gov/administration/departments/finance/procurement.html
- Maricopa County vendor registration on BidNet Direct: https://www.maricopa.gov/634/Doing-BusinessVendor-Registration
- BidNet Direct electronic bid submission: https://faq.bidnetdirect.com/electronic-bid-submission/
- DemandStar notifications and tiers: https://network.demandstar.com/business-support/
- PlanHub subcontractor bidding: https://planhub.com/subcontractors/
- BuildingConnected API field guide (3LO auth, Bid Board opportunities): https://aps.autodesk.com/en/docs/buildingconnected/v2/developers_guide/field_guide/buildingconnected/
- Dodge Construction Network API: https://www.construction.com/apis/
- Federal quote submission by email on SF-1449: https://www.acquisition.gov/far/part-53
- AI in federal proposals, contractor remains responsible: https://natlawreview.com/article/navigating-federal-solicitations-artificial-intelligence
- Electronic bid bonds (Surety2000, Tinubu): https://www.surety2000.com/how-it-works
- SBA size standards (238210 $19M, 561720 $22M, proposed $58M): https://govcontoday.com/blog/size-standards-guide
