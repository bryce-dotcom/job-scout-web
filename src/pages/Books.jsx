import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'
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

// Single source of truth for the Tax Category dropdown (IRS Form 1065 lines).
// Used in the transaction edit modal and wherever Tax Category picking happens.
// Keep these values in sync with public.expense_categories.default_tax_category
// so auto-fill from Expense Category always lands on a real option.
export const TAX_CATEGORIES = [
  { group: 'Cost of Goods Sold', options: [
    { value: 'Line 2 - Cost of goods sold', label: 'Cost of Goods Sold (job materials, resale items)' },
  ]},
  { group: 'Common Deductions', options: [
    { value: 'Line 20 - Advertising', label: 'Advertising & Marketing' },
    { value: 'Line 20 - Office expenses', label: 'Office Expenses & Supplies' },
    { value: 'Line 20 - Auto expenses', label: 'Vehicle & Auto Expenses' },
    { value: 'Line 12 - Repairs and maintenance', label: 'Repairs & Maintenance' },
    { value: 'Line 14 - Rent', label: 'Rent' },
    { value: 'Line 20 - Utilities', label: 'Utilities' },
    { value: 'Line 20 - Insurance', label: 'Insurance' },
    { value: 'Line 15 - Taxes and licenses', label: 'Taxes & Licenses' },
    { value: 'Line 20 - Travel', label: 'Travel' },
    { value: 'Line 20 - Meals', label: 'Meals (50% deductible)' },
  ]},
  { group: 'Payroll & Contractors', options: [
    { value: 'Line 10 - Guaranteed payments', label: 'Guaranteed Payments (partners)' },
    { value: 'Line 9 - Salaries and wages', label: 'Salaries & Wages' },
    { value: 'Line 20 - Contract labor', label: 'Contract Labor / Subcontractors' },
    { value: 'Line 18 - Retirement plans', label: 'Retirement Plan Contributions' },
    { value: 'Line 19 - Employee benefit programs', label: 'Employee Benefits' },
  ]},
  { group: 'Assets & Depreciation', options: [
    { value: 'Line 16a - Depreciation', label: 'Depreciation (equipment, vehicles)' },
    { value: 'Line 20 - Equipment rental', label: 'Equipment Rental' },
  ]},
  { group: 'Other', options: [
    { value: 'Line 20 - Other deductions', label: 'Other Deductions' },
    { value: 'Line 13 - Bad debts', label: 'Bad Debts' },
    { value: 'Not deductible', label: 'Not Deductible (personal, distributions)' },
    { value: 'Income', label: 'Income (not a deduction)' },
  ]},
]

