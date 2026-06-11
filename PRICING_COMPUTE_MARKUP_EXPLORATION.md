# Pricing Exploration: JobScout as a Compute/Credits Margin Business

**Status:** Exploration / decision memo — not yet a committed plan.
**Question being explored:** What if JobScout's money-maker stops being a flat
SaaS seat fee and becomes the **markup on AI compute** — a low base price per
seat (\$10–\$20) plus a 200–300% markup on the tokens/compute each customer
actually burns?

This memo models that idea two ways (both base prices × both markup levels),
compares it against today's flat plans, and ends with a recommendation.

---

## 1. TL;DR

- **The core insight is correct and valuable.** Today's flat plans (Field Crew
  \$99 / Field Pro \$249 / Field Boss \$599) bundle unlimited-ish AI. That means
  **margin is great on light users and collapses on heavy AI users** — a heavy
  Field Boss customer can burn most of their \$599 in raw Anthropic spend.
  Markup pricing **locks gross margin at ~75–80% no matter how hard a customer
  uses the AI.** AI flips from a cost/risk into the profit engine.

- **But a pure \$10–\$20 base would torch your best segment.** Solo/light users
  who happily pay \$99 today would pay ~\$30–\$47/mo under a \$10-base markup
  model. You'd capture the heavy users you currently under-charge — and gut the
  light users you currently over-charge. Net revenue likely **down**, not up,
  unless your base captures real fixed value.

- **Recommendation: don't go pure-metered. Go hybrid** — a **\$20–\$30/seat
  base that includes a monthly credit allowance** covering typical usage, with
  metered overage billed at the 3–4× markup. You keep today's revenue floor
  *and* monetize heavy AI usage instead of eating it.

- **Two cost levers make the markup far fatter than it looks:** routing light
  actions to **Haiku** (5× cheaper than Sonnet) and **prompt caching**
  (~0.1× on cached input) can cut COGS 40–60%, so a "3× markup" sticker can be
  a true **5–6× on actual cost.**

---

## 2. The cost basis (what we actually pay)

All AI runs through Claude (via the Vercel AI Gateway). Current per-million-token
("MTok") pricing:

| Model | Input \$/MTok | Output \$/MTok | Use for |
|---|---|---|---|
| **Claude Opus 4.8** | \$5.00 | \$25.00 | Premium / hardest reasoning |
| **Claude Sonnet 4.6** | \$3.00 | \$15.00 | Default — what most functions use today |
| **Claude Haiku 4.5** | \$1.00 | \$5.00 | High-volume cheap actions |
| Prompt-cache read | ~0.1× input | — | Repeated context (system prompts, docs) |
| Prompt-cache write | 1.25× input (5-min) | — | First write of a cached prefix |

> Today the edge functions call mostly Sonnet-tier models (`claude-sonnet-4`,
> `-4-5`, `-4-6`) with a couple on Haiku, `max_tokens` from 700 → 8,192. So the
> COGS basis below uses **Sonnet 4.6 (\$3 / \$15)** as the realistic default.

### Per-action COGS (no caching, Sonnet 4.6)

| Action (real feature) | In tok | Out tok | COGS |
|---|---:|---:|---:|
| Instant quote (Zach) | 1,200 | 700 | \$0.014 |
| Receipt scan | 1,500 | 1,000 | \$0.020 |
| Fixture / lighting analyze | 1,800 | 1,200 | \$0.023 |
| Email generation (Conrad) | 3,000 | 1,500 | \$0.032 |
| Arnie chat turn | 6,000 | 2,000 | \$0.048 |
| Proposal layout | 4,000 | 5,000 | \$0.087 |
| PDF / utility-bill extract | 6,000 | 8,000 | \$0.138 |
| Prospect research (+ web search) | 20,000 | 6,000 | ~\$0.17 |

Collapsed into three archetypes for modeling:

| Class | Examples | COGS / action |
|---|---|---:|
| **Light** | quotes, receipt scans, fixture/lighting analyze, classify | **\$0.02** |
| **Medium** | email gen, proposal layout, Arnie chat | **\$0.06** |
| **Heavy** | PDF extract, prospect research, multi-step agent runs | **\$0.17** |

---

## 3. Markup terminology (pinning the numbers down)

"Mark up 200–300%" is ambiguous, so both readings are modeled explicitly:

| Phrase | Price as multiple of cost | Gross margin |
|---|---|---|
| **200% markup** | price = cost + 200% = **3× cost** | 67% |
| **300% markup** | price = cost + 300% = **4× cost** | 75% |

So a Light action costing \$0.02 retails at **\$0.06 (3×)** or **\$0.08 (4×)**.
Both are modeled below as the "3×" and "4×" columns.

---

## 4. Customer usage profiles

Four representative monthly profiles, with the resulting raw compute COGS:

