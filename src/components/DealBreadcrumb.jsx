import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from './Layout'
import { ChevronRight, Check } from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349'
}

const steps = [
  { key: 'lead', label: 'Lead', path: (id) => `/leads/${id}` },
  { key: 'quote', label: 'Quote', path: (id) => `/quotes/${id}` },
  { key: 'customer', label: 'Customer', path: (id) => `/customers/${id}` },
  { key: 'job', label: 'Job', path: (id) => `/jobs/${id}` },
  { key: 'invoice', label: 'Invoice', path: (id) => `/invoices/${id}` }
]

export default function DealBreadcrumb({ current, leadId, quoteId, customerId, jobId }) {
  const navigate = useNavigate()
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const [resolved, setResolved] = useState({
    lead: leadId || null,
    quote: quoteId || null,
    customer: customerId || null,
    job: jobId || null,
    invoice: null
  })

  useEffect(() => {
    // Build all needed lookups and run in parallel
    const r = {
      lead: leadId || null,
      quote: quoteId || null,
      customer: customerId || null,
      job: jobId || null,
      invoice: null
    }

    const promises = []

    // If on lead page, find linked job + lead details in one batch
    if (leadId && !jobId) {
      promises.push(
        supabase.from('jobs').select('id').eq('lead_id', leadId).limit(1).single()
          .then(({ data }) => { if (data) r.job = data.id })
          .catch(() => {})
      )
    }

    if (leadId && (!customerId || !quoteId)) {
      promises.push(
        supabase.from('leads').select('converted_customer_id, quote_id').eq('id', leadId).single()
          .then(({ data }) => {
            if (data) {
              if (!r.customer && data.converted_customer_id) r.customer = data.converted_customer_id
              if (!r.quote && data.quote_id) r.quote = data.quote_id
            }
          })
          .catch(() => {})
      )
    }

    // Find invoice for job
    const jid = jobId || null
    if (jid) {
      promises.push(
        supabase.from('invoices').select('id').eq('job_id', jid).limit(1).single()
          .then(({ data }) => { if (data) r.invoice = data.id })
          .catch(() => {})
      )
    }

    if (promises.length === 0) {
      setResolved(r)
      return
    }

    Promise.all(promises).then(() => {
      // If we discovered a job from the lead lookup, also check for invoice
      if (r.job && !jid) {
        supabase.from('invoices').select('id').eq('job_id', r.job).limit(1).single()
          .then(({ data }) => { if (data) r.invoice = data.id })
          .catch(() => {})
          .finally(() => setResolved({ ...r }))
      } else {
        setResolved({ ...r })
      }
    })
  }, [leadId, quoteId, customerId, jobId])

  const hasLinks = Object.entries(resolved).some(([key, val]) => val && key !== current)
  if (!hasLinks) return null

  const currentIdx = steps.findIndex(s => s.key === current)

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '4px',
      padding: '8px 12px',
      backgroundColor: theme.bgCard,
      borderRadius: '8px',
      border: `1px solid ${theme.border}`,
      marginBottom: '16px',
      overflowX: 'auto',
      flexWrap: 'nowrap'
    }}>
      <span style={{ fontSize: '10px', color: theme.textMuted, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px', marginRight: '4px', whiteSpace: 'nowrap' }}>
        Deal
      </span>
      {steps.map((step, idx) => {
        const entityId = resolved[step.key]
        const isCurrent = step.key === current
        const isResolved = !!entityId
        const isBeforeCurrent = idx < currentIdx && isResolved

        return (
          <div key={step.key} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {idx > 0 && (
              <ChevronRight size={12} color={theme.border} style={{ flexShrink: 0 }} />
            )}
            <button
              onClick={() => {
                if (isResolved && !isCurrent) navigate(step.path(entityId))
              }}
              disabled={!isResolved || isCurrent}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '3px',
                padding: '3px 8px',
                borderRadius: '4px',
                border: 'none',
                cursor: isResolved && !isCurrent ? 'pointer' : 'default',
                backgroundColor: isCurrent ? theme.accent + '15' : 'transparent',
                color: isCurrent ? theme.accent : isResolved ? theme.textSecondary : theme.border,
                fontSize: '12px',
                fontWeight: isCurrent ? '600' : '400',
                whiteSpace: 'nowrap',
                transition: 'background-color 0.15s'
              }}
            >
              {isBeforeCurrent && <Check size={10} style={{ color: '#22c55e', flexShrink: 0 }} />}
              {step.label}
            </button>
          </div>
        )
      })}
    </div>
  )
}
