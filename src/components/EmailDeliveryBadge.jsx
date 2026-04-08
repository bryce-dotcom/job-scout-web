/**
 * EmailDeliveryBadge
 *
 * Reusable delivery status card driven by the email_id / email_status /
 * email_status_at / email_bounce_reason / email_opened_at / email_clicked_at
 * columns that both `invoices` and `quotes` now carry. Resend webhook keeps
 * these in sync. Renders nothing when the record hasn't been sent yet.
 *
 * Props:
 * - record: object with email_* columns + sent_to_email
 * - theme: theme object
 */
export default function EmailDeliveryBadge({ record, theme }) {
  if (!record?.email_id) return null

  const t = theme || {
    border: '#d6cdb8',
    textMuted: '#7d8a7f',
    textSecondary: '#4d5a52',
    info: '#3b82f6',
    success: '#22c55e',
    warning: '#eab308',
    error: '#ef4444',
  }

  const status = record.email_status || 'sent'
  const statusConfig = {
    sent: { label: 'Sent', color: t.info, bg: 'rgba(59,130,246,0.12)' },
    delivered: { label: 'Delivered', color: t.success, bg: 'rgba(34,197,94,0.12)' },
    delayed: { label: 'Delayed', color: t.warning, bg: 'rgba(234,179,8,0.12)' },
    bounced: { label: 'Bounced', color: t.error, bg: 'rgba(239,68,68,0.12)' },
    complained: { label: 'Spam Complaint', color: t.error, bg: 'rgba(239,68,68,0.12)' },
  }
  const cfg = statusConfig[status] || statusConfig.sent
  const ts = record.email_status_at ? new Date(record.email_status_at).toLocaleString() : ''

  return (
    <div
      style={{
        marginTop: 16,
        padding: '12px 16px',
        borderRadius: 10,
        border: `1px solid ${t.border}`,
        backgroundColor: cfg.bg,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <p style={{ fontSize: 12, color: t.textMuted, marginBottom: 4, margin: 0 }}>Email Delivery</p>
          <p style={{ fontSize: 14, fontWeight: 600, color: cfg.color, margin: 0, marginTop: 2 }}>
            {cfg.label}
            {ts ? ` — ${ts}` : ''}
          </p>
          {record.sent_to_email && (
            <p style={{ fontSize: 12, color: t.textSecondary, margin: '2px 0 0' }}>To: {record.sent_to_email}</p>
          )}
          {record.email_bounce_reason && (
            <p style={{ fontSize: 12, color: t.error, margin: '4px 0 0' }}>{record.email_bounce_reason}</p>
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, color: t.textMuted }}>
          {record.email_opened_at && <div>Opened {new Date(record.email_opened_at).toLocaleString()}</div>}
          {record.email_clicked_at && <div>Clicked {new Date(record.email_clicked_at).toLocaleString()}</div>}
        </div>
      </div>
    </div>
  )
}
