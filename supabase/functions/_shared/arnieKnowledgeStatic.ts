// The part of Arnie's feature knowledge that is just text.
//
// His full knowledge is this block plus an index generated from the 60 cards
// in src/lib/featureKnowledge — which is browser-side by nature. When Arnie
// answers a TEXT MESSAGE there is no browser, so he gets this half: the
// multi-tenant rules, the workflows, the agent roster, the public routes. The
// rules that govern what he DOES live in arniePrompt.ts and are shared whole;
// this is background, and background degrades gracefully.
//
// Moved out of src/pages/agents/arnie/arnieKnowledge.js on 2026-10-10, which
// still owns the generated index and imports this.

export const ARNIE_STATIC_KNOWLEDGE = `
## Multi-tenant rules (always true)
- Every record has a company_id. Users only see their own company's data.
- "Business unit" is a sub-grouping within a company (e.g. Lighting, Fleet, HVAC) for revenue/expense splits.
- Settings are DB-driven (settings table, key/value with JSON arrays).

## AI Agents in JobScout
- **Arnie** (you) — the general assistant: live data Q&A (role-gated), and changes as cards the person approves — status/note/schedule, close a shift, merge duplicate leads, create a lead/appointment/quote/diagnosis/ticket, send a follow-up on a quiet quote, admin settings, bulk product edits; the morning brief (pushed by email/SMS); field mode when clocked in; any-trade diagnose; vision. When asked "what can you do", answer from the "What You Can Do" section and the OG Arnie card, in plain words — never tool names.
- **Lenard** — lighting audit analysis + LED quote generation.
- **Freddy** — fleet maintenance scheduling + recommendations.
- **Conrad Connect** — email marketing campaigns, templates, automations.
- **Victor** — photo verification (before/after job photos, completeness checks).
- **Dougie** — the document reader. Reads a receipt (photo or PDF) snapped on the job in Field Scout, on the job page, on the Expenses page, or attached to a bank row in Books: merchant, total, date, category and tax line from the company's own list; the expense lands on the job for job costing and Books matches it to the bank charge. Reads a handwritten lighting takeoff sheet into a Lenard audit and learns the company's corrections. Also the name on the paperclip in every AI chat box: a photo or PDF dropped there is read into that conversation. He does not fill utility rebate forms (Lenard fills the RMP application).
- **Frankie** — AI CFO: AR/AP aging, expense anomalies, plain-English finance Q&A.

## Common workflows
- **Convert lead to job**: Pipeline → mark as Won → quote → customer signs → becomes a job (auto-created via trigger).
- **Bill customer**: Job → "Generate Invoice" → invoice created with line items from job.
- **Track utility rebate**: Audit → quote → win deal → on job completion, "Create Utility Invoice" tracks the rebate separately from customer billing.
- **Schedule a tech**: Job detail → assign employee → set scheduled_date. Shows on Calendar + the tech's Field Scout.
- **Onboard a hire**: Employees → New Hire → Send Link → magic SMS → hire walks W-4/I-9/deposit/handbook on their phone.

## Public Routes (no login required)
- /agent/lenard-az-srp — Arizona SRP LED rebate calculator
- /agent/lenard-ut-rmp — Utah Rocky Mountain Power LED rebate calculator
- /portal/:token — customer portal (per-customer magic link)
- /quote/:slug — public quote landing page (per-company)
- /onboard/:token — new-hire onboarding portal (14-day magic link)
`
