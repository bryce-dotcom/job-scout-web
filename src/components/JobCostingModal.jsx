import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import {
  X, DollarSign, TrendingUp, TrendingDown, Receipt,
  Clock, Package, Truck, Users, Loader, Zap, ShoppingCart, FileText, AlertCircle
} from 'lucide-react'

const fmt = (v) => (v || 0).toLocaleString('en-US', { style: 'currency', currency: 'USD' })

// PO status → badge color
const PO_STATUS_COLORS = {
  draft:    { bg: '#f1f5f9', text: '#64748b' },
  sent:     { bg: '#dbeafe', text: '#1d4ed8' },
  received: { bg: '#dcfce7', text: '#15803d' },
  partial:  { bg: '#fef9c3', text: '#a16207' },
  closed:   { bg: '#e8f5e9', text: '#388e3c' },
  cancelled:{ bg: '#fee2e2', text: '#b91c1c' },
}

export default function JobCostingModal({ job, theme, onClose }) {
  const [loading, setLoading] = useState(true)
  const [data, setData] = useState(null)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  useEffect(() => {
    if (job?.id) fetchCostingData()
  }, [job?.id])

  const fetchCostingData = async () => {
    setLoading(true)
    try {
      const companyId = job.company_id

      // Fetch all data in parallel — includes new PO-based product cost queries
      const [invoicesRes, expensesRes, plaidRes, allocRes, timeRes, configRes, skillRes, poLineJobsRes, jobLinesRes] = await Promise.all([
        supabase
          .from('invoices')
          .select('id, amount, payment_status')
          .eq('job_id', job.id)
          .eq('company_id', companyId),
        supabase
          .from('expenses')
          .select('*')
          .eq('job_id', job.id)
          .eq('company_id', companyId),
        supabase
          .from('plaid_transactions')
          .select('*')
          .eq('job_id', job.id)
          .eq('company_id', companyId),
        supabase
          .from('transaction_job_allocations')
          .select('*, txn:plaid_transactions!transaction_id(id, amount, merchant_name, user_category, ai_category, date)')
          .eq('job_id', job.id)
          .eq('company_id', companyId),
        supabase
          .from('time_clock')
          .select('id, employee_id, job_id, clock_in, clock_out, total_hours, lunch_start, lunch_end, employee:employees!employee_id(id, name, hourly_rate, skill_level)')
          .eq('job_id', job.id)
          .eq('company_id', companyId)
          .not('clock_out', 'is', null),
        supabase
          .from('settings')
          .select('value')
          .eq('company_id', companyId)
          .eq('key', 'payroll_config')
          .maybeSingle(),
        supabase
          .from('settings')
          .select('value')
          .eq('company_id', companyId)
          .eq('key', 'skill_levels')
          .maybeSingle(),

        // ── PO-based product costs ──────────────────────────────────────
        // pull every PO line linked to this job via purchase_order_line_jobs,
        // including the PO's number/status and the vendor name.
        supabase
          .from('purchase_order_line_jobs')
          .select(`
            id, quantity, job_line_id,
            po_line:purchase_order_lines!po_line_id(
              id, description, unit_cost, line_total, quantity_ordered, quantity_received,
              po:purchase_orders!po_id(
                id, po_number, status,
                vendor:vendors!vendor_id(id, name)
              )
            )
          `)
          .eq('job_id', job.id),

        // ── Job lines (all) ─────────────────────────────────────────────
        // Used to show product cost for lines that have no PO yet.
        // We join to products_services to get the COST TO US (catalog cost),
        // NOT job_line.price which is what the customer pays.
        // labor_cost > 0 lines are the labor component (handled separately).
        supabase
          .from('job_lines')
          .select('id, description, item_name, price, total, quantity, labor_cost, po_line_id, kind, item:products_services!item_id(id, name, cost, material_or_labor)')
          .eq('job_id', job.id),
      ])

      const invoices = invoicesRes.data || []
      const expenses = expensesRes.data || []
      const allocations = allocRes.data || []
      const timeLogs = (timeRes.data || []).map((row) => {
        let hours = parseFloat(row.total_hours)
        if (!(hours > 0) && row.clock_in && row.clock_out) {
          hours = (new Date(row.clock_out) - new Date(row.clock_in)) / 36e5
          if (row.lunch_start && row.lunch_end) {
            hours -= (new Date(row.lunch_end) - new Date(row.lunch_start)) / 36e5
          }
        }
        return { ...row, hours: Math.round((hours || 0) * 100) / 100 }
      })

      // ── PO product cost assembly ─────────────────────────────────────
      const rawPoLineJobs = poLineJobsRes.data || []
      const jobLines = jobLinesRes.data || []

      // Build set of job_line_ids that are covered by a PO
      const coveredJobLineIds = new Set(rawPoLineJobs.map(r => r.job_line_id))

      // PO lines: flatten to a single list of { description, vendor, po_number, po_status, qty, unit_cost, total }
      const poProductLines = rawPoLineJobs
        .filter(r => r.po_line)
        .map(r => {
          const pol = r.po_line
          const po  = pol.po || {}
          const vendor = po.vendor || {}
          const qtyOrdered = parseFloat(pol.quantity_ordered) || 0
          const qtyReceived = parseFloat(pol.quantity_received) || 0
          const unitCost = parseFloat(pol.unit_cost) || 0
          const linkedQty = parseFloat(r.quantity) || qtyOrdered
          return {
            description: pol.description || '—',
            vendor_name: vendor.name || '—',
            po_number: po.po_number || '—',
            po_status: po.status || 'draft',
            qty: linkedQty,
            unit_cost: unitCost,
            total: linkedQty * unitCost,
            is_received: qtyReceived >= qtyOrdered && qtyOrdered > 0,
          }
        })

      // ── Bundle decomposition ─────────────────────────────────────────
      // Products with cost=null may be bundles — look up product_components
      // to get the individual parts and their costs. A bundle line on the
      // job represents N units of the bundle; each component's cost is
      //   component.cost × component.quantity × job_line.quantity
      //
      // If the bundle has no components either, flag as "no cost data".

      // 1. Collect product IDs that need bundle lookup (no catalog cost)
      const candidateBundleIds = [...new Set(
        jobLines
          .filter(jl => !coveredJobLineIds.has(jl.id) && !jl.po_line_id && jl.item?.id && !(parseFloat(jl.item?.cost) > 0))
          .map(jl => jl.item.id)
          .filter(Boolean)
      )]

      // 2. Fetch components for all candidate bundles in one query
      let bundleComponentMap = {}   // parent_product_id → [{ name, cost, qty_per_bundle, material_or_labor }]
      if (candidateBundleIds.length > 0) {
        const { data: compRows } = await supabase
          .from('product_components')
          .select('parent_product_id, quantity, component:products_services!component_product_id(id, name, cost, material_or_labor)')
          .in('parent_product_id', candidateBundleIds)
          .eq('company_id', companyId)
        for (const row of compRows || []) {
          const pid = row.parent_product_id
          if (!bundleComponentMap[pid]) bundleComponentMap[pid] = []
          bundleComponentMap[pid].push({
            name: row.component?.name || '—',
            cost: parseFloat(row.component?.cost) || 0,
            hasCost: parseFloat(row.component?.cost) > 0,
            qty_per_bundle: parseFloat(row.quantity) || 1,
            material_or_labor: row.component?.material_or_labor || null,
          })
        }
      }

      // 3. Build fallback lines — one entry per job_line, with optional bundle breakdown.
      // We intentionally do NOT filter on material_or_labor because many bundle products
      // (e.g. SMBE Highbay "w/ Controls") are tagged 'labor' to indicate install-included
      // pricing but are still physical products with a material cost. Only exclude lines
      // that are purely time-and-materials labor entries with no physical product at all.
      const fallbackLines = jobLines
        .filter(jl => {
          if (coveredJobLineIds.has(jl.id)) return false
          if (jl.po_line_id) return false
          // Only skip lines that are explicitly pure-labor WITH no product link
          // (i.e. a labor-hours row added manually with no SKU/item)
          const hasProduct = !!(jl.item?.id || jl.item_name || jl.description)
          const isPureTimeLabor = jl.kind === 'labor' && !jl.item?.id && !(parseFloat(jl.price) > 0)
          if (isPureTimeLabor) return false
          return hasProduct || parseFloat(jl.price) > 0
        })
        .map(jl => {
          const jobQty = parseFloat(jl.quantity) || 1
          const catalogCost = parseFloat(jl.item?.cost)
          const productId = jl.item?.id
          const name = jl.item?.name || jl.item_name || jl.description || 'Item'

          // Case A: product has a direct catalog cost → use it
          if (catalogCost > 0) {
            return {
              isBundle: false,
              description: name,
              qty: jobQty,
              unit_cost: catalogCost,
              total: catalogCost * jobQty,
              sell_price: parseFloat(jl.price) || 0,
              hasNoCostData: false,
              components: null,
            }
          }

          // Case B: no direct cost — check if it's a bundle with components
          const components = productId ? bundleComponentMap[productId] : null
          if (components && components.length > 0) {
            // Cost per bundle = sum of (component.cost × component.qty_per_bundle)
            const costPerBundle = components.reduce((s, c) => s + c.cost * c.qty_per_bundle, 0)
            return {
              isBundle: true,
              description: name,
              qty: jobQty,
              unit_cost: costPerBundle,             // cost of one bundle to us
              total: costPerBundle * jobQty,
              sell_price: parseFloat(jl.price) || 0,
              hasNoCostData: costPerBundle === 0,
              components: components.map(c => ({
                name: c.name,
                cost_per_unit: c.cost,
                qty_per_bundle: c.qty_per_bundle,
                total_qty: c.qty_per_bundle * jobQty,
                total_cost: c.cost * c.qty_per_bundle * jobQty,
                hasCost: c.hasCost,
              })),
            }
          }

          // Case C: no cost, no components → flag as missing
          return {
            isBundle: false,
            description: name,
            qty: jobQty,
            unit_cost: 0,
            total: 0,
            sell_price: parseFloat(jl.price) || 0,
            hasNoCostData: true,
            components: null,
          }
        })

      const poProductCost    = poProductLines.reduce((s, l) => s + l.total, 0)
      const fallbackCost     = fallbackLines.reduce((s, l) => s + l.total, 0)
      const totalProductCost = poProductCost + fallbackCost

      // ── Bills from POs linked to this job ───────────────────────────
      // Get the unique PO IDs from the po_line_jobs results, then fetch bills for those POs.
      const poIds = [...new Set(
        rawPoLineJobs
          .map(r => r.po_line?.po?.id)
          .filter(Boolean)
      )]
      let billLines = []
      if (poIds.length > 0) {
        const { data: billData } = await supabase
          .from('bills')
          .select('id, amount, balance_due, status, due_date, vendor:vendors!vendor_id(name), po:purchase_orders!po_id(po_number)')
          .in('po_id', poIds)
        billLines = billData || []
      }
      const totalBillsAP = billLines.reduce((s, b) => s + (parseFloat(b.amount) || 0), 0)
      const totalBillsBalance = billLines.reduce((s, b) => s + (parseFloat(b.balance_due) || 0), 0)

      // ── Existing logic (unchanged) ────────────────────────────────────
      const allocatedTxnIds = new Set(allocations.map(a => a.transaction_id))
      const legacyPlaidTxns = (plaidRes.data || []).filter(t => !allocatedTxnIds.has(t.id))
      const allocPlaid = allocations.map(a => ({
        ...a.txn,
        amount: parseFloat(a.amount) || 0,
        _allocatedAmount: parseFloat(a.amount) || 0,
        category: a.txn?.user_category || a.txn?.ai_category,
      }))
      const plaidTxns = [...legacyPlaidTxns, ...allocPlaid]

      const invoiceIds = invoices.map((i) => i.id)
      let payments = []
      if (invoiceIds.length > 0) {
        const { data: payData } = await supabase
          .from('payments')
          .select('id, amount, invoice_id')
          .in('invoice_id', invoiceIds)
        payments = payData || []
      }

      const invoicedAmount = invoices.reduce((s, i) => s + (parseFloat(i.amount) || 0), 0)
      const paidAmount = payments.reduce((s, p) => s + (parseFloat(p.amount) || 0), 0)
      const outstandingAR = invoicedAmount - paidAmount

      const materialKeywords = ['material', 'supplies', 'supply']
      const isMaterial = (cat) => cat && materialKeywords.some((k) => cat.toLowerCase().includes(k))
      const isSub = (cat) => cat && cat.toLowerCase() === 'subcontractor'

      // Split receipts: those with dollar amounts entered vs photos still at $0
      const allMaterialExpenses = expenses.filter((e) => isMaterial(e.category))
      const materialExpenses = allMaterialExpenses.filter(e => parseFloat(e.amount) > 0)
      const pendingReceiptExpenses = allMaterialExpenses.filter(e => !(parseFloat(e.amount) > 0) && e.receipt_url)
      const subExpenses = expenses.filter((e) => isSub(e.category))
      const receiptExpenses = expenses.filter((e) => e.receipt_url && parseFloat(e.amount) > 0)
      const otherExpenses = expenses.filter((e) => !isMaterial(e.category) && !isSub(e.category))

      const plaidAmt = (t) => t._allocatedAmount != null ? t._allocatedAmount : Math.abs(parseFloat(t.amount) || 0)
      const materialPlaid = plaidTxns.filter((t) => isMaterial(t.category))
      const otherPlaid = plaidTxns.filter((t) => !isMaterial(t.category))

      const materialCost =
        materialExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) +
        materialPlaid.reduce((s, t) => s + plaidAmt(t), 0)

      const laborLines = []
      const empMap = {}
      timeLogs.forEach((tl) => {
        const empId = tl.employee?.id || tl.employee_id
        const empName = tl.employee?.name || 'Unknown'
        const rate = parseFloat(tl.employee?.hourly_rate) || 0
        const hours = parseFloat(tl.hours) || 0
        if (!empMap[empId]) empMap[empId] = { name: empName, rate, hours: 0, cost: 0 }
        empMap[empId].hours += hours
        empMap[empId].cost += hours * rate
      })
      Object.values(empMap).forEach((e) => laborLines.push(e))
      const laborCost = laborLines.reduce((s, l) => s + l.cost, 0)

      const subCost = subExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0)
      const otherCost =
        otherExpenses.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0) +
        otherPlaid.reduce((s, t) => s + plaidAmt(t), 0)

      let bonusData = null
      let payrollCfg = null
      try { payrollCfg = configRes.data?.value ? JSON.parse(configRes.data.value) : null } catch {}
      let skillLevels = []
      try {
        const parsed = skillRes.data?.value ? JSON.parse(skillRes.data.value) : []
        skillLevels = parsed.map(s => typeof s === 'string' ? { name: s, weight: 1 } : s)
      } catch {}

      const allottedHours = parseFloat(job.allotted_time_hours) || 0
      const totalActualHours = timeLogs.reduce((s, tl) => s + (parseFloat(tl.hours) || 0), 0)

      if (payrollCfg?.efficiency_bonus_enabled && allottedHours > 0 && totalActualHours < allottedHours) {
        const savedHours = allottedHours - totalActualHours
        const rate = payrollCfg.efficiency_bonus_rate || 25
        const companyCutPct = payrollCfg.company_bonus_cut_percent || 0
        const totalPool = savedHours * rate
        const companyShare = totalPool * (companyCutPct / 100)
        const crewBonus = totalPool - companyShare
        const crewMemberIds = [...new Set(timeLogs.map(tl => tl.employee?.id || tl.employee_id))]
        const crewMembers = crewMemberIds.map(empId => {
          const tl = timeLogs.find(t => (t.employee?.id || t.employee_id) === empId)
          const skillLevel = tl?.employee?.skill_level || ''
          const found = skillLevels.find(s => s.name === skillLevel)
          const weight = found ? found.weight : 1
          return { name: tl?.employee?.name || 'Unknown', weight }
        })
        bonusData = { savedHours, rate, totalPool, companyShare, crewBonus, crewMembers }
      }

      const crewBonusExpense = bonusData?.crewBonus || 0
      // Total costs = product cost + labor + sub + material expenses + other + bonus
      // Product cost: PO-based (actual ordered) takes precedence over fallback (estimated)
      const totalCosts = totalProductCost + materialCost + laborCost + subCost + otherCost + crewBonusExpense
      const totalRevenue = parseFloat(job.job_total) || 0
      const grossProfit = totalRevenue - totalCosts
      const profitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0

      setData({
        // Revenue
        invoicedAmount, paidAmount, outstandingAR,
        // Products (PO-aware)
        poProductLines, fallbackLines,
        poProductCost, fallbackCost, totalProductCost,
        hasPOData: poProductLines.length > 0,
        // Bills (AP)
        billLines, totalBillsAP, totalBillsBalance,
        // Expenses / Plaid
        materialCost, materialExpenses, pendingReceiptExpenses, materialPlaid,
        // Labor
        laborCost, laborLines,
        // Sub / Other
        subCost, subExpenses, otherCost, otherExpenses, otherPlaid,
        receiptExpenses,
        // Bonus
        bonusData,
        // P&L
        totalCosts, totalRevenue, grossProfit, profitMargin,
      })
    } catch (err) {
      console.error('JobCostingModal fetch error:', err)
    } finally {
      setLoading(false)
    }
  }

  const getMarginColor = (margin) => {
    if (margin >= 20) return theme.success || '#22c55e'
    if (margin >= 10) return theme.warning || '#eab308'
    return theme.error || '#ef4444'
  }

  // ── Styles ────────────────────────────────────────────────────────────

  const overlayStyle = {
    position: 'fixed', inset: 0, zIndex: 9999,
    backgroundColor: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    padding: isMobile ? 0 : '24px',
  }
  const panelStyle = {
    backgroundColor: theme.bgCard || '#ffffff', color: theme.text || '#2c3530',
    width: '100%', maxWidth: isMobile ? '100%' : '720px',
    height: isMobile ? '100%' : 'auto', maxHeight: isMobile ? '100%' : '90vh',
    borderRadius: isMobile ? 0 : '12px',
    boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
  }
  const headerStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    padding: '16px 20px', borderBottom: `1px solid ${theme.border || '#d6cdb8'}`, flexShrink: 0,
  }
  const bodyStyle = { flex: 1, overflowY: 'auto', padding: '20px' }
  const sectionStyle = { marginBottom: '24px' }
  const sectionHeaderStyle = {
    display: 'flex', alignItems: 'center', gap: '8px',
    marginBottom: '12px', fontSize: '15px', fontWeight: 600, color: theme.text || '#2c3530',
  }
  const rowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '8px 0', fontSize: '14px',
    borderBottom: `1px solid ${theme.border || '#d6cdb8'}22`,
  }
  const labelStyle = { color: theme.textSecondary || '#4d5a52' }
  const valueStyle = { fontWeight: 600, fontVariantNumeric: 'tabular-nums' }
  const subtotalRowStyle = {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    padding: '10px 0 4px', fontSize: '14px', fontWeight: 700,
    color: theme.text, borderTop: `1px solid ${theme.border || '#d6cdb8'}`, marginTop: '4px',
  }
  const summaryCardStyle = {
    backgroundColor: theme.bg || '#f7f5ef', borderRadius: '10px',
    padding: '16px', border: `1px solid ${theme.border || '#d6cdb8'}`,
  }
  const summaryRowStyle = {
    display: 'flex', justifyContent: 'space-between',
    alignItems: 'center', padding: '6px 0', fontSize: '14px',
  }
  const thumbnailStyle = {
    width: '48px', height: '48px', borderRadius: '6px', objectFit: 'cover',
    border: `1px solid ${theme.border || '#d6cdb8'}`, cursor: 'pointer',
  }

  const renderSection = (icon, title, items, subtotal, renderItem) => {
    const Icon = icon
    return (
      <div style={sectionStyle}>
        <div style={sectionHeaderStyle}>
          <Icon size={18} color={theme.accent || '#5a6349'} />
          <span>{title}</span>
        </div>
        {items.length === 0 ? (
          <div style={{ fontSize: '13px', color: theme.textMuted, padding: '4px 0' }}>
            No {title.toLowerCase()} recorded
          </div>
        ) : (
          items.map(renderItem)
        )}
        <div style={subtotalRowStyle}>
          <span>Subtotal</span>
          <span>{fmt(subtotal)}</span>
        </div>
      </div>
    )
  }

  // Small status badge for PO status
  const POStatusBadge = ({ status }) => {
    const colors = PO_STATUS_COLORS[status] || { bg: '#f1f5f9', text: '#64748b' }
    return (
      <span style={{
        fontSize: '10px', fontWeight: 600, padding: '2px 6px',
        borderRadius: '6px', backgroundColor: colors.bg, color: colors.text,
        textTransform: 'uppercase', letterSpacing: '0.3px', flexShrink: 0
      }}>
        {status}
      </span>
    )
  }

  return (
    <div style={overlayStyle} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div style={panelStyle}>
        {/* Header */}
        <div style={headerStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <DollarSign size={20} color={theme.accent || '#5a6349'} />
            <div>
              <div style={{ fontWeight: 700, fontSize: '16px' }}>Job Costing</div>
              <div style={{ fontSize: '13px', color: theme.textMuted || '#7d8a7f' }}>
                {job.job_title || job.job_id || `Job #${String(job.id || '').slice(0, 8)}`}
              </div>
            </div>
          </div>
          <button
            style={{ width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '8px', border: 'none', backgroundColor: 'transparent', color: theme.textMuted || '#7d8a7f', cursor: 'pointer' }}
            onClick={onClose}
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div style={bodyStyle}>
          {loading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 0', gap: '10px' }}>
              <Loader size={20} style={{ animation: 'spin 1s linear infinite' }} color={theme.accent} />
              <span style={{ color: theme.textMuted, fontSize: '14px' }}>Loading costing data...</span>
            </div>
          ) : data ? (
            <>
              {/* ── Revenue ─────────────────────────────────────────────── */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <TrendingUp size={18} color={theme.success || '#22c55e'} />
                  <span>Revenue</span>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Job Total</span>
                  <span style={valueStyle}>{fmt(data.totalRevenue)}</span>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Invoiced</span>
                  <span style={valueStyle}>{fmt(data.invoicedAmount)}</span>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Paid</span>
                  <span style={{ ...valueStyle, color: theme.success || '#22c55e' }}>{fmt(data.paidAmount)}</span>
                </div>
                <div style={rowStyle}>
                  <span style={labelStyle}>Outstanding AR</span>
                  <span style={{ ...valueStyle, color: data.outstandingAR > 0 ? (theme.warning || '#eab308') : (theme.success || '#22c55e') }}>
                    {fmt(data.outstandingAR)}
                  </span>
                </div>
                {/* Bills AP summary when POs are linked */}
                {data.totalBillsAP > 0 && (
                  <div style={rowStyle}>
                    <span style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <FileText size={12} color={theme.textMuted} />
                      Vendor Bills (AP committed)
                    </span>
                    <span style={{ ...valueStyle, color: data.totalBillsBalance > 0 ? (theme.warning || '#eab308') : (theme.textMuted) }}>
                      {fmt(data.totalBillsAP)}
                      {data.totalBillsBalance > 0 && (
                        <span style={{ fontSize: '11px', fontWeight: 400, color: theme.textMuted, marginLeft: '4px' }}>
                          ({fmt(data.totalBillsBalance)} open)
                        </span>
                      )}
                    </span>
                  </div>
                )}
              </div>

              {/* ── Products / Parts ─────────────────────────────────────
                  Shows PO-linked items at actual ordered cost, then falls
                  back to job line prices for items not yet on a PO.
                  This lets the manager see exactly what was committed vs
                  what's still just estimated.                             */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <ShoppingCart size={18} color={theme.accent || '#5a6349'} />
                  <span>Products / Parts</span>
                  {data.hasPOData ? (
                    <span style={{ fontSize: '11px', fontWeight: 400, color: theme.textMuted, marginLeft: 'auto' }}>
                      actual cost from POs
                    </span>
                  ) : data.fallbackLines.length > 0 ? (
                    <span style={{ fontSize: '11px', fontWeight: 400, color: '#eab308', marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '3px' }}>
                      <AlertCircle size={11} /> catalog cost — no PO yet
                    </span>
                  ) : null}
                </div>

                {/* PO-linked product lines */}
                {data.poProductLines.length > 0 && (
                  <>
                    {data.poProductLines.map((line, idx) => (
                      <div key={idx} style={{ ...rowStyle, flexWrap: 'wrap', gap: '4px' }}>
                        <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                          <div style={{ ...labelStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {line.description}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                            <span style={{ fontSize: '11px', color: theme.textMuted }}>
                              {line.qty} × {fmt(line.unit_cost)} · {line.vendor_name} · {line.po_number}
                            </span>
                            <POStatusBadge status={line.po_status} />
                          </div>
                        </div>
                        <span style={valueStyle}>{fmt(line.total)}</span>
                      </div>
                    ))}
                    {data.poProductCost > 0 && data.fallbackLines.length > 0 && (
                      <div style={{ ...rowStyle, borderBottom: `1px dashed ${theme.border}` }}>
                        <span style={{ fontSize: '12px', color: theme.textMuted, fontStyle: 'italic' }}>
                          Subtotal from POs
                        </span>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: theme.textMuted }}>
                          {fmt(data.poProductCost)}
                        </span>
                      </div>
                    )}
                  </>
                )}

                {/* Fallback lines — catalog/bundle cost (our buy price) for items not yet on a PO.
                    Bundles with cost=null are decomposed into their components so you can
                    see exactly what each part costs, not just the sell price. */}
                {data.fallbackLines.length > 0 && (
                  <>
                    {data.hasPOData && (
                      <div style={{ padding: '6px 0 2px', fontSize: '11px', color: '#eab308', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <AlertCircle size={11} /> No PO yet — using catalog cost:
                      </div>
                    )}
                    {data.fallbackLines.map((line, idx) => (
                      <div key={idx} style={{ marginBottom: line.isBundle ? '6px' : 0 }}>
                        {/* Line header row */}
                        <div style={{ ...rowStyle, opacity: line.hasNoCostData ? 0.6 : 0.85, borderBottom: line.isBundle ? 'none' : undefined }}>
                          <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                            <div style={{ ...labelStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: '6px' }}>
                              {line.isBundle && (
                                <span style={{ fontSize: '10px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: 'rgba(90,99,73,0.12)', color: theme.accent, flexShrink: 0 }}>
                                  BUNDLE
                                </span>
                              )}
                              {line.description}
                              {line.hasNoCostData && !line.isBundle && (
                                <span style={{ fontSize: '10px', color: '#ef4444', fontWeight: 600 }}>no cost set</span>
                              )}
                            </div>
                            <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '2px' }}>
                              {line.hasNoCostData && !line.components
                                ? <em>No catalog cost or bundle components — add cost to the product</em>
                                : line.isBundle
                                  ? <>{line.qty} bundle{line.qty !== 1 ? 's' : ''} × {fmt(line.unit_cost)}/ea <em>(sum of parts)</em>{line.sell_price > line.unit_cost && <span style={{ marginLeft: '6px', color: '#22c55e' }}>sells for {fmt(line.sell_price)}</span>}</>
                                  : <>{line.qty} × {fmt(line.unit_cost)} <em>(catalog cost)</em>{line.sell_price > line.unit_cost && <span style={{ marginLeft: '6px', color: '#22c55e' }}>sells for {fmt(line.sell_price)}</span>}</>
                              }
                            </div>
                          </div>
                          <span style={{ ...valueStyle, color: line.hasNoCostData ? '#ef4444' : theme.textMuted }}>
                            {line.hasNoCostData && !line.components ? '—' : fmt(line.total)}
                          </span>
                        </div>

                        {/* Bundle component breakdown — indented */}
                        {line.isBundle && line.components && (
                          <div style={{
                            marginLeft: '16px', marginTop: '2px', marginBottom: '4px',
                            borderLeft: `2px solid ${theme.border}`, paddingLeft: '10px',
                          }}>
                            {line.components.map((comp, ci) => (
                              <div key={ci} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', fontSize: '12px', borderBottom: `1px solid ${theme.border}22` }}>
                                <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                                  <span style={{ color: theme.textSecondary, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>
                                    {comp.name}
                                    {!comp.hasCost && <span style={{ marginLeft: '6px', fontSize: '10px', color: '#ef4444' }}>no cost</span>}
                                  </span>
                                  <span style={{ fontSize: '10px', color: theme.textMuted }}>
                                    {comp.qty_per_bundle}/bundle × {line.qty} = {comp.total_qty} units @ {fmt(comp.cost_per_unit)}
                                  </span>
                                </div>
                                <span style={{ fontWeight: 500, color: comp.hasCost ? theme.text : '#ef4444', flexShrink: 0 }}>
                                  {comp.hasCost ? fmt(comp.total_cost) : '—'}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </>
                )}

                {data.poProductLines.length === 0 && data.fallbackLines.length === 0 && (
                  <div style={{ fontSize: '13px', color: theme.textMuted, padding: '4px 0' }}>
                    No product lines on this job
                  </div>
                )}

                <div style={subtotalRowStyle}>
                  <span>Subtotal</span>
                  <span>{fmt(data.totalProductCost)}</span>
                </div>
              </div>

              {/* ── Bills detail (when there are PO-linked bills) ─────── */}
              {data.billLines.length > 0 && (
                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>
                    <FileText size={18} color='#8b5cf6' />
                    <span>Vendor Bills (AP)</span>
                  </div>
                  {data.billLines.map((bill, idx) => (
                    <div key={bill.id || idx} style={rowStyle}>
                      <div style={{ flex: 1, minWidth: 0, marginRight: '12px' }}>
                        <div style={labelStyle}>{bill.vendor?.name || 'Vendor'}</div>
                        <div style={{ fontSize: '11px', color: theme.textMuted, display: 'flex', gap: '6px', marginTop: '2px' }}>
                          <span>{bill.po?.po_number}</span>
                          {bill.due_date && <span>due {new Date(bill.due_date).toLocaleDateString()}</span>}
                          <span style={{
                            padding: '1px 5px', borderRadius: '4px', fontSize: '10px', fontWeight: 600,
                            backgroundColor: bill.status === 'paid' ? '#dcfce7' : bill.status === 'partial' ? '#fef9c3' : '#fee2e2',
                            color: bill.status === 'paid' ? '#15803d' : bill.status === 'partial' ? '#a16207' : '#b91c1c'
                          }}>
                            {bill.status}
                          </span>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={valueStyle}>{fmt(parseFloat(bill.amount))}</div>
                        {parseFloat(bill.balance_due) > 0 && (
                          <div style={{ fontSize: '11px', color: '#eab308' }}>{fmt(parseFloat(bill.balance_due))} open</div>
                        )}
                      </div>
                    </div>
                  ))}
                  <div style={subtotalRowStyle}>
                    <span>Total Billed</span>
                    <span>{fmt(data.totalBillsAP)}</span>
                  </div>
                </div>
              )}

              {/* ── Material Expenses (receipts + Plaid) ────────────── */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <Package size={18} color={theme.accent || '#5a6349'} />
                  <span>Material Expenses</span>
                </div>
                {[...data.materialExpenses, ...data.materialPlaid].length === 0 && data.pendingReceiptExpenses.length === 0 ? (
                  <div style={{ fontSize: '13px', color: theme.textMuted, padding: '4px 0' }}>
                    No material expenses recorded
                  </div>
                ) : (
                  <>
                    {[...data.materialExpenses, ...data.materialPlaid].map((item, idx) => (
                      <div key={item.id || idx} style={rowStyle}>
                        <span style={{ ...labelStyle, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '12px' }}>
                          {item.description || item.name || item.merchant_name || 'Material'}
                        </span>
                        <span style={valueStyle}>{fmt(Math.abs(parseFloat(item.amount) || 0))}</span>
                      </div>
                    ))}
                    {/* Receipts captured but dollar amount not yet entered */}
                    {data.pendingReceiptExpenses.length > 0 && (
                      <div style={{
                        marginTop: '6px', padding: '8px 10px', borderRadius: '8px',
                        backgroundColor: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                          <AlertCircle size={12} color='#a16207' />
                          <span style={{ fontSize: '12px', fontWeight: 600, color: '#a16207' }}>
                            {data.pendingReceiptExpenses.length} receipt{data.pendingReceiptExpenses.length !== 1 ? 's' : ''} need dollar amounts entered
                          </span>
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                          {data.pendingReceiptExpenses.map((exp, idx) => (
                            <a
                              key={exp.id || idx}
                              href={exp.receipt_url}
                              target="_blank"
                              rel="noreferrer"
                              title="Open receipt to enter amount"
                              style={{ display: 'block', flexShrink: 0 }}
                            >
                              <img
                                src={exp.receipt_url}
                                alt="Receipt"
                                style={{ width: 44, height: 44, borderRadius: '6px', objectFit: 'cover', border: '1px solid rgba(234,179,8,0.4)', cursor: 'pointer' }}
                                onError={e => { e.target.style.display = 'none' }}
                              />
                            </a>
                          ))}
                        </div>
                        <div style={{ fontSize: '11px', color: '#a16207', marginTop: '4px' }}>
                          Open each receipt image, enter the dollar amount in the expense record, then refresh job costing.
                        </div>
                      </div>
                    )}
                  </>
                )}
                <div style={subtotalRowStyle}>
                  <span>Subtotal{data.pendingReceiptExpenses.length > 0 ? ` (${data.pendingReceiptExpenses.length} receipts pending)` : ''}</span>
                  <span>{fmt(data.materialCost)}</span>
                </div>
              </div>

              {/* ── Labor ───────────────────────────────────────────────── */}
              <div style={sectionStyle}>
                <div style={sectionHeaderStyle}>
                  <Clock size={18} color={theme.accent || '#5a6349'} />
                  <span>Labor</span>
                </div>
                {data.laborLines.length === 0 ? (
                  <div style={{ fontSize: '13px', color: theme.textMuted, padding: '4px 0' }}>
                    No labor recorded
                  </div>
                ) : (
                  data.laborLines.map((line, idx) => (
                    <div key={idx} style={rowStyle}>
                      <div style={{ flex: 1 }}>
                        <div style={labelStyle}>{line.name}</div>
                        <div style={{ fontSize: '12px', color: theme.textMuted }}>
                          {line.hours.toFixed(1)} hrs @ {fmt(line.rate)}/hr
                        </div>
                      </div>
                      <span style={valueStyle}>{fmt(line.cost)}</span>
                    </div>
                  ))
                )}
                <div style={subtotalRowStyle}>
                  <span>Subtotal</span>
                  <span>{fmt(data.laborCost)}</span>
                </div>
              </div>

              {/* ── Subcontractors ──────────────────────────────────────── */}
              {renderSection(Users, 'Subcontractors', data.subExpenses, data.subCost, (item, idx) => (
                <div key={item.id || idx} style={rowStyle}>
                  <span style={{ ...labelStyle, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginRight: '12px' }}>
                    {item.description || item.vendor || 'Subcontractor'}
                  </span>
                  <span style={valueStyle}>{fmt(parseFloat(item.amount) || 0)}</span>
                </div>
              ))}

              {/* ── Other Expenses ──────────────────────────────────────── */}
              {renderSection(Truck, 'Other Expenses', [...data.otherExpenses, ...data.otherPlaid], data.otherCost, (item, idx) => (
                <div key={item.id || idx} style={rowStyle}>
                  <div style={{ flex: 1, overflow: 'hidden', marginRight: '12px' }}>
                    <div style={{ ...labelStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {item.description || item.name || item.merchant_name || 'Expense'}
                    </div>
                    {item.category && (
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{item.category}</div>
                    )}
                  </div>
                  <span style={valueStyle}>{fmt(Math.abs(parseFloat(item.amount) || 0))}</span>
                </div>
              ))}

              {/* ── Receipts ───────────────────────────────────────────── */}
              {data.receiptExpenses.length > 0 && (
                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>
                    <Receipt size={18} color={theme.accent || '#5a6349'} />
                    <span>Receipts</span>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {data.receiptExpenses.map((exp) => (
                      <div key={exp.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 0' }}>
                        <img src={exp.receipt_url} alt="Receipt" style={thumbnailStyle} onClick={() => window.open(exp.receipt_url, '_blank')} />
                        <div>
                          <div style={{ fontSize: '13px', color: theme.textSecondary }}>{exp.description || 'Receipt'}</div>
                          <div style={{ fontSize: '13px', fontWeight: 600 }}>{fmt(parseFloat(exp.amount) || 0)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* ── Bonus Hours Impact ──────────────────────────────────── */}
              {data.bonusData && (
                <div style={sectionStyle}>
                  <div style={sectionHeaderStyle}>
                    <Zap size={18} color='#8b5cf6' />
                    <span>Bonus Hours Impact</span>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Hours Saved</span>
                    <span style={{ ...valueStyle, color: '#22c55e' }}>{data.bonusData.savedHours.toFixed(1)}h</span>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Total Pool ({data.bonusData.savedHours.toFixed(1)}h × {fmt(data.bonusData.rate)}/hr)</span>
                    <span style={valueStyle}>{fmt(data.bonusData.totalPool)}</span>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Company Retention</span>
                    <span style={{ ...valueStyle, color: '#22c55e' }}>{fmt(data.bonusData.companyShare)}</span>
                  </div>
                  <div style={rowStyle}>
                    <span style={labelStyle}>Crew Bonus Expense</span>
                    <span style={{ ...valueStyle, color: theme.error || '#ef4444' }}>{fmt(data.bonusData.crewBonus)}</span>
                  </div>
                  {data.bonusData.crewMembers.length > 0 && (
                    <div style={{ marginTop: '8px' }}>
                      {data.bonusData.crewMembers.map((m, idx) => {
                        const totalWeight = data.bonusData.crewMembers.filter(c => c.weight > 0).reduce((s, c) => s + c.weight, 0)
                        const share = m.weight > 0 && totalWeight > 0 ? data.bonusData.crewBonus * (m.weight / totalWeight) : 0
                        return (
                          <div key={idx} style={{ ...rowStyle, fontSize: '13px' }}>
                            <span style={{ color: theme.textMuted }}>
                              {m.name} {m.weight > 0 ? `(wt ${m.weight})` : '(no bonus)'}
                            </span>
                            <span style={{ fontWeight: 500, color: m.weight > 0 ? theme.text : theme.textMuted }}>
                              {m.weight > 0 ? fmt(share) : '—'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  )}
                  <div style={subtotalRowStyle}>
                    <span>Net Company Benefit</span>
                    <span style={{ color: '#22c55e' }}>{fmt(data.bonusData.companyShare)}</span>
                  </div>
                </div>
              )}

              {/* ── P&L Summary ─────────────────────────────────────────── */}
              <div style={summaryCardStyle}>
                <div style={{ ...sectionHeaderStyle, marginBottom: '10px' }}>
                  <TrendingDown size={18} color={theme.accent || '#5a6349'} />
                  <span>P&L Summary</span>
                </div>
                <div style={{ ...summaryRowStyle }}>
                  <span style={labelStyle}>Total Revenue</span>
                  <span style={{ ...valueStyle, color: theme.success || '#22c55e' }}>{fmt(data.totalRevenue)}</span>
                </div>
                {/* Cost breakdown rows */}
                <div style={{ ...summaryRowStyle, fontSize: '12px' }}>
                  <span style={{ color: theme.textMuted, paddingLeft: '12px' }}>
                    Products / Parts {data.hasPOData ? '(PO cost)' : '(catalog cost)'}
                  </span>
                  <span style={{ color: theme.textMuted, fontWeight: 500 }}>{fmt(data.totalProductCost)}</span>
                </div>
                {data.materialCost > 0 && (
                  <div style={{ ...summaryRowStyle, fontSize: '12px' }}>
                    <span style={{ color: theme.textMuted, paddingLeft: '12px' }}>Material Expenses</span>
                    <span style={{ color: theme.textMuted, fontWeight: 500 }}>{fmt(data.materialCost)}</span>
                  </div>
                )}
                <div style={{ ...summaryRowStyle, fontSize: '12px' }}>
                  <span style={{ color: theme.textMuted, paddingLeft: '12px' }}>Labor</span>
                  <span style={{ color: theme.textMuted, fontWeight: 500 }}>{fmt(data.laborCost)}</span>
                </div>
                {(data.subCost + data.otherCost) > 0 && (
                  <div style={{ ...summaryRowStyle, fontSize: '12px' }}>
                    <span style={{ color: theme.textMuted, paddingLeft: '12px' }}>Other / Sub</span>
                    <span style={{ color: theme.textMuted, fontWeight: 500 }}>{fmt(data.subCost + data.otherCost)}</span>
                  </div>
                )}
                <div style={{ ...summaryRowStyle }}>
                  <span style={labelStyle}>Total Costs</span>
                  <span style={{ ...valueStyle, color: theme.error || '#ef4444' }}>{fmt(data.totalCosts)}</span>
                </div>
                <div style={{ ...summaryRowStyle, borderTop: `2px solid ${theme.border || '#d6cdb8'}`, marginTop: '6px', paddingTop: '10px' }}>
                  <span style={{ fontWeight: 700, fontSize: '15px' }}>Gross Profit</span>
                  <span style={{ fontWeight: 700, fontSize: '15px', color: getMarginColor(data.profitMargin) }}>
                    {fmt(data.grossProfit)}
                  </span>
                </div>
                <div style={{ ...summaryRowStyle, paddingTop: '4px' }}>
                  <span style={labelStyle}>Profit Margin</span>
                  <span style={{
                    fontWeight: 700, fontSize: '16px',
                    color: getMarginColor(data.profitMargin),
                    backgroundColor: `${getMarginColor(data.profitMargin)}18`,
                    padding: '4px 10px', borderRadius: '6px',
                  }}>
                    {data.profitMargin.toFixed(1)}%
                  </span>
                </div>
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px 0', color: theme.textMuted, fontSize: '14px' }}>
              Failed to load costing data
            </div>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
    </div>
  )
}
