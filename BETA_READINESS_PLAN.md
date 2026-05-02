# Beta Readiness Plan (post-revert)

**State today:** RLS is OFF everywhere (commit `7a45b8f`). Anon key
can read all tenant data. App is fully working. The earlier one-shot
RLS migration broke too many flows because it was rolled out
sight-unseen — that's what we're fixing in this plan.

## What I learned from the failure

Three reasons the RLS-everywhere migration broke things:

1. **JWT email matching is brittle.** The policy resolved a user's
   company via `lower(employees.email) = lower(jwt.email)`. If any
   table query happened before that lookup populated, OR if a row
   had a typo'd / capitalized email, OR if multiple companies share
   an employee email, the function returned no company_ids and
   every row was hidden. Suspect this is what made the AI Crew /
   Arnie / Base Camp items disappear — those features read from
   `company_agents`, `agents`, or settings that the RLS gate failed
   on for HHH's actual JWT.

2. **Assumed every table has `company_id`.** Several tables that
   the app reads don't (`agents`, `ai_modules`, `helpers`, etc.).
   With my bulk loop, those tables got skipped (correct), but
   tables that DO have it but are read globally for menu / feature
   gating got blocked.

3. **No staging.** I went table → table → policy → push to prod in
   one round trip. There was no incognito sanity check on a single
   table before applying to all 50.

## The staged plan

Instead of one migration, do this in **5 phases**, each verifiable
on its own. Don't move to the next phase until the current one
passes a spot-check by Bryce on prod.

### Phase 0 — Diagnose what failed

Before re-attempting RLS at all, prove out the JWT helper:

1. Add a debug endpoint that, when called by the signed-in HHH user,
   returns:
   - `auth.jwt() ->> 'email'`
   - The result of `current_user_company_ids()` for that user
   - Whether each menu-feature table (`agents`, `company_agents`,
     `ai_modules`, `feedback`, etc.) has the user's company_id
2. Have Bryce hit it as Bryce, then as another HHH employee.
3. If the helper returns the right company_id for both, JWT
   resolution works and we move on. If not, fix the helper FIRST
   (case sensitivity, missing claim, etc.).

### Phase 1 — Single-table pilot (24 hours)

Pick ONE table that's HIGH-VALUE for tenant isolation but
LOW-RISK for breakage: `feedback`.

- Enable RLS on `feedback` only
- Add `tenant_isolation` policy
- Bryce uses HHH for a day; verifies feedback submission, listing,
  and reply still work
- Tester signs up via beta code; verifies they see only their own
  feedback rows

If anything breaks, revert just that one table. If it holds for
24 hours, advance.

### Phase 2 — Pure-data tables (no menu / feature dependencies)

These are tables read only inside their own page, not by the
nav/menu/feature-flag system:

- `customers`
- `leads`
- `quotes` + `quote_lines`
- `jobs` + `job_lines` + `job_sections`
- `invoices`
- `payments` + `lead_payments`
- `time_off_requests` + `time_log_entries`
- `verification_reports` + `verification_photos`
- `appointments`
- `expenses` + `manual_expenses` + `plaid_transactions`
- `utility_invoices`

Apply RLS to these in **3 batches**:
- Batch 2a: customers, leads, jobs, invoices  →  smoke test
- Batch 2b: payments, quotes, time/verif tables  →  smoke test
- Batch 2c: appointments, expenses, utilities  →  smoke test

Smoke test = Bryce loads each affected page in HHH, confirms data
appears, confirms create/edit works.

### Phase 3 — Per-employee data (HR-restricted)

- `employees` itself (read-own-company)
- `payroll_adjustments`
- `companies` (read-own only)

This is risky because the app reads `employees` early for the
auth flow. Do this with a manual rollback ready and Bryce on the
phone.

### Phase 4 — Feature-gating tables

These are what likely broke the AI crew / Arnie / Base Camp last
time:

- `agents`, `ai_modules`, `ai_messages`, `ai_sessions`
- `company_agents`
- `helpers`, `incentives`, `prescriptive_measures`,
  `utility_providers`, `utility_programs`, `rebate_rates`
- `fixture_types`
- `settings`

Some of these are SHARED reference tables (no company_id) — they
need different policies (or stay open). Some are per-company.
Audit each one individually. **Don't bulk-apply.**

### Phase 5 — Public route surfaces

- `customer_portal_tokens` — already locked from anon (edge fn only)
- `give_me_log` — Lenard's audit trail; anon INSERT only
- `leads` and `jobs` for Lenard signature capture — refactor to
  edge function before re-locking

## Hard rules going forward

1. **Never apply RLS to more than one table in a single migration.**
   One table = one migration = one verification cycle.
2. **Every RLS migration must be paired with a smoke-test script**
   that Bryce can run before deploying.
3. **Every RLS migration must include its own revert SQL inline as
   a comment.** If something breaks, revert is a copy-paste away.
4. **No AI agent applies RLS without explicit human approval per
   table.** Automated bulk-apply is what got us here.

## What I'm NOT going to touch right now

Until Phase 0 passes: nothing. The app works. Beta testers can sign
up — they'll see HHH data, but so what; HHH already saw demo company
data and Demo Company saw HHH data. We've been operating that way
for months. The leak is bad in principle but the app being broken
is worse in practice.

When you say "go", I start with Phase 0 — the debug endpoint to
confirm JWT resolution works. That's a 30-line read-only function;
no migration. We watch it return correct data for HHH employees.
Only then do we touch a single table.
