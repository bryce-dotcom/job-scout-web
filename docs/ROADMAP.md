# JobScout — Up-Market Roadmap

The short, honest list of things the enterprise field-service suites (ServiceTitan, Salesforce)
have that JobScout doesn't **yet**. Everything else on the ops + back-office + AI front, JobScout
already matches or beats. None of these are architectural rebuilds — each is an integration plus a
surface on the existing stack (Supabase + per-tenant Stripe + Twilio + edge functions + RLS).

Priority order = fastest revenue impact first.

---

## 1. Consumer financing at the point of sale  ·  _highest ROI_

**What:** On any large quote or invoice, offer the customer monthly payments — they finance a
$12k retrofit, **you get paid in full up front**, and a lender carries the balance.

**Why it's #1:** Directly lifts average ticket size and close rate, and it's table-stakes for
HVAC / roofing / solar / remodel buyers. ServiceTitan pushes this hard.

**How (in our stack):**
- Integrate **Wisetack** (purpose-built for home/field services, no consumer dealer fees). Alt: Sunbit, GreenSky.
- "Offer financing" action on a quote/invoice → text/email a prequal link (reuse Twilio/Resend).
- Track approval + funding via a webhook (reuse the existing webhook + per-tenant patterns).
- New `financing_applications` table, tenant-scoped RLS. Surface status on the quote/invoice + portal.
- We never touch the money → no new money-transmitter licensing on us.

**Effort:** ~2–4 weeks · **Dependency:** Wisetack per-merchant enrollment (KYB).
**AI angle:** the quote AI auto-suggests "offer financing" when a ticket crosses a threshold.

---

## 2. Recurring service memberships

**What:** Sell recurring plans — "$29/mo lawn plan", "annual HVAC maintenance", "quarterly pest" —
that auto-bill on a schedule, auto-generate the recurring visits, and track member perks
(priority scheduling, discounts).

**Why:** Recurring revenue is *the* valuation + cash-flow lever in field service. Every serious
operator runs memberships. Retention + LTV engine.

**How (in our stack):**
- Reuse the Stripe-subscription pattern we already run for our own billing, tenant → customer.
- New `membership_plans` + `customer_memberships`; create a Stripe Subscription on the customer via
  the tenant's Stripe.
- On each billing webhook, auto-spawn the visit/job (tie into Zach's visit engine / Upcoming Services).
- Member badge in the customer file + portal; dunning on past-due via existing states.

**Effort:** ~3–6 weeks · **Dependency:** recurring-job generator (partially exists).
**AI angle:** Frankie flags membership candidates by service history.

---

## 3. Call recording + IVR (telephony on Lead Setter)

**What:** Turn Lead Setter's click-to-call into a real phone system — in-app softphone with **call
recording**, **inbound routing / IVR** ("press 1 for service"), setter-floor queues, every call
logged to the lead/customer timeline.

**Why:** Makes it a true call center for a 200-seat floor — record every call, coach setters,
capture missed-call revenue. Headline ServiceTitan Phones draw. The one competitors can't easily copy
once paired with our AI.

**How (in our stack):**
- Build on **Twilio Voice** (we already use Twilio for SMS): per-tenant numbers via subaccounts,
  an edge function returning TwiML for the IVR menu + queue routing, recordings pushed to a Supabase
  storage bucket, WebRTC softphone (Twilio Voice SDK) inside Lead Setter, recording + transcript
  attached to the Communications Log.

**Effort:** ~6–10 weeks (heaviest) · **Dependencies:** number provisioning + usage billing,
**two-party-consent recording compliance** (per-state notices — legal review).
**AI angle:** transcribe every call → Frankie/Victor score setter performance, surface coaching +
missed opportunities.

---

## 4. Full-service payroll: direct-deposit ACH + tax remittance + e-file

**Current state (important):** Payroll today is a **calculation + compliance-paperwork engine, not a
money-mover**. It computes gross→net (IRS Pub 15-T, FICA, FUTA, SUI, multi-state), produces paystubs,
tracks liabilities + deadlines (Payroll Inbox), and **fills** every form as a ready-to-file PDF
(941/940/W-2/W-3/1099-NEC/1096/state). It does **not** originate direct-deposit ACH, remit taxes
(EFTPS), or e-file. Direct deposit today = the employee enters bank info + signs a DD authorization in
onboarding (stored encrypted, last-4 shown); payroll marks the run `paid`; the employer moves the
actual money through their own bank and files the generated forms.

**What this item does:** Make payroll actually **pay and file** — direct-deposit ACH to employees,
tax remittance to the agencies, and e-filing of the forms.

**Why:** It's the line between "payroll calculator + forms" and full-service payroll (Gusto/ADP).
Removes the biggest manual step and de-risks compliance for the owner.

**How (in our stack):**
- Embed a payroll-infrastructure provider — **Check** (check.com; payroll-as-a-service: handles DD,
  tax remittance, e-filing, and is the system of record for filings). Alt: Column / Increase for ACH
  rails + Abound for filings if building more in-house.
- Map our computed pay + tax liabilities to the provider's API; the provider originates DD, remits
  taxes, and e-files. JobScout stays the UI + calc + source of truth; keep the current
  "generate PDF + track" path as an audit/fallback.

**Effort:** ~8–12 weeks + **per-tenant provider underwriting (KYB)**. Regulated — the provider carries
the money-transmitter / licensing burden, which is exactly why we embed rather than build.
**AI angle:** Frankie forecasts payroll + tax cash needs before each run.

---

_Not on this list because JobScout already does it: full ops (dispatch, routes, jobs), accounting +
books, CRM + pipeline, AI prospecting, the AI workforce, fleet, offline field app, EOS, multi-tenant
+ RLS. Custom workflows are a natural Arnie next-tier (propose → approve → apply, described in plain
English), not a wall._