| Profile | Seats | Light/mo | Med/mo | Heavy/mo | Compute COGS/mo |
|---|---:|---:|---:|---:|---:|
| Solo operator | 1 | 200 | 30 | 5 | **\$6.65** |
| Small crew | 3 | 600 | 100 | 20 | **\$21.40** |
| Established biz | 10 | 2,500 | 500 | 100 | **\$97.00** |
| Power / multi-crew | 25 | 8,000 | 2,000 | 500 | **\$365.00** |

---

## 5. The model: revenue under base × markup

Total monthly revenue = `(base × seats) + (COGS × markup multiple)`.

### Scenario A — \$10/seat base

| Profile | 3× markup | 4× markup | Today (flat) |
|---|---:|---:|---:|
| Solo (1 seat) | \$29.95 | \$36.60 | **\$99** (Crew) |
| Small crew (3) | \$94.20 | \$115.60 | **\$99** (Crew) |
| Established (10) | \$391 | \$488 | **\$249** (Pro) |
| Power (25) | \$1,345 | \$1,710 | **\$599** (Boss) |

### Scenario B — \$20/seat base

| Profile | 3× markup | 4× markup | Today (flat) |
|---|---:|---:|---:|
| Solo (1 seat) | \$39.95 | \$46.60 | **\$99** (Crew) |
| Small crew (3) | \$124.20 | \$145.60 | **\$99** (Crew) |
| Established (10) | \$491 | \$588 | **\$249** (Pro) |
| Power (25) | \$1,595 | \$1,960 | **\$599** (Boss) |

### What jumps out

1. **Light/solo users get much cheaper** — \$30–\$47 vs \$99 today. Great for
   adoption and top-of-funnel, **bad** if those users would have paid \$99
   anyway. This is the single biggest revenue risk of going pure-metered.

2. **Heavy users get much more expensive — correctly.** A Power customer paying
   \$599 flat today (and burning \$365 of it in compute → only \$234 margin)
   would pay \$1,345–\$1,960. That's the upside the flat model is leaving on the
   table.

3. **The crossover sits around the Established tier.** Below it, flat pricing
   wins on revenue; above it, markup pricing wins — by a lot.

---

## 6. The margin story (why the idea is good)

Gross margin = revenue − COGS. The point of markup pricing is that **margin %
stays constant regardless of usage**, instead of decaying as customers lean on
the AI.

| Profile | Flat margin (today) | Markup margin (\$10 base, 3×) | Markup margin % |
|---|---:|---:|---:|
| Solo | \$92 (93%) | \$23 (78%) | locked |
| Established | \$152 (61%) | \$294 (75%) | locked |
| Power | \$234 (39%) | \$980 (73%) | locked |

Read the flat-margin column top to bottom: **93% → 61% → 39%.** That decay *is*
the problem. Every new AI feature you ship makes heavy users more valuable to
them and less profitable to you. Markup pricing holds the line at ~73–78%
forever.

---

## 7. Two levers that make the markup fatter than the sticker

The COGS above assumes naive Sonnet calls with no optimization. In practice:

- **Route Light actions to Haiku (\$1/\$5 vs \$3/\$15).** Most light actions
  (classify, quote, receipt) don't need Sonnet. That's a **5× input / 3× output**
  cost cut on the highest-volume class. A "3× markup" on a Haiku action is a
  true **~9× on real cost.**

- **Prompt caching (~0.1× on cached input).** System prompts, product catalogs,
  proposal templates, and company context repeat on every call. Caching the
  stable prefix cuts input cost ~90% on the cached portion. Heavy actions with
  big fixed context (proposal layout, agent turns) benefit most.

Combined, these realistically **cut blended COGS 40–60%.** If you price off the
*naive* Sonnet cost and optimize behind the scenes, the customer-facing "3×"
becomes a **5–6× true margin** — without changing the sticker.

> Caveat: don't price off a cost you've already optimized away, then have a
> model-price increase erase the cushion. Price off **current naive Sonnet
> cost**, bank the optimization as margin, and re-baseline if Anthropic pricing
> moves (see §10).

---

## 8. Packaging it for customers (credits)

Contractors will not reason about tokens. Abstract compute into **credits**, the
way the prospecting feature already abstracts into "searches/enrichments"
(`TIER_QUOTAS` in `prospect-research`). That metering table is the seed of a
real credit ledger.

Proposed design:

- **1 credit = \$0.05 of retail AI value.** Clean mental model.
- Each action debits credits = `round_up(COGS × markup ÷ $0.05)`:

  | Action class | COGS | Retail @3× | Credits |
  |---|---:|---:|---:|
  | Light | \$0.02 | \$0.06 | **1** |
  | Medium | \$0.06 | \$0.18 | **4** |
  | Heavy | \$0.17 | \$0.51 | **10** |

