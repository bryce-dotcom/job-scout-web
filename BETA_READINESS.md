# Beta Readiness Audit — 2026-05-01

Sweep of the build before onboarding outsiders. Most-critical items
fixed in commit `b53abab`.

## Fixed

### 🔒 RLS lockdown (CRITICAL — was a hard data-leak blocker)

Before: Anonymous browsers could read every customer / job / invoice /
employee / payment in the database via the published anon key. Confirmed
3,225 customers, 7,085 jobs, 6,523 invoices, 18 employees were
publicly enumerable.

Root cause: every tenant table had pre-existing `USING: true` permissive
policies attached to PUBLIC. PostgreSQL OR-combines policies, so any
new restrictive policy was silently nullified.

Fix:
- New `tenant_isolation` policy on every public tenant table that
  resolves the caller's company via `employees.email = JWT email`
- Permissive policies dropped wholesale across the public schema
- Narrow anon-write carve-out for `/agent/lenard-*` signature capture
  (TODO: migrate to signed edge functions)

Verified: anon SELECT returns 0 rows on every tenant table.

### 🧹 HHH leakage in seed data

`src/lib/seedData.js` had `bryce@hhh.services` hardcoded as a sample
employee for new tenants. Replaced with `owner@example.com`.

### 🔁 Onboarding gate works

`ProtectedRoute` (App.jsx) redirects users with
`companies.setup_complete = false` to `/onboarding`. Beta-signup edge
function sets this flag, so new tenants are forced through the
5-step setup wizard before the rest of the app loads.

### 🪙 Beta invite codes ready

Two codes pre-seeded:
- `SCOUT-EARLY-ACCESS` (50 uses, no expiry)
- `JOBSCOUT-BETA-2026` (100 uses, no expiry)

Plus `scripts/create-beta-code.cjs` for one-shot codes per tester.

## Remaining (not beta-blockers)

### HHH branding in Lenard agents

`/agent/lenard-az-srp` and `/agent/lenard-ut-rmp` are HHH's own public
energy-rebate intake forms. PDF outputs and on-page footers reference
"HHH Building Services". Outsiders won't use those URLs unless they
want their own white-labeled agent — track as a separate productization
task.

### Direct anon writes on Lenard flows

Public Lenard agents currently call `supabase.from('leads').update(...)`
directly with the anon key. The narrow RLS exception keeps it working,
but a stranger with a valid lead_id can still update those tables.
Move the signature-capture and give-me-log paths into signed edge
functions before scaling outside HHH.

### Console.log noise

92 `console.log` calls in src/. Mostly debug breadcrumbs with no
sensitive data, but some (PMJobSetter:1637, Settings:3216) print
payload bodies. Should be wrapped in `if (import.meta.env.DEV)` or
removed before a public launch.

### Customer 3118 needs `business_name`

Doug's earlier feedback — customer "Chris Reilley" has no business
name set, so search for "Central Valley Water District" misses it.
Manual fix in the Customers UI.

## Audit scripts

```
scripts/readiness-audit.cjs          table-by-table service vs anon
scripts/test-anon-access.cjs         direct anon-role probe
scripts/check-rls-real.cjs           pg_class RLS flag inspection
scripts/list-policies.cjs            enumerate policies per table
scripts/check-beta-codes.cjs         active beta codes
scripts/create-beta-code.cjs <CODE>  generate a one-shot code
```

## After deploying b53abab

1. Hard-reload the app (Ctrl+Shift+R) so the JWT in localStorage
   re-authenticates against the new policies. If a session token is
   stale, it'll just redirect to /login.
2. Verify HHH still loads everything — Customers/Leads/Jobs/etc.
3. Verify a public Lenard URL still saves a signature (HHH's existing
   intake flow).
4. Smoke-test beta signup: open an incognito window, go to /login,
   "Start Your Beta Trial", use `JOBSCOUT-BETA-2026`, walk through
   onboarding, confirm the new tenant sees only their own seeded data
   (10 customers, 5 leads, 3 jobs, etc.).
