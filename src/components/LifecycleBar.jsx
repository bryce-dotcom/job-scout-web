// The lifecycle bar — how much life is left, and when to sell.
//
// One bar answers the question a fleet owner cannot otherwise see: this
// machine's largest cost is depreciation, it is invisible because it never
// arrives as an invoice, and it is spent on a schedule nobody is watching.
//
// Deliberately readable in three ways, because colour alone fails for a
// meaningful slice of users and fails entirely in a printed report: colour,
// position of the marker, and a text verdict.
//
// When inputs are missing the bar does not draw. A greyed strip saying which
// two numbers would unlock it is worth more than a confident bar built from
// defaults nobody entered — and far better than the alternative this codebase
// has produced twice already, which is a plausible number computed from
// nothing.

import { AlertTriangle, TrendingDown, Clock } from 'lucide-react'

const ZONE = {
  keep: '#5a6349',
  plan: '#eab308',
  replace: '#ef4444',
}

const VERDICT_COPY = {
  keep: 'Cheap years',
  plan: 'Plan replacement',
  replace: 'Costing you money',
  unknown: 'Not enough data',
}

// The headline follows the RECOMMENDATION, not the position on the wear
// curve. A nine-month-old truck driven 5,000 miles a year is genuinely early
// in its life and genuinely should be sold, and the first version of this
// said 'Cheap years' in green directly above 'sell it' in amber. Both true,
// read as broken. Under-use is its own headline because it is its own
// problem — nothing to do with wear, and invisible on a wear curve.
const HEADLINE = {
  keep: { text: 'Cheap years', colour: ZONE.keep },
  plan: { text: 'Plan replacement', colour: ZONE.plan },
  replace: { text: 'Costing you money', colour: ZONE.replace },
  sell_or_rent: { text: 'Under-used', colour: ZONE.plan },
}

/** "3,898 mi" / "1,240 hrs" — the meter, in the unit that asset is valued in. */
function meterLabel(value, basis) {
  if (value === null || value === undefined) return '—'
  const n = Math.round(Number(value))
  return `${n.toLocaleString()} ${basis === 'hours' ? 'hrs' : 'mi'}`
}

function money(n) {
  if (n === null || n === undefined) return '—'
  return `$${Math.round(Number(n)).toLocaleString()}`
}

export default function LifecycleBar({ lifecycle, recommendation, theme, compact = false }) {
  if (!lifecycle) return null

  const { verdict, position, zones, basis, value, costPerUnit, limitedBy, yearsToWearOut, missing } = lifecycle

  // Nothing to draw yet. Say what would fix it — these are two numbers off a
  // dash and an invoice, not a data project.
  if (verdict === 'unknown' || position === null) {
    const friendly = {
      purchase_price: 'what it cost',
      purchase_date: 'when it was bought',
      meter_reading: 'a meter reading',
      meter_at_purchase: 'the meter when bought',
      odometer_anchor: 'a dash reading',
      asset_class: 'what kind of asset it is',
    }
    // Ordered by what actually unlocks the answer: price and age first,
    // because with those two a bar can be drawn at all.
    const ORDER = ['purchase_price', 'purchase_date', 'asset_class', 'odometer_anchor', 'meter_at_purchase', 'meter_reading']
    const all = [...(missing || [])].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b))
    const wants = all.slice(0, 2).map(m => friendly[m] || m)
    const more = all.length - wants.length
    return (
      <div style={{
        marginTop: 12, padding: '10px 12px', borderRadius: 8,
        background: theme.bg, border: `1px dashed ${theme.border}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <Clock size={14} style={{ color: theme.textMuted, flexShrink: 0 }} />
        <div style={{ fontSize: 11, color: theme.textMuted, lineHeight: 1.4 }}>
          {wants.length
            ? <>Add <strong style={{ color: theme.textSecondary }}>{wants.join(' and ')}</strong>
                {more > 0 ? ` (+${more} more)` : ''} to see when to sell this one.</>
            : 'Lifecycle unavailable for this asset.'}
        </div>
      </div>
    )
  }

  const headline = HEADLINE[recommendation?.action] || HEADLINE[verdict] ||
    { text: VERDICT_COPY[verdict], colour: ZONE[verdict] || theme.textMuted }
  const colour = headline.colour
  const keepPct = Math.max(0, Math.min(1, zones.keepUntil)) * 100
  const planPct = Math.max(keepPct / 100, Math.min(1, zones.planUntil)) * 100

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{
        display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
        gap: 8, marginBottom: 6, flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: 11, fontWeight: 700, color: colour, letterSpacing: '.02em' }}>
          {headline.text}
        </span>
        {!compact && value !== null && (
          <span style={{ fontSize: 11, color: theme.textMuted }}>
            worth {money(value)}
            {costPerUnit !== null && <> · {money(costPerUnit * 100) === '—' ? '' : `$${costPerUnit.toFixed(2)}`}/{basis === 'hours' ? 'hr' : 'mi'}</>}
          </span>
        )}
      </div>

      {/* Three zones, then a marker. The marker is a dark tick rather than a
          coloured one so it stays visible against whichever zone it lands in. */}
      <div style={{ position: 'relative', paddingTop: 2, paddingBottom: 2 }}>
        <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', background: theme.border }}>
          <div style={{ width: `${keepPct}%`, background: ZONE.keep }} />
          <div style={{ width: `${planPct - keepPct}%`, background: ZONE.plan }} />
          <div style={{ width: `${100 - planPct}%`, background: ZONE.replace }} />
        </div>
        <div
          title={`${(position * 100).toFixed(0)}% through its economic life`}
          style={{
            position: 'absolute', top: -2, left: `${position * 100}%`,
            width: 2, height: 16, background: theme.text,
            transform: 'translateX(-1px)', borderRadius: 1,
          }}
        />
      </div>

      {!compact && (
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 10, color: theme.textMuted, display: 'flex', alignItems: 'center', gap: 4 }}>
            {limitedBy === 'age'
              // The surprising case, and the one worth naming out loud: low
              // mileage does not mean low cost.
              ? <><TrendingDown size={10} /> ageing faster than it wears</>
              : <>{meterLabel(lifecycle.lifetimeUsed, basis)} used</>}
          </span>
          {yearsToWearOut !== null && yearsToWearOut > 25 && (
            <span style={{ fontSize: 10, color: '#b07300', fontWeight: 600 }}>
              ~{yearsToWearOut} yrs to wear out at this rate
            </span>
          )}
        </div>
      )}

      {!compact && recommendation && recommendation.action !== 'keep' && recommendation.action !== 'incomplete' && (
        <div style={{
          marginTop: 8, padding: '8px 10px', borderRadius: 6,
          background: verdict === 'replace' ? 'rgba(239,68,68,.08)' : 'rgba(234,179,8,.10)',
          border: `1px solid ${verdict === 'replace' ? 'rgba(239,68,68,.35)' : 'rgba(234,179,8,.4)'}`,
          display: 'flex', gap: 6, alignItems: 'flex-start',
        }}>
          <AlertTriangle size={12} style={{ color: verdict === 'replace' ? '#b91c1c' : '#8a6d08', marginTop: 1, flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: theme.textSecondary, lineHeight: 1.4 }}>
            {recommendation.reason}
          </span>
        </div>
      )}
    </div>
  )
}
