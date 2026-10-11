# Arnie On Your Computer

A JobScout feature. Arnie gets hands on the user's own machine and can operate
any program on it, the way a person does. SRP is the first job we give him, not
the product.

Status: plan only. Nothing here is built.
Written 2026-10-10. Supersedes `ARNIE_LAST_MILE_PLAN.md`, which scoped a
single-purpose SRP filler — the wrong, smaller product.

---

## What we are missing

One thing. Arnie has everything except hands.

| capability | today |
|---|---|
| a brain that decides the next action | `arnie-chat` + `_shared/arniePrompt.ts` |
| eyes — reads an image | vision, metered through `_shared/anthropic.ts`; 10+ functions already send images (`chris-house`, `analyze-fixture`, `dougie-analyze`, `ai-extract-pdf`…) |
| approval before acting | the 4 write rails: propose → approve → apply → rollback |
| reach outside the app | text, email, routines, notifications |
| somewhere to keep a learned workflow | `arnie_routines.steps jsonb` — null on every row, reserved for exactly this |
| **hands on a computer** | **nothing** |
| **per-application permission** | **nothing** |

Arnie can reason about TrakSmart indefinitely and cannot click one thing in it.

That missing row is a desktop app. And because hands are general, the moment
they exist Arnie can drive SRP's portal, RMP's workbook, QuickBooks, a PDF, a
vendor site — anything on the machine. Those stop being integrations we build
one at a time and become jobs the user gives him.

---

## The pieces

### 1. The local agent

A small signed desktop app the user installs. Tray icon, no window most of the
time. Tauri (smaller, Rust, Win+Mac) over Electron.

What it can do: screenshot, mouse move / click / drag, keyboard type and key
combos, scroll, launch an application, clipboard, read and write files in a
folder the user nominates.

**It connects outbound only** — a WebSocket out to a JobScout edge function,
authenticated as that employee with their own Supabase session. No inbound
connection, no open port, nothing listening on the machine. This matters for
every IT conversation we will ever have about it.

### 2. The loop, hybrid on purpose

```
screenshot ──► cloud: what next? ──► action ──► screenshot ──► …
```

Pure vision-every-step is slow and costs a vision call per step; a 30-step SRP
close-out is 30 calls. So:

- **A taught step replays deterministically** — no model call, fast, free.
- **Vision is the fallback**, used when a step misses or the task is new.

That is why `steps` matters, and it is the difference between a demo and
something a rep uses twice a day. Every vision call goes through
`_shared/anthropic.ts` so it meters into `ai_usage` and the compute ledger like
everything else — this feature must not be the one thing we cannot cost.

### 3. Per-application permission — this is the product

The most powerful thing JobScout would ship. The permission model is not a
footnote, it is the feature.

- **The user grants Arnie specific applications.** Not "your computer."
- **Tiers, because some programs should be read-only.** Watch-only, clickable,
  full. A terminal or an IDE should never be typeable.
- **Allow once / deny / always allow**, per action, with a visible running log.
- **Hard stops, not advisory:**
  - never type a credential — there is nothing to type (see below)
  - never click Submit, Send, Pay or Delete without a human
  - screenshot before and after every irreversible click
  - a step that misses **stops and asks**, never guesses at a nearby field
- **Every action gets an `audit_log` row.** Who, which app, what it did, the
  before and after.
- **A kill switch the user can always reach** — tray icon, one click, hands off.

### 4. Login — each user, their own account, exactly as asked

Arnie drives to SRP's sign-in page and **stops**. Banner: *sign in and tell me
when you're through.* The rep types their own password and clears their own 2FA.
Arnie carries on into a session he inherited.

- JobScout never receives, stores or protects a utility credential.
- Per-user is structural, not enforced — there is no vault to scope.
- SSO and 2FA work, because a human did them.
- The session lives in that rep's own browser profile on their own machine.

Cole's SRP login is Cole's. Nobody else's machine has it. That is the
requirement, met by construction rather than by policy.

### 5. Teaching by demonstration

The rep does the job once with recording on. We capture the **action stream** —
clicked this element, typed this value into that field — not raw video. Arnie
proposes the step list in English, the rep corrects and names it, and it saves
as a routine's `steps`.