- **Each seat includes a monthly credit allowance** (e.g. 400 credits =
  ~\$20 retail of usage). Overage is sold in packs or metered at the same rate.
- Surface a **live meter + spend cap + alerts** (the prospecting UI already has
  usage bars — reuse them). Caps are what make a metered bill safe to sell to a
  small contractor.

---

## 9. The recommendation: hybrid, not pure-metered

A pure \$10–\$20 base loses money against today's floor on the segment that's
easiest to keep. The fix is a **platform fee + included credits + metered
overage** model — the standard modern SaaS shape (Twilio, OpenAI, Vercel):

| Tier | Base/seat | Included credits/seat | Overage |
|---|---:|---:|---|
| **Starter** | \$29 | 300 (~\$15 retail) | metered @ 3× |
| **Pro** | \$49 | 800 (~\$40 retail) | metered @ 3× |
| **Scale** | \$79 | 2,000 (~\$100 retail) | metered @ 3× |

Why this wins:

- **Keeps the revenue floor.** A solo user still pays ~\$29, not ~\$30-with-no-
  guaranteed-minimum. You don't cannibalize your \$99 base — you reframe it as
  base + usage and the *light* user lands near today, the *heavy* user lands
  well above.
- **Monetizes the heavy users you currently subsidize.** Overage past the
  included allowance bills at full markup — exactly where flat pricing bleeds.
- **Predictable for the buyer.** The included allowance covers normal months;
  only genuinely heavy usage triggers overage, with caps/alerts as guardrails.
- **Margin-safe by construction.** Even the included credits are sized so the
  base fee comfortably covers their COGS at the allowance ceiling.

Pure low-base markup (the literal \$10–\$20 idea) is the right model for a
**self-serve, viral, land-and-expand** motion where you want the lowest possible
entry price and trust expansion revenue to follow. If JobScout's go-to-market is
sales-assisted to established contractors, the **hybrid** captures more.

---

## 10. Risks & open questions

- **Bill shock / churn.** Variable bills scare small contractors. Hard caps,
  alerts at 50/80/100%, and "you're about to run out of credits" prompts are
  non-negotiable. Default every account to a cap.
- **Anthropic price exposure.** Your COGS is a vendor price you don't control.
  Markup pricing *passes that through* (good), but you must re-baseline credit
  costs if model prices move. Keep the COGS→credit mapping in one config
  (like `billingPlans.js`), not hardcoded across functions.
- **Gaming / abuse.** Metered AI invites scripted abuse. Per-account rate limits
  and anomaly detection needed (the prospecting quota check is a starting point).
- **Forecasting.** Revenue becomes usage-dependent and less predictable for
  *your own* planning. You trade customer-side margin risk for company-side
  revenue variance. Cohort usage data de-risks this over time.
- **Sales friction.** "It depends on usage" is harder to quote than "\$249/mo."
  The hybrid's published base + included allowance keeps a clean headline price.
- **Migration.** Grandfathered/HHH and beta tenants are on free-for-life Field
  Boss (`BillingTab` `grandfathered` path). Any change must preserve those.

---

## 11. If we pursue this — implementation sketch

The plumbing is ~70% there already:

1. **Credit ledger** — generalize the prospecting usage table
   (`searches`/`enrichments`) into a per-company credit balance + transaction
   log. Debit on every AI action via a shared wrapper.
2. **COGS→credit config** — one source of truth (extend `billingPlans.js`)
   mapping each action type → credit cost, plus the markup multiple and credit
   retail price, so re-pricing is a config change.
3. **Metering wrapper** — a single helper every edge function calls before/after
   an Anthropic request: check balance/cap → run → record actual tokens →
   debit. Records *actual* tokens so margin is measured, not assumed.
4. **Model routing** — route Light actions to Haiku, enable prompt caching on
   stable prefixes — bank the COGS cut as margin (§7).
5. **Billing** — Stripe metered/usage-based prices + credit-pack purchases
   alongside the existing subscription (`tenant-billing-*` functions). Stripe
   already supports metered billing.
6. **UX** — reuse the prospecting usage bars for a global credit meter; add
   caps, alerts, and an overage purchase flow.

---

## 12. Bottom line

The instinct — **make money on the AI markup, not the seat** — is sound, and the
margin math proves it: it locks ~75% gross margin and finally monetizes the
heavy AI users that flat pricing subsidizes today. The trap is the **\$10–\$20
base**: taken literally it underprices your easiest, highest-margin segment.

Keep the markup engine; raise the base into a **hybrid (base + included credits
+ metered overage)**. That's the version that grows revenue across *every*
segment instead of trading light-user revenue for heavy-user upside.

*All figures are illustrative models on stated assumptions (token counts, usage
mix, Sonnet 4.6 pricing as of this writing). Validate against real per-action
token logs before committing to credit prices.*
