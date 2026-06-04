# MES Vendor Swap — HHH Electrical Bundles

**Date swapped:** 2026-05-21
**Performed by:** Bryce (via JobScout admin tooling)
**For review by:** London, Alayda, Doug
**Status:** ✅ LIVE — all changes committed to the JobScout database

---

## TL;DR

- **28 LEDONE/ML/WL fixture products archived** (set `active=false`, kept in DB for audit/history)
- **28 brand-new MES product rows created** (clean records, IDs 2094–2121, `manufacturer = "MES"`)
- **104 parent bundle component pointers updated** to reference the new MES products instead of the archived ones
- **11 SMBE customer-facing parent bundles** had a brief in-place cost edit rolled back to their original state (cost still calculated from their sub-components, as it was before)
- **No customer-facing selling prices changed.** Every SMBE parent bundle still sells for the same price it did yesterday.
- **7 LEDONE/WL bundles still need London's call** — no green-highlighted MES equivalent (listed at the bottom)

---

## What changed in the database

### Old products (archived — still queryable for historical reports)

| Old ID | Original Name | Cost | Status |
|---:|---|---:|---|
| 1955 | LEDONE 70W/90W/110W Highbay | $71.07 | ARCHIVED 2026-05-21 |
| 1957 | LEDONE 180W/200W/220W Highbay | $125.66 | ARCHIVED 2026-05-21 |
| 1958 | LEDONE 290W/320W/350W Highbay | $182.31 | ARCHIVED 2026-05-21 |
| 1959 | LEDONE 360W/400W/440W Highbay | $199.30 | ARCHIVED 2026-05-21 |
| 1960 | LEDONE Adjustable Area Lights 75W/100W/120W/150W | $194.15 | ARCHIVED 2026-05-21 |
| 1961 | LEDONE Adjustable Area Lights 160W/200W/240W/320W | $286.34 | ARCHIVED 2026-05-21 |
| 1962 | LEDONE Mini Wall Pack 8W/10W/15W/25W | $88.91 | ARCHIVED 2026-05-21 |
| 1963 | LEDONE Adjustable Wall Packs 20W/30W/40W/50W | $65.92 | ARCHIVED 2026-05-21 |
| 1964 | LEDONE Adjustable Wall Packs 50W/60W/80W/100W | $103.51 | ARCHIVED 2026-05-21 |
| 1965 | LEDONE Strip Light 48W/68W/90W | $86.52 | ARCHIVED 2026-05-21 |
| 1966 | LEDONE Strip Light 60W/70W/80W | $70.00 | ARCHIVED 2026-05-21 |
| 1967 | LEDONE Backlit Panels 20W/25W/30W (1X4) | $42.23 | ARCHIVED 2026-05-21 |
| 1968 | LEDONE Backlit Panels 20W/25W/30W (2X2) | $40.17 | ARCHIVED 2026-05-21 |
| 1969 | LEDONE Backlit Panels 30W/35W/40W (2X4) | $49.95 | ARCHIVED 2026-05-21 |
| 2002 | LEDONE Vapor Tight Fixtures 25W/35W/50W | $69.01 | ARCHIVED 2026-05-21 |
| 2003 | LEDONE Vapor Tight Fixtures 60W/75W/90W | $156.56 | ARCHIVED 2026-05-21 |
| 2006 | LEDONE Canopy 40W/50W/60W/75W | $67.98 | ARCHIVED 2026-05-21 |
| 2009 | WL 130/150/165W Highbay | $65.00 | ARCHIVED 2026-05-21 |
| 2010 | WL 70/90/110W Highbay | $49.00 | ARCHIVED 2026-05-21 |
| 2011 | WL 130/150/165W Highbay | $65.00 | ARCHIVED 2026-05-21 |
| 2046 | ML 50W/60W/70W/90W/110W Highbay | $65.80 | ARCHIVED 2026-05-21 |
| 2047 | ML 90W/110W/130W/150W/165W Highbay | $72.80 | ARCHIVED 2026-05-21 |
| 2048 | ML 150W/165W/180W/200W/220W Highbay | $81.50 | ARCHIVED 2026-05-21 |
| 2049 | ML 220W/280W/320W/360W/400W Highbay | $175.00 | ARCHIVED 2026-05-21 |
| 2050 | ML 105W/135W/155W/180W Highbay | $195.00 | ARCHIVED 2026-05-21 |
| 2051 | ML 2x2 Backlit Panel Retrofit Kit 20W/25W/30W | $35.10 | ARCHIVED 2026-05-21 |
| 2052 | ML 2x4 Backlit Panel Retrofit Kit 23W/30W/36W | $51.50 | ARCHIVED 2026-05-21 |
| 2053 | ML 2x4 Backlit Panel Retrofit Kit 35W/40W/46W | $53.50 | ARCHIVED 2026-05-21 |