Tenant-scoped: Cole teaches the SRP close-out once and every rep inherits it.
**The steps are shared. The login is not.** That is the split, and it falls out
of the design instead of being bolted on.

---

## What this unlocks beyond SRP

Not a list of things to build — a list of things that need no new code once
hands exist:

- SRP TrakSmart filing (the one that pays for it)
- opening and filling a vendor's own quote tool
- pulling a bill or statement off a utility site at month end
- a workbook that is not ours
- anything a rep does by hand twice a week and resents

---

## Phasing

**Phase 0 — hands, one program, internal.** *In progress, 2026-10-10.*

Built, tested and live:

- `supabase/migrations/20261010205500_arnie_computer.sql` — the three tables.
  `arnie_computer_grants.employee_id` is NOT NULL with no company-wide variant,
  so a company-level grant is not representable rather than merely discouraged.
  Applied to the live database and recorded in the migration history.
- `supabase/functions/_shared/computerGrants.ts` — the leash. One decision,
  imported by both sides. 37 tests.
- `supabase/functions/arnie-computer/index.ts` — the rail: hello / next /
  report / queue / stop / grants / grant / revoke. Deployed. Identity is always
  the caller's own session: no service-key path and no `as_employee_id`, so no
  route here can act for anybody else. 19 tests.
- `scripts/jobscout-agent.mjs` — the reference agent. Imports the *same* leash
  module rather than a copy; re-checks the frontmost app against what was
  granted, because only the machine knows what is really on screen; prints
  every action, allowed or refused, as it happens. Windows/PowerShell, verified
  against this screen.

Proved live on the demo tenant, 22/22: an ungranted app refused and the refusal
kept as a row; a password box and a 2FA box refused while the ordinary field
beside them was allowed; the typed value absent from the audit row with only its
length kept; Submit handed back to the person; a `click`-tier grant able to click
but not to type; revoking biting on the very next action; the kill switch
refusing what was already queued; and the anon key, the service key and another
person's session id getting 401, 401 and 404.

Left in Phase 0: the "Connect this computer" flow that hands the agent a token
(an env var today), and the first taught SRP run end to end. The question Phase
0 exists to answer is unchanged — does a correct TrakSmart application come out
the other end?

**Phase 1 — teach mode.** Recording, review-in-English, steps saved, re-teach on
a miss. This is what turns it from a script into a feature.

**Phase 2 — ship it as a JobScout feature.** Signed and notarised installers,
auto-update, onboarding, the permission UI as a real surface, tenant-scoped
step libraries, audit surfaced in the app.

---

## Risks, stated plainly

This is the biggest single thing on the roadmap — bigger than payroll — and the
risks are not all engineering.

- **Security is the whole ballgame.** This is a cloud brain with hands on
  customer machines. If Arnie is ever compromised, the blast radius is a
  customer's computer. The permission model has to be genuinely restrictive and
  locally enforced — the local agent refuses out-of-grant actions itself and does
  not rely on the cloud to ask nicely.
- **Two platforms, forever.** Windows and macOS, auto-update, crash reporting on
  someone's laptop. A real support surface we do not have today.
- **Code signing and reputation.** Apple Developer ID plus notarisation; Windows
  needs a signing cert, and an unsigned binary that synthesises input will be
  flagged. Expect antivirus false positives as an ongoing tax, not a one-off.
- **macOS permission friction.** Screen Recording and Accessibility grants are
  System Settings toggles the user must flip by hand. Cannot be scripted. It will
  be the top onboarding drop-off.
- **Cost per step.** Vision calls on the fallback path. Metered from day one or
  we will not know what a filing costs.
- **Customer IT will ask hard questions**, and they should. Outbound-only, per-app
  grants, local enforcement and a full audit trail are the answers — which is why
  they are in Phase 0 and not Phase 2.
- **It types numbers onto rebate applications.** A human clicks Submit. Always.

---

## Decided

It is a **JobScout feature**, not an HHH internal tool. So steps are
tenant-scoped from the first line of code, and the permission model is built
for a customer's IT department rather than retrofitted for one.
