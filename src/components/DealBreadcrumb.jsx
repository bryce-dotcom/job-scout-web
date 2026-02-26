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

/**
 * Shows the deal lifecycle breadcrumb: Lead → Quote → Customer → Job → Invoice
 * Each resolved entity is clickable. Current page is highlighted.
 *
 * Props:
 *   current: 'lead' | 'job' — which page we're on
 *   leadId, quoteId, customerId, jobId — known IDs from the parent page
 *   Remaining IDs are resolved automatically via a single lookup
 */
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
    resolveChain()
  }, [leadId, quoteId, customerId, jobId])

  const resolveChain = async () => {
    const r = {
      lead: leadId || null,
      quote: quoteId || null,
      customer: customerId || null,
      job: jobId || null,
      invoice: null
    }

    // If we're on a lead page, find the linked job
    if (leadId && !jobId) {
      const { data: jobData } = await supabase
        .from('jobs')
        .select('id')
        .eq('lead_id', leadId)
        .limit(1)
        .single()
      if (jobData) r.job = jobData.id
    }

    // If we have a lead, get its customer and quote links
    if (leadId && (!customerId || !quoteId)) {
      const { data: leadData } = await supabase
        .from('leads')
        .select('converted_customer_id, quote_id')
        .eq('id', leadId)
        .single()
      if (leadData) {
        if (!r.customer && leadData.converted_customer_id) r.customer = leadData.converted_customer_id
        if (!r.quote && leadData.quote_id) r.quote = leadData.quote_id
      }
    }

    // If we have a job, find invoice
    const jobIdToCheck = r.job
    if (jobIdToCheck) {
      const { data: invData } = await supabase
        .from('invoices')
        .select('id')
        .eq('job_id', jobIdToCheck)
        .limit(1)
        .single()
      if (invData) r.invoice = invData.id
    }

    setResolved(r)
  }

  // Don't render if there's only the current entity and nothing else
  const hasLinks = Object.entries(resolved).some(([key, val]) => val && key !== current)
  if (!hasLinks) return null

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
        const isPast = isResolved && !isCurrent

        // Find the index of current step to determine if this step is "before" current
        const currentIdx = steps.findIndex(s => s.key === current)
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
