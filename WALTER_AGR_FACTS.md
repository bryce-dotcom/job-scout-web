# Walter — the AGR glass restoration bid, as facts

Source: two PDFs Christopher worked from on the UGR Eden job —
`AGR-P261019-01 — UGR Eden — Project Pricing Glass Review` (14 pages, 24 photos)
and `AGR-E261019-01 — UGR Eden — Client Estimate` (1 page). They were read by a
cloud session on 2026-10-22 and the findings are transcribed here before that
session is closed. The PDFs themselves are not in this repo.

This file is **facts only** — what the documents say, and what was inferred
from elsewhere, kept clearly apart. The build plan lives in code and in the
`walter-windows` agent, not here.

Why it exists: these numbers are the only worked example of a glass
restoration bid anyone here has, and they were sitting in a chat window at 11%
remaining context. A number nobody can find again is a number nobody has.

---

## Stated by the PDFs

### The bid shape

Three tiers, not one number:

| Tier | Amount |
|---|---|
| Favourable conditions | $15,150 |
| Expected scope | $19,400 |
| Difficult conditions | $26,500 |

AGR say outright that it is **not a per-scratch, per-pane or per-square-foot
price**. It is built from roughly **5 days on site**.

### What the expected tier is made of

| Package | Price | Who would do it if HHH sold this |
|---|---|---|
| Checking the glass and coatings, plus test patches | $1,450 | The tech, with our person present |
| Removing construction residue | $4,950 | **Our own crew** — this is post-construction window cleaning |
| Resurfacing the scratches | $8,250 | The subbed tech |
| Final polishing and quality check | $1,850 | The tech, then our walkthrough with the customer |
| Travel, lodging and mobilisation | $2,900 | Nearly nothing — we are local |

Two of those five are where the margin is: we already own the $4,950 and most
of the $2,900 disappears.

### The damage register

One row per mark. Fields: an ID (**A01–A23**), location, which face it is on
(inside or outside), severity, an edge flag, a rough glass size, the marked
zone size, a photo, a **duplicate-of** link, and a note on what drives the
price.

Severity ladder:

- **L0** — probably residue; try cleaning first
- **L1** — light abrasion
- **L2** — deep, or close to the edge

### The counting rule

**68 marks across 23 photo groups is not 68 scratches.** The same mark was
photographed from several angles. Duplicates are never counted twice, which is
why the register carries a duplicate-of link. Bidding the 68 would have roughly
tripled the tech days.

### Glass and coatings

Sierra Pacific windows with **Cardinal LoE³-366** glass. Coatings on the room
side or the outside — **i89**, **Neat** — **cannot be abraded**. Roughly **25%**
of the reported marks may have come from the manufacturer rather than the
trades, which makes them a warranty question, not a restoration line.

### How it is sold

Against replacement cost: replacing the glass would run **$45,000–$110,000**,
so a $19,400 bid is **17–43%** of that.

### Terms and exclusions

- **35% deposit**
- **14-day lead time**
- Lift or scaffold **excluded**
- Weld spatter **tested only** — removal not guaranteed
- Extra work needs a **written change order**
- The documents keep saying it is a range, with no guarantees, and are explicit
  that the range is neither a minimum nor a maximum

---

## Inferred, researched, or uncertain — NOT from the PDFs

- No published day rate for a glass restoration tech could be found. Get one
  from ours; it is the single biggest input to a restoration bid.
- GlassRenu-style kits run roughly **$400–$3,900** (kit through contractor
  kit). What you pay a tech for is skill, not equipment — which is what makes
  training our own people later realistic.
- One window-cleaning forum puts output at about **15 sq ft of light-to-moderate
  damage per hour**. One forum post, treated as a smell test and nothing more.
- A `share.google` link supplied alongside the PDFs did not resolve and was
  never read. If it mattered, it is still unread.

---

## Business questions that are not code

Settle these before the first job, not after:

- **Breakage.** Write into the sub agreement who pays if a tempered or coated
  pane breaks. Polishing tempered glass, especially near an edge, can weaken it.
- **Insurance.** The tech carries their own general liability and names HHH as
  additional insured.
- **Warranty.** Abrading coated glass may void the Sierra Pacific or Cardinal
  warranty. Get the builder's sign-off in writing, the way AGR does.
- **Promises.** Keep AGR's language: a range, not a guarantee.

---

## How this lands in the product

Walter The Window Wizard (`walter-windows`), whose engine is
`src/lib/windowEstimator.js`. Cleaning and restoration are two verticals over
one engine, not two engines — the residue-removal package above is the reason
why: it is window cleaning, and modelling it as a separate trade would hide
the margin.

Nothing on this page is a default in the code. Minutes per zone, day rates,
markup and the tier spread are per-company settings with documented seeds —
this ships to every tenant, and AGR's numbers are one worked example, not the
product.
