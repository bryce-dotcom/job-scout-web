# Company Compute Wallet — Implementation Plan

**Status:** Build spec (proposed). Follows the pricing exploration in
`PRICING_COMPUTE_MARKUP_EXPLORATION.md`.
**Goal:** Keep the three tiers and per-agent subscriptions exactly as they are,
and put a **single per-company compute wallet** underneath all AI — built-in
*and* agent — funded by the tier + agents, topped up by a "buy more compute"
button, billed at a markup. Locks ~75% gross margin on AI while keeping the
flat-fee revenue floor.

---

## 0. Principles

1. **One wallet, every AI action.** Built-in AI (receipt scan, PDF import,
   proposal layout) and agent AI (Zach, Lenard, Conrad, Victor, Arnie, Frankie)
   all debit the same company balance. No per-agent silos, no stranded credits.
2. **Margin is structural, not hoped-for.** A credit is a unit of *cost*;
   customers buy credits at a markup. Margin = the markup, independent of which
   actions they run.
3. **Debit on actual tokens, never estimates.** Every Anthropic response reports
   real usage; we price off that. Estimates are only used as a pre-flight guard.
4. **Don't ship pricing we haven't measured.** Phase 0 runs the meter in
   *shadow mode* (log, don't charge) to size allowances from real data before
   any customer sees a cap. This is the single biggest de-risker.
5. **Caps and prepaid, not surprise bills.** Hard spend caps default on; credits
   are prepaid (with optional auto-refill). Contractors must never get a shock
   invoice.
6. **One config for all the money.** Markup, credit unit, model prices,
   allowances, and pack prices live in one file (extending `billingPlans.js`) so
   re-pricing — or reacting to an Anthropic price change — is a config edit.

---

## 1. The credit model

| Concept | Value | Notes |
|---|---|---|
| **1 credit** | **\$0.02 of underlying COGS** | Internal anchor. Light action = 1 credit. |
| **Markup** | **3.5×** (configurable) | Customer effectively pays ~\$0.07/credit on overage. |
| **Debit per action** | `ceil(actual_cost_usd / 0.02)` | From real tokens × model price. |

Action credit cost falls out of actual cost (illustrative, Sonnet 4.6):

| Action class | COGS | Credits | Customer sees |
|---|--:|--:|---|
| Light (quote, receipt, fixture) | \$0.02 | **1** | "1 credit" |
| Medium (email, proposal, chat) | \$0.06 | **3** | "3 credits" |
| Heavy (PDF extract, prospect research) | \$0.17 | **9** | "9 credits" |

Customers never see dollars-per-credit or COGS — only credit counts and pack
prices. The \$0.02 anchor stays internal.

### Two-bucket balance (fairness + rollover)

The wallet holds two balances; **debits draw `included` first, then `purchased`:**

| Bucket | Source | Rollover |
|---|---|---|
| `included_balance` | Tier base allowance + each agent's allowance, granted monthly | **Resets monthly** (use-it-or-lose-it) |
| `purchased_balance` | "Buy more compute" packs | **Persists** (they paid for it) |

---

## 2. Allowances & packs

### Included with the subscription (granted monthly, in credits)

| Source | Included credits/mo | Covers (typical) | COGS to us at full burn |
|---|--:|---|--:|
| **Field Crew** base | 250 | built-in AI for a solo op | \$5 |
| **Field Pro** base | 750 | built-in AI for a small team | \$15 |
| **Field Boss** base | 2,000 | built-in AI for a multi-crew shop | \$40 |
| **Each agent** | 350 | one active agent's normal month | ~\$7 |

The tier base funds **built-in AI** (which has no agent fee to attach to); each
agent adds its own allowance to the same pool. All numbers are **placeholders to
be set from Phase 0 shadow data** — see §8.

### Overage — "buy more compute" packs (sold at the markup)

| Pack | Price | Credits | COGS | Margin |
|---|--:|--:|--:|--:|
| Small | \$10 | 140 | \$2.80 | 72% |
| Medium | \$25 | 350 | \$7.00 | 72% |
| Large | \$50 | 700 | \$14.00 | 72% |
| Bulk | \$100 | 1,600 | \$32.00 | 68% (small volume discount) |

Optional **auto-refill**: when `purchased_balance` drops below a threshold,
charge the saved card for a chosen pack. Opt-in; off by default.

---

## 3. Margin model (what we actually make)

| Layer | Customer pays | Our COGS | Margin |
|---|---|---|---|
| Tier base + included built-in AI | flat (unchanged) | ≤ allowance COGS (\$5–\$40) | ~90%+ (tier price dwarfs it) |
| Agent fee + included agent AI | flat (unchanged) | ~\$7/agent | ~75% |
| Overage packs | \$0.07/credit eq. | \$0.02/credit | **~71%** |

**Worked example — heavy 5-person crew on one agent** (≈\$20 COGS/mo on that
agent vs a 350-credit/\$7 allowance): they buy ~\$47 of overage → pay agent fee +
\$47, COGS \$20, **margin ~73%.** Under flat-unlimited that same crew is 30%
margin. The overage button is the margin.

Margin holds **~71–77% across every usage level** — the entire point.

---

## 4. Data model

Reuses the `prospecting_usage` + `bump_prospecting_usage` RPC pattern already in
production.

```
compute_wallet
  company_id            uuid PK → companies.id
  included_balance      int        -- resets monthly
  purchased_balance     int        -- persists
  included_grant        int        -- current monthly grant (tier + agents)
  period_start          date       -- for monthly reset
  cap_credits           int NULL   -- hard spend cap this period (NULL = use grant only)
  auto_refill_pack      text NULL  -- e.g. 'medium', NULL = off
  auto_refill_threshold int
  low_balance_alert_at  timestamptz NULL
  updated_at            timestamptz

compute_ledger                      -- append-only audit; source of truth
  id            bigserial PK
  company_id    uuid
  user_id       uuid NULL           -- who triggered it
  ts            timestamptz
  type          text                -- grant | debit | purchase | refund | adjust
  feature_slug  text                -- 'receipt_scan', 'proposal_layout', ...
  agent_slug    text NULL           -- 'zach', 'lenard', ... NULL for built-in
  model         text                -- 'claude-sonnet-4-6'
  input_tokens  int
  output_tokens int
  cache_read_tokens int
  cost_usd      numeric(10,5)
  credits       int                 -- +grant/+purchase, -debit
  bucket        text                -- 'included' | 'purchased'
  stripe_ref    text NULL
  idempotency_key text UNIQUE NULL  -- prevents double-debit on retries
```

- **Balance = the two counters on `compute_wallet`**, maintained transactionally;
  `compute_ledger` is the immutable audit trail (and lets us recompute / debug).
- A single `debit_compute(company_id, ...)` Postgres RPC does the
  read-cap-check → decrement → ledger-insert atomically (mirrors
  `bump_prospecting_usage`).

---

## 5. The metering wrapper

One shared helper every AI edge function wraps its Anthropic call in. Centralizes
the model→price table and credit math (Principle 6).

```ts
// supabase/functions/_shared/compute.ts
async function withCompute(ctx, { companyId, userId, feature, agentSlug, estMaxTokens }, run) {
  const wallet = await loadWallet(companyId)
  const available = wallet.included_balance + wallet.purchased_balance

  // Pre-flight guard: worst-case estimate from the feature's max_tokens.
  const estCredits = creditsForCost(estimateCost(feature, estMaxTokens))
  if (available < estCredits && capReached(wallet)) {
    return outOfCompute(wallet)          // 402 + buy-more payload; action does NOT run
  }

  const res = await run()                // the actual Anthropic call
  const usage = res.usage                // real tokens

  const cost = costUsd(res.model, usage) // model price table × tokens (incl. cache reads)
  const credits = Math.ceil(cost / 0.02)

  await debitCompute({                   // atomic RPC: included-first, then purchased
    companyId, userId, feature, agentSlug,
    model: res.model, usage, cost, credits,
    idempotencyKey: ctx.requestId,
  })
  return { ...res, _compute: { credits, balance: available - credits } }
}
```

- **Pre-flight** prevents blowing past a hard cap; **reconciliation** on actual
  tokens keeps margin honest.
- Balance decrement is **inline and reliable** (not `waitUntil`); the ledger row
  can be `waitUntil` if needed, but the counter must commit before responding.
- **Idempotency key** = request ID, so a retried function invocation can't
  double-debit.

Rollout touchpoint: every function in `supabase/functions/*` that calls Anthropic
(arnie-chat, prospect-research, generate-proposal-layout, zach-instant-quote,
analyze-fixture, scan-receipt, cc-generate-email, lenard-analyze, ai-extract-pdf,
parse-utility-pdf, victor-verify, …) gets one wrapper line.

---

## 6. Pricing config (extend `billingPlans.js`)

```js
export const COMPUTE = {
  creditCostUsd: 0.02,          // 1 credit = $0.02 COGS
  markup: 3.5,                   // customer pays markup× cost on overage
  modelPrices: {                 // $/MTok [input, output, cacheRead]
    'claude-opus-4-8':   { in: 5,  out: 25, cacheRead: 0.5 },
    'claude-sonnet-4-6': { in: 3,  out: 15, cacheRead: 0.3 },
    'claude-haiku-4-5':  { in: 1,  out: 5,  cacheRead: 0.1 },
  },
  tierIncludedCredits: { field_crew: 250, field_pro: 750, field_boss: 2000 },
  agentIncludedCredits: 350,     // per active agent
  packs: [
    { id: 'small',  price: 10,  credits: 140 },
    { id: 'medium', price: 25,  credits: 350 },
    { id: 'large',  price: 50,  credits: 700 },
    { id: 'bulk',   price: 100, credits: 1600 },
  ],
  capDefault: 'grant',           // 'grant' = stop at included; 'auto_refill'; 'uncapped'
  alertThresholds: [0.5, 0.8, 1.0],
}
```

A `displayCredits` table (per feature: "~3 credits") drives UI hints; the real
debit is always computed from actual tokens.

---

## 7. Stripe & billing flow

- **Subscriptions (tier + agents):** unchanged — `tenant-billing-*` functions and
  the per-agent `price_monthly` stay as-is.
- **Monthly grant:** a cron resets `included_balance` to
  `tierIncludedCredits + (agentIncludedCredits × active_agents)` on each company's
  period boundary. Add to `vercel.json` crons (the file already runs
  `drain-migrations` and `stripe-sync-books`):
  ```
  { "path": "/api/cron/grant-compute", "schedule": "0 7 * * *" }
  ```
  (Daily run; grants only companies whose `period_start` has rolled.)
- **Pack purchases:** Stripe Checkout (one-time) → `master-stripe-webhook`
  handles `checkout.session.completed` → insert `purchase` ledger row + bump
  `purchased_balance`. (The webhook already handles `invoice.*`; add the
  one-time-payment case.)
- **Auto-refill:** when `debit` drops `purchased_balance` below threshold and
  `auto_refill_pack` is set, charge the saved payment method off-session for that
  pack.
- **Prepaid, not metered Stripe usage** → no surprise invoices, simpler reconial,
  caps enforceable client-side.

---

## 8. Cost-optimization levers (bank as margin)

Credits debit on *actual* cost, so optimizing COGS makes each action cost the
customer **fewer credits** (their balance lasts longer — a marketing point) while
our markup margin stays constant.

- **Haiku routing.** Light actions (classify, quote, receipt scan, column-map)
  → Haiku (\$1/\$5 vs \$3/\$15). 3–5× cheaper. Per-feature `model` flag in config.
- **Prompt caching.** Cache stable prefixes — system prompts, product catalogs,
  proposal templates, company context — at `cache_control` breakpoints
  (~0.1× on cached input). Heavy, big-context actions benefit most.
- Combined: ~40–60% real COGS cut. Price packs off **naive Sonnet cost** (§1),
  bank the optimization. Re-baseline if Anthropic pricing moves.

---

## 9. UX

- **Global compute meter** (header + Settings → Subscription): "1,420 / 2,000
  monthly credits · 350 purchased." Reuse the prospecting `UsageBar` component.
- **Per-feature / per-agent breakdown** for visibility (where the credits went)
  without siloing the money.
- **Alerts** at 50 / 80 / 100% of the monthly grant + low `purchased_balance`
  warning (email + in-app).
- **Out-of-compute modal** (default cap = `grant`): when included is spent, no
  purchased credits, and cap reached, AI actions return a friendly "You're out of
  compute — top up to keep [Zach] working" modal with one-click pack purchase.
- **Buy-more flow:** pack picker, one-click with saved card, optional auto-refill
  toggle.
- **Pre-action hint** on heavy actions ("This will use ~9 credits").

---

## 10. Safety & abuse

- **Hard caps default on** (`capDefault: 'grant'`); uncapped/auto-refill is opt-in.
- **Per-company + per-user rate limits** on AI endpoints (the prospecting quota
  check is the starting pattern).
- **Anomaly detection:** flag a sudden ≥10× usage spike → auto-pause + notify
  (catches scripted abuse and runaway loops).
- **Idempotent debits** (§5) so retries never double-charge.
- **Reconciliation job:** nightly, recompute balances from `compute_ledger` and
  alert on drift between ledger and counters.

---

## 11. Migration

- **Grandfathered / HHH tenants** (`BillingTab` `grandfathered` path): grant an
  effectively unlimited allowance, never show a paywall. Free-for-life is
  preserved verbatim.
- **Existing paid tenants:** seed **generous** allowances from their real
  historical usage (Phase 0 data), grandfather current behavior for a **60-day
  notice period** with usage visible but **no hard cap**, communicate clearly,
  then enable enforcement. No surprise cutoffs.
- **Prospecting:** leave on its own meter for v1 (already monetized via its own
  Stripe sub). Fold into the wallet in Phase 4.

---

## 12. Rollout phases

| Phase | Ships | Exit criteria |
|---|---|---|
| **0 — Shadow meter** | `withCompute` wrapper logging actual cost/credits per action, **debiting nothing**. Wallet + ledger tables. | 4–6 weeks of real per-company usage → allowance sizes set from data, not guesses. |
| **1 — Wallet + meter UI** | Balances, monthly grant cron, read-only meter + per-feature breakdown. No enforcement. | Customers can *see* their usage. |
| **2 — Soft enforcement** | Alerts (50/80/100%), buy-more flow, pack purchases via Stripe. No hard cap. | Overage purchasing works end-to-end. |
| **3 — Hard caps + packs + auto-refill** | Full enforcement for new customers; existing on 60-day grandfather. Out-of-compute modal. | New-customer margins locked; churn at cutover within tolerance. |
| **4 — Optimize & consolidate** | Haiku routing, prompt caching, fold in prospecting, auto-refill default-on opt-in. | Blended COGS down 40%+; one wallet for all AI. |

Phase 0 can ship **immediately** and runs invisibly — it's the de-risker, and it
captures the data that sets every number in this doc. Given the market momentum,
shipping Phase 0 now means the pricing is data-backed by the time enforcement
lands.

---

## 13. Metrics

- Blended gross margin per company (target ~73–77% on AI).
- % companies hitting overage; overage revenue/company.
- **Credits-per-action by feature** — early warning when a model change or prompt
  bloat raises COGS.
- Churn at the enforcement cutover.
- Billing-related support ticket volume.

---

## 14. Open decisions (config knobs to confirm)

- Markup multiple (default **3.5×**).
- Credit unit (default **\$0.02 COGS**).
- Allowance sizes per tier / per agent — **set from Phase 0 data.**
- Pack prices & whether to discount bulk.
- Rollover policy (proposed: included resets, purchased persists).
- Cap default (proposed: stop at grant; auto-refill opt-in).
- Notice period for existing tenants (proposed: 60 days).

---

## 15. Bottom line

The plumbing is ~70% built: a per-company metering table + RPC
(`prospecting_usage` / `bump_prospecting_usage`), cron infra (`vercel.json`),
a Stripe webhook (`master-stripe-webhook`), and usage-bar UI all exist. The new
work is the **unified wallet + ledger**, the **`withCompute` wrapper** on each AI
function, the **grant cron + pack purchase flow**, and the **meter/cap UX** — then
Haiku routing and caching to fatten the margin.

Ship **Phase 0 shadow metering now** to back the numbers with real data, and the
rest is a controlled, margin-safe rollout that grows revenue across *every*
customer segment without a single surprise bill.
