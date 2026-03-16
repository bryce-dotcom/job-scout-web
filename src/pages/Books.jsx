import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import HelpBadge from '../components/HelpBadge'
import EmptyState from '../components/EmptyState'
import {
  BookOpen, Plus, X, DollarSign, TrendingUp, TrendingDown,
  Wallet, CreditCard, Building, PiggyBank, Pencil, Trash2,
  Calendar, FileText, Search, Zap, Landmark, RefreshCw,
  Sparkles, Check, CheckCircle, ChevronDown, ChevronRight,
  Download, Filter, AlertCircle, Settings as SettingsIcon,
  Link, Briefcase
} from 'lucide-react'
import { toast } from '../lib/toast'
import { isAdmin as checkAdmin } from '../lib/accessControl'

export default function Books() {
  const navigate = useNavigate()
  const user = useStore((state) => state.user)
  const companyId = useStore((state) => state.companyId)
  const invoices = useStore((state) => state.invoices)
  const utilityInvoices = useStore((state) => state.utilityInvoices)
  const storeExpenses = useStore((state) => state.expenses)
  const leadPayments = useStore((state) => state.leadPayments)
  const connectedAccounts = useStore((state) => state.connectedAccounts)
  const plaidTransactions = useStore((state) => state.plaidTransactions)
  const fetchConnectedAccounts = useStore((state) => state.fetchConnectedAccounts)
  const fetchPlaidTransactions = useStore((state) => state.fetchPlaidTransactions)
  const syncPlaidTransactions = useStore((state) => state.syncPlaidTransactions)
  const jobs = useStore((state) => state.jobs)

  const themeContext = useTheme()
  const theme = themeContext?.theme || {
    bg: '#f7f5ef', bgCard: '#ffffff', bgCardHover: '#eef2eb',
    border: '#d6cdb8', text: '#2c3530', textSecondary: '#4d5a52',
    textMuted: '#7d8a7f', accent: '#5a6349', accentBg: 'rgba(90,99,73,0.12)'
  }

  const [activeTab, setActiveTab] = useState('overview')
  const [bankAccounts, setBankAccounts] = useState([])
  const [expenses, setExpenses] = useState([])
  const [expenseCategories, setExpenseCategories] = useState([])
  const [assets, setAssets] = useState([])
  const [liabilities, setLiabilities] = useState([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)

  // Transaction filters
  const [txnSearch, setTxnSearch] = useState('')
  const [txnFilter, setTxnFilter] = useState('all') // 'all' | 'unreviewed' | 'reviewed'
  const [txnAccountFilter, setTxnAccountFilter] = useState('all')
  const [expandedTxn, setExpandedTxn] = useState(null)
  const [txnEditCategory, setTxnEditCategory] = useState('')
  const [txnEditTaxCategory, setTxnEditTaxCategory] = useState('')
  const [txnEditNotes, setTxnEditNotes] = useState('')
  const [txnEditJobId, setTxnEditJobId] = useState(null)
  const [jobSearchText, setJobSearchText] = useState('')

  // Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', expense_date: '', vendor: '', category_id: ''
  })

  // Asset/Liability modals
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showLiabilityModal, setShowLiabilityModal] = useState(false)
  const [assetForm, setAssetForm] = useState({ name: '', asset_type: '', purchase_price: '', current_value: '', status: 'active' })
  const [liabilityForm, setLiabilityForm] = useState({ name: '', liability_type: '', current_balance: '', monthly_payment: '', lender: '', status: 'active' })

  // Tax date range
  const [taxDateFrom, setTaxDateFrom] = useState(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  })
  const [taxDateTo, setTaxDateTo] = useState(() => new Date().toISOString().split('T')[0])

  // AR filter
  const [arFilter, setArFilter] = useState('all')

  useEffect(() => {
    if (companyId) fetchAllBooksData()
  }, [companyId])

  const fetchAllBooksData = async () => {
    setLoading(true)
    await Promise.all([
      fetchBankAccounts(),
      fetchExpenses(),
      fetchExpenseCategories(),
      fetchAssets(),
      fetchLiabilities(),
      fetchConnectedAccounts(),
      fetchPlaidTransactions()
    ])
    setLoading(false)
  }

  const fetchBankAccounts = async () => {
    const { data } = await supabase.from('bank_accounts').select('*').eq('company_id', companyId).order('name')
    setBankAccounts(data || [])
  }

  const fetchExpenses = async () => {
    const { data } = await supabase.from('manual_expenses').select('*, category:expense_categories(id, name, icon, color)').eq('company_id', companyId).order('expense_date', { ascending: false })
    setExpenses(data || [])
  }

  const fetchExpenseCategories = async () => {
    const { data } = await supabase.from('expense_categories').select('*').order('sort_order')
    setExpenseCategories(data || [])
  }

  const fetchAssets = async () => {
    const { data } = await supabase.from('assets').select('*').eq('company_id', companyId).order('name')
    setAssets(data || [])
  }

  const fetchLiabilities = async () => {
    const { data } = await supabase.from('liabilities').select('*').eq('company_id', companyId).order('name')
    setLiabilities(data || [])
  }

  // ─── Calculations ───
  const activeConnected = connectedAccounts.filter(a => a.status === 'active')
  const totalBankBalance = bankAccounts.reduce((sum, acc) => sum + (parseFloat(acc.current_balance) || 0), 0)
  const totalConnectedBalance = activeConnected.reduce((sum, acc) => sum + (parseFloat(acc.current_balance) || 0), 0)
  const totalCash = Math.max(totalBankBalance, totalConnectedBalance) // Avoid double-counting

  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()

  const isThisMonth = (dateStr) => {
    if (!dateStr) return false
    const d = new Date(dateStr)
    return d.getMonth() === currentMonth && d.getFullYear() === currentYear
  }

  // Money in: deposits + paid invoices + positive plaid transactions
  const paidInvoicesMTD = (invoices || []).filter(inv => inv.payment_status === 'Paid' && isThisMonth(inv.created_at)).reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
  const depositsMTD = (leadPayments || []).filter(p => isThisMonth(p.date_created || p.created_at)).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
  const plaidInMTD = plaidTransactions.filter(t => t.amount < 0 && isThisMonth(t.date) && !t.is_transfer).reduce((s, t) => s + Math.abs(parseFloat(t.amount) || 0), 0) // Plaid: negative = money in

  // Money out: expenses + positive plaid transactions
  const expensesMTD = (storeExpenses || []).filter(e => isThisMonth(e.date || e.created_at)).reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
  const plaidOutMTD = plaidTransactions.filter(t => t.amount > 0 && isThisMonth(t.date) && !t.is_transfer).reduce((s, t) => s + (parseFloat(t.amount) || 0), 0) // Plaid: positive = money out
  const moneyOut = expensesMTD + plaidOutMTD

  // Utility incentives tracking
  const pendingIncentives = (utilityInvoices || []).filter(i => i.payment_status !== 'Paid')
  const collectedIncentives = (utilityInvoices || []).filter(i => i.payment_status === 'Paid')
  const pendingIncentiveTotal = pendingIncentives.reduce((s, i) => s + (parseFloat(i.amount || i.incentive_amount) || 0), 0)
  const collectedIncentiveTotal = collectedIncentives.reduce((s, i) => s + (parseFloat(i.amount || i.incentive_amount) || 0), 0)
  const collectedIncentiveMTD = collectedIncentives.filter(i => isThisMonth(i.updated_at || i.created_at)).reduce((s, i) => s + (parseFloat(i.amount || i.incentive_amount) || 0), 0)

  const moneyIn = paidInvoicesMTD + depositsMTD + plaidInMTD + collectedIncentiveMTD

  const netMonth = moneyIn - moneyOut

  const unreviewedCount = plaidTransactions.filter(t => !t.confirmed && !t.user_category).length

  const totalAssetValue = assets.filter(a => a.status === 'active').reduce((s, a) => s + (parseFloat(a.current_value) || 0), 0)
  const totalLiabilityValue = liabilities.filter(l => l.status === 'active').reduce((s, l) => s + (parseFloat(l.current_balance) || 0), 0)

  // ─── Transaction handlers ───
  const handleSync = async () => {
    setSyncing(true)
    try {
      const result = await syncPlaidTransactions()
      if (result?.error) {
        toast.error(result.error)
      } else {
        const added = result?.sync?.total_added || 0
        const categorized = result?.categorized?.categorized || 0
        toast.success(`Synced ${added} transactions, categorized ${categorized}`)
      }
    } catch (e) {
      toast.error('Sync failed: ' + e.message)
    }
    setSyncing(false)
  }

  // Quick accept: confirm AI predictions directly from the row (no expand needed)
  // Only available when AI has predicted BOTH category and tax category
  const handleQuickAccept = async (e, txn) => {
    e.stopPropagation()
    const cat = txn.user_category || txn.ai_category
    const tax = txn.user_tax_category || txn.ai_tax_category
    if (!cat || !tax) {
      toast.error('Set both Expense Category and Tax Category first')
      return
    }
    const updates = {
      confirmed: true,
      user_category: cat,
      user_tax_category: tax,
    }
    if (!txn.job_id && txn.ai_job_id) updates.job_id = txn.ai_job_id

    await supabase.from('plaid_transactions').update(updates).eq('id', txn.id)
    await fetchPlaidTransactions()
    toast.success('Accepted')
  }

  const handleConfirmTxn = async (txnId) => {
    const category = txnEditCategory
    const taxCategory = txnEditTaxCategory

    // Both category and tax category are required
    if (!category || !taxCategory) {
      toast.error('Expense Category and Tax Category are both required')
      return
    }

    const updates = {
      confirmed: true,
      user_category: category,
      user_tax_category: taxCategory,
    }
    if (txnEditNotes) updates.notes = txnEditNotes
    if (txnEditJobId) updates.job_id = txnEditJobId

    await supabase.from('plaid_transactions').update(updates).eq('id', txnId)

    // Learn rule if category was overridden
    const txn = plaidTransactions.find(t => t.id === txnId)
    if (category && txn?.merchant_name) {
      await supabase.functions.invoke('categorize-transactions', {
        body: {
          action: 'learn_rule',
          company_id: companyId,
          merchant_name: txn.merchant_name,
          category,
          tax_category: taxCategory,
        }
      })
    }

    // Learn job mapping if job was assigned
    if (txnEditJobId && txn?.merchant_name) {
      await supabase.functions.invoke('categorize-transactions', {
        body: {
          action: 'learn_rule',
          company_id: companyId,
          merchant_name: txn.merchant_name,
          category: category || txn.ai_category,
          tax_category: taxCategory || txn.ai_tax_category,
        }
      })
    }

    await fetchPlaidTransactions()
    setExpandedTxn(null)
    toast.success('Transaction confirmed')
  }

  const handleConfirmAll = async () => {
    // Only confirm transactions that have BOTH category and tax category
    const unreviewed = plaidTransactions.filter(t => {
      if (t.confirmed) return false
      const hasCat = t.user_category || t.ai_category
      const hasTax = t.user_tax_category || t.ai_tax_category
      return hasCat && hasTax
    })
    if (unreviewed.length === 0) {
      toast.error('No fully categorized transactions to confirm (need both expense & tax category)')
      return
    }
    // Set user_category/user_tax_category from AI if not already user-set
    for (const t of unreviewed) {
      const updates = { confirmed: true }
      if (!t.user_category && t.ai_category) updates.user_category = t.ai_category
      if (!t.user_tax_category && t.ai_tax_category) updates.user_tax_category = t.ai_tax_category
      if (!t.job_id && t.ai_job_id) updates.job_id = t.ai_job_id
      await supabase.from('plaid_transactions').update(updates).eq('id', t.id)
    }
    await fetchPlaidTransactions()
    const skipped = plaidTransactions.filter(t => !t.confirmed && !(t.user_category || t.ai_category) || !(t.user_tax_category || t.ai_tax_category)).length
    toast.success(`Confirmed ${unreviewed.length} transactions${skipped > 0 ? ` (${skipped} skipped — missing categories)` : ''}`)
  }

  // ─── Expense handlers ───
  const handleSaveExpense = async () => {
    const payload = {
      company_id: companyId, description: expenseForm.description,
      amount: parseFloat(expenseForm.amount) || 0,
      expense_date: expenseForm.expense_date || null,
      vendor: expenseForm.vendor || null, category_id: expenseForm.category_id || null
    }
    if (editingItem) {
      await supabase.from('manual_expenses').update(payload).eq('id', editingItem.id)
    } else {
      await supabase.from('manual_expenses').insert([payload])
    }
    await fetchExpenses()
    closeExpenseModal()
  }

  const handleDeleteExpense = async (id) => {
    if (!confirm('Delete this expense?')) return
    await supabase.from('manual_expenses').delete().eq('id', id)
    await fetchExpenses()
  }

  const openEditExpense = (expense) => {
    setEditingItem(expense)
    setExpenseForm({ description: expense.description || '', amount: expense.amount || '', expense_date: expense.expense_date || '', vendor: expense.vendor || '', category_id: expense.category_id || '' })
    setShowExpenseModal(true)
  }

  const closeExpenseModal = () => {
    setShowExpenseModal(false)
    setEditingItem(null)
    setExpenseForm({ description: '', amount: '', expense_date: '', vendor: '', category_id: '' })
  }

  // ─── Asset/Liability handlers ───
  const handleSaveAsset = async () => {
    const payload = { company_id: companyId, name: assetForm.name, asset_type: assetForm.asset_type || null, purchase_price: parseFloat(assetForm.purchase_price) || 0, current_value: parseFloat(assetForm.current_value) || 0, status: assetForm.status }
    if (editingItem) { await supabase.from('assets').update(payload).eq('id', editingItem.id) }
    else { await supabase.from('assets').insert([payload]) }
    await fetchAssets()
    setShowAssetModal(false); setEditingItem(null); setAssetForm({ name: '', asset_type: '', purchase_price: '', current_value: '', status: 'active' })
  }

  const handleSaveLiability = async () => {
    const payload = { company_id: companyId, name: liabilityForm.name, liability_type: liabilityForm.liability_type || null, current_balance: parseFloat(liabilityForm.current_balance) || 0, monthly_payment: parseFloat(liabilityForm.monthly_payment) || 0, lender: liabilityForm.lender || null, status: liabilityForm.status }
    if (editingItem) { await supabase.from('liabilities').update(payload).eq('id', editingItem.id) }
    else { await supabase.from('liabilities').insert([payload]) }
    await fetchLiabilities()
    setShowLiabilityModal(false); setEditingItem(null); setLiabilityForm({ name: '', liability_type: '', current_balance: '', monthly_payment: '', lender: '', status: 'active' })
  }

  // ─── Tax export ───
  const handleExportCSV = () => {
    const taxTxns = plaidTransactions.filter(t => {
      if (!t.confirmed) return false
      const d = new Date(t.date)
      return d >= new Date(taxDateFrom) && d <= new Date(taxDateTo)
    })

    const rows = [
      ['Date', 'Merchant', 'Amount', 'Category', 'Tax Category', '1065 Line', 'Account'].join(','),
      ...taxTxns.map(t => [
        t.date,
        `"${(t.merchant_name || t.name || '').replace(/"/g, '""')}"`,
        t.amount,
        `"${t.user_category || t.ai_category || ''}"`,
        `"${t.user_tax_category || t.ai_tax_category || ''}"`,
        `"${t.ai_form_1065_line || ''}"`,
        `"${t.account?.institution_name || ''} ${t.account?.mask || ''}"`
      ].join(','))
    ].join('\n')

    const blob = new Blob([rows], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `books-tax-export-${taxDateFrom}-to-${taxDateTo}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ─── Helpers ───
  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  }
  const formatDate = (d) => d ? new Date(d).toLocaleDateString() : ''

  const inputStyle = { width: '100%', padding: '10px 12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' }
  const labelStyle = { display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: '500', color: theme.text }

  const tabStyle = (isActive, badge) => ({
    padding: '10px 20px',
    backgroundColor: isActive ? theme.accent : 'transparent',
    color: isActive ? '#fff' : theme.textMuted,
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minHeight: '44px'
  })

  const statCardStyle = { backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }

  if (loading) {
    return <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>Loading financial data...</div>
  }

  // ─── Filtered transactions ───
  const filteredTxns = plaidTransactions.filter(t => {
    if (txnFilter === 'unreviewed' && t.confirmed) return false
    if (txnFilter === 'reviewed' && !t.confirmed) return false
    if (txnAccountFilter !== 'all' && t.connected_account_id !== parseInt(txnAccountFilter)) return false
    if (txnSearch) {
      const s = txnSearch.toLowerCase()
      const matchName = (t.merchant_name || t.name || '').toLowerCase().includes(s)
      const matchCat = (t.user_category || t.ai_category || '').toLowerCase().includes(s)
      if (!matchName && !matchCat) return false
    }
    return true
  })

  if (!checkAdmin(user)) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: '600', color: '#2c3530', marginBottom: '8px' }}>Access Restricted</div>
        <div style={{ fontSize: '14px', color: '#7d8a7f' }}>You don't have permission to view this page. Contact your admin for access.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BookOpen size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Books</h1>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '4px', backgroundColor: theme.bg, padding: '4px', borderRadius: '10px', flexWrap: 'wrap' }}>
          {[
            { id: 'overview', label: 'Overview' },
            { id: 'transactions', label: 'Transactions', badge: unreviewedCount > 0 ? unreviewedCount : null },
            { id: 'accounts', label: 'Accounts' },
            { id: 'tax', label: 'Tax & Reports' },
            { id: 'booked', label: 'Booked' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={tabStyle(activeTab === tab.id)}>
              {tab.label}
              {tab.badge && (
                <span style={{
                  padding: '1px 7px', borderRadius: '10px', fontSize: '11px', fontWeight: '700',
                  backgroundColor: activeTab === tab.id ? 'rgba(255,255,255,0.3)' : '#ef4444',
                  color: activeTab === tab.id ? '#fff' : '#fff'
                }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ════════════════════ OVERVIEW TAB ════════════════════ */}
      {activeTab === 'overview' && (
        <>
          {/* Metric Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wallet size={20} style={{ color: '#22c55e' }} />
                </div>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>Cash Available</span>
                <HelpBadge text="Total balance across all your connected bank accounts and manual bank entries." />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(totalCash)}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={20} style={{ color: '#3b82f6' }} />
                </div>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>Money In (MTD)</span>
                <HelpBadge text="All money received this month: paid invoices, deposits, and bank deposits detected by Plaid." />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>{formatCurrency(moneyIn)}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingDown size={20} style={{ color: '#ef4444' }} />
                </div>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>Money Out (MTD)</span>
                <HelpBadge text="All spending this month: manual expenses plus bank debits detected by Plaid." />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#ef4444' }}>{formatCurrency(moneyOut)}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: netMonth >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <PiggyBank size={20} style={{ color: netMonth >= 0 ? '#22c55e' : '#ef4444' }} />
                </div>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>Net This Month</span>
                <HelpBadge text="Money In minus Money Out. Green means profit, red means spending exceeded income." />
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: netMonth >= 0 ? '#22c55e' : '#ef4444' }}>{formatCurrency(netMonth)}</div>
            </div>
          </div>

          {/* Utility Incentive Tracking */}
          {(pendingIncentives.length > 0 || collectedIncentives.length > 0) && (
            <div style={{
              ...statCardStyle,
              marginBottom: '24px',
              border: '1px solid rgba(74,124,89,0.2)',
              backgroundColor: 'rgba(74,124,89,0.03)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Zap size={16} style={{ color: '#4a7c59' }} /> Utility Incentives
                  <HelpBadge text="Track utility rebates and incentive payments from lighting audits and other energy projects." />
                </h3>
                <button
                  onClick={() => navigate('/invoices?type=utility')}
                  style={{ padding: '6px 14px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '12px', fontWeight: '500', cursor: 'pointer' }}
                >
                  View All
                </button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
                <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Pending</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: '#c28b38' }}>{formatCurrency(pendingIncentiveTotal)}</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>{pendingIncentives.length} claim{pendingIncentives.length !== 1 ? 's' : ''}</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Collected</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: '#4a7c59' }}>{formatCurrency(collectedIncentiveTotal)}</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>{collectedIncentives.length} paid</div>
                </div>
                <div style={{ padding: '12px', backgroundColor: theme.bg, borderRadius: '8px', textAlign: 'center' }}>
                  <div style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '4px' }}>Total Pipeline</div>
                  <div style={{ fontSize: '22px', fontWeight: '700', color: theme.text }}>{formatCurrency(pendingIncentiveTotal + collectedIncentiveTotal)}</div>
                  <div style={{ fontSize: '11px', color: theme.textMuted }}>{pendingIncentives.length + collectedIncentives.length} total</div>
                </div>
              </div>
              {pendingIncentives.length > 0 && (
                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {pendingIncentives.slice(0, 5).map(inv => (
                    <div key={inv.id} onClick={() => navigate(`/utility-invoices/${inv.id}`)} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '8px 12px', backgroundColor: theme.bgCard, borderRadius: '6px',
                      border: `1px solid ${theme.border}`, cursor: 'pointer', fontSize: '13px'
                    }}>
                      <div>
                        <span style={{ fontWeight: '500', color: theme.text }}>{inv.utility_name || 'Utility'}</span>
                        <span style={{ color: theme.textMuted, marginLeft: '8px' }}>{inv.customer_name || ''}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontWeight: '600', color: '#c28b38' }}>{formatCurrency(inv.amount || inv.incentive_amount)}</span>
                        <span style={{ padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500', backgroundColor: 'rgba(234,179,8,0.12)', color: '#b45309' }}>
                          {inv.payment_status}
                        </span>
                      </div>
                    </div>
                  ))}
                  {pendingIncentives.length > 5 && (
                    <div style={{ fontSize: '12px', color: theme.textMuted, textAlign: 'center', paddingTop: '4px' }}>
                      +{pendingIncentives.length - 5} more pending
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Needs Review Card */}
          {unreviewedCount > 0 && (
            <div style={{
              ...statCardStyle,
              marginBottom: '24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              border: '1px solid rgba(234,179,8,0.3)',
              backgroundColor: 'rgba(234,179,8,0.04)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(234,179,8,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <AlertCircle size={20} style={{ color: '#eab308' }} />
                </div>
                <div>
                  <div style={{ fontWeight: '600', color: theme.text }}>{unreviewedCount} transaction{unreviewedCount !== 1 ? 's' : ''} need{unreviewedCount === 1 ? 's' : ''} review</div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>AI categorized them — just confirm or adjust</div>
                </div>
              </div>
              <button
                onClick={() => setActiveTab('transactions')}
                style={{ padding: '10px 20px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', minHeight: '44px' }}
              >
                Review Transactions
              </button>
            </div>
          )}

          {/* Connected accounts mini-list */}
          {activeConnected.length > 0 ? (
            <div style={{ ...statCardStyle, marginBottom: '24px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Landmark size={16} style={{ color: theme.accent }} /> Connected Accounts
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeConnected.map(acct => (
                  <div key={acct.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    <div>
                      <span style={{ fontSize: '13px', fontWeight: '500', color: theme.text }}>{acct.institution_name}</span>
                      <span style={{ fontSize: '12px', color: theme.textMuted, marginLeft: '8px' }}>{acct.account_name} {acct.mask ? `****${acct.mask}` : ''}</span>
                    </div>
                    <span style={{ fontWeight: '600', color: theme.text, fontSize: '14px' }}>{formatCurrency(acct.current_balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <EmptyState
              icon={Landmark}
              title="No bank accounts connected"
              message="Connect your bank accounts and credit cards via Plaid to automatically import transactions and track your finances."
              actionLabel="Go to Settings"
              onAction={() => navigate('/settings?tab=integrations')}
            />
          )}
        </>
      )}

      {/* ════════════════════ TRANSACTIONS TAB ════════════════════ */}
      {activeTab === 'transactions' && (
        <>
          {/* Actions bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
              <button onClick={handleSync} disabled={syncing} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
                backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px',
                fontSize: '13px', fontWeight: '500', cursor: syncing ? 'not-allowed' : 'pointer',
                opacity: syncing ? 0.6 : 1, minHeight: '44px'
              }}>
                <RefreshCw size={14} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
                {syncing ? 'Syncing...' : 'Sync Transactions'}
              </button>
              <button onClick={handleConfirmAll} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
                backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`,
                borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', minHeight: '44px'
              }}>
                <CheckCircle size={14} /> Confirm All Categorized
              </button>
              <button onClick={() => { setEditingItem(null); setShowExpenseModal(true) }} style={{
                display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
                backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`,
                borderRadius: '8px', fontSize: '13px', fontWeight: '500', cursor: 'pointer', minHeight: '44px'
              }}>
                <Plus size={14} /> Add Manual
              </button>
            </div>
          </div>

          {/* Filters */}
          <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            <div style={{ position: 'relative', flex: '1 1 200px', maxWidth: '320px' }}>
              <Search size={14} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: theme.textMuted }} />
              <input
                type="text" value={txnSearch} onChange={(e) => setTxnSearch(e.target.value)}
                placeholder="Search merchant or category..."
                style={{ ...inputStyle, paddingLeft: '32px', width: '100%' }}
              />
            </div>
            <select value={txnFilter} onChange={(e) => setTxnFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '140px' }}>
              <option value="all">All Transactions</option>
              <option value="unreviewed">Needs Review</option>
              <option value="reviewed">Confirmed</option>
            </select>
            {activeConnected.length > 1 && (
              <select value={txnAccountFilter} onChange={(e) => setTxnAccountFilter(e.target.value)} style={{ ...inputStyle, width: 'auto', minWidth: '160px' }}>
                <option value="all">All Accounts</option>
                {activeConnected.map(a => (
                  <option key={a.id} value={a.id}>{a.institution_name} ****{a.mask}</option>
                ))}
              </select>
            )}
          </div>

          {/* Transaction list */}
          {filteredTxns.length === 0 ? (
            <EmptyState
              icon={FileText}
              title={plaidTransactions.length === 0 ? 'No transactions yet' : 'No matching transactions'}
              message={plaidTransactions.length === 0 ? 'Connect a bank account in Settings, then click Sync to import transactions.' : 'Try adjusting your filters.'}
              actionLabel={plaidTransactions.length === 0 ? 'Go to Settings' : undefined}
              onAction={plaidTransactions.length === 0 ? () => navigate('/settings?tab=integrations') : undefined}
            />
          ) : (
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
              {filteredTxns.map((txn, idx) => {
                const isExpanded = expandedTxn === txn.id
                const category = txn.user_category || txn.ai_category
                const taxCat = txn.user_tax_category || txn.ai_tax_category
                const isAI = !txn.user_category && !!txn.ai_category
                const amountNum = parseFloat(txn.amount) || 0
                const isIncome = amountNum < 0
                const jId = txn.job_id || txn.ai_job_id
                const isAIJob = !txn.job_id && !!txn.ai_job_id
                const matchedJob = jId ? (jobs || []).find(j => j.id === jId) : null

                return (
                  <div key={txn.id} style={{ borderTop: idx > 0 ? `1px solid ${theme.border}` : 'none' }}>
                    {/* Row: top line = date, merchant, amount, accept */}
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '10px',
                      padding: '12px 16px 4px',
                      backgroundColor: txn.confirmed ? 'transparent' : 'rgba(234,179,8,0.03)',
                    }}>
                      <div style={{ fontSize: '12px', color: theme.textMuted, minWidth: '70px' }}>{formatDate(txn.date)}</div>
                      <div
                        onClick={() => {
                          if (isExpanded) { setExpandedTxn(null) }
                          else {
                            setExpandedTxn(txn.id)
                            setTxnEditCategory(txn.user_category || txn.ai_category || '')
                            setTxnEditTaxCategory(txn.user_tax_category || txn.ai_tax_category || '')
                            setTxnEditNotes(txn.notes || '')
                            setTxnEditJobId(txn.job_id || txn.ai_job_id || null)
                            setJobSearchText('')
                          }
                        }}
                        style={{ flex: 1, minWidth: 0, cursor: 'pointer' }}
                      >
                        <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {txn.merchant_name || txn.name || 'Unknown'}
                        </div>
                        {txn.account && (
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>{txn.account.institution_name} ****{txn.account.mask}</div>
                        )}
                      </div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: isIncome ? '#22c55e' : '#ef4444', minWidth: '80px', textAlign: 'right' }}>
                        {isIncome ? '+' : '-'}{formatCurrency(Math.abs(amountNum))}
                      </div>
                      {txn.confirmed ? (
                        <CheckCircle size={14} style={{ color: '#22c55e', flexShrink: 0 }} />
                      ) : (category && taxCat) ? (
                        <button
                          onClick={(e) => { e.stopPropagation(); handleQuickAccept(e, txn) }}
                          title="Accept AI prediction"
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            width: '32px', height: '32px', borderRadius: '50%',
                            backgroundColor: 'rgba(34,197,94,0.12)', border: '1.5px solid #22c55e',
                            cursor: 'pointer', flexShrink: 0, padding: 0
                          }}
                        >
                          <Check size={14} style={{ color: '#22c55e' }} />
                        </button>
                      ) : null}
                      <div
                        onClick={() => {
                          if (isExpanded) { setExpandedTxn(null) }
                          else {
                            setExpandedTxn(txn.id)
                            setTxnEditCategory(txn.user_category || txn.ai_category || '')
                            setTxnEditTaxCategory(txn.user_tax_category || txn.ai_tax_category || '')
                            setTxnEditNotes(txn.notes || '')
                            setTxnEditJobId(txn.job_id || txn.ai_job_id || null)
                            setJobSearchText('')
                          }
                        }}
                        style={{ cursor: 'pointer', flexShrink: 0, padding: '4px' }}
                      >
                        {isExpanded ? <ChevronDown size={14} style={{ color: theme.textMuted }} /> : <ChevronRight size={14} style={{ color: theme.textMuted }} />}
                      </div>
                    </div>
                    {/* Row: bottom line = inline category dropdown, job selector */}
                    {!txn.confirmed && (
                      <div style={{
                        display: 'flex', gap: '6px', padding: '2px 16px 10px', alignItems: 'center',
                        backgroundColor: txn.confirmed ? 'transparent' : 'rgba(234,179,8,0.03)',
                        flexWrap: 'wrap'
                      }}>
                        {/* Inline category select */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <select
                            value={category || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={async (e) => {
                              e.stopPropagation()
                              const val = e.target.value
                              await supabase.from('plaid_transactions').update({ user_category: val }).eq('id', txn.id)
                              await fetchPlaidTransactions()
                            }}
                            style={{
                              padding: '3px 24px 3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500',
                              border: 'none', cursor: 'pointer', appearance: 'none', outline: 'none',
                              backgroundColor: isAI ? 'rgba(168,85,247,0.1)' : category ? theme.accentBg : 'rgba(239,68,68,0.08)',
                              color: isAI ? '#a855f7' : category ? theme.accent : '#ef4444',
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%237d8a7f' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
                            }}
                          >
                            <option value="">{isIncome ? 'Category...' : 'Category...'}</option>
                            {isIncome ? (
                              <>
                                <optgroup label="Income">
                                  {expenseCategories.filter(c => c.type === 'income').map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="Expense">
                                  {expenseCategories.filter(c => c.type === 'expense').map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                  ))}
                                </optgroup>
                              </>
                            ) : (
                              <>
                                <optgroup label="Expense">
                                  {expenseCategories.filter(c => c.type === 'expense').map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                  ))}
                                </optgroup>
                                <optgroup label="Income">
                                  {expenseCategories.filter(c => c.type === 'income').map(c => (
                                    <option key={c.id} value={c.name}>{c.name}</option>
                                  ))}
                                </optgroup>
                              </>
                            )}
                            <optgroup label="Other">
                              <option value="Transfer">Transfer</option>
                              <option value="Owner Distribution">Owner Distribution</option>
                              <option value="Owner Contribution">Owner Contribution</option>
                              <option value="Loan Payment">Loan Payment</option>
                              <option value="Tax Payment">Tax Payment</option>
                            </optgroup>
                          </select>
                          {isAI && category && <Sparkles size={8} style={{ position: 'absolute', left: '-2px', top: '-2px', color: '#a855f7' }} />}
                        </div>
                        {/* Inline tax category select */}
                        <div style={{ position: 'relative', flexShrink: 0 }}>
                          <select
                            value={taxCat || ''}
                            onClick={(e) => e.stopPropagation()}
                            onChange={async (e) => {
                              e.stopPropagation()
                              const val = e.target.value
                              await supabase.from('plaid_transactions').update({ user_tax_category: val }).eq('id', txn.id)
                              await fetchPlaidTransactions()
                            }}
                            style={{
                              padding: '3px 24px 3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500',
                              border: 'none', cursor: 'pointer', appearance: 'none', outline: 'none',
                              backgroundColor: taxCat ? 'rgba(59,130,246,0.08)' : 'rgba(239,68,68,0.08)',
                              color: taxCat ? '#3b82f6' : '#ef4444',
                              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 24 24' fill='none' stroke='%237d8a7f' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
                              backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
                            }}
                          >
                            <option value="">Tax category... *</option>
                            <optgroup label="Common Deductions">
                              <option value="Line 20 - Advertising">Advertising</option>
                              <option value="Line 20 - Office expenses">Office Expenses</option>
                              <option value="Line 20 - Auto expenses">Vehicle/Auto</option>
                              <option value="Line 12 - Repairs and maintenance">Repairs</option>
                              <option value="Line 14 - Rent">Rent</option>
                              <option value="Line 20 - Utilities">Utilities</option>
                              <option value="Line 20 - Insurance">Insurance</option>
                              <option value="Line 15 - Taxes and licenses">Taxes/Licenses</option>
                              <option value="Line 20 - Travel">Travel</option>
                              <option value="Line 20 - Meals">Meals</option>
                            </optgroup>
                            <optgroup label="Payroll & Labor">
                              <option value="Line 10 - Guaranteed payments">Guaranteed Payments</option>
                              <option value="Line 9 - Salaries and wages">Salaries/Wages</option>
                              <option value="Line 20 - Contract labor">Contract Labor</option>
                              <option value="Line 18 - Retirement plans">Retirement</option>
                              <option value="Line 19 - Employee benefit programs">Benefits</option>
                            </optgroup>
                            <optgroup label="Other">
                              <option value="Line 16a - Depreciation">Depreciation</option>
                              <option value="Line 20 - Equipment rental">Equip Rental</option>
                              <option value="Line 20 - Other deductions">Other Deductions</option>
                              <option value="Not deductible">Not Deductible</option>
                              <option value="Income">Income</option>
                            </optgroup>
                          </select>
                        </div>
                        {/* Job badge — clickable to expand and change */}
                        {matchedJob ? (
                          <span
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedTxn(txn.id)
                              setTxnEditCategory(txn.user_category || txn.ai_category || '')
                              setTxnEditTaxCategory(txn.user_tax_category || txn.ai_tax_category || '')
                              setTxnEditNotes(txn.notes || '')
                              setTxnEditJobId(txn.job_id || txn.ai_job_id || null)
                              setJobSearchText('')
                            }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500',
                              backgroundColor: isAIJob ? 'rgba(59,130,246,0.1)' : 'rgba(90,99,73,0.12)',
                              color: isAIJob ? '#3b82f6' : theme.accent, cursor: 'pointer',
                              maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}
                            title="Click to change job"
                          >
                            {isAIJob && <Sparkles size={8} />}
                            <Briefcase size={9} />
                            {matchedJob.job_title || `Job #${matchedJob.id}`}
                          </span>
                        ) : (
                          <span
                            onClick={(e) => {
                              e.stopPropagation()
                              setExpandedTxn(txn.id)
                              setTxnEditCategory(txn.user_category || txn.ai_category || '')
                              setTxnEditTaxCategory(txn.user_tax_category || txn.ai_tax_category || '')
                              setTxnEditNotes(txn.notes || '')
                              setTxnEditJobId(null)
                              setJobSearchText('')
                            }}
                            style={{
                              display: 'inline-flex', alignItems: 'center', gap: '4px',
                              padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500',
                              backgroundColor: theme.bg, color: theme.textMuted, cursor: 'pointer',
                              border: `1px dashed ${theme.border}`
                            }}
                            title="Link to a job"
                          >
                            <Briefcase size={9} />
                            Job
                          </span>
                        )}
                      </div>
                    )}
                    {/* Confirmed row: show badges read-only */}
                    {txn.confirmed && (
                      <div style={{
                        display: 'flex', gap: '6px', padding: '0 16px 10px', alignItems: 'center',
                        flexWrap: 'wrap'
                      }}>
                        {category && (
                          <span style={{
                            padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500',
                            backgroundColor: theme.accentBg, color: theme.accent
                          }}>{category}</span>
                        )}
                        {taxCat && (
                          <span style={{
                            padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500',
                            backgroundColor: 'rgba(59,130,246,0.08)', color: '#3b82f6'
                          }}>{taxCat.replace(/^Line \d+[a-z]? - /, '')}</span>
                        )}
                        {matchedJob && (
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', gap: '4px',
                            padding: '3px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: '500',
                            backgroundColor: 'rgba(90,99,73,0.12)', color: theme.accent
                          }}>
                            <Briefcase size={9} />
                            {matchedJob.job_title || `Job #${matchedJob.id}`}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Expanded inline edit */}
                    {isExpanded && (
                      <div style={{ padding: '0 16px 16px', backgroundColor: theme.bg, borderTop: `1px solid ${theme.border}` }}>
                        {/* AI summary bar */}
                        {txn.ai_confidence != null && (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', marginTop: '12px',
                            backgroundColor: 'rgba(168,85,247,0.06)', borderRadius: '8px', border: '1px solid rgba(168,85,247,0.15)'
                          }}>
                            <Sparkles size={14} style={{ color: '#a855f7', flexShrink: 0 }} />
                            <span style={{ fontSize: '12px', color: '#7c3aed', fontWeight: '500' }}>
                              AI is {Math.round((txn.ai_confidence || 0) * 100)}% confident in this categorization
                              {txn.ai_form_1065_line && <span> — maps to {txn.ai_form_1065_line}</span>}
                            </span>
                          </div>
                        )}

                        {/* Category + Tax Category */}
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                              <label style={{ fontSize: '12px', fontWeight: '600', color: theme.text }}>Expense Category</label>
                              <HelpBadge text="How you track this expense in your business. Groups similar spending together (e.g., all gas purchases go under Fuel). This helps you see where your money goes each month." size={13} />
                            </div>
                            <select
                              value={txnEditCategory}
                              onChange={(e) => setTxnEditCategory(e.target.value)}
                              style={{ ...inputStyle, cursor: 'pointer' }}
                            >
                              <option value="">Select a category...</option>
                              {amountNum > 0 && <optgroup label="Expense Categories">
                                {expenseCategories.filter(c => c.type === 'expense').map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                              </optgroup>}
                              {amountNum < 0 && <optgroup label="Income Categories">
                                {expenseCategories.filter(c => c.type === 'income').map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                              </optgroup>}
                              {amountNum > 0 && <optgroup label="Income Categories">
                                {expenseCategories.filter(c => c.type === 'income').map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                              </optgroup>}
                              {amountNum < 0 && <optgroup label="Expense Categories">
                                {expenseCategories.filter(c => c.type === 'expense').map(c => (
                                  <option key={c.id} value={c.name}>{c.name}</option>
                                ))}
                              </optgroup>}
                              <optgroup label="Other">
                                <option value="Transfer">Transfer (between accounts)</option>
                                <option value="Owner Distribution">Owner Distribution</option>
                                <option value="Owner Contribution">Owner Contribution</option>
                                <option value="Loan Payment">Loan Payment</option>
                                <option value="Tax Payment">Tax Payment</option>
                              </optgroup>
                            </select>
                          </div>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                              <label style={{ fontSize: '12px', fontWeight: '600', color: theme.text }}>Tax Category</label>
                              <HelpBadge text="Where this goes on your tax return. Your accountant uses this to file taxes. If you're unsure, the AI suggestion is usually correct — just confirm it." size={13} />
                            </div>
                            <select
                              value={txnEditTaxCategory}
                              onChange={(e) => setTxnEditTaxCategory(e.target.value)}
                              style={{ ...inputStyle, cursor: 'pointer' }}
                            >
                              <option value="">Select tax category...</option>
                              <optgroup label="Common Deductions">
                                <option value="Line 20 - Advertising">Advertising & Marketing</option>
                                <option value="Line 20 - Office expenses">Office Expenses & Supplies</option>
                                <option value="Line 20 - Auto expenses">Vehicle & Auto Expenses</option>
                                <option value="Line 12 - Repairs and maintenance">Repairs & Maintenance</option>
                                <option value="Line 14 - Rent">Rent</option>
                                <option value="Line 20 - Utilities">Utilities</option>
                                <option value="Line 20 - Insurance">Insurance</option>
                                <option value="Line 15 - Taxes and licenses">Taxes & Licenses</option>
                                <option value="Line 20 - Travel">Travel</option>
                                <option value="Line 20 - Meals">Meals (50% deductible)</option>
                              </optgroup>
                              <optgroup label="Payroll & Contractors">
                                <option value="Line 10 - Guaranteed payments">Guaranteed Payments (partners)</option>
                                <option value="Line 9 - Salaries and wages">Salaries & Wages</option>
                                <option value="Line 20 - Contract labor">Contract Labor / Subcontractors</option>
                                <option value="Line 18 - Retirement plans">Retirement Plan Contributions</option>
                                <option value="Line 19 - Employee benefit programs">Employee Benefits</option>
                              </optgroup>
                              <optgroup label="Assets & Depreciation">
                                <option value="Line 16a - Depreciation">Depreciation (equipment, vehicles)</option>
                                <option value="Line 20 - Equipment rental">Equipment Rental</option>
                              </optgroup>
                              <optgroup label="Other">
                                <option value="Line 20 - Other deductions">Other Deductions</option>
                                <option value="Line 13 - Bad debts">Bad Debts</option>
                                <option value="Not deductible">Not Deductible (personal, distributions)</option>
                                <option value="Income">Income (not a deduction)</option>
                              </optgroup>
                            </select>
                          </div>
                        </div>

                        {/* Job Assignment */}
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.text }}>Link to Job</label>
                            <HelpBadge text="Connect this transaction to a specific job to track job profitability. If the AI matched it, you'll see the suggestion pre-filled. Only link it if this purchase was specifically for that job." size={13} />
                          </div>
                          <div style={{ position: 'relative' }}>
                            <input
                              type="text"
                              value={jobSearchText || (() => {
                                const j = (jobs || []).find(j => j.id === txnEditJobId)
                                return j ? `${j.job_title || 'Job #' + j.id} — ${j.customer?.name || ''}` : ''
                              })()}
                              onChange={(e) => { setJobSearchText(e.target.value); if (!e.target.value) setTxnEditJobId(null) }}
                              placeholder="Search by job name, customer, or address..."
                              style={inputStyle}
                            />
                            {jobSearchText && (() => {
                              const filtered = (jobs || []).filter(j => {
                                const s = jobSearchText.toLowerCase()
                                return (j.job_title || '').toLowerCase().includes(s) ||
                                  (j.customer?.name || '').toLowerCase().includes(s) ||
                                  (j.job_address || '').toLowerCase().includes(s) ||
                                  String(j.id).includes(s)
                              }).slice(0, 8)
                              if (!filtered.length) return null
                              return (
                                <div style={{
                                  position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                                  backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`,
                                  borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                                  maxHeight: '200px', overflowY: 'auto'
                                }}>
                                  {filtered.map(j => (
                                    <button key={j.id} onClick={() => { setTxnEditJobId(j.id); setJobSearchText('') }} style={{
                                      width: '100%', padding: '10px 12px', border: 'none', backgroundColor: 'transparent',
                                      cursor: 'pointer', textAlign: 'left', fontSize: '13px', color: theme.text,
                                      borderBottom: `1px solid ${theme.border}`, minHeight: '44px'
                                    }}>
                                      <div style={{ fontWeight: '500' }}>{j.job_title || `Job #${j.id}`}</div>
                                      <div style={{ fontSize: '11px', color: theme.textMuted }}>{j.customer?.name || ''} {j.job_address ? `— ${j.job_address}` : ''}</div>
                                    </button>
                                  ))}
                                </div>
                              )
                            })()}
                            {txnEditJobId && !jobSearchText && (
                              <button onClick={() => { setTxnEditJobId(null); setJobSearchText('') }} style={{
                                position: 'absolute', right: '8px', top: '50%', transform: 'translateY(-50%)',
                                background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px'
                              }}>
                                <X size={14} />
                              </button>
                            )}
                          </div>
                          {txn.ai_job_id && txn.ai_job_confidence != null && (
                            <div style={{ fontSize: '11px', color: '#3b82f6', marginTop: '4px' }}>
                              <Sparkles size={10} style={{ verticalAlign: 'middle', marginRight: '3px' }} />
                              AI matched to job with {Math.round(txn.ai_job_confidence * 100)}% confidence
                            </div>
                          )}
                        </div>

                        {/* Notes */}
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '6px' }}>
                            <label style={{ fontSize: '12px', fontWeight: '600', color: theme.text }}>Notes</label>
                            <HelpBadge text="Add a note to remember what this transaction was for. Optional, but helpful during tax time." size={13} />
                          </div>
                          <input type="text" value={txnEditNotes} onChange={(e) => setTxnEditNotes(e.target.value)} placeholder="What was this purchase for?" style={inputStyle} />
                        </div>

                        {/* Actions */}
                        <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                          <button onClick={() => handleConfirmTxn(txn.id)} style={{
                            display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 20px',
                            backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px',
                            fontSize: '13px', fontWeight: '500', cursor: 'pointer', minHeight: '44px'
                          }}>
                            <Check size={14} /> Confirm & Save
                          </button>
                          <button onClick={() => setExpandedTxn(null)} style={{
                            padding: '10px 16px', backgroundColor: 'transparent', color: theme.textMuted,
                            border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '13px', cursor: 'pointer', minHeight: '44px'
                          }}>
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </>
      )}

      {/* ════════════════════ ACCOUNTS TAB ════════════════════ */}
      {activeTab === 'accounts' && (
        <>
          {/* Connected accounts */}
          {activeConnected.length > 0 ? (
            <div style={{ ...statCardStyle, marginBottom: '24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Landmark size={18} style={{ color: theme.accent }} /> Connected Accounts
                </h3>
                <button onClick={handleSync} disabled={syncing} style={{
                  display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 14px',
                  backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px',
                  fontSize: '12px', fontWeight: '500', cursor: syncing ? 'not-allowed' : 'pointer', minHeight: '44px'
                }}>
                  <RefreshCw size={12} style={syncing ? { animation: 'spin 1s linear infinite' } : {}} />
                  {syncing ? 'Syncing...' : 'Sync All'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {activeConnected.map(acct => (
                  <div key={acct.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px', backgroundColor: theme.bg, borderRadius: '10px' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '500', color: theme.text }}>{acct.institution_name}</span>
                        <span style={{
                          padding: '2px 8px', borderRadius: '10px', fontSize: '10px', fontWeight: '600',
                          backgroundColor: acct.account_type === 'credit' ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)',
                          color: acct.account_type === 'credit' ? '#ef4444' : '#3b82f6', textTransform: 'uppercase'
                        }}>
                          {acct.account_type}
                        </span>
                      </div>
                      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '2px' }}>
                        {acct.account_name} {acct.mask ? `(****${acct.mask})` : ''}
                        {acct.last_synced && <span style={{ marginLeft: '8px' }}>Last synced: {new Date(acct.last_synced).toLocaleString()}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>{formatCurrency(acct.current_balance)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: '12px', fontSize: '12px', color: theme.textMuted }}>
                Connect more accounts in <button onClick={() => navigate('/settings?tab=integrations')} style={{ color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontSize: '12px' }}>Settings &gt; Integrations</button>
              </div>
            </div>
          ) : (
            <div style={{ marginBottom: '24px' }}>
              <EmptyState
                icon={Landmark}
                title="No connected accounts"
                message="Connect bank accounts via Plaid in Settings to see balances and sync transactions automatically."
                actionLabel="Go to Settings"
                onAction={() => navigate('/settings?tab=integrations')}
              />
            </div>
          )}

          {/* Manual bank accounts */}
          {bankAccounts.length > 0 && (
            <div style={{ ...statCardStyle, marginBottom: '24px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>Manual Bank Accounts</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                {bankAccounts.filter(b => !b.connected_account_id).map(acct => (
                  <div key={acct.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                    <span style={{ fontWeight: '500', color: theme.text }}>{acct.name}</span>
                    <span style={{ fontWeight: '600', color: theme.text }}>{formatCurrency(acct.current_balance)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Assets & Liabilities */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginBottom: '24px' }}>
            <div style={{ ...statCardStyle }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingUp size={18} style={{ color: '#22c55e' }} /> Assets
                </h3>
                <button onClick={() => { setEditingItem(null); setAssetForm({ name: '', asset_type: '', purchase_price: '', current_value: '', status: 'active' }); setShowAssetModal(true) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '44px' }}>
                  <Plus size={12} /> Add
                </button>
              </div>
              {assets.length === 0 ? <p style={{ color: theme.textMuted, fontSize: '14px' }}>No assets recorded</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {assets.map(asset => (
                    <div key={asset.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                      <div>
                        <div style={{ fontWeight: '500', color: theme.text, fontSize: '13px' }}>{asset.name}</div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>{asset.asset_type}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: '600', color: '#22c55e', fontSize: '13px' }}>{formatCurrency(asset.current_value)}</span>
                        <button onClick={() => { setEditingItem(asset); setAssetForm({ name: asset.name || '', asset_type: asset.asset_type || '', purchase_price: asset.purchase_price || '', current_value: asset.current_value || '', status: asset.status || 'active' }); setShowAssetModal(true) }} style={{ padding: '4px', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><Pencil size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ ...statCardStyle }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <TrendingDown size={18} style={{ color: '#ef4444' }} /> Liabilities
                </h3>
                <button onClick={() => { setEditingItem(null); setLiabilityForm({ name: '', liability_type: '', current_balance: '', monthly_payment: '', lender: '', status: 'active' }); setShowLiabilityModal(true) }}
                  style={{ display: 'flex', alignItems: 'center', gap: '4px', padding: '6px 12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '6px', color: theme.accent, fontSize: '12px', cursor: 'pointer', minHeight: '44px' }}>
                  <Plus size={12} /> Add
                </button>
              </div>
              {liabilities.length === 0 ? <p style={{ color: theme.textMuted, fontSize: '14px' }}>No liabilities recorded</p> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {liabilities.map(liability => (
                    <div key={liability.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                      <div>
                        <div style={{ fontWeight: '500', color: theme.text, fontSize: '13px' }}>{liability.name}</div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>{liability.lender}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: '600', color: '#ef4444', fontSize: '13px' }}>{formatCurrency(liability.current_balance)}</span>
                        <button onClick={() => { setEditingItem(liability); setLiabilityForm({ name: liability.name || '', liability_type: liability.liability_type || '', current_balance: liability.current_balance || '', monthly_payment: liability.monthly_payment || '', lender: liability.lender || '', status: liability.status || 'active' }); setShowLiabilityModal(true) }} style={{ padding: '4px', background: 'none', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><Pencil size={12} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Net Worth */}
          <div style={{ ...statCardStyle, textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '8px' }}>Net Worth (Assets - Liabilities)</div>
            <div style={{ fontSize: '36px', fontWeight: '700', color: (totalAssetValue - totalLiabilityValue) >= 0 ? '#22c55e' : '#ef4444' }}>
              {formatCurrency(totalAssetValue - totalLiabilityValue)}
            </div>
          </div>
        </>
      )}

      {/* ════════════════════ TAX & REPORTS TAB ════════════════════ */}
      {activeTab === 'tax' && (
        <>
          {/* Date range */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div>
              <label style={{ ...labelStyle, fontSize: '12px' }}>From</label>
              <input type="date" value={taxDateFrom} onChange={(e) => setTaxDateFrom(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
            </div>
            <div>
              <label style={{ ...labelStyle, fontSize: '12px' }}>To</label>
              <input type="date" value={taxDateTo} onChange={(e) => setTaxDateTo(e.target.value)} style={{ ...inputStyle, width: 'auto' }} />
            </div>
            <button onClick={handleExportCSV} style={{
              display: 'flex', alignItems: 'center', gap: '6px', padding: '10px 16px',
              backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: '500', cursor: 'pointer', alignSelf: 'flex-end', minHeight: '44px'
            }}>
              <Download size={14} /> Export CSV
            </button>
          </div>

          {(() => {
            const taxTxns = plaidTransactions.filter(t => {
              if (!t.confirmed) return false
              const d = new Date(t.date)
              return d >= new Date(taxDateFrom) && d <= new Date(taxDateTo)
            })

            // Group by tax category
            const byCat = {}
            taxTxns.forEach(t => {
              const cat = t.user_tax_category || t.ai_tax_category || 'Uncategorized'
              if (!byCat[cat]) byCat[cat] = { count: 0, total: 0 }
              byCat[cat].count++
              byCat[cat].total += parseFloat(t.amount) || 0
            })
            const catEntries = Object.entries(byCat).sort((a, b) => Math.abs(b[1].total) - Math.abs(a[1].total))

            // Group by 1065 line
            const byLine = {}
            taxTxns.forEach(t => {
              const line = t.ai_form_1065_line || 'Unassigned'
              if (!byLine[line]) byLine[line] = { count: 0, total: 0 }
              byLine[line].count++
              byLine[line].total += parseFloat(t.amount) || 0
            })
            const lineEntries = Object.entries(byLine).sort((a, b) => a[0].localeCompare(b[0]))

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
                {/* Tax Category Summary */}
                <div style={statCardStyle}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Tax Category Summary</h3>
                  {catEntries.length === 0 ? (
                    <p style={{ color: theme.textMuted, fontSize: '14px' }}>No confirmed transactions in this date range.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <th style={{ padding: '8px 0', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Category</th>
                          <th style={{ padding: '8px 0', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>#</th>
                          <th style={{ padding: '8px 0', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {catEntries.map(([cat, data]) => (
                          <tr key={cat} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '10px 0', fontSize: '13px', color: theme.text }}>{cat}</td>
                            <td style={{ padding: '10px 0', fontSize: '13px', color: theme.textMuted, textAlign: 'center' }}>{data.count}</td>
                            <td style={{ padding: '10px 0', fontSize: '13px', fontWeight: '600', color: data.total > 0 ? '#ef4444' : '#22c55e', textAlign: 'right' }}>{formatCurrency(Math.abs(data.total))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* 1065 Line Items */}
                <div style={statCardStyle}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Form 1065 Line Items</h3>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px' }}>Partnership return breakdown (AI-assigned)</p>
                  {lineEntries.length === 0 ? (
                    <p style={{ color: theme.textMuted, fontSize: '14px' }}>No 1065 data yet.</p>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                      <thead>
                        <tr style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <th style={{ padding: '8px 0', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Line</th>
                          <th style={{ padding: '8px 0', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>#</th>
                          <th style={{ padding: '8px 0', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lineEntries.map(([line, data]) => (
                          <tr key={line} style={{ borderBottom: `1px solid ${theme.border}` }}>
                            <td style={{ padding: '10px 0', fontSize: '13px', color: theme.text }}>{line}</td>
                            <td style={{ padding: '10px 0', fontSize: '13px', color: theme.textMuted, textAlign: 'center' }}>{data.count}</td>
                            <td style={{ padding: '10px 0', fontSize: '13px', fontWeight: '600', color: theme.text, textAlign: 'right' }}>{formatCurrency(Math.abs(data.total))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                {/* AR Summary */}
                <div style={statCardStyle}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Accounts Receivable</h3>
                  {(() => {
                    const unpaidInvoices = (invoices || []).filter(inv => inv.payment_status !== 'Paid')
                    const customerAR = unpaidInvoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
                    const unpaidUtility = (utilityInvoices || []).filter(inv => inv.payment_status !== 'Paid')
                    const utilityAR = unpaidUtility.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                          <span style={{ color: theme.text }}>Customer AR</span>
                          <span style={{ fontWeight: '600', color: '#3b82f6' }}>{formatCurrency(customerAR)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                          <span style={{ color: theme.text }}>Utility AR</span>
                          <span style={{ fontWeight: '600', color: '#14b8a6' }}>{formatCurrency(utilityAR)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 12px', backgroundColor: theme.bg, borderRadius: '8px', fontWeight: '600' }}>
                          <span style={{ color: theme.text }}>Combined AR</span>
                          <span style={{ color: theme.text }}>{formatCurrency(customerAR + utilityAR)}</span>
                        </div>
                      </div>
                    )
                  })()}
                </div>
              </div>
            )
          })()}
        </>
      )}

      {/* ════════════════════ BOOKED TAB ════════════════════ */}
      {activeTab === 'booked' && (
        <>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '24px' }}>Confirmed Transactions by Category</h2>

          {(() => {
            // Combine confirmed plaid transactions + manual expenses
            const confirmedPlaid = plaidTransactions.filter(t => t.confirmed)
            const allBooked = [
              ...confirmedPlaid.map(t => ({
                id: 'p-' + t.id, type: 'plaid', category: t.user_category || t.ai_category || 'Uncategorized',
                description: t.merchant_name || t.name, amount: Math.abs(parseFloat(t.amount) || 0),
                date: t.date, isExpense: (parseFloat(t.amount) || 0) > 0
              })),
              ...expenses.map(e => ({
                id: 'm-' + e.id, type: 'manual', category: e.category?.name || 'Uncategorized',
                description: e.description, amount: parseFloat(e.amount) || 0,
                date: e.expense_date, isExpense: true
              }))
            ]

            // Group by category
            const byCategory = {}
            allBooked.forEach(item => {
              if (!byCategory[item.category]) byCategory[item.category] = []
              byCategory[item.category].push(item)
            })

            const categoryEntries = Object.entries(byCategory).sort((a, b) => {
              const totalA = a[1].reduce((s, i) => s + i.amount, 0)
              const totalB = b[1].reduce((s, i) => s + i.amount, 0)
              return totalB - totalA
            })

            if (categoryEntries.length === 0) {
              return <EmptyState icon={BookOpen} title="No booked transactions" message="Confirm transactions in the Transactions tab to see them organized by category here." />
            }

            return (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
                {categoryEntries.map(([category, items]) => {
                  const totalAmount = items.reduce((s, i) => s + i.amount, 0)
                  return (
                    <div key={category} style={statCardStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                        <span style={{ fontWeight: '600', color: theme.text }}>{category}</span>
                        <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: theme.accentBg, color: theme.accent, borderRadius: '10px' }}>
                          {items.length} items
                        </span>
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>{formatCurrency(totalAmount)}</div>
                      {items.length > 0 && (
                        <div style={{ marginTop: '12px', maxHeight: '120px', overflowY: 'auto' }}>
                          {items.slice(0, 5).map(item => (
                            <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textSecondary, padding: '4px 0' }}>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '60%' }}>{item.description}</span>
                              <span>{formatCurrency(item.amount)}</span>
                            </div>
                          ))}
                          {items.length > 5 && <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>+{items.length - 5} more</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </>
      )}

      {/* ════════════════════ MODALS ════════════════════ */}

      {/* EXPENSE MODAL */}
      {showExpenseModal && (
        <>
          <div onClick={closeExpenseModal} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{editingItem ? 'Edit Expense' : 'Add Manual Expense'}</h2>
              <button onClick={closeExpenseModal} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Description *</label>
                <input type="text" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Amount *</label>
                  <input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select value={expenseForm.category_id} onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })} style={inputStyle}>
                    <option value="">-- Select --</option>
                    {expenseCategories.filter(c => c.type === 'expense').map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Vendor</label>
                  <input type="text" value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={closeExpenseModal} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer', minHeight: '44px' }}>Cancel</button>
                <button onClick={handleSaveExpense} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer', minHeight: '44px' }}>Save</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ASSET MODAL */}
      {showAssetModal && (
        <>
          <div onClick={() => setShowAssetModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{editingItem ? 'Edit Asset' : 'Add Asset'}</h2>
              <button onClick={() => setShowAssetModal(false)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Name *</label>
                <input type="text" value={assetForm.name} onChange={(e) => setAssetForm({ ...assetForm, name: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Asset Type</label>
                <select value={assetForm.asset_type} onChange={(e) => setAssetForm({ ...assetForm, asset_type: e.target.value })} style={inputStyle}>
                  <option value="">-- Select --</option>
                  <option value="Vehicle">Vehicle</option>
                  <option value="Equipment">Equipment</option>
                  <option value="Property">Property</option>
                  <option value="Inventory">Inventory</option>
                  <option value="Other">Other</option>
                </select>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={labelStyle}>Purchase Price</label>
                  <input type="number" step="0.01" value={assetForm.purchase_price} onChange={(e) => setAssetForm({ ...assetForm, purchase_price: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Current Value</label>
                  <input type="number" step="0.01" value={assetForm.current_value} onChange={(e) => setAssetForm({ ...assetForm, current_value: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowAssetModal(false)} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer', minHeight: '44px' }}>Cancel</button>
                <button onClick={handleSaveAsset} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer', minHeight: '44px' }}>Save</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* LIABILITY MODAL */}
      {showLiabilityModal && (
        <>
          <div onClick={() => setShowLiabilityModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{editingItem ? 'Edit Liability' : 'Add Liability'}</h2>
              <button onClick={() => setShowLiabilityModal(false)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Name *</label>
                <input type="text" value={liabilityForm.name} onChange={(e) => setLiabilityForm({ ...liabilityForm, name: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Type</label>
                  <select value={liabilityForm.liability_type} onChange={(e) => setLiabilityForm({ ...liabilityForm, liability_type: e.target.value })} style={inputStyle}>
                    <option value="">-- Select --</option>
                    <option value="Loan">Loan</option>
                    <option value="Credit Card">Credit Card</option>
                    <option value="Mortgage">Mortgage</option>
                    <option value="Lease">Lease</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Lender</label>
                  <input type="text" value={liabilityForm.lender} onChange={(e) => setLiabilityForm({ ...liabilityForm, lender: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
                <div>
                  <label style={labelStyle}>Current Balance</label>
                  <input type="number" step="0.01" value={liabilityForm.current_balance} onChange={(e) => setLiabilityForm({ ...liabilityForm, current_balance: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Monthly Payment</label>
                  <input type="number" step="0.01" value={liabilityForm.monthly_payment} onChange={(e) => setLiabilityForm({ ...liabilityForm, monthly_payment: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowLiabilityModal(false)} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer', minHeight: '44px' }}>Cancel</button>
                <button onClick={handleSaveLiability} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer', minHeight: '44px' }}>Save</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
