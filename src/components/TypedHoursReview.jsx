import { AlertTriangle, Clock, Lock } from 'lucide-react'

// Hours typed on a job that the bonus calculation has never counted.
//
// Bryce: "flag them on the payroll screen first". Counting them is correct —
// they are real work that never went against the allotment — but it lowers 14
// bonuses by around $3,750, and a number that quietly drops is how people stop
// trusting the payroll screen. So it is shown, explained, and applied by a
// person, not discovered afterwards.
//
// Nothing here changes anything. The parent owns the apply.
export default function TypedHoursReview({ rows = [], theme, onApply, applying = false }) {
  if (!rows.length) return null

  const willFall = rows.filter(r => r.savedAfter < r.savedBefore && r.bonusNow > 0 && !r.frozen)
  const atRisk = willFall.reduce((s, r) => s + r.bonusNow, 0)
  const frozen = rows.filter(r => r.frozen)
  const refused = rows.reduce((s, r) => s + (r.refusedEntries || 0), 0)
  const money = (n) => `$${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
  const hrs = (n) => `${Number(n || 0).toFixed(1)}h`

  return (
    <div style={{
      backgroundColor: theme.bgCard, border: `1px solid ${theme.warning || '#eab308'}`,
      borderLeft: `4px solid ${theme.warning || '#eab308'}`, borderRadius: '12px',
      padding: '16px 20px', marginBottom: '16px',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', marginBottom: '10px' }}>
        <AlertTriangle size={18} style={{ color: theme.warning || '#eab308', flexShrink: 0, marginTop: '2px' }} />
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
            {rows.length} job{rows.length === 1 ? ' has' : 's have'} hours typed in that bonuses have never counted
          </div>
          <div style={{ fontSize: '12px', color: theme.textSecondary, marginTop: '3px', lineHeight: 1.5 }}>
            Time added by hand on a job page went to job costing but never against the
            allotted hours, so efficiency bonuses were calculated as though that work
            did not happen. Counting it is correct and will lower{' '}
            <strong>{willFall.length}</strong> bonus{willFall.length === 1 ? '' : 'es'}
            {atRisk > 0 && <> totalling <strong>{money(atRisk)}</strong></>}.
            {frozen.length > 0 && <> {frozen.length} already paid and cannot change.</>}
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', margin: '12px 0' }}>
        <div style={{ minWidth: '620px' }}>
          <div style={{
            display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) 70px 80px 80px 110px 90px',
            gap: '8px', padding: '6px 8px', fontSize: '10px', fontWeight: '700',
            color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em',
          }}>
            <div>Job</div>
            <div style={{ textAlign: 'right' }}>Allotted</div>
            <div style={{ textAlign: 'right' }}>Clocked</div>
            <div style={{ textAlign: 'right' }}>Typed</div>
            <div style={{ textAlign: 'right' }}>Hours left</div>
            <div style={{ textAlign: 'right' }}>Bonus</div>
          </div>
          {rows.map(r => (
            <div key={r.job_id} style={{
              display: 'grid', gridTemplateColumns: 'minmax(0, 2fr) 70px 80px 80px 110px 90px',
              gap: '8px', padding: '7px 8px', fontSize: '12px', color: theme.text,
              borderTop: `1px solid ${theme.border}`, alignItems: 'center',
            }}>
              <div style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                   title={r.label}>
                {r.label}
                {r.frozen && (
                  <span style={{ marginLeft: 6, fontSize: '10px', color: theme.textMuted }}>
                    <Lock size={10} style={{ verticalAlign: '-1px' }} /> paid
                  </span>
                )}
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{hrs(r.allotted)}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{hrs(r.punchHours)}</div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: theme.warning || '#a16207' }}>
                +{hrs(r.typedHours)}
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                <span style={{ color: theme.textMuted }}>{hrs(r.savedBefore)}</span>
                <span style={{ color: theme.textMuted }}> → </span>
                <span style={{ color: r.savedAfter < 0 ? (theme.error || '#ef4444') : theme.text, fontWeight: 600 }}>
                  {hrs(r.savedAfter)}
                </span>
              </div>
              <div style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                {r.bonusNow > 0 ? money(r.bonusNow) : '—'}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ fontSize: '11px', color: theme.textMuted, lineHeight: 1.6, marginBottom: '12px' }}>
        <Clock size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
        A job showing negative hours left went over its allotment once the typed time counts, so it earns no bonus.
        {refused > 0 && (
          <> {refused} typed entr{refused === 1 ? 'y was' : 'ies were'} ignored — either a repeat of a clocked
          shift, or one person's box holding the whole crew's hours.</>
        )}
      </div>

      <button
        onClick={onApply}
        disabled={applying}
        style={{
          padding: '9px 16px', backgroundColor: theme.accent, color: '#ffffff', border: 'none',
          borderRadius: '8px', fontSize: '13px', fontWeight: '600',
          cursor: applying ? 'default' : 'pointer', opacity: applying ? 0.6 : 1, minHeight: '40px',
        }}
      >
        {applying ? 'Recalculating…' : 'Count these hours and recalculate'}
      </button>
      <span style={{ fontSize: '11px', color: theme.textMuted, marginLeft: 10 }}>
        Paid bonuses are never changed.
      </span>
    </div>
  )
}