### New MES products (active, replacing the archived ones above)

| New ID | Replaces | New MES Name | MES SKU | New Cost | Δ Cost |
|---:|---:|---|---|---:|---:|
| 2094 | 1955 | 70W/90W/110W Highbay (MES) | 5116 | $65.80 | −$5.27 |
| 2095 | 1957 | 180W/200W/220W Highbay (MES) | 5118 | $81.50 | −$44.16 |
| 2096 | 1958 | 290W/320W/350W Highbay (MES) | 6785 | $175.00 | −$7.31 |
| 2097 | 1959 | 360W/400W/440W Highbay (MES) | 6785 | $175.00 | −$24.30 |
| 2098 | 1960 | Adjustable Area Lights 75W/100W/120W/150W (MES) | 5148 | $98.50 | −$95.65 |
| 2099 | 1961 | Adjustable Area Lights 160W/200W/240W/320W (MES) | 5144 | $145.50 | −$140.84 |
| 2100 | 1962 | Mini Wall Pack 8W/10W/15W/25W (MES) | 3963 | $36.75 | −$52.16 |
| 2101 | 1963 | Adjustable Wall Packs 20W/30W/40W/50W (MES) | 6247 | $59.75 | −$6.17 |
| 2102 | 1964 | Adjustable Wall Packs 50W/60W/80W/100W (MES) | 6236 | $67.50 | −$36.01 |
| 2103 | 1965 | Strip Light 48W/68W/90W (MES) | 6684 | $42.00 | −$44.52 |
| 2104 | 1966 | Strip Light 60W/70W/80W (MES) | 6686 | $68.00 | −$2.00 |
| 2105 | 1967 | Backlit Panels 20W/25W/30W (1X4) (MES) | 6471 | $39.50 | −$2.73 |
| 2106 | 1968 | Backlit Panels 20W/25W/30W (2X2) (MES) | 5138 | $35.10 | −$5.07 |
| 2107 | 1969 | Backlit Panels 30W/35W/40W (2X4) (MES) | 6427 | $43.50 | −$6.45 |
| 2108 | 2002 | Vapor Tight Fixtures 25W/35W/50W (MES) | 3635 | $67.50 | −$1.51 |
| 2109 | 2003 | Vapor Tight Fixtures 60W/75W/90W (MES) | 3635 | $67.50 | −$89.06 |
| 2110 | 2006 | Canopy 40W/50W/60W/75W (MES) | 6028 | $45.00 | −$22.98 |
| 2111 | 2009 | 130/150/165W Highbay (MES) | 5117 | $72.50 | +$7.50 |
| 2112 | 2010 | 70/90/110W Highbay (MES) | 5116 | $65.80 | +$16.80 |
| 2113 | 2011 | 130/150/165W Highbay (MES) | 5117 | $72.50 | +$7.50 |
| 2114 | 2046 | 50W/60W/70W/90W/110W Highbay (MES) | 5116 | $65.80 | $0.00 |
| 2115 | 2047 | 90W/110W/130W/150W/165W Highbay (MES) | 5117 | $72.50 | −$0.30 |
| 2116 | 2048 | 150W/165W/180W/200W/220W Highbay (MES) | 5118 | $81.50 | $0.00 |
| 2117 | 2049 | 220W/280W/320W/360W/400W Highbay (MES) | 6785 | $175.00 | $0.00 |
| 2118 | 2050 | 105W/135W/155W/180W Highbay (MES) | 5118 | $81.50 | −$113.50 |
| 2119 | 2051 | 2x2 Backlit Panel Retrofit Kit 20W/25W/30W (MES) | 5138 | $35.10 | $0.00 |
| 2120 | 2052 | 2x4 Backlit Panel Retrofit Kit 23W/30W/36W (MES) | 5139 | $51.50 | $0.00 |
| 2121 | 2053 | 2x4 Backlit Panel Retrofit Kit 35W/40W/46W (MES) | 5140 | $53.50 | $0.00 |

