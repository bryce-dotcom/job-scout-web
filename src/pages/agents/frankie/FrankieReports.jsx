import { useEffect } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { FileText, BarChart3 } from 'lucide-react'
import ReportsPanel from '../../../components/ReportsPanel'

const defaultTheme = {
  bg: '#f7f5ef', bgCard: '#ffffff', border: '#d6cdb8',
  text: '#2c3530', textSecondary: '#4d5a52', textMuted: '#7d8a7f',
  accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)',
}

// Frankie's Reports view — same data + UI as Books → Reports → Standard,
// just framed from a CFO's POV. Single source of truth lives in
// src/lib/reports.js so the numbers can't drift between the two surfaces.

export default function FrankieReports() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme
  const isMobile = useIsMobile()

  const companyId = useStore(s => s.companyId)
  const fetchInvoices = useStore(s => s.fetchInvoices)
  const fetchPayments = useStore(s => s.fetchPayments)
  const fetchExpenses = useStore(s => s.fetchExpenses)
  const fetchPlaidTransactions = useStore(s => s.fetchPlaidTransactions)

  useEffect(() => {
    if (!companyId) return
    fetchInvoices?.()
    fetchPayments?.()
    fetchExpenses?.()
    fetchPlaidTransactions?.()
  }, [companyId])

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Frankie-flavored intro card */}
      <div style={{
        marginBottom: '20px',
        padding: '16px 20px',
        backgroundColor: 'rgba(90, 99, 73, 0.06)',
        border: `1px solid ${theme.border}`,
        borderRadius: '12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
          <BarChart3 size={18} style={{ color: theme.accent }} />
          <h2 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: theme.text }}>
            Standard CFO reports
          </h2>
        </div>
        <p style={{ margin: '0 0 6px', fontSize: '13px', color: theme.textSecondary, lineHeight: 1.5 }}>
          One click, real numbers. P&L, AR aging, sales by customer or salesperson, expense by category or vendor,
          and a monthly trend view. Each one downloads as a CSV. <strong>Same numbers as Books → Reports</strong> —
          if you ask me a question about any of these in chat, I'll be looking at exactly this data.
        </p>
        <p style={{ margin: 0, fontSize: '12px', color: theme.textMuted, lineHeight: 1.5 }}>
          Need something more tailored? Ask me on the Ask tab — I can slice and dice however you want.
        </p>
      </div>

      {/* Bank Reconciliation is a bookkeeping artifact (line-item deposit
          matching), so it lives in Books → Reports, not on the CFO's tab.
          Frankie still surfaces the reconciliation *insight* — recorded
          revenue vs bank cash-in and the unmatched gap — in chat. */}
      <ReportsPanel theme={theme} isMobile={isMobile} introHidden hiddenReportIds={['bank-reconciliation']} />
    </div>
  )
}
