import { AlertTriangle, ExternalLink } from 'lucide-react'
import { useTheme } from './Layout'
import { describeMatch } from '../lib/leadDuplicates'

// Shown inside any form that is about to create a lead, when
// findSimilarLeads() found one that looks like the same customer.
//
// The point is to make "use the one that exists" the easy path. A rep who
// creates a near-duplicate is not being careless — the existing lead simply
// was not in front of them at the moment they typed. Put it there.
//
// Props:
//   matches        from findSimilarLeads()
//   employees      store.employees, to name who set the existing lead
//   onUseExisting  (lead) => void — the form should switch to that lead
//   onCreateAnyway () => void — the person has looked and it really is new
//   useLabel       what "use it" means in this form, e.g. "Open this lead"
function DuplicateLeadWarning({ matches, employees = [], onUseExisting, onCreateAnyway, useLabel = 'Use this lead' }) {
  const { theme } = useTheme()
  if (!matches?.length) return null

  const who = (id) => employees.find((e) => String(e.id) === String(id))?.name || null
  const ago = (iso) => {
    if (!iso) return ''
    const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
    if (mins < 60) return `${mins} min ago`
    if (mins < 60 * 36) return `${Math.round(mins / 60)} h ago`
    return `${Math.round(mins / 1440)} days ago`
  }

  const warn = '#b45309'
  const warnBg = 'rgba(234,179,8,0.10)'
  const warnBorder = 'rgba(234,179,8,0.45)'

  return (
    <div role="alert" style={{ marginBottom: 16, padding: 14, backgroundColor: warnBg, border: `1px solid ${warnBorder}`, borderRadius: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <AlertTriangle size={18} style={{ color: warn, flexShrink: 0, marginTop: 1 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, color: theme.text, fontSize: 14 }}>
            {matches.length === 1 ? 'This lead may already exist' : `${matches.length} leads look like this one`}
          </div>
          <div style={{ color: theme.textSecondary, fontSize: 13, marginTop: 2 }}>
            Creating a second lead for the same customer splits the appointment, the quote and the setter's commission across two records.
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
            {matches.slice(0, 3).map((m) => {
              const l = m.lead
              const setter = who(l.setter_owner_id) || who(l.lead_source_employee_id)
              const owner = who(l.lead_owner_id) || who(l.salesperson_id)
              return (
                <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: 8, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 180 }}>
                    <div style={{ fontWeight: 600, color: theme.text, fontSize: 14 }}>
                      {l.business_name || l.customer_name}
                      {l.business_name && l.customer_name ? <span style={{ fontWeight: 400, color: theme.textMuted }}> · {l.customer_name}</span> : null}
                    </div>
                    <div style={{ color: theme.textMuted, fontSize: 12, marginTop: 2 }}>
                      <span style={{ color: warn, fontWeight: 600 }}>{describeMatch(m)}</span>
                      {l.status ? ` · ${l.status}` : ''}
                      {setter ? ` · set by ${setter}` : owner ? ` · ${owner}` : ''}
                      {l.created_at ? ` · ${ago(l.created_at)}` : ''}
                      {l.appointment_time ? ` · appt ${new Date(l.appointment_time).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` : ''}
                    </div>
                  </div>
                  <button type="button" onClick={() => onUseExisting?.(l)}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '8px 14px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    <ExternalLink size={14} /> {useLabel}
                  </button>
                </div>
              )
            })}
          </div>

          {onCreateAnyway && (
            <button type="button" onClick={onCreateAnyway}
              style={{ marginTop: 10, minHeight: 44, padding: '8px 4px', background: 'none', border: 'none', color: theme.textSecondary, fontSize: 13, textDecoration: 'underline', cursor: 'pointer' }}>
              It really is a different customer — create anyway
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default DuplicateLeadWarning
