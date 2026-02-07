import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import {
  BookOpen, Plus, X, DollarSign, TrendingUp, TrendingDown,
  Wallet, CreditCard, Building, PiggyBank, Pencil, Trash2,
  Calendar, FileText, Search
} from 'lucide-react'

export default function Books() {
  const companyId = useStore((state) => state.companyId)
  const invoices = useStore((state) => state.invoices)

  const themeContext = useTheme()
  const theme = themeContext?.theme || {
    bg: '#f7f5ef',
    bgCard: '#ffffff',
    bgCardHover: '#eef2eb',
    border: '#d6cdb8',
    text: '#2c3530',
    textSecondary: '#4d5a52',
    textMuted: '#7d8a7f',
    accent: '#5a6349',
    accentBg: 'rgba(90,99,73,0.12)'
  }

  const [activeTab, setActiveTab] = useState('health')
  const [bankAccounts, setBankAccounts] = useState([])
  const [expenses, setExpenses] = useState([])
  const [expenseCategories, setExpenseCategories] = useState([])
  const [assets, setAssets] = useState([])
  const [liabilities, setLiabilities] = useState([])
  const [loading, setLoading] = useState(true)

  // Modal states
  const [showExpenseModal, setShowExpenseModal] = useState(false)
  const [showAssetModal, setShowAssetModal] = useState(false)
  const [showLiabilityModal, setShowLiabilityModal] = useState(false)
  const [editingItem, setEditingItem] = useState(null)

  // Form data
  const [expenseForm, setExpenseForm] = useState({
    description: '', amount: '', expense_date: '', vendor: '', category_id: ''
  })
  const [assetForm, setAssetForm] = useState({
    name: '', asset_type: '', purchase_price: '', current_value: '', status: 'active'
  })
  const [liabilityForm, setLiabilityForm] = useState({
    name: '', liability_type: '', current_balance: '', monthly_payment: '', lender: '', status: 'active'
  })

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
      fetchLiabilities()
    ])
    setLoading(false)
  }

  const fetchBankAccounts = async () => {
    const { data } = await supabase
      .from('bank_accounts')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    setBankAccounts(data || [])
  }

  const fetchExpenses = async () => {
    const { data } = await supabase
      .from('manual_expenses')
      .select('*, category:expense_categories(id, name, icon, color)')
      .eq('company_id', companyId)
      .order('expense_date', { ascending: false })
    setExpenses(data || [])
  }

  const fetchExpenseCategories = async () => {
    const { data } = await supabase
      .from('expense_categories')
      .select('*')
      .order('sort_order')
    setExpenseCategories(data || [])
  }

  const fetchAssets = async () => {
    const { data } = await supabase
      .from('assets')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    setAssets(data || [])
  }

  const fetchLiabilities = async () => {
    const { data } = await supabase
      .from('liabilities')
      .select('*')
      .eq('company_id', companyId)
      .order('name')
    setLiabilities(data || [])
  }

  // Calculate financial stats
  const totalCashInBank = bankAccounts.reduce((sum, acc) => sum + (parseFloat(acc.current_balance) || 0), 0)

  const unpaidInvoices = invoices?.filter(inv => inv.payment_status !== 'Paid') || []
  const totalReceivables = unpaidInvoices.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0)

  const currentMonth = new Date().getMonth()
  const currentYear = new Date().getFullYear()
  const paidInvoicesThisMonth = invoices?.filter(inv => {
    if (inv.payment_status !== 'Paid') return false
    const date = new Date(inv.created_at)
    return date.getMonth() === currentMonth && date.getFullYear() === currentYear
  }) || []
  const monthlyRevenue = paidInvoicesThisMonth.reduce((sum, inv) => sum + (parseFloat(inv.amount) || 0), 0)

  const totalAssetValue = assets.filter(a => a.status === 'active').reduce((sum, a) => sum + (parseFloat(a.current_value) || 0), 0)
  const totalLiabilities = liabilities.filter(l => l.status === 'active').reduce((sum, l) => sum + (parseFloat(l.current_balance) || 0), 0)

  // Expense handlers
  const handleSaveExpense = async () => {
    const payload = {
      company_id: companyId,
      description: expenseForm.description,
      amount: parseFloat(expenseForm.amount) || 0,
      expense_date: expenseForm.expense_date || null,
      vendor: expenseForm.vendor || null,
      category_id: expenseForm.category_id || null
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
    setExpenseForm({
      description: expense.description || '',
      amount: expense.amount || '',
      expense_date: expense.expense_date || '',
      vendor: expense.vendor || '',
      category_id: expense.category_id || ''
    })
    setShowExpenseModal(true)
  }

  const closeExpenseModal = () => {
    setShowExpenseModal(false)
    setEditingItem(null)
    setExpenseForm({ description: '', amount: '', expense_date: '', vendor: '', category_id: '' })
  }

  // Asset handlers
  const handleSaveAsset = async () => {
    const payload = {
      company_id: companyId,
      name: assetForm.name,
      asset_type: assetForm.asset_type || null,
      purchase_price: parseFloat(assetForm.purchase_price) || 0,
      current_value: parseFloat(assetForm.current_value) || 0,
      status: assetForm.status
    }

    if (editingItem) {
      await supabase.from('assets').update(payload).eq('id', editingItem.id)
    } else {
      await supabase.from('assets').insert([payload])
    }

    await fetchAssets()
    closeAssetModal()
  }

  const handleDeleteAsset = async (id) => {
    if (!confirm('Delete this asset?')) return
    await supabase.from('assets').delete().eq('id', id)
    await fetchAssets()
  }

  const openEditAsset = (asset) => {
    setEditingItem(asset)
    setAssetForm({
      name: asset.name || '',
      asset_type: asset.asset_type || '',
      purchase_price: asset.purchase_price || '',
      current_value: asset.current_value || '',
      status: asset.status || 'active'
    })
    setShowAssetModal(true)
  }

  const closeAssetModal = () => {
    setShowAssetModal(false)
    setEditingItem(null)
    setAssetForm({ name: '', asset_type: '', purchase_price: '', current_value: '', status: 'active' })
  }

  // Liability handlers
  const handleSaveLiability = async () => {
    const payload = {
      company_id: companyId,
      name: liabilityForm.name,
      liability_type: liabilityForm.liability_type || null,
      current_balance: parseFloat(liabilityForm.current_balance) || 0,
      monthly_payment: parseFloat(liabilityForm.monthly_payment) || 0,
      lender: liabilityForm.lender || null,
      status: liabilityForm.status
    }

    if (editingItem) {
      await supabase.from('liabilities').update(payload).eq('id', editingItem.id)
    } else {
      await supabase.from('liabilities').insert([payload])
    }

    await fetchLiabilities()
    closeLiabilityModal()
  }

  const handleDeleteLiability = async (id) => {
    if (!confirm('Delete this liability?')) return
    await supabase.from('liabilities').delete().eq('id', id)
    await fetchLiabilities()
  }

  const openEditLiability = (liability) => {
    setEditingItem(liability)
    setLiabilityForm({
      name: liability.name || '',
      liability_type: liability.liability_type || '',
      current_balance: liability.current_balance || '',
      monthly_payment: liability.monthly_payment || '',
      lender: liability.lender || '',
      status: liability.status || 'active'
    })
    setShowLiabilityModal(true)
  }

  const closeLiabilityModal = () => {
    setShowLiabilityModal(false)
    setEditingItem(null)
    setLiabilityForm({ name: '', liability_type: '', current_balance: '', monthly_payment: '', lender: '', status: 'active' })
  }

  const formatCurrency = (val) => {
    const num = parseFloat(val) || 0
    return num.toLocaleString('en-US', { style: 'currency', currency: 'USD' })
  }

  const formatDate = (d) => d ? new Date(d).toLocaleDateString() : ''

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    backgroundColor: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none'
  }

  const labelStyle = {
    display: 'block',
    marginBottom: '6px',
    fontSize: '14px',
    fontWeight: '500',
    color: theme.text
  }

  const tabStyle = (isActive) => ({
    padding: '10px 20px',
    backgroundColor: isActive ? theme.accent : 'transparent',
    color: isActive ? '#fff' : theme.textMuted,
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: '500',
    cursor: 'pointer',
    transition: 'all 0.15s ease'
  })

  const statCardStyle = {
    backgroundColor: theme.bgCard,
    borderRadius: '12px',
    border: `1px solid ${theme.border}`,
    padding: '20px'
  }

  if (loading) {
    return (
      <div style={{ padding: '24px', textAlign: 'center', color: theme.textMuted }}>
        Loading financial data...
      </div>
    )
  }

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <BookOpen size={28} style={{ color: theme.accent }} />
          <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Books</h1>
        </div>

        {/* Tab Navigation */}
        <div style={{ display: 'flex', gap: '8px', backgroundColor: theme.bg, padding: '4px', borderRadius: '10px' }}>
          <button onClick={() => setActiveTab('health')} style={tabStyle(activeTab === 'health')}>Health</button>
          <button onClick={() => setActiveTab('expenses')} style={tabStyle(activeTab === 'expenses')}>Expenses</button>
          <button onClick={() => setActiveTab('booked')} style={tabStyle(activeTab === 'booked')}>Booked</button>
        </div>
      </div>

      {/* HEALTH TAB */}
      {activeTab === 'health' && (
        <>
          {/* Stats Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(34,197,94,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Wallet size={20} style={{ color: '#22c55e' }} />
                </div>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>Cash in Bank</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#22c55e' }}>{formatCurrency(totalCashInBank)}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(59,130,246,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <FileText size={20} style={{ color: '#3b82f6' }} />
                </div>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>Receivables</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#3b82f6' }}>{formatCurrency(totalReceivables)}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(168,85,247,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building size={20} style={{ color: '#a855f7' }} />
                </div>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>Asset Value</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#a855f7' }}>{formatCurrency(totalAssetValue)}</div>
            </div>

            <div style={statCardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
                <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: 'rgba(249,115,22,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <TrendingUp size={20} style={{ color: '#f97316' }} />
                </div>
                <span style={{ fontSize: '13px', color: theme.textMuted }}>Monthly Revenue</span>
              </div>
              <div style={{ fontSize: '28px', fontWeight: '700', color: '#f97316' }}>{formatCurrency(monthlyRevenue)}</div>
            </div>
          </div>

          {/* Quick Actions */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '24px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setShowExpenseModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
            >
              <Plus size={18} /> Add Expense
            </button>
            <button
              onClick={() => setShowAssetModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
            >
              <Plus size={18} /> Add Asset
            </button>
            <button
              onClick={() => setShowLiabilityModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: 'transparent', color: theme.accent, border: `1px solid ${theme.border}`, borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
            >
              <Plus size={18} /> Add Liability
            </button>
          </div>

          {/* Assets & Liabilities Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: '24px' }}>
            {/* Assets */}
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingUp size={18} style={{ color: '#22c55e' }} /> Assets
              </h3>
              {assets.length === 0 ? (
                <p style={{ color: theme.textMuted, fontSize: '14px' }}>No assets recorded</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {assets.map(asset => (
                    <div key={asset.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                      <div>
                        <div style={{ fontWeight: '500', color: theme.text }}>{asset.name}</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>{asset.asset_type}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '600', color: '#22c55e' }}>{formatCurrency(asset.current_value)}</span>
                        <button onClick={() => openEditAsset(asset)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteAsset(asset.id)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Liabilities */}
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <TrendingDown size={18} style={{ color: '#ef4444' }} /> Liabilities
              </h3>
              {liabilities.length === 0 ? (
                <p style={{ color: theme.textMuted, fontSize: '14px' }}>No liabilities recorded</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {liabilities.map(liability => (
                    <div key={liability.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', backgroundColor: theme.bg, borderRadius: '8px' }}>
                      <div>
                        <div style={{ fontWeight: '500', color: theme.text }}>{liability.name}</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>{liability.lender}</div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: '600', color: '#ef4444' }}>{formatCurrency(liability.current_balance)}</span>
                        <button onClick={() => openEditLiability(liability)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><Pencil size={14} /></button>
                        <button onClick={() => handleDeleteLiability(liability.id)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Net Worth */}
          <div style={{ marginTop: '24px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '20px', textAlign: 'center' }}>
            <div style={{ fontSize: '14px', color: theme.textMuted, marginBottom: '8px' }}>Net Worth (Assets - Liabilities)</div>
            <div style={{ fontSize: '36px', fontWeight: '700', color: (totalAssetValue - totalLiabilities) >= 0 ? '#22c55e' : '#ef4444' }}>
              {formatCurrency(totalAssetValue - totalLiabilities)}
            </div>
          </div>
        </>
      )}

      {/* EXPENSES TAB */}
      {activeTab === 'expenses' && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>Manual Expenses</h2>
            <button
              onClick={() => setShowExpenseModal(true)}
              style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 16px', backgroundColor: theme.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}
            >
              <Plus size={18} /> Add Expense
            </button>
          </div>

          {expenses.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px', backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}` }}>
              <DollarSign size={48} style={{ color: theme.textMuted, marginBottom: '16px' }} />
              <p style={{ color: theme.textSecondary }}>No expenses recorded yet.</p>
            </div>
          ) : (
            <div style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ backgroundColor: theme.bg }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>Date</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>Description</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>Category</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>Vendor</th>
                    <th style={{ padding: '12px 16px', textAlign: 'right', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>Amount</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center', fontSize: '12px', fontWeight: '600', color: theme.textMuted, textTransform: 'uppercase' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {expenses.map(expense => (
                    <tr key={expense.id} style={{ borderTop: `1px solid ${theme.border}` }}>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: theme.text }}>{formatDate(expense.expense_date)}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: theme.text }}>{expense.description}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: theme.text }}>
                        {expense.category && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '2px 8px', backgroundColor: expense.category.color + '20', color: expense.category.color, borderRadius: '4px', fontSize: '12px' }}>
                            {expense.category.icon} {expense.category.name}
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', color: theme.textSecondary }}>{expense.vendor}</td>
                      <td style={{ padding: '12px 16px', fontSize: '14px', fontWeight: '600', color: '#ef4444', textAlign: 'right' }}>{formatCurrency(expense.amount)}</td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button onClick={() => openEditExpense(expense)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer', marginRight: '4px' }}><Pencil size={16} /></button>
                        <button onClick={() => handleDeleteExpense(expense.id)} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: '#dc2626', cursor: 'pointer' }}><Trash2 size={16} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* BOOKED TAB - Categorized transactions */}
      {activeTab === 'booked' && (
        <>
          <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '24px' }}>Booked Transactions by Category</h2>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {expenseCategories.filter(c => c.type === 'expense').map(category => {
              const categoryExpenses = expenses.filter(e => e.category_id === category.id)
              const totalAmount = categoryExpenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0)

              return (
                <div key={category.id} style={{ backgroundColor: theme.bgCard, borderRadius: '12px', border: `1px solid ${theme.border}`, padding: '16px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontSize: '20px' }}>{category.icon}</span>
                      <span style={{ fontWeight: '600', color: theme.text }}>{category.name}</span>
                    </div>
                    <span style={{ fontSize: '11px', padding: '2px 8px', backgroundColor: category.color + '20', color: category.color, borderRadius: '10px' }}>
                      {categoryExpenses.length} items
                    </span>
                  </div>
                  <div style={{ fontSize: '24px', fontWeight: '700', color: category.color }}>{formatCurrency(totalAmount)}</div>
                  {categoryExpenses.length > 0 && (
                    <div style={{ marginTop: '12px', maxHeight: '120px', overflowY: 'auto' }}>
                      {categoryExpenses.slice(0, 3).map(exp => (
                        <div key={exp.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: theme.textSecondary, padding: '4px 0' }}>
                          <span>{exp.description}</span>
                          <span>{formatCurrency(exp.amount)}</span>
                        </div>
                      ))}
                      {categoryExpenses.length > 3 && (
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>+{categoryExpenses.length - 3} more</div>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* EXPENSE MODAL */}
      {showExpenseModal && (
        <>
          <div onClick={closeExpenseModal} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>{editingItem ? 'Edit Expense' : 'Add Expense'}</h2>
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
                      <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={labelStyle}>Vendor</label>
                  <input type="text" value={expenseForm.vendor} onChange={(e) => setExpenseForm({ ...expenseForm, vendor: e.target.value })} style={inputStyle} />
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={closeExpenseModal} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSaveExpense} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ASSET MODAL */}
      {showAssetModal && (
        <>
          <div onClick={closeAssetModal} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>{editingItem ? 'Edit Asset' : 'Add Asset'}</h2>
              <button onClick={closeAssetModal} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
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
                <button onClick={closeAssetModal} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSaveAsset} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* LIABILITY MODAL */}
      {showLiabilityModal && (
        <>
          <div onClick={closeLiabilityModal} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', backgroundColor: theme.bgCard, borderRadius: '16px', border: `1px solid ${theme.border}`, width: '100%', maxWidth: '480px', zIndex: 51 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px', borderBottom: `1px solid ${theme.border}` }}>
              <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>{editingItem ? 'Edit Liability' : 'Add Liability'}</h2>
              <button onClick={closeLiabilityModal} style={{ padding: '4px', backgroundColor: 'transparent', border: 'none', color: theme.textMuted, cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <div style={{ padding: '20px' }}>
              <div style={{ marginBottom: '16px' }}>
                <label style={labelStyle}>Name *</label>
                <input type="text" value={liabilityForm.name} onChange={(e) => setLiabilityForm({ ...liabilityForm, name: e.target.value })} style={inputStyle} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '16px' }}>
                <div>
                  <label style={labelStyle}>Liability Type</label>
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
                <button onClick={closeLiabilityModal} style={{ flex: 1, padding: '12px', backgroundColor: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '8px', color: theme.textSecondary, fontSize: '14px', cursor: 'pointer' }}>Cancel</button>
                <button onClick={handleSaveLiability} style={{ flex: 1, padding: '12px', backgroundColor: theme.accent, border: 'none', borderRadius: '8px', color: '#fff', fontSize: '14px', fontWeight: '500', cursor: 'pointer' }}>Save</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