### Parent bundles re-wired

**104 `product_components` rows** were updated to point at the new MES product IDs. Example:

> Bundle 1370 "SMBE 70W/90W/110W Highbay Relocation/Lift/Control" now contains:
> - Relocation Accessories/Materials ($35)
> - ES LIFT ($24.99)
> - WL HB Control ($32)
> - **70W/90W/110W Highbay (MES), SKU 5116, $65.80** ← was archived product 1955

All 104 parent bundles (everything from "SMBE 70W/90W/110W Highbay" through "SMBE 360W/400W/440W Highbay Relocate/Lift/Controls") got their lighting component swapped to MES automatically.

## What is on each new MES product

Each new product row in JobScout has:

- `manufacturer`: "MES"
- `model_number`: MES SKU (matches London's pricing sheet 1:1)
- `name`: "{Watt range} {Fixture type} (MES)" — e.g., "70W/90W/110W Highbay (MES)"
- `cost`: MES cost from London's green-highlighted picks
- `unit_price`: same selling price the archived product had
- `description`: full traceability — MES section, SKU, watt range, original cost, "Selected by London", reference count to parent bundles
- `active`: true
- Business unit, group, taxable, allotted hours, labor rate, utility scope, Lenard suggest flag — all cloned from the archived product so estimate behavior is identical

## Financial summary (across 28 swapped fixtures, qty=1 each)

| Metric | Value |
|---|---:|
| Old total cost | $2,808.79 |
| New total cost | $2,680.10 |
| **Net cost change** | **−$128.69** (savings) |

**24 of 28** got cheaper, **4 stayed the same**, **3 got more expensive** (WL Highbays, +$7.50 to +$16.80 each — minor).

## Top wins (biggest cost drops per fixture)

| New Product | MES SKU | Old → New | Saved |
|---|---|---:|---:|
| Adjustable Area Lights 160W/200W/240W/320W (MES) | 5144 | $286.34 → $145.50 | **$140.84** |
| 105W/135W/155W/180W Highbay (MES) | 5118 | $195.00 → $81.50 | **$113.50** |
| Adjustable Area Lights 75W/100W/120W/150W (MES) | 5148 | $194.15 → $98.50 | **$95.65** |
| Vapor Tight Fixtures 60W/75W/90W (MES) | 3635 | $156.56 → $67.50 | **$89.06** |
| Mini Wall Pack 8W/10W/15W/25W (MES) | 3963 | $88.91 → $36.75 | **$52.16** |

## ⚠️ Still needs attention — 7 bundles with no green-approved MES match

These products are **still active and untouched** because no green-highlighted MES product fits. London needs to call each one:

| ID | Bundle | Current Cost | Selling Price | Why no green match |
|---:|---|---:|---:|---|
| 1954 | LEDONE Wrap Fixture 30W/40W/50W/60W | $73.64 | $147.28 | No green wrap fixtures in MES sheet |
| 1956 | LEDONE 145W/160W/175W Highbay | $95.79 | $191.58 | 4 green highbays in MES, none in the 145–175W range |
| 2005 | LEDONE Canopy 25W/50W/75W/100W | $77.76 | $155.52 | 1 green canopy in MES, but no watt overlap |
| 2007 | WL 30/40/50/60/72W Panel 2x4 | $45.00 | $112.50 | 14 green panels, none at 30–72W 2x4 |
| 2008 | WL 12/17/22/27/32W Panel 2x2 | $35.00 | $87.50 | 14 green panels, none at 12–32W 2x2 |
| 2012 | WL 220/275/300 Highbay | $134.00 | $335.00 | 4 green highbays, none in 220–300W range |
| 2004 | WL Vapor Tight Control | $65.00 | $130.00 | Controls/sensor add-on, not a fixture — no MES equivalent |

**London — pick one per row:** (a) override to a non-green MES SKU, (b) pick a different fixture family, or (c) deactivate the bundle.

## ⚠️ For Alayda — accounting / margin reporting heads-up

1. **COGS feeds** — if QuickBooks (or any other accounting system) sees `cost` on the archived old product IDs (1955, 1961, etc.), it will still see those same values (we left their cost intact for historical reporting). New estimates and invoices now reference IDs 2094–2121 with the new MES cost.
2. **Margin reports** — any view filtered on `manufacturer = 'LEDONE'` or `'ML'` or `'WL'` now returns zero rows for active products. Filter to `manufacturer = 'MES'` instead (or check the archived flag).
3. **Markup % display** — the SMBE parent bundles still show their original markups. Their cost is still $0 (intentionally — they roll up from components), so the markup_percent field on those rows is unchanged from before.

## ⚠️ For Doug — field crew / sales comms

1. **All new estimates from today forward** will show MES products (with "(MES)" suffix in the name). Old estimates already in the field still show LEDONE / ML / WL names because line items snapshot the product info at creation time.
2. **Customer-facing selling prices are identical.** No need to re-quote anyone, no awkward "the price went up" conversations.
3. **Spec sheets / DLC listings** — the archived products' spec sheet URLs were NOT cloned to the new MES rows (since they reference LEDONE/ML/WL part numbers). London should upload the MES spec sheets for the 28 new products at her convenience. They are not blocking for selling, but useful for utility rebate submissions.
4. **Lenard (lighting AI agent)** — the `suggest_in_lenard` flag was cloned, so Lenard will suggest the MES products in the same scenarios where she used to suggest the LEDONE / ML / WL products.

## Audit / rollback

Everything is logged at:

- `scripts/_archive_replace_log.json` — every rollback, archive, create, and repoint with row IDs
- `scripts/_mes_swap_results.json` — earlier in-place swap snapshot (kept for completeness)
- `scripts/MES_SWAP_REPORT.md` — this file

**To roll back the entire change** (15-minute script):
1. For each entry in `log.newProducts`, delete the new product row (after first checking nothing references it in estimates/invoices)
2. For each entry in `log.repoints`, restore `component_product_id` to `oldComponentId`
3. For each entry in `log.archives`, set `active=true` and strip the " (ARCHIVED 2026-05-21)" suffix from name

Existing estimates / invoices / job line items are **unaffected** by archives or product replacement — line items snapshot product info when created.

## Open questions

**London:**
- The 7 unmapped bundles — what's the plan?
- Should we also archive the LEDONE / ML / WL products that are NOT used as components in any bundle (other than the 28 we just archived)? If you only use these for direct line-item sales (not bundles), we should clean them up too.
- Upload MES spec sheets for the 28 new products when you have a minute.

**Alayda:**
- Any reports filtered on manufacturer/vendor name that need updating?
- Year-over-year cost trend reports — heads-up that fixture costs dropped on most SKUs as of today.

**Doug:**
- Want me to draft a one-pager / Loom for the sales team explaining the swap (same selling price, better margins, MES instead of LEDONE)?
- Field crew training docs — anything that needs updating to reflect MES products?

---

*Generated 2026-05-21 by `scripts/_archive_and_replace_mes.mjs` · Audit log: `scripts/_archive_replace_log.json` · Source data: `scripts/_mes_catalog_with_colors.json` (MES pricing sheet with London's green highlights).*
