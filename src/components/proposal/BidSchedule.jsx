import { buildSchedule, fmtMoney, fmtQty } from '../../lib/bidSchedule'

// The bid, the way the buyer laid it out: their item numbers, their
// sections, a unit price and an extension on every row, a total at the end.
// Rendered on the customer's portal and in the rep's preview from the same
// lib/bidSchedule arrangement the PDF uses, so no two of them can disagree.
//
// showRedlines: the rep's preview marks an AI-sourced price nobody verified.
// The portal never passes it — and never needs to, because send-estimate
// refuses to send a bid while one exists.

export default function BidSchedule({ data, theme, isMobile = false, showRedlines = false }) {
  const doc = data?.document || {}
  const s = buildSchedule(doc, data?.line_items || [])
  const company = data?.company || {}
  const bu = data?.business_unit || null
  const customer = data?.customer || {}
  const bidder = bu?.name || company.company_name || 'Bidder'
  const buyer = s.intake.buyer || customer.business_name || customer.name || null

  const card = { backgroundColor: theme.bgCard || '#fff', border: `1px solid ${theme.border}`, borderRadius: '12px', marginBottom: '16px', overflow: 'hidden' }
  const label = { fontSize: '11px', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase', color: theme.textMuted, margin: '0 0 3px' }
  const th = { textAlign: 'left', fontSize: '11px', fontWeight: 600, color: theme.textMuted, padding: '8px 10px', borderBottom: `1px solid ${theme.border}`, whiteSpace: 'nowrap' }
  const td = { fontSize: '13px', color: theme.text, padding: '8px 10px', borderBottom: `1px solid ${theme.border}`, verticalAlign: 'top' }
  const right = { textAlign: 'right', whiteSpace: 'nowrap' }

  return (
    <div>
      <div style={{ ...card, padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '18px', fontWeight: 700, color: theme.text }}>{bidder}</div>
            {(bu?.address || company.address) && <div style={{ fontSize: '13px', color: theme.textSecondary }}>{bu?.address || company.address}</div>}
            {(bu?.phone || company.phone) && <div style={{ fontSize: '13px', color: theme.textSecondary }}>{bu?.phone || company.phone}</div>}
          </div>
          <div style={{ textAlign: isMobile ? 'left' : 'right' }}>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '2px', color: theme.accent }}>BID</div>
            {s.intake.bid_number && <div style={{ fontSize: '13px', color: theme.text }}>Bid No. <strong>{s.intake.bid_number}</strong></div>}
            {doc.quote_id && <div style={{ fontSize: '12px', color: theme.textMuted }}>Our ref. {doc.quote_id}</div>}
            {s.intake.due_at && <div style={{ fontSize: '12px', color: theme.textMuted }}>Due {new Date(s.intake.due_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'minmax(0, 1fr) minmax(0, 1fr)', gap: '16px', marginTop: '18px' }}>
          {buyer && (
            <div>
              <p style={label}>Submitted to</p>
              <div style={{ fontSize: '14px', color: theme.text, whiteSpace: 'pre-wrap' }}>{buyer}{s.intake.submit_to ? `\n${s.intake.submit_to}` : ''}</div>
            </div>
          )}
          {(s.intake.project || s.intake.title || doc.estimate_name) && (
            <div>
              <p style={label}>Project</p>
              <div style={{ fontSize: '14px', color: theme.text }}>{s.intake.project || s.intake.title || doc.estimate_name}</div>
            </div>
          )}
        </div>
      </div>

      {showRedlines && s.unverified > 0 && (
        <div style={{ ...card, padding: '12px 16px', backgroundColor: 'rgba(239,68,68,0.08)', borderColor: '#ef4444', color: '#b91c1c', fontSize: '13px', fontWeight: 600 }}>
          Draft — {s.unverified} AI-sourced price{s.unverified === 1 ? '' : 's'} not yet verified. This bid cannot be sent until each one is verified with a source link.
        </div>
      )}

      {s.sections.map((sec, si) => (
        <div key={si} style={card}>
          <div style={{ padding: '14px 16px 6px', fontSize: '14px', fontWeight: 700, color: theme.accent }}>{sec.name}</div>
          {isMobile ? (
            <div>
              {sec.rows.map((r) => (
                <div key={r.id} style={{ padding: '10px 16px', borderTop: `1px solid ${theme.border}` }}>
                  <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline' }}>
                    {r.item_no && <span style={{ fontSize: '12px', color: theme.textMuted, flexShrink: 0 }}>{r.item_no}</span>}
                    <span style={{ fontSize: '14px', color: showRedlines && r.unverified ? '#b91c1c' : theme.text, flex: 1, minWidth: 0 }}>{r.description}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '13px', color: theme.textSecondary }}>
                    <span>{fmtQty(r.qty)} {r.unit} × {fmtMoney(r.unit_price)}{showRedlines && r.unverified ? ' · unverified' : ''}</span>
                    <strong style={{ color: theme.text }}>{fmtMoney(r.extended)}</strong>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '560px' }}>
                <thead>
                  <tr>
                    <th style={th}>Item</th>
                    <th style={th}>Description</th>
                    <th style={{ ...th, ...right }}>Qty</th>
                    <th style={th}>Unit</th>
                    <th style={{ ...th, ...right }}>Unit Price</th>
                    <th style={{ ...th, ...right }}>Extended</th>
                  </tr>
                </thead>
                <tbody>
                  {sec.rows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ ...td, color: theme.textMuted, whiteSpace: 'nowrap' }}>{r.item_no || ''}</td>
                      <td style={{ ...td, color: showRedlines && r.unverified ? '#b91c1c' : theme.text }}>
                        {r.description}
                        {showRedlines && r.unverified && <div style={{ fontSize: '11px', fontWeight: 600, color: '#b91c1c' }}>AI-sourced · unverified</div>}
                      </td>
                      <td style={{ ...td, ...right }}>{fmtQty(r.qty)}</td>
                      <td style={td}>{r.unit}</td>
                      <td style={{ ...td, ...right }}>{fmtMoney(r.unit_price)}</td>
                      <td style={{ ...td, ...right, fontWeight: 600 }}>{fmtMoney(r.extended)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '24px', padding: '10px 16px', fontSize: '13px' }}>
            <span style={{ color: theme.textMuted }}>{sec.name} total</span>
            <strong style={{ color: theme.text }}>{fmtMoney(sec.total)}</strong>
          </div>
        </div>
      ))}

      <div style={{ ...card, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: '14px', fontWeight: 700, color: theme.text, letterSpacing: '0.5px' }}>TOTAL BID</span>
        <span style={{ fontSize: '22px', fontWeight: 800, color: theme.accent }}>{fmtMoney(s.total)}</span>
      </div>

      {(s.intake.acknowledgements.length > 0 || s.intake.instructions) && (
        <div style={{ ...card, padding: '16px 20px' }}>
          {s.intake.acknowledgements.length > 0 && (
            <div style={{ marginBottom: s.intake.instructions ? '12px' : 0 }}>
              <p style={label}>Acknowledgements</p>
              {s.intake.acknowledgements.map((a, i) => <div key={i} style={{ fontSize: '13px', color: theme.text }}>☐ {a}</div>)}
            </div>
          )}
          {s.intake.instructions && (
            <div>
              <p style={label}>Submission</p>
              <div style={{ fontSize: '13px', color: theme.textSecondary, whiteSpace: 'pre-wrap' }}>{s.intake.instructions}</div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
