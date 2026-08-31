import { Zap } from 'lucide-react'

// "Utility Invoiced" chip. One component so the wording and colour are written
// once — this codebase's recurring failure is the same rule written on several
// screens and then drifting apart.
//
// Rendered alongside the job status and the customer invoice_status pill, never
// instead of either: a job can be utility-invoiced at any pipeline stage.
export default function UtilityInvoicedBadge({ compact = false }) {
  return (
    <span
      title="A utility rebate invoice has been sent for this job"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        padding: compact ? '1px 6px' : '2px 8px',
        borderRadius: compact ? '8px' : '12px',
        fontSize: compact ? '10px' : '11px',
        fontWeight: 500,
        backgroundColor: 'rgba(234,179,8,0.12)',
        color: '#a16207',
        whiteSpace: 'nowrap',
      }}
    >
      <Zap size={compact ? 9 : 10} /> Utility Invoiced
    </span>
  )
}
