# Don The Dirt Digger — Build Plan

**Agent:** `don-excavator` (agents.id 16) · Construction · $39.99/mo · currently `coming_soon`, zero code
**Branch:** `feat/don-excavator` · **Worktree:** `C:\JobScout\js-don-wt`
**Written:** 2026-08-18

---

## 1. What Don actually is

Don is a **unit-price excavation estimator with an AI intake front-end and an as-built feedback loop.**

Not "AI looks at a photo and guesses a price." That product already exists in a dozen forms and every excavator who has tried one stopped after the second bid, because dirt work is the one trade where the quantity *is* the bid. Get the cubic yards wrong and no amount of pretty UI saves you.

Three claims Don has to be able to defend to a guy with 20 years on a 320:

1. **Every number traces to a source.** Plan sheet + region, field note + line, or a human keystroke. Nothing appears from nowhere. (This is the exact trap that bit Energy Scout — Damien couldn't see where an estimate came from because the panel was gated on `audit_id`. Don carries `source` + `source_ref` + `confidence` on every single quantity row from day one.)
2. **The math is right and it's the math they already do.** Bank/loose/compacted volumes, swell and shrink, OSHA sloping, truck cycles bound by weight *or* volume, production rates × efficiency factors. Deterministic JS, unit-tested. The LLM never computes a number.
3. **It learns from what actually happened.** Estimated 42 machine hours, job logged 51 → next bid on that soil class prices 21% higher. Same shape as Zach's `effort_factor` loop, which is already proven in this codebase.

**Who buys him:** site work contractors, utility/underground contractors, septic and residential dirt outfits, and the excavation division of GCs. 2–20 machines is the sweet spot — big enough that a blown bid hurts, small enough that they have no estimator on staff and are bidding off a legal pad at 9pm.

**What he replaces:** Agtek / Trimble Business Center / InSite SiteWork ($3k–$15k/seat, desktop, weeks to learn), plus the legal pad.

---

## 2. Non-negotiables

These are the things that, if we get them wrong, make Don a toy.

| Rule | Why |
|---|---|
| **LLM proposes, deterministic code disposes** | Same rule as Arnie's config engine. The AI extracts quantities and reads handwriting. `lib/digEstimator.js` does 100% of the arithmetic. An LLM that multiplies is an LLM that will eventually multiply wrong, silently, on a $180k bid. |
| **Unit-price first, lump-sum second** | Excavation bids are unit-price with quantity allowances because the dirt lies. Don's native output is a bid schedule (item / qty / unit / unit price / extension). Lump sum is a rollup of that, not the other way round. |
| **Volume state is always labeled** | BCY, LCY, CCY are three different numbers for the same dirt. Every volume in the DB carries its state. A field named `volume` with no state is a bug. |
| **Confidence is visible, never hidden** | Anything AI-derived shows its confidence and stays flagged until a human confirms. Below threshold → the bid won't send. |
| **`company_id` on every row, RLS on every table** | All 123 tenant tables are RLS-on as of the security rollout. Don's tables ship RLS-on from the migration, not later. |
| **All AI through `_shared/anthropic.ts`** | Metering → `ai_usage` + compute ledger, error taxonomy, billing alerts, graceful `ai_unavailable` degrade. No raw fetches to the API. |
| **Don't invent a second money path** | Quotes/lines/invoices already have one blessed path (`invoiceLines.js`, `resolveMatLabSplit`). Don writes `quote_lines` with correct `kind` and `unit_of_measure` and lets the existing machinery do the rest. Writing a parallel invoice builder is how this codebase broke five times before. |

---

## 2.5 Verticals are toggles, not a fork

**Decision (2026-08-19):** Don does not pick a vertical. He ships all of them and the company turns on the ones they do.

Excavation is one trade with three job shapes, and plenty of outfits do two or all three. Forking the product by vertical would mean three price books, three UIs, and a migration path when a trenching customer picks up a septic contract. Instead: one generic engine, and a per-company toggle set that decides what the UI offers and which price-book pack gets seeded.

```
dig_settings.verticals = {
  trenching: true,    // utility — water/sewer/storm/electric
  sitework:  true,    // mass ex, cut/fill, pads, road base
  foundation: true,   // footings, basements, septic, driveways
  demolition: false,  // (later) structure demo + haul
  land_clearing: false
}
```

What a toggle actually controls:

| Layer | Effect of a toggle |
|---|---|
| Takeoff UI | Which item types appear in the "add item" picker and which geometry form each opens (trench form vs area/depth form vs footing perimeter form) |
| Price book | Which seed pack gets installed on first enable (trenching: bedding, pipe, shoring, compaction testing · sitework: strip/stockpile, mass ex, import fill, fine grade · foundation: footing over-dig, tank set, leach field, driveway base) |
| Plan reader | Which schedules `don-read-plan` looks hardest for (pipe schedule vs earthwork table vs footing schedule) |
| Bid template | Section headings and default assumptions/exclusions |
| Calibration | Production rates are keyed by work_type, so a company running two verticals learns two sets — no cross-contamination |

The engine itself is vertical-blind: every geometry function, every volume conversion, every truck and production calculation is shared. A trench and a footing over-dig are the same prism math with different defaults. That is the point — one tested engine, five façades.

Default on first recruit: all three core verticals on, so nobody hits an empty app. Settings tab lets them switch off what they don't do, which just tidies the pickers.

---

## 3. The engine — `src/lib/digEstimator.js`

Pure functions, no I/O, fully unit-tested. This is the part that has to be bulletproof; everything else is UI around it.

### 3.1 Volume states and conversion

```
BCY (bank)      in-place, undisturbed          ← what you excavate, what plans show
LCY (loose)     after digging, swelled         ← what you HAUL (truck counts live here)
CCY (compacted) after placement + compaction   ← what you FILL
```

```
LCY = BCY × (1 + swell)
CCY = BCY × (1 − shrink)
BCY needed to produce 1 CCY of fill = 1 / (1 − shrink)
```

Seed factors by soil class (per-company overridable — these are starting values, the calibration loop replaces them with the company's real numbers):

| Soil class | Swell | Shrink | OSHA type | Max slope | Bank density |
|---|---|---|---|---|---|
| Topsoil | 25–40% | 10% | C | 1.5:1 | 2,400 lb/BCY |
| Common earth / loam | 25% | 10% | B | 1:1 | 2,800 lb/BCY |
| Sand | 12% | 8% | C | 1.5:1 | 2,900 lb/BCY |
| Sandy clay | 25% | 12% | B | 1:1 | 2,900 lb/BCY |
| Clay (stiff) | 35% | 15% | A/B | 0.75:1 | 3,100 lb/BCY |
| Gravel / cobble | 15% | 8% | C | 1.5:1 | 3,200 lb/BCY |
| Weathered rock / rippable | 40% | — | A | 0.75:1 | 3,600 lb/BCY |
| Rock (blasted) | 55% | — | — | vertical | 4,100 lb/BCY |

**The #1 estimating error this prevents:** you haul loose and you pay for bank. 1,000 BCY of stiff clay is 1,350 LCY on the road. Counting off bank yards at a 15 CY tri-axle gives 67 loads; the real answer is **97**. That 30-load gap is the whole profit on a small job. (Both numbers are asserted in `digEstimator.test.js` — the naive one included, so the gap can't quietly close.)

**The #2 error:** import fill. A pad calling for 900 CCY of structural fill needs ~1,060 BCY from the pit and arrives as ~1,300 LCY / ~1,400 tons. Quoting 900 of anything is a five-figure miss.

### 3.2 Geometry → volume

- **Prism / mass ex:** `area_sf × avg_depth_ft / 27`
- **Trench (vertical, shored):** `length × width × depth / 27`
- **Trench (sloped — this is the one everyone forgets):**
  `top_width = bottom_width + 2 × (slope_ratio × depth)`, average-end-area over the run.
  *Worked:* 100 LF, 4 ft bottom, 10 ft deep. Vertical = **148 CY**. Type C soil sloped 1.5:1 → top width 34 ft, avg 19 ft → **704 CY**. Same trench, **4.75× the dirt**, and every hand-built estimate in the industry gets this wrong or eats it. Don asks one question — box or slope — and the number is right.
  OSHA: protective system required ≥5 ft; ≥20 ft needs engineered design (Don flags, doesn't guess).
- **Footings/foundations:** perimeter × width × depth + over-dig working room (default 2 ft each side, configurable)
- **Pond / basin / detention:** frustum by average-end-area between contour bands
- **Backfill and net spoil:** `spoil_to_haul = excavated_LCY − backfill_LCY_required`; pipe, bedding, and structure volumes displace native and *increase* haul-off. Bedding default 6" below / 12" over pipe OD.

### 3.3 Trucking — bound by weight *or* volume, whichever hits first

```
loads = ceil(LCY / effective_truck_capacity)
effective_capacity = min(volumetric_cy, weight_limit_tons / loose_density_ton_per_lcy)
```

A 15 CY tri-axle at a 16-ton payload limit is really a **13.9 CY truck** in stiff clay and a **12.1 CY truck** in blasted rock — and less again in saturated material or under a lower legal axle limit. On the seed densities that is a 7–19% under-count, and it compounds with the swell error above: get both wrong on the same job and the truck line is off by a third.

Cycle time = load + haul + dump + return + queue. Trucks required to keep the hoe working = `truck_cycle_min / load_time_min`. Don sizes the fleet and prices either per-hour or per-load, whichever the company bids.

### 3.4 Production rates → machine hours

```
machine_hours = volume / (base_rate × efficiency × soil_difficulty × haul_penalty × operator_factor)
cost = machine_hours × (machine_rate + operator_rate + burden)
```

Seed rates (BCY/hr, tune per company — the calibration loop owns these after ~5 jobs):

| Equipment | Activity | Seed rate |
|---|---|---|
| Mini-ex 3–5t | trenching | 15–25 |
| 160-class (~35k lb) | mass ex | 60–90 |
| 320-class (~50k lb) | mass ex, truck-fed | 80–130 |
| D6 dozer | push ≤100 ft | 150–250 LCY/hr |
| Skid steer | grade / backfill | 30–60 |

Efficiency defaults: 50-minute hour = 0.83. Congested site 0.75. New operator 0.85. These stack.

### 3.5 Cost categories the bid must carry

Mobilization (lowboy in/out, per machine) · equipment (owned hourly or rental day/week + delivery) · operator labor + burden · trucking · dump/tipping fees (per ton or load, clean vs contaminated) · import material (per ton delivered) · dewatering · erosion control (silt fence $/LF, inlet protection ea, SWPPP) · traffic control · private utility locate · compaction testing per lift · permits/bonds · **allowances and unit-price adders for rock, unsuitable soils, and groundwater** · overhead + profit.

The risk adders are not decoration. Rock and water are what turn a good excavation bid into a loss, and the professional answer is a unit price on the bid form, not a bigger guess. Don makes that the default shape.

### 3.6 Output

`estimateDig({ items, priceBook, settings, ctx })` → `{ bidItems[], rollup, volumes, loads, machine_hours, assumptions[], warnings[], unpriced_count, low_confidence_count, ready_to_send }`

`assumptions[]` is a first-class output — the engine writes its own qualifications/exclusions page (soil priced for, sloping basis, weight-limited hauling, mobilization count), which is how excavators keep a surprise from becoming their problem.

`ready_to_send` is a gate, not advice: false while any line is unpriced or any sub-threshold AI guess is unconfirmed. The UI disables the send button on it.

**Status: built and green.** `src/lib/digEstimator.js` + `src/lib/digEstimator.test.js`, 69 tests passing — volume states, trench sloping and the OSHA flags, weight-vs-volume trucking, haul cycles, production rates, the calibration clamp, provenance pass-through, vertical toggles, pricing with minimum charges, the rollup order, and the `quote_lines` handoff.

---

## 4. The AI layer — honest tiers

This is where the plan has to be straight, because overclaiming here is how the product dies on first contact.

### Tier 1 — Read what the plans already say ✅ works, high confidence

Civil plan sets *contain* the answers: earthwork/cut-fill summary tables, pipe schedules ("240 LF 8" SDR-35 @ 1.0%"), structure schedules, quantity legends, general notes, sheet index, revision clouds. Extracting these is straight document AI — the same 2-pass OCR→structure pattern as `dougie-analyze`, which already survives handwritten lighting takeoff sheets in production.

`don-read-plan` returns: sheet number/discipline/revision, scale, benchmark, earthwork table rows, pipe runs, structures, callouts — each with a page + region reference so the user can click a number and see where it came from.

### Tier 2 — Scale-calibrated measurement 🤝 works with the human in the loop

The user taps the plan's scale bar (or any known dimension) → px-per-foot. Then trace an area or a pipe run; the app computes SF/LF and multiplies by a depth the user supplies or the plan states. **We already have this exact interaction** in `components/zach/YardMeasureModal.jsx` — Google Maps polygon tracing with `computeArea`, AI-suggested measurement, and a per-company calibration factor learned from user corrections. Don swaps the satellite tile for a plan image and reuses the whole pattern. Aerial tracing still works too, for site footprint and clearing.

### Tier 3 — Cut/fill from contours ⚠️ stretch, must be labeled preliminary

**A PDF has no elevation data.** True cut/fill needs a surface — existing contours and proposed grades, digitized. Any vendor claiming one-click cut/fill from a plan photo is lying, and excavators know it. Don's honest path: user digitizes contour lines (or spot elevations) with values, we build a grid and run average-end-area / grid method, and the result is stamped **PRELIMINARY ±15–25%** with a prompt to verify against the plan's own earthwork table when one exists. Anything else is how you get sued.

### Tier 1.5 — Handwritten field notes 📝 the sleeper feature

This is the one that makes crews love him. Photo of a legal pad: *"Tues — 320 6.5 hrs, 14 loads to Miller pit, 40 ton base, hit rock @ 6' NE corner."* → structured quantities, machine hours, loads, tons, and a flagged rock exposure. Direct `dougie-analyze` lineage, including the `dougie_corrections` few-shot learning loop **which already exists as a table** — Don just uses `field_type='dig_note'` / `'dig_plan'`. Zero new infrastructure for the learning loop.

### Site photos

`don-read-site`: soil class guess from the cut face, access constraints (gates, overhead lines, slope, staging room), existing-conditions documentation (the cheapest claim defense there is), rough spoil-pile volume. Soil ID from a photo is *advisory* — it seeds the field, the human confirms, and it never silently changes a price.

---

## 5. Data model

All tables `company_id`-scoped, RLS-on in the same migration. Prefix `dig_` (mirrors Zach's `lawn_`).

| Table | Purpose | Notes |
|---|---|---|
| `dig_sites` | The project/site record | `lawn_properties` analog: address, lat/lng, `site_polygon` GeoJSON, access notes, water table, utility notes, `customer_id`/`lead_id`, default soil class |
| `dig_plans` | Uploaded plan sheets | storage path in `project-documents`, sheet no/discipline/revision, page, `scale_px_per_ft`, extraction status + raw AI JSON |
| `dig_takeoffs` | A takeoff version per site | revision label, status draft/final, totals snapshot, overall confidence, links to plan set |
| `dig_takeoff_items` | **The quantity rows** | work_type, geometry inputs (area_sf, length_lf, width_ft, depth_ft, count), soil_class, `volume_bcy`/`volume_lcy`/`volume_ccy`, loads, machine_hours, `source` (plan\|ai_photo\|handwritten\|measured\|manual), `source_ref` (sheet+region), `confidence`, `confirmed_by`, resolved price-book item |
| `dig_rates` | Per-company price book | code, label, uom (CY/LF/TON/HR/LOAD/EA/DAY/SF), unit_price, cost, production rate + unit, machine class, operator rate, min charge, mobilization |
| `dig_soil_profiles` | Per-company soil factors | swell, shrink, OSHA type, slope ratio, density, difficulty multiplier, rock adder |
| `dig_actuals` | As-built | machine hours, loads, tons in/out, tied to `job_id`; sourced from `time_clock`, `job_lines`, expenses, and hauling tickets |
| `dig_calibration` | Learned factors | per company × work_type × soil_class: factor + sample_n (≥3 to apply, Zach's rule) |
| `dig_settings` | Per-company config | `verticals` toggles (§2.5), confidence threshold, default truck/soil, units, bid template prefs |

**Reused, not rebuilt:** `dougie_corrections` (learning loop), `products_services` + `product_components` (sellable items and assemblies), `quotes`/`quote_lines`, `jobs`/`job_lines`, `project-documents` and `audit-photos` buckets, `ai_usage`/compute ledger.

---

## 6. Edge functions

| Function | Input | Output | Model |
|---|---|---|---|
| `don-read-plan` | plan page image(s) | sheet meta, scale, earthwork table, pipe/structure schedules, callouts — each with region ref | Sonnet 4.6, 2-pass |
| `don-read-notes` | photo of handwritten notes/takeoff sheet | quantities, hours, loads, tons, exposures | Sonnet 4.6, 2-pass + corrections few-shot |
| `don-read-site` | site photos | soil class candidate, access constraints, conditions notes, spoil estimate | Sonnet 4.6, single pass |
| `don-corrections` | user edits to any of the above | writes `dougie_corrections` rows | no AI |

All via `callAnthropic({ feature, companyId, req })`. All degrade to manual entry on `ai_unavailable` — Don never blocks a bid on an API outage (Victor's rule).

⚠️ Deploy with `--no-verify-jwt` where the function is called from a public/portal surface, and pin it in `config.toml`, or the deploy silently resets `verify_jwt` and 401s.

---

## 7. Platform integration — how Don plugs into the money

**Quote push** — copy `components/zach/EstimateModal.jsx` exactly:

```
dig_takeoffs → quotes (audit_type: 'excavation', service_type: 'Excavation',
                       audit_id: takeoff.id, quote_amount: rollup.total)
             → quote_lines (one per bid item)
             → leads.quote_id + status 'Estimate Sent'
             → back-link quote_id onto the takeoff
```

`audit_type` is already the polymorphic discriminator — live values are `lighting` (105 quotes) and `lawn_care`. Adding `excavation` costs nothing and it lands in the existing pipeline, follow-up automation, portal, and PDF flows for free.

**Line-item fields that matter downstream — get these right or the invoice breaks:**
- `unit_of_measure` — Don introduces CY / LF / TON / HR / LOAD / DAY (existing values are only `Sq. Ft.`, `Each`)
- `kind` — must be `labor` or `materials`; this feeds `resolveMatLabSplit` and the whole in-scope/out-of-scope invoice view
- `in_utility_scope` — false for Don (that's Energy Scout's rebate concept)

**Job side:** accepted bid → job carries the takeoff. `job_lines` get the same quantities so the field can report against them. Machine hours flow from `time_clock`, loads from field entry or hauling tickets.

**Actuals loop:** `dig_actuals` vs `dig_takeoff_items` → variance report → `dig_calibration`. This is Don's moat and his tagline. "Ground truth, guaranteed" means *we measured what the machine actually did.*

**Also free from the platform:** Victor photo-verifies completion, FieldScout captures site photos offline, `poUtils` orders import material against the takeoff quantities, Frankie sees the margin, Conrad markets it.

---

## 8. UI — `/agents/don`

`DonWorkspace` = `<AgentRequired slug="don-excavator">` + `<AgentHeader tabs>` + `<Outlet/>`, tabs:

1. **Sites** — list + detail, map, photos, soil defaults, access notes
2. **Takeoff** — plan viewer with scale calibration and trace tools · AI extract button · the item grid with live volume math and a source badge + confidence chip on every row
3. **Bid** — unit-price bid schedule, allowances/alternates, assumptions & exclusions, rollup, **Push to Quote**
4. **Price Book** — `dig_rates` + soil profiles editor, with calibration deltas shown inline
5. **Actuals** — estimated vs actual by work type; the calibration ledger
6. **Settings** — defaults, thresholds, which tiers are enabled

Conventions: inline `style={{}}` with the theme object (no Tailwind), Lucide icons (no emoji), 44px touch targets, `minmax(0,1fr)` grid tracks, local state + `onBlur`, empty states with guidance, `HelpBadge` tooltips. Verify at 375px with `scripts/ui-test-user.cjs`.

---

## 9. Slices

Each slice ships on its own and is independently useful. **Slice 1 is the product** — an excavator would pay for it with zero AI in the build.

| # | Slice | Contents | Done when |
|---|---|---|---|
| **0** | Foundation | migration (9 tables + RLS), `AGENT_MODULE_TEMPLATES` entry, routes, workspace shell, Sites CRUD, vertical toggles | Recruit Don in Base Camp → he appears in the sidebar → create a site |
| **1** | **The engine** | `digEstimator.js` + full unit test suite (all verticals), price-book seed packs per vertical, soil profiles, manual takeoff entry, bid sheet, **push to quote + line items** | A real excavator hand-enters a job and the bid matches their own spreadsheet within a few percent |
| **2** | Dirt Dougie | `don-read-notes` + `don-read-plan`, review/correct UI, corrections loop | Photo of a legal pad becomes takeoff items you only have to fix, not retype |
| **3** | Measure | plan scale calibration + trace tools, aerial site tracing, `don-read-site` | Trace a pipe run on a plan → LF → priced line |
| **4** | Ground truth | `dig_actuals` from time clock + field entry, variance report, `dig_calibration` feeding rates | Second bid on similar soil prices off *their* real production, not our seed table |
| **5** | Ship it | walkthrough knowledge cards, Base Camp copy + demo data, proposal PDF layout, `status → active` | Listed and sellable |

---

## 10. Traps

- **Don't claim cut/fill you can't compute.** Tier 3 stays labeled preliminary. One bad cut/fill number ends the relationship with a dirt contractor permanently.
- **Trench sloping.** Bake it in from day one; it is the biggest single source of quantity error and our best "oh damn, it caught that" moment.
- **Weight vs volume on trucks.** See §3.3.
- **Don't fork the money path.** `quote_lines` with correct `kind`, then let `invoiceLines.js` own it. Five prior breakages say so.
- **Don't let AI write a price.** Quantities only. Ever.
- **Migration + push discipline.** `npx supabase migration new` → `npx supabase db push --linked`; wrap `CREATE POLICY` in the `DO $$ … EXCEPTION WHEN duplicate_object` guard. Verify pushes with merge-base — four other sessions are live in this repo right now.
- **Verify live, not pushed.** "Deployed" ≠ "working." Probe the function, load the page.

---

## 11. Open questions for Bryce

1. ~~Which excavation vertical first?~~ **Answered 2026-08-19: all of them, behind per-company toggles.** See §2.5.
2. **Is there a design partner** — a real dirt contractor whose plans, price book, and last five bids we can calibrate against? Slice 1's acceptance test needs one, and it is the difference between "plausible" and "they want it bad."
3. **Bid-form output:** do they bid public work with mandated bid schedules (needs an exportable line-item form) or private proposals (the existing estimate PDF is enough)?