// Flat list for reverse lookup (value -> label).
export const TAX_CATEGORY_OPTIONS = TAX_CATEGORIES.flatMap(g => g.options)

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
  const isMobile = useIsMobile()

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
  // Multi-job allocations: [{ job_id, amount, notes }]
  const [txnJobAllocations, setTxnJobAllocations] = useState([])
  const [txnAllocJobSearch, setTxnAllocJobSearch] = useState('')

  // Expense modal
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)
  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', expense_date: '', vendor: '', category_id: ''
  })
  // Split-across-categories support: when enabled, the expense's amount is
  // distributed across N category lines (e.g. one check to Cole covering
  // materials + fuel + tools). Each line is { category_id, amount, note }.
  // Lines must sum to expenseForm.amount before save is allowed.
  const [expenseSplitsEnabled, setExpenseSplitsEnabled] = useState(false)
  const [expenseSplits, setExpenseSplits] = useState([])
  // Cache of all splits keyed by expense_id, so the list view can render
  // category badges and the booked rollup can credit the right buckets.
  const [splitsByExpense, setSplitsByExpense] = useState({})

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

  // Manage Categories modal
  const [showManageCategories, setShowManageCategories] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newCategoryType, setNewCategoryType] = useState('expense')
  const [newCategoryTax, setNewCategoryTax] = useState('')
  const [savingCategory, setSavingCategory] = useState(false)
  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryTax, setEditingCategoryTax] = useState('')

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
    // Pull all splits for this company in one query and group by expense_id.
    const { data: splits } = await supabase
      .from('expense_splits')
      .select('*, category:expense_categories(id, name, icon, color)')
      .eq('company_id', companyId)
    const byExp = {}
    ;(splits || []).forEach(s => {
      if (!byExp[s.expense_id]) byExp[s.expense_id] = []
      byExp[s.expense_id].push(s)
    })
    setSplitsByExpense(byExp)
  }

  const fetchExpenseCategories = async () => {
    // Show globals (company_id IS NULL) plus any this company has added.
    const { data } = await supabase
      .from('expense_categories')
      .select('*')
      .or(`company_id.is.null,company_id.eq.${companyId}`)
      .order('sort_order')
      .order('name')
    setExpenseCategories(data || [])
  }

  // Add a new expense category scoped to this company.
  const addCustomCategory = async () => {
    const name = newCategoryName.trim()
    if (!name) { toast.error('Name is required'); return }
    if (expenseCategories.some(c => c.name.toLowerCase() === name.toLowerCase())) {
      toast.error('A category with that name already exists')
      return
    }
    setSavingCategory(true)
    const { error } = await supabase.from('expense_categories').insert({
      company_id: companyId,
      name,
      type: newCategoryType,
      default_tax_category: newCategoryTax || null,
      sort_order: 100, // custom rows sort after globals
      icon: newCategoryType === 'income' ? '💰' : '📁',
      color: newCategoryType === 'income' ? '#22c55e' : '#64748b',
    })
    setSavingCategory(false)
    if (error) { toast.error('Failed to add: ' + error.message); return }
    setNewCategoryName('')
    setNewCategoryTax('')
    setNewCategoryType('expense')
    await fetchExpenseCategories()
    toast.success('Category added')
  }

  // Update the default_tax_category mapping on a category. For globals
  // (company_id IS NULL) the server-side RLS will block this — we keep it
  // enabled only for the current company's rows.
  const saveCategoryTaxDefault = async (categoryId) => {
    setSavingCategory(true)
    const { error } = await supabase.from('expense_categories')
      .update({ default_tax_category: editingCategoryTax || null })
      .eq('id', categoryId)
    setSavingCategory(false)
    if (error) { toast.error('Failed: ' + error.message); return }
    setEditingCategoryId(null)
    setEditingCategoryTax('')
    await fetchExpenseCategories()
  }

  // Delete a custom category. Globals cannot be deleted (RLS blocks it).
  const deleteCategory = async (cat) => {
    if (cat.company_id === null) {
      toast.error("Built-in categories can't be deleted (you can add your own with a different name).")
      return
    }
    if (!confirm(`Delete "${cat.name}"? Transactions already using it will keep the name but it won't appear in the dropdown.`)) return
    const { error } = await supabase.from('expense_categories').delete().eq('id', cat.id)
    if (error) { toast.error('Failed: ' + error.message); return }
    await fetchExpenseCategories()
    toast.success('Deleted')
  }

  const fetchAssets = async () => {
    const { data } = await supabase.from('assets').select('*').eq('company_id', companyId).order('name')
    setAssets(data || [])
  }

  const fetchLiabilities = async () => {
    const { data } = await supabase.from('liabilities').select('*').eq('company_id', companyId).order('name')
    setLiabilities(data || [])
  }

  // ─── Income reconciliation: bank-deposit ↔ invoice matching ───
  // The Payroll commission engine reads the payments table. Two scenarios
  // silently dropped commission until we fixed them:
  //   1) Bank deposit hits the account but nobody marks the invoice paid in
  //      JobScout — invoice stays Pending, no payment row, $0 commission.
  //      Solution: surface unmatched deposits, let admin pick the invoice,
  //      we insert a payment row dated to the deposit date.
  //   2) Admin clicked "Mark as Paid" before commit 9d69e6d added the
  //      payment-row insert. Status='Paid' but no row in payments. Same
  //      $0 commission outcome. Solution: surface these and one-click
  //      backfill a payment dated to the invoice's updated_at.
  const [paymentsByInvoiceId, setPaymentsByInvoiceId] = useState(new Map())
  const [paymentsLoaded, setPaymentsLoaded] = useState(false)
  const [matchModal, setMatchModal] = useState({ open: false, deposit: null, invoices: [], loading: false, query: '', selectedId: null, saving: false })
  const [backfilling, setBackfillingInvoiceId] = useState(null)

  const fetchPaymentsLifetime = async () => {
    // Only need invoice_id + amount for the rollup. Paginate to be safe on
    // tenants with thousands of payment rows.
    const all = []
    for (let from = 0; ; from += 1000) {
      const { data, error } = await supabase
        .from('payments')
        .select('id, invoice_id, amount')
        .eq('company_id', companyId)
        .range(from, from + 999)
      if (error) break
      all.push(...(data || []))
      if (!data || data.length < 1000) break
    }
    const map = new Map()
    all.forEach(p => {
      if (!p.invoice_id) return
      map.set(p.invoice_id, (map.get(p.invoice_id) || 0) + (parseFloat(p.amount) || 0))
    })
    setPaymentsByInvoiceId(map)
    setPaymentsLoaded(true)
  }

  // Open the match modal for a given Plaid deposit. Pre-fetches open
  // invoices (status != Paid) and ranks them by:
  //   1) exact amount match (within 1¢)
  //   2) close amount match (within 5%)
  //   3) customer-name fuzzy match on the deposit's merchant_name/name
  const openMatchModal = async (deposit) => {
    setMatchModal({ open: true, deposit, invoices: [], loading: true, query: '', selectedId: null, saving: false })
    const depAmount = Math.abs(parseFloat(deposit.amount) || 0)
    const depName = ((deposit.merchant_name || deposit.name || '') + '').toLowerCase()
    const { data, error } = await supabase
      .from('invoices')
      .select('id, invoice_id, amount, payment_status, created_at, customer_id, job_id, customer:customers(name)')
      .eq('company_id', companyId)
      .neq('payment_status', 'Paid')
      .neq('payment_status', 'Cancelled')
      .order('created_at', { ascending: false })
      .limit(500)
    if (error) {
      toast.error('Failed to load invoices: ' + error.message)
      setMatchModal(m => ({ ...m, open: false }))
      return
    }
    // Compute open balance per invoice (amount − payments already on it).
    const ranked = (data || []).map(inv => {
      const paid = paymentsByInvoiceId.get(inv.id) || 0
      const open = Math.max(0, (parseFloat(inv.amount) || 0) - paid)
      const custName = (inv.customer?.name || '').toLowerCase()
      let score = 0
      if (Math.abs(open - depAmount) < 0.01) score += 100
      else if (open > 0 && Math.abs(open - depAmount) / open < 0.05) score += 50
      if (depName && custName && (depName.includes(custName.split(' ')[0]) || custName.includes(depName.split(' ')[0]))) score += 25
      return { ...inv, _open: open, _score: score }
    }).filter(inv => inv._open > 0.01)
      .sort((a, b) => (b._score - a._score) || (b.created_at < a.created_at ? 1 : -1))
    setMatchModal(m => ({ ...m, invoices: ranked, loading: false, selectedId: ranked[0]?._score >= 100 ? ranked[0].id : null }))
  }

  // Confirm the match: insert a payments row dated to the deposit, then
  // tag the plaid_transactions row so we don't re-prompt. The same path
  // the existing addPayment uses, just with source='bank_match' and a
  // back-reference to the txn for audit.
  const confirmMatch = async () => {
    const { deposit, selectedId, invoices } = matchModal
    const inv = invoices.find(i => i.id === selectedId)
    if (!inv) { toast.error('Pick an invoice first'); return }
    setMatchModal(m => ({ ...m, saving: true }))
    const depAmount = Math.abs(parseFloat(deposit.amount) || 0)
    const payAmount = Math.min(depAmount, inv._open)
    const { data: payRow, error: payErr } = await supabase.from('payments').insert([{
      company_id: companyId,
      invoice_id: inv.id,
      customer_id: inv.customer_id || null,
      job_id: inv.job_id || null,
      amount: Math.round(payAmount * 100) / 100,
      date: deposit.date,
      method: 'Bank Deposit',
      status: 'Completed',
      source: 'bank_match',
      source_transaction_id: deposit.id,
      notes: `Matched bank deposit (${deposit.merchant_name || deposit.name || 'unnamed'})`
    }]).select('id').single()
    if (payErr) {
      toast.error('Failed to create payment: ' + payErr.message)
      setMatchModal(m => ({ ...m, saving: false }))
      return
    }
    // Tag the plaid txn so it stops appearing in the unmatched list.
    const { error: txnErr } = await supabase.from('plaid_transactions').update({
      matched_invoice_id: inv.id,
      matched_payment_id: payRow.id,
      matched_at: new Date().toISOString(),
    }).eq('id', deposit.id)
    if (txnErr) console.warn('Match tag failed (non-fatal):', txnErr)
    // If this payment closes out the invoice, flip status to Paid.
    if (payAmount + (paymentsByInvoiceId.get(inv.id) || 0) >= (parseFloat(inv.amount) || 0) - 0.01) {
      await supabase.from('invoices').update({ payment_status: 'Paid', updated_at: new Date().toISOString() }).eq('id', inv.id)
    } else {
      await supabase.from('invoices').update({ payment_status: 'Partially Paid', updated_at: new Date().toISOString() }).eq('id', inv.id)
    }
    toast.success(`Matched $${payAmount.toFixed(2)} to invoice ${inv.invoice_id || inv.id}`)
    setMatchModal({ open: false, deposit: null, invoices: [], loading: false, query: '', selectedId: null, saving: false })
    await Promise.all([fetchPaymentsLifetime(), fetchPlaidTransactions()])
  }

  // One-click backfill: invoice is marked Paid but has no payment row.
  // Insert one for the remaining balance dated to invoice.updated_at so
  // the commission engine sees a payment in the period the admin marked
  // it paid in.
  const backfillMissingPayment = async (inv) => {
    if (!confirm(`Create a payment record for $${(parseFloat(inv.amount) || 0).toFixed(2)} on invoice ${inv.invoice_id || inv.id}? This will be dated to the invoice's last update so commissions land in the right pay period.`)) return
    setBackfillingInvoiceId(inv.id)
    const paid = paymentsByInvoiceId.get(inv.id) || 0
    const owed = Math.max(0, (parseFloat(inv.amount) || 0) - paid)
    if (owed < 0.01) { toast.error('Nothing left owed'); setBackfillingInvoiceId(null); return }
    const dateStr = (inv.updated_at || inv.created_at || new Date().toISOString()).slice(0, 10)
    const { error } = await supabase.from('payments').insert([{
      company_id: companyId,
      invoice_id: inv.id,
      customer_id: inv.customer_id || null,
      job_id: inv.job_id || null,
      amount: Math.round(owed * 100) / 100,
      date: dateStr,
      method: 'Backfill',
      status: 'Completed',
      source: 'mark_paid',
      notes: 'Backfilled missing payment record (invoice was already marked Paid)'
    }])
    setBackfillingInvoiceId(null)
    if (error) { toast.error('Failed: ' + error.message); return }
    toast.success('Payment record created — commission will appear on next Payroll load')
    await fetchPaymentsLifetime()
  }

  // Fetch lifetime payments once the page mounts.
  useEffect(() => {
    if (companyId) fetchPaymentsLifetime()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId])

  // Lists derived from the raw store + payments map.
  const unmatchedDeposits = (plaidTransactions || [])
    .filter(t => t.amount < 0 && !t.is_transfer && !t.matched_invoice_id)
    .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
    .slice(0, 50) // cap UI; admin clears the queue from the top

  const paidWithoutPayment = paymentsLoaded
    ? (invoices || []).filter(inv => {
        if (inv.payment_status !== 'Paid') return false
        if ((parseFloat(inv.amount) || 0) <= 0) return false
        const paid = paymentsByInvoiceId.get(inv.id) || 0
        return paid < (parseFloat(inv.amount) || 0) * 0.99
      }).slice(0, 50)
    : []


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

  // Expand a transaction: load its job allocations
  const expandTransaction = async (txn) => {
    setExpandedTxn(txn.id)
    setTxnEditCategory(txn.user_category || txn.ai_category || '')
    setTxnEditTaxCategory(txn.user_tax_category || txn.ai_tax_category || '')
    setTxnEditNotes(txn.notes || '')
    setTxnEditJobId(txn.job_id || txn.ai_job_id || null)
    setJobSearchText('')
    setTxnAllocJobSearch('')
    // Load existing allocations
    const { data: allocs } = await supabase
      .from('transaction_job_allocations')
      .select('id, job_id, amount, notes')
      .eq('transaction_id', txn.id)
      .eq('company_id', companyId)
    if (allocs && allocs.length > 0) {
      setTxnJobAllocations(allocs.map(a => ({ id: a.id, job_id: a.job_id, amount: String(a.amount), notes: a.notes || '' })))
    } else if (txn.job_id) {
      // Legacy: single job_id, use full transaction amount
      setTxnJobAllocations([{ job_id: txn.job_id, amount: String(Math.abs(parseFloat(txn.amount) || 0)), notes: '' }])
    } else {
      setTxnJobAllocations([])
    }
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

    // Validate allocations: amounts must not exceed transaction total
    const txnAmount = Math.abs(parseFloat(plaidTransactions.find(t => t.id === txnId)?.amount) || 0)
    const allocTotal = txnJobAllocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
    if (txnJobAllocations.length > 0 && Math.abs(allocTotal - txnAmount) > 0.01) {
      toast.error(`Allocated $${allocTotal.toFixed(2)} but transaction is $${txnAmount.toFixed(2)} — amounts must match`)
      return
    }

    const updates = {
      confirmed: true,
      user_category: category,
      user_tax_category: taxCategory,
    }
    if (txnEditNotes) updates.notes = txnEditNotes
    // Set job_id to first allocation for backward compat
    const firstJobId = txnJobAllocations.length > 0 ? txnJobAllocations[0].job_id : txnEditJobId
    if (firstJobId) updates.job_id = firstJobId

    await supabase.from('plaid_transactions').update(updates).eq('id', txnId)

    // Save job allocations
    if (txnJobAllocations.length > 0) {
      // Delete old allocations
      await supabase.from('transaction_job_allocations').delete().eq('transaction_id', txnId).eq('company_id', companyId)
      // Insert new
      const rows = txnJobAllocations.filter(a => a.job_id && parseFloat(a.amount) > 0).map(a => ({
        company_id: companyId,
        transaction_id: txnId,
        job_id: a.job_id,
        amount: parseFloat(a.amount) || 0,
        notes: a.notes || null,
      }))
      if (rows.length > 0) {
        await supabase.from('transaction_job_allocations').insert(rows)
      }
    } else {
      // Clear allocations if no jobs assigned
      await supabase.from('transaction_job_allocations').delete().eq('transaction_id', txnId).eq('company_id', companyId)
    }

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
  // Sum of split-line amounts (numeric, NaN-safe).
  const splitsSum = expenseSplits.reduce((s, l) => s + (parseFloat(l.amount) || 0), 0)
  const expenseTotal = parseFloat(expenseForm.amount) || 0
  const splitsBalanced = !expenseSplitsEnabled || Math.abs(splitsSum - expenseTotal) < 0.01

  const handleSaveExpense = async () => {
    const totalAmount = parseFloat(expenseForm.amount) || 0
    if (expenseSplitsEnabled) {
      if (expenseSplits.length === 0) { toast.error('Add at least one split line or turn off splits'); return }
      if (Math.abs(splitsSum - totalAmount) > 0.01) {
        toast.error(`Split lines (${formatCurrency(splitsSum)}) must equal expense total (${formatCurrency(totalAmount)})`)
        return
      }
      if (expenseSplits.some(l => !l.category_id)) { toast.error('Every split line needs a category'); return }
    }
    const payload = {
      company_id: companyId, description: expenseForm.description,
      amount: totalAmount,
      expense_date: expenseForm.expense_date || null,
      vendor: expenseForm.vendor || null,
      // When splits are on, the parent's category_id stops being meaningful;
      // null it out so reporting code knows to look at splits instead.
      category_id: expenseSplitsEnabled ? null : (expenseForm.category_id || null)
    }
    let expenseId
    if (editingItem) {
      await supabase.from('manual_expenses').update(payload).eq('id', editingItem.id)
      expenseId = editingItem.id
    } else {
      const { data: inserted } = await supabase.from('manual_expenses').insert([payload]).select().single()
      expenseId = inserted?.id
    }
    if (expenseId) {
      // Replace splits: simplest correct semantics for an edit. Delete then insert.
      await supabase.from('expense_splits').delete().eq('expense_id', expenseId).eq('company_id', companyId)
      if (expenseSplitsEnabled && expenseSplits.length) {
        const rows = expenseSplits.map(l => ({
          company_id: companyId,
          expense_id: expenseId,
          category_id: parseInt(l.category_id, 10),
          amount: parseFloat(l.amount) || 0,
          note: l.note || null
        }))
        const { error } = await supabase.from('expense_splits').insert(rows)
        if (error) { toast.error('Failed to save splits: ' + error.message); return }
      }
    }
    await fetchExpenses()
    closeExpenseModal()
  }

  const handleDeleteExpense = async (id) => {
    if (!confirm('Delete this expense?')) return
    // ON DELETE CASCADE on expense_splits.expense_id handles cleanup, but
    // delete explicitly anyway so RLS / row-count is predictable.
    await supabase.from('expense_splits').delete().eq('expense_id', id).eq('company_id', companyId)
    await supabase.from('manual_expenses').delete().eq('id', id)
    await fetchExpenses()
  }

  const openEditExpense = (expense) => {
    setEditingItem(expense)
    setExpenseForm({ description: expense.description || '', amount: expense.amount || '', expense_date: expense.expense_date || '', vendor: expense.vendor || '', category_id: expense.category_id || '' })
    const existingSplits = splitsByExpense[expense.id] || []
    if (existingSplits.length > 0) {
      setExpenseSplitsEnabled(true)
      setExpenseSplits(existingSplits.map(s => ({ category_id: String(s.category_id || ''), amount: String(s.amount || ''), note: s.note || '' })))
    } else {
      setExpenseSplitsEnabled(false)
      setExpenseSplits([])
    }
    setShowExpenseModal(true)
  }

  const closeExpenseModal = () => {
    setShowExpenseModal(false)
    setEditingItem(null)
    setExpenseForm({ description: '', amount: '', expense_date: '', vendor: '', category_id: '' })
    setExpenseSplitsEnabled(false)
    setExpenseSplits([])
  }

  const addSplitLine = () => {
    // Pre-fill the new line with whatever balance is left so the common
    // "1 line covers the rest" case is one click.
    const remaining = Math.max(0, expenseTotal - splitsSum)
    setExpenseSplits([...expenseSplits, { category_id: '', amount: remaining > 0 ? remaining.toFixed(2) : '', note: '' }])
  }
  const updateSplitLine = (idx, patch) => {
    setExpenseSplits(expenseSplits.map((l, i) => i === idx ? { ...l, ...patch } : l))
  }
  const removeSplitLine = (idx) => {
    setExpenseSplits(expenseSplits.filter((_, i) => i !== idx))
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

  if (!user) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '14px', color: '#7d8a7f' }}>Loading...</div>
      </div>
    )
  }

  if (!checkAdmin(user)) {
    return (
      <div style={{ padding: '40px', textAlign: 'center' }}>
        <div style={{ fontSize: '16px', fontWeight: '600', color: '#2c3530', marginBottom: '8px' }}>Access Restricted</div>
        <div style={{ fontSize: '14px', color: '#7d8a7f' }}>You don't have permission to view this page. Contact your admin for access.</div>
      </div>
    )
  }

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px', flexDirection: isMobile ? 'column' : 'row' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BookOpen size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: isMobile ? '20px' : '24px', fontWeight: '700', color: theme.text, margin: 0 }}>Books</h1>
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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
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

          {/* Income to Reconcile — bank-deposit ↔ invoice matching + Paid-with-no-payment backfill.
              Both flows insert a row in the payments table, which is what the Payroll
              commission engine reads. Without this, commissions silently went to $0
              for any invoice closed via the Mark-Paid button or paid via bank deposit
              that nobody manually applied in JobScout. */}
          {(unmatchedDeposits.length > 0 || paidWithoutPayment.length > 0) && (
            <div style={{
              ...statCardStyle,
              marginBottom: '24px',
              border: '1px solid rgba(234,179,8,0.4)',
              backgroundColor: 'rgba(234,179,8,0.05)'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                <AlertCircle size={18} style={{ color: '#eab308' }} />
                <h3 style={{ fontSize: '15px', fontWeight: '700', color: theme.text, margin: 0 }}>Income to reconcile</h3>
                <HelpBadge text="Money in that hasn't been linked to an invoice yet. Linking creates the payment record that drives commissions on the Payroll page." />
              </div>
              <div style={{ fontSize: '12px', color: theme.textSecondary, marginBottom: '14px' }}>
                Each item below blocks commission tracking until it's resolved. Click Match to tie a bank deposit to an invoice; click Add payment record to back-fill an invoice that was marked Paid but never had a payment row created.
              </div>

              {/* Unmatched bank deposits */}
              {unmatchedDeposits.length > 0 && (
                <div style={{ marginBottom: paidWithoutPayment.length > 0 ? '20px' : 0 }}>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Unmatched bank deposits ({unmatchedDeposits.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {unmatchedDeposits.map(dep => (
                      <div key={dep.id} style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                        backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px'
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {dep.merchant_name || dep.name || '(unnamed deposit)'}
                          </div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>
                            {formatDate(dep.date)}
                          </div>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: '#22c55e', minWidth: '90px', textAlign: 'right' }}>
                          +{formatCurrency(Math.abs(parseFloat(dep.amount) || 0))}
                        </div>
                        <button
                          onClick={() => openMatchModal(dep)}
                          style={{
                            padding: '6px 14px', backgroundColor: theme.accent, color: '#fff',
                            border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer',
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <Link size={12} /> Match
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Invoices marked Paid but missing a payment row */}
              {paidWithoutPayment.length > 0 && (
                <div>
                  <div style={{ fontSize: '12px', fontWeight: '600', color: theme.textSecondary, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                    Invoices marked Paid but missing a payment record ({paidWithoutPayment.length})
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                    {paidWithoutPayment.map(inv => (
                      <div key={inv.id} style={{
                        display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px',
                        backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '8px'
                      }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {inv.invoice_id || `Invoice #${inv.id}`}
                            {inv.job_description ? ` — ${inv.job_description}` : ''}
                          </div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>
                            Marked Paid {formatDate(inv.updated_at || inv.created_at)}
                          </div>
                        </div>
                        <div style={{ fontSize: '14px', fontWeight: '700', color: theme.text, minWidth: '90px', textAlign: 'right' }}>
                          {formatCurrency(parseFloat(inv.amount) || 0)}
                        </div>
                        <button
                          onClick={() => backfillMissingPayment(inv)}
                          disabled={backfilling === inv.id}
                          style={{
                            padding: '6px 14px', backgroundColor: theme.accent, color: '#fff',
                            border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600',
                            cursor: backfilling === inv.id ? 'wait' : 'pointer', opacity: backfilling === inv.id ? 0.5 : 1,
                            display: 'flex', alignItems: 'center', gap: '4px'
                          }}
                        >
                          <Plus size={12} /> Add payment record
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
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
          <div style={{ display: 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'space-between', marginBottom: '16px', flexWrap: 'wrap', gap: '12px', flexDirection: isMobile ? 'column' : 'row' }}>
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
                          else { expandTransaction(txn) }
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
                              // Auto-fill the row's tax category from the picked
                              // expense category's default, UNLESS the user already
                              // has a tax category on this row (don't clobber).
                              const existingTax = txn.user_tax_category || txn.ai_tax_category
                              const match = expenseCategories.find(c => c.name === val)
                              const updates = { user_category: val }
                              if (val && !existingTax && match?.default_tax_category) {
                                updates.user_tax_category = match.default_tax_category
                              }
                              await supabase.from('plaid_transactions').update(updates).eq('id', txn.id)
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
                            {TAX_CATEGORIES.map(grp => (
                              <optgroup key={grp.group} label={grp.group}>
                                {grp.options.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </optgroup>
                            ))}
                          </select>
                        </div>
                        {/* Job badge — clickable to expand and change */}
                        {matchedJob ? (
                          <span
                            onClick={(e) => { e.stopPropagation(); expandTransaction(txn) }}
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
                            onClick={(e) => { e.stopPropagation(); expandTransaction(txn) }}
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
                        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '12px', marginTop: '12px' }}>
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                <label style={{ fontSize: '12px', fontWeight: '600', color: theme.text }}>Expense Category</label>
                                <HelpBadge text="How you track this expense in your business. Groups similar spending together (e.g., all gas purchases go under Fuel). This helps you see where your money goes each month." size={13} />
                              </div>
                              <button
                                type="button"
                                onClick={() => setShowManageCategories(true)}
                                style={{ fontSize: '11px', color: theme.accent, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                              >
                                + Manage categories
                              </button>
                            </div>
                            <select
                              value={txnEditCategory}
                              onChange={(e) => {
                                const newCat = e.target.value
                                setTxnEditCategory(newCat)
                                // Auto-fill Tax Category from the picked expense category's
                                // default_tax_category — but only if the user hasn't already
                                // set a tax category (don't clobber overrides).
                                if (newCat && !txnEditTaxCategory) {
                                  const match = expenseCategories.find(c => c.name === newCat)
                                  if (match?.default_tax_category) {
                                    setTxnEditTaxCategory(match.default_tax_category)
                                  }
                                }
                              }}
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
                              <HelpBadge text="Where this goes on your tax return. Your accountant uses this to file taxes. Auto-fills from your Expense Category — override only if this specific transaction belongs on a different line (e.g. 'Supplies' for a job → COGS; 'Supplies' for the office → Office Expenses)." size={13} />
                            </div>
                            <select
                              value={txnEditTaxCategory}
                              onChange={(e) => setTxnEditTaxCategory(e.target.value)}
                              style={{ ...inputStyle, cursor: 'pointer' }}
                            >
                              <option value="">Select tax category...</option>
                              {TAX_CATEGORIES.map(grp => (
                                <optgroup key={grp.group} label={grp.group}>
                                  {grp.options.map(opt => (
                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                  ))}
                                </optgroup>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Job Allocations */}
                        <div style={{ marginTop: '12px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                              <label style={{ fontSize: '12px', fontWeight: '600', color: theme.text }}>Allocate to Jobs</label>
                              <HelpBadge text="Split this transaction across one or more jobs with exact dollar amounts for accurate job costing. Amounts must add up to the transaction total." size={13} />
                            </div>
                            <span style={{ fontSize: '11px', color: theme.textMuted }}>
                              Transaction: ${Math.abs(amountNum).toFixed(2)}
                            </span>
                          </div>

                          {/* Existing allocations */}
                          {txnJobAllocations.map((alloc, allocIdx) => {
                            const allocJob = (jobs || []).find(j => j.id === alloc.job_id)
                            return (
                              <div key={allocIdx} style={{
                                display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px',
                                padding: '8px 10px', backgroundColor: theme.bg, borderRadius: '8px',
                                border: `1px solid ${theme.border}`
                              }}>
                                <Briefcase size={14} style={{ color: theme.accent, flexShrink: 0 }} />
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <div style={{ fontSize: '13px', fontWeight: '500', color: theme.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                    {allocJob?.job_title || `Job #${alloc.job_id}`}
                                  </div>
                                  <div style={{ fontSize: '11px', color: theme.textMuted }}>{allocJob?.customer?.name || ''}</div>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ fontSize: '13px', color: theme.textMuted }}>$</span>
                                  <input
                                    type="number"
                                    step="0.01"
                                    value={alloc.amount}
                                    onChange={(e) => {
                                      const updated = [...txnJobAllocations]
                                      updated[allocIdx] = { ...updated[allocIdx], amount: e.target.value }
                                      setTxnJobAllocations(updated)
                                    }}
                                    style={{
                                      width: '90px', padding: '6px 8px', border: `1px solid ${theme.border}`,
                                      borderRadius: '6px', fontSize: '13px', color: theme.text,
                                      backgroundColor: theme.bgCard, textAlign: 'right'
                                    }}
                                  />
                                </div>
                                <button
                                  onClick={() => setTxnJobAllocations(txnJobAllocations.filter((_, i) => i !== allocIdx))}
                                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}
                                  title="Remove"
                                >
                                  <X size={14} />
                                </button>
                              </div>
                            )
                          })}

                          {/* Allocation summary */}
                          {txnJobAllocations.length > 0 && (() => {
                            const allocTotal = txnJobAllocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
                            const remaining = Math.abs(amountNum) - allocTotal
                            const isBalanced = Math.abs(remaining) < 0.01
                            return (
                              <div style={{
                                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                padding: '6px 10px', marginBottom: '8px', fontSize: '12px',
                                backgroundColor: isBalanced ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
                                borderRadius: '6px', color: isBalanced ? '#16a34a' : '#dc2626'
                              }}>
                                <span>Allocated: ${allocTotal.toFixed(2)}</span>
                                {!isBalanced && <span>{remaining > 0 ? `$${remaining.toFixed(2)} remaining` : `$${Math.abs(remaining).toFixed(2)} over`}</span>}
                                {isBalanced && <span><Check size={12} style={{ verticalAlign: 'middle' }} /> Balanced</span>}
                              </div>
                            )
                          })()}

                          {/* Add job search */}
                          <div style={{ position: 'relative' }}>
                            <input
                              type="text"
                              value={txnAllocJobSearch}
                              onChange={(e) => setTxnAllocJobSearch(e.target.value)}
                              placeholder="Search to add a job..."
                              style={inputStyle}
                            />
                            {txnAllocJobSearch && (() => {
                              const existingJobIds = new Set(txnJobAllocations.map(a => a.job_id))
                              const filtered = (jobs || []).filter(j => {
                                if (existingJobIds.has(j.id)) return false
                                const s = txnAllocJobSearch.toLowerCase()
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
                                    <button key={j.id} onClick={() => {
                                      const currentTotal = txnJobAllocations.reduce((s, a) => s + (parseFloat(a.amount) || 0), 0)
                                      const remaining = Math.abs(amountNum) - currentTotal
                                      setTxnJobAllocations([...txnJobAllocations, {
                                        job_id: j.id,
                                        amount: String(Math.max(0, Math.round(remaining * 100) / 100)),
                                        notes: ''
                                      }])
                                      setTxnAllocJobSearch('')
                                    }} style={{
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
                          </div>
                          {txn.ai_job_id && txn.ai_job_confidence != null && txnJobAllocations.length === 0 && (
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
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(350px, 1fr))', gap: '24px', marginBottom: '24px' }}>
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
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', alignItems: isMobile ? 'stretch' : 'center', flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
                {/* Tax Category Summary */}
                <div style={statCardStyle}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>Tax Category Summary</h3>
                  {catEntries.length === 0 ? (
                    <p style={{ color: theme.textMuted, fontSize: '14px' }}>No confirmed transactions in this date range.</p>
                  ) : (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
                    </div>
                  )}
                </div>

                {/* 1065 Line Items */}
                <div style={statCardStyle}>
                  <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '4px' }}>Form 1065 Line Items</h3>
                  <p style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '16px' }}>Partnership return breakdown (AI-assigned)</p>
                  {lineEntries.length === 0 ? (
                    <p style={{ color: theme.textMuted, fontSize: '14px' }}>No 1065 data yet.</p>
                  ) : (
                    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
                    </div>
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
            // Combine confirmed plaid transactions + manual expenses.
            // For manual expenses with splits, emit one row per split so each
            // category gets credited correctly; otherwise emit the parent.
            const confirmedPlaid = plaidTransactions.filter(t => t.confirmed)
            const manualRows = []
            expenses.forEach(e => {
              const splits = splitsByExpense[e.id] || []
              if (splits.length > 0) {
                splits.forEach(s => {
                  manualRows.push({
                    id: 'm-' + e.id + '-s' + s.id, type: 'manual-split',
                    category: s.category?.name || 'Uncategorized',
                    description: e.description + (s.note ? ` — ${s.note}` : ''),
                    amount: parseFloat(s.amount) || 0,
                    date: e.expense_date, isExpense: true
                  })
                })
              } else {
                manualRows.push({
                  id: 'm-' + e.id, type: 'manual', category: e.category?.name || 'Uncategorized',
                  description: e.description, amount: parseFloat(e.amount) || 0,
                  date: e.expense_date, isExpense: true
                })
              }
            })
            const allBooked = [
              ...confirmedPlaid.map(t => ({
                id: 'p-' + t.id, type: 'plaid', category: t.user_category || t.ai_category || 'Uncategorized',
                description: t.merchant_name || t.name, amount: Math.abs(parseFloat(t.amount) || 0),
                date: t.date, isExpense: (parseFloat(t.amount) || 0) > 0
              })),
              ...manualRows
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
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
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: isMobile ? 'calc(100vw - 32px)' : '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{editingItem ? 'Edit Expense' : 'Add Manual Expense'}</h2>
              <button onClick={closeExpenseModal} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Description *</label>
                <input type="text" value={expenseForm.description} onChange={(e) => setExpenseForm({ ...expenseForm, description: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Amount *</label>
                  <input type="number" step="0.01" value={expenseForm.amount} onChange={(e) => setExpenseForm({ ...expenseForm, amount: e.target.value })} style={inputStyle} />
                </div>
                <div>
                  <label style={labelStyle}>Date</label>
                  <input type="date" value={expenseForm.expense_date} onChange={(e) => setExpenseForm({ ...expenseForm, expense_date: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Category</label>
                  <select value={expenseForm.category_id} onChange={(e) => setExpenseForm({ ...expenseForm, category_id: e.target.value })} style={inputStyle} disabled={expenseSplitsEnabled}>
                    <option value="">{expenseSplitsEnabled ? '-- Using splits --' : '-- Select --'}</option>
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

              {/* Split toggle + lines */}
              <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: theme.bg, border: `1px solid ${theme.border}`, borderRadius: '8px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', minHeight: '44px' }}>
                  <input
                    type="checkbox"
                    checked={expenseSplitsEnabled}
                    onChange={(e) => {
                      const on = e.target.checked
                      setExpenseSplitsEnabled(on)
                      if (on && expenseSplits.length === 0) {
                        // Seed two empty lines so user sees the pattern.
                        setExpenseSplits([
                          { category_id: expenseForm.category_id || '', amount: '', note: '' },
                          { category_id: '', amount: '', note: '' }
                        ])
                      }
                    }}
                  />
                  <span style={{ fontSize: '14px', color: theme.text, fontWeight: '500' }}>Split across multiple categories</span>
                  <HelpBadge text="Use this when one payment (e.g. a single check to a vendor) covers expenses in different categories. Each line's amounts must add up to the total above." />
                </label>

                {expenseSplitsEnabled && (
                  <div style={{ marginTop: '12px' }}>
                    {expenseSplits.map((line, idx) => (
                      <div key={idx} style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.4fr 1fr 1.4fr 36px', gap: '8px', marginBottom: '8px', alignItems: 'center' }}>
                        <select
                          value={line.category_id}
                          onChange={(e) => updateSplitLine(idx, { category_id: e.target.value })}
                          style={{ ...inputStyle, padding: '8px 10px' }}
                        >
                          <option value="">-- Category --</option>
                          {expenseCategories.filter(c => c.type === 'expense').map(c => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                        <input
                          type="number"
                          step="0.01"
                          placeholder="Amount"
                          defaultValue={line.amount}
                          onBlur={(e) => updateSplitLine(idx, { amount: e.target.value })}
                          style={{ ...inputStyle, padding: '8px 10px' }}
                        />
                        <input
                          type="text"
                          placeholder="Note (optional)"
                          defaultValue={line.note}
                          onBlur={(e) => updateSplitLine(idx, { note: e.target.value })}
                          style={{ ...inputStyle, padding: '8px 10px' }}
                        />
                        <button
                          type="button"
                          onClick={() => removeSplitLine(idx)}
                          style={{ background: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', padding: '6px', minHeight: '36px' }}
                          title="Remove line"
                        >
                          <X size={16} />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={addSplitLine}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '8px 12px', backgroundColor: 'transparent', border: `1px dashed ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '13px', cursor: 'pointer', minHeight: '36px' }}
                    >
                      <Plus size={14} /> Add line
                    </button>
                    <div style={{ marginTop: '10px', display: 'flex', justifyContent: 'space-between', fontSize: '13px', color: splitsBalanced ? theme.textSecondary : theme.error, fontWeight: '500' }}>
                      <span>Sum of splits: {formatCurrency(splitsSum)}</span>
                      <span>{splitsBalanced ? 'Balanced' : `Off by ${formatCurrency(expenseTotal - splitsSum)}`}</span>
                    </div>
                  </div>
                )}
              </div>

              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={closeExpenseModal} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer', minHeight: '44px' }}>Cancel</button>
                <button
                  onClick={handleSaveExpense}
                  disabled={!splitsBalanced}
                  style={{ flex: 1, padding: '12px', backgroundColor: splitsBalanced ? theme.accent : theme.border, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: splitsBalanced ? 'pointer' : 'not-allowed', minHeight: '44px', opacity: splitsBalanced ? 1 : 0.6 }}
                >Save</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ASSET MODAL */}
      {showAssetModal && (
        <>
          <div onClick={() => setShowAssetModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: isMobile ? 'calc(100vw - 32px)' : '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{editingItem ? 'Edit Asset' : 'Add Asset'}</h2>
              <button onClick={() => setShowAssetModal(false)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
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
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: isMobile ? 'calc(100vw - 32px)' : '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, margin: 0 }}>{editingItem ? 'Edit Liability' : 'Add Liability'}</h2>
              <button onClick={() => setShowLiabilityModal(false)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px', maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Name *</label>
                <input type="text" value={liabilityForm.name} onChange={(e) => setLiabilityForm({ ...liabilityForm, name: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
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
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: '16px', marginBottom: '24px' }}>
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

      {/* Manage Expense Categories modal */}
      {showManageCategories && (
        <div
          onClick={() => setShowManageCategories(false)}
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.45)', zIndex: 2000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '16px' }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ backgroundColor: theme.bgCard, border: `1px solid ${theme.border}`, borderRadius: '14px', width: '100%', maxWidth: '640px', maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
          >
            {/* Header */}
            <div style={{ padding: '20px 24px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text, margin: 0 }}>Manage Expense Categories</h2>
                <p style={{ fontSize: '12px', color: theme.textMuted, margin: '4px 0 0' }}>
                  Add your own buckets (like Job Supplies, Truck Payments, etc.) and map each one to the right tax line. Once a category has a default tax line, picking that category on a transaction auto-fills the Tax Category.
                </p>
              </div>
              <button onClick={() => setShowManageCategories(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted, padding: '4px' }}>
                <X size={20} />
              </button>
            </div>

            {/* Add new */}
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.bg }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: theme.text, marginBottom: '8px' }}>Add New Category</div>
              <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '2fr 1fr 2fr auto', gap: '8px', alignItems: 'end' }}>
                <div>
                  <label style={{ fontSize: '11px', color: theme.textMuted }}>Name</label>
                  <input
                    type="text"
                    value={newCategoryName}
                    onChange={(e) => setNewCategoryName(e.target.value)}
                    placeholder="e.g. Truck Payments"
                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', backgroundColor: theme.bgCard, color: theme.text, boxSizing: 'border-box' }}
                  />
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: theme.textMuted }}>Type</label>
                  <select
                    value={newCategoryType}
                    onChange={(e) => setNewCategoryType(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', backgroundColor: theme.bgCard, color: theme.text, boxSizing: 'border-box' }}
                  >
                    <option value="expense">Expense</option>
                    <option value="income">Income</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: '11px', color: theme.textMuted }}>Default Tax Category</label>
                  <select
                    value={newCategoryTax}
                    onChange={(e) => setNewCategoryTax(e.target.value)}
                    style={{ width: '100%', padding: '8px 10px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', backgroundColor: theme.bgCard, color: theme.text, boxSizing: 'border-box' }}
                  >
                    <option value="">(none — ask each time)</option>
                    {TAX_CATEGORIES.map(grp => (
                      <optgroup key={grp.group} label={grp.group}>
                        {grp.options.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </div>
                <button
                  onClick={addCustomCategory}
                  disabled={savingCategory || !newCategoryName.trim()}
                  style={{ padding: '8px 14px', backgroundColor: theme.accent, border: 'none', borderRadius: '6px', color: '#fff', fontSize: '13px', fontWeight: '500', cursor: savingCategory ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}
                >
                  <Plus size={14} style={{ verticalAlign: 'middle', marginRight: '4px' }} />
                  Add
                </button>
              </div>
            </div>

            {/* Existing list */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {expenseCategories.length === 0 ? (
                <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>No categories yet.</div>
              ) : (
                <table style={{ width: '100%', fontSize: '13px', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ backgroundColor: theme.bg, position: 'sticky', top: 0 }}>
                      <th style={{ textAlign: 'left', padding: '10px 16px', fontSize: '11px', color: theme.textMuted, fontWeight: '600' }}>Category</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '11px', color: theme.textMuted, fontWeight: '600' }}>Type</th>
                      <th style={{ textAlign: 'left', padding: '10px 8px', fontSize: '11px', color: theme.textMuted, fontWeight: '600' }}>Default Tax Category</th>
                      <th style={{ width: '60px' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {expenseCategories.map(cat => {
                      const isGlobal = cat.company_id === null
                      const isEditingThis = editingCategoryId === cat.id
                      const taxLabel = TAX_CATEGORY_OPTIONS.find(o => o.value === cat.default_tax_category)?.label || cat.default_tax_category
                      return (
                        <tr key={cat.id} style={{ borderBottom: `1px solid ${theme.border}` }}>
                          <td style={{ padding: '10px 16px', color: theme.text }}>
                            <span style={{ marginRight: '6px' }}>{cat.icon}</span>
                            {cat.name}
                            {isGlobal && <span style={{ marginLeft: '6px', fontSize: '10px', color: theme.textMuted, fontStyle: 'italic' }}>(built-in)</span>}
                          </td>
                          <td style={{ padding: '10px 8px', color: theme.textSecondary }}>{cat.type}</td>
                          <td style={{ padding: '10px 8px', color: theme.textSecondary }}>
                            {isEditingThis ? (
                              <div style={{ display: 'flex', gap: '6px' }}>
                                <select
                                  value={editingCategoryTax}
                                  onChange={(e) => setEditingCategoryTax(e.target.value)}
                                  style={{ flex: 1, padding: '6px 8px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '12px', backgroundColor: theme.bgCard, color: theme.text }}
                                >
                                  <option value="">(none)</option>
                                  {TAX_CATEGORIES.map(grp => (
                                    <optgroup key={grp.group} label={grp.group}>
                                      {grp.options.map(opt => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                      ))}
                                    </optgroup>
                                  ))}
                                </select>
                                <button onClick={() => saveCategoryTaxDefault(cat.id)} disabled={savingCategory} style={{ padding: '6px 10px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>Save</button>
                                <button onClick={() => { setEditingCategoryId(null); setEditingCategoryTax('') }} style={{ padding: '6px 10px', backgroundColor: 'transparent', color: theme.textMuted, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}>Cancel</button>
                              </div>
                            ) : isGlobal ? (
                              <span style={{ color: theme.textMuted }}>{taxLabel || '—'}</span>
                            ) : (
                              <span
                                onClick={() => { setEditingCategoryId(cat.id); setEditingCategoryTax(cat.default_tax_category || '') }}
                                style={{ cursor: 'pointer', color: taxLabel ? theme.text : theme.textMuted, textDecoration: 'underline', textDecorationStyle: 'dotted' }}
                                title="Click to change"
                              >
                                {taxLabel || 'Set default...'}
                              </span>
                            )}
                          </td>
                          <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                            {!isGlobal && (
                              <button
                                onClick={() => deleteCategory(cat)}
                                title="Delete"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: '4px' }}
                              >
                                <Trash2 size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div style={{ padding: '12px 24px', borderTop: `1px solid ${theme.border}`, backgroundColor: theme.bg, textAlign: 'right' }}>
              <button onClick={() => setShowManageCategories(false)} style={{ padding: '8px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* Bank-deposit ↔ invoice match modal. Shows open invoices ranked by
          amount-similarity + customer-name fuzzy match, with the deposit's
          context up top so the user can confirm visually. */}
      {matchModal.open && matchModal.deposit && (
        <div onClick={() => !matchModal.saving && setMatchModal({ open: false, deposit: null, invoices: [], loading: false, query: '', selectedId: null, saving: false })}
             style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px' }}>
          <div onClick={e => e.stopPropagation()}
               style={{ backgroundColor: theme.bgCard, borderRadius: '10px', maxWidth: '700px', width: '100%', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${theme.border}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '700', color: theme.text, margin: 0 }}>Match deposit to invoice</h3>
              <button onClick={() => !matchModal.saving && setMatchModal({ open: false, deposit: null, invoices: [], loading: false, query: '', selectedId: null, saving: false })}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ padding: '16px 24px', borderBottom: `1px solid ${theme.border}`, backgroundColor: theme.bg }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '4px' }}>Bank deposit</div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600', color: theme.text }}>
                    {matchModal.deposit.merchant_name || matchModal.deposit.name || '(unnamed)'}
                  </div>
                  <div style={{ fontSize: '12px', color: theme.textMuted }}>{formatDate(matchModal.deposit.date)}</div>
                </div>
                <div style={{ fontSize: '18px', fontWeight: '700', color: '#22c55e' }}>
                  +{formatCurrency(Math.abs(parseFloat(matchModal.deposit.amount) || 0))}
                </div>
              </div>
            </div>

            <div style={{ padding: '12px 24px', borderBottom: `1px solid ${theme.border}` }}>
              <input
                type="text"
                placeholder="Filter open invoices by customer or invoice #…"
                value={matchModal.query}
                onChange={e => setMatchModal(m => ({ ...m, query: e.target.value }))}
                style={{ width: '100%', padding: '8px 12px', border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', backgroundColor: theme.bgCard, color: theme.text, boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 16px' }}>
              {matchModal.loading && <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted }}>Loading open invoices…</div>}
              {!matchModal.loading && matchModal.invoices.length === 0 && (
                <div style={{ padding: '40px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
                  No open invoices to match against. Create the invoice first, then come back and match this deposit.
                </div>
              )}
              {!matchModal.loading && matchModal.invoices
                .filter(inv => {
                  const q = matchModal.query.toLowerCase().trim()
                  if (!q) return true
                  return (inv.invoice_id || '').toLowerCase().includes(q) ||
                         (inv.customer?.name || '').toLowerCase().includes(q)
                })
                .slice(0, 40)
                .map(inv => {
                  const selected = matchModal.selectedId === inv.id
                  const exact = inv._score >= 100
                  return (
                    <div key={inv.id}
                         onClick={() => setMatchModal(m => ({ ...m, selectedId: inv.id }))}
                         style={{
                           display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 12px', marginBottom: '4px',
                           cursor: 'pointer', borderRadius: '6px',
                           backgroundColor: selected ? theme.accentBg : 'transparent',
                           border: `1px solid ${selected ? theme.accent : 'transparent'}`,
                         }}>
                      <input type="radio" checked={selected} onChange={() => setMatchModal(m => ({ ...m, selectedId: inv.id }))} style={{ cursor: 'pointer' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>
                          {inv.invoice_id || `Invoice #${inv.id}`}
                          {inv.customer?.name && ` — ${inv.customer.name}`}
                          {exact && <span style={{ marginLeft: '6px', fontSize: '10px', fontWeight: '700', color: '#22c55e', backgroundColor: 'rgba(34,197,94,0.12)', padding: '1px 6px', borderRadius: '8px' }}>EXACT MATCH</span>}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>
                          {inv.payment_status} · created {formatDate(inv.created_at)}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{formatCurrency(inv._open)}</div>
                        <div style={{ fontSize: '10px', color: theme.textMuted }}>open balance</div>
                      </div>
                    </div>
                  )
                })}
            </div>

            <div style={{ padding: '12px 24px', borderTop: `1px solid ${theme.border}`, backgroundColor: theme.bg, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
              <div style={{ fontSize: '11px', color: theme.textMuted }}>
                {matchModal.selectedId
                  ? `Will create a payment row dated ${formatDate(matchModal.deposit.date)} on the selected invoice. Commission flows to the rep on the next Payroll load.`
                  : 'Select an invoice to enable Match.'}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => !matchModal.saving && setMatchModal({ open: false, deposit: null, invoices: [], loading: false, query: '', selectedId: null, saving: false })}
                        disabled={matchModal.saving}
                        style={{ padding: '8px 14px', backgroundColor: 'transparent', color: theme.text, border: `1px solid ${theme.border}`, borderRadius: '6px', fontSize: '13px', fontWeight: '500', cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={confirmMatch}
                        disabled={!matchModal.selectedId || matchModal.saving}
                        style={{ padding: '8px 14px', backgroundColor: matchModal.selectedId ? theme.accent : theme.border, color: '#fff', border: 'none', borderRadius: '6px', fontSize: '13px', fontWeight: '600', cursor: matchModal.selectedId && !matchModal.saving ? 'pointer' : 'not-allowed', opacity: matchModal.saving ? 0.5 : 1 }}>
                  {matchModal.saving ? 'Matching…' : 'Match & create payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
