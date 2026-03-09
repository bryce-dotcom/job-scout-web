import { useState, useEffect, useRef, useMemo, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import {
  Search, X, Users, UserPlus, Briefcase, FileText, Receipt,
  Package, UserCog, Truck, Calendar, ArrowRight,
  Lightbulb, Warehouse, GitBranch
} from 'lucide-react'

// Category config: icon, color, route builder
const CATEGORIES = {
  customers: { label: 'Customers', icon: Users, color: '#22c55e', route: (item) => `/customers/${item.id}` },
  leads: { label: 'Leads', icon: UserPlus, color: '#6b7280', route: (item) => `/leads/${item.id}` },
  estimates: { label: 'Estimates', icon: FileText, color: '#3b82f6', route: (item) => `/estimates/${item.id}` },
  jobs: { label: 'Jobs', icon: Briefcase, color: '#22c55e', route: (item) => `/jobs/${item.id}` },
  invoices: { label: 'Invoices', icon: Receipt, color: '#f59e0b', route: (item) => `/invoices/${item.id}` },
  employees: { label: 'Team', icon: UserCog, color: '#8b5cf6', route: () => `/employees` },
  products: { label: 'Products', icon: Package, color: '#ec4899', route: () => `/products` },
  fleet: { label: 'Fleet', icon: Truck, color: '#06b6d4', route: (item) => `/fleet/${item.id}` },
  inventory: { label: 'Inventory', icon: Warehouse, color: '#f97316', route: () => `/inventory` },
  appointments: { label: 'Appointments', icon: Calendar, color: '#14b8a6', route: () => `/appointments` },
  pipeline: { label: 'Pipeline', icon: GitBranch, color: '#f59e0b', route: () => `/pipeline` },
  audits: { label: 'Audits', icon: Lightbulb, color: '#eab308', route: (item) => `/lighting-audits/${item.id}` },
  pages: { label: 'Go To', icon: ArrowRight, color: '#5a6349', route: (item) => item.to },
}

// All navigable pages for "go to" search
const PAGES = [
  { id: 'p-dashboard', name: 'Dashboard', keywords: 'home overview metrics', to: '/' },
  { id: 'p-leads', name: 'Leads', keywords: 'prospects potential', to: '/leads' },
  { id: 'p-lead-setter', name: 'Lead Setter', keywords: 'call phone dialer', to: '/lead-setter' },
  { id: 'p-pipeline', name: 'Sales Pipeline', keywords: 'funnel stages deals', to: '/pipeline' },
  { id: 'p-estimates', name: 'Estimates', keywords: 'quotes proposals pricing', to: '/estimates' },
  { id: 'p-jobs', name: 'Jobs', keywords: 'projects work orders', to: '/jobs' },
  { id: 'p-customers', name: 'Customers', keywords: 'clients accounts contacts', to: '/customers' },
  { id: 'p-appointments', name: 'Appointments', keywords: 'meetings schedule visits', to: '/appointments' },
  { id: 'p-field-scout', name: 'Field Scout', keywords: 'technician daily', to: '/field-scout' },
  { id: 'p-job-board', name: 'Job Board', keywords: 'pm scheduler sections', to: '/job-board' },
  { id: 'p-products', name: 'Products & Services', keywords: 'catalog pricing items', to: '/products' },
  { id: 'p-inventory', name: 'Inventory', keywords: 'materials stock warehouse', to: '/inventory' },
  { id: 'p-invoices', name: 'Invoices', keywords: 'billing payments ar', to: '/invoices' },
  { id: 'p-deposits', name: 'Deposits', keywords: 'lead payments prepay', to: '/lead-payments' },
  { id: 'p-expenses', name: 'Expenses', keywords: 'costs spending receipts', to: '/expenses' },
  { id: 'p-books', name: 'Books', keywords: 'accounting finance ledger', to: '/books' },
  { id: 'p-employees', name: 'Employees', keywords: 'team staff crew members', to: '/employees' },
  { id: 'p-time-clock', name: 'Time Clock', keywords: 'clock in out hours', to: '/time-clock' },
  { id: 'p-fleet', name: 'Fleet', keywords: 'vehicles trucks vans', to: '/fleet' },
  { id: 'p-audits', name: 'Lighting Audits', keywords: 'energy audit survey', to: '/lighting-audits' },
  { id: 'p-settings', name: 'Settings', keywords: 'configuration company profile', to: '/settings' },
  { id: 'p-reports', name: 'Reports', keywords: 'analytics data charts', to: '/reports' },
  { id: 'p-routes', name: 'Routes', keywords: 'routing driving map', to: '/routes' },
  { id: 'p-calendar', name: 'Calendar', keywords: 'schedule job calendar', to: '/job-calendar' },
  { id: 'p-payroll', name: 'Payroll', keywords: 'wages pay', to: '/payroll' },
  { id: 'p-comms', name: 'Communications', keywords: 'messages log notes', to: '/communications' },
]

// Safely extract all string/number values from an object (including nested),
// skipping arrays and deep objects. Returns one big searchable string per record.
function extractSearchText(obj) {
  if (!obj || typeof obj !== 'object') return ''
  const parts = []
  for (const key of Object.keys(obj)) {
    const val = obj[key]
    if (val == null) continue
    if (typeof val === 'string' || typeof val === 'number') {
      parts.push(String(val))
    } else if (typeof val === 'object' && !Array.isArray(val)) {
      // One level of nested object (Supabase joins like customer: { name, email })
      for (const subKey of Object.keys(val)) {
        const subVal = val[subKey]
        if (subVal != null && (typeof subVal === 'string' || typeof subVal === 'number')) {
          parts.push(String(subVal))
        }
      }
    }
  }
  return parts.join(' ')
}

// Fuzzy match: checks if all query words appear somewhere in the text
function fuzzyMatch(text, queryWords) {
  if (!text) return false
  const lower = text.toLowerCase()
  return queryWords.every(w => lower.includes(w))
}

// Format phone for display
function fmtPhone(phone) {
  if (!phone) return ''
  const d = String(phone).replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}`
  return phone
}

// Format currency
function fmtMoney(val) {
  if (!val && val !== 0) return ''
  return '$' + Number(val).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

// Build a pre-indexed searchable cache: array of { text, record, category, title, subtitle }
function buildIndex(data) {
  const index = []

  // Customers — query: *, salesperson:employees(id, name)
  // Fields: name, business_name, company_name, first_name, last_name, email, phone, address, city, state, zip, status, notes, service_type
  ;(data.customers || []).forEach(c => {
    index.push({
      text: extractSearchText(c),
      id: c.id,
      category: 'customers',
      title: c.name || c.company_name || c.business_name || `${c.first_name || ''} ${c.last_name || ''}`.trim() || 'Unnamed',
      subtitle: [c.email, fmtPhone(c.phone), c.city, c.status].filter(Boolean).join(' · '),
      data: c
    })
  })

  // Leads — query: *, salesperson/lead_owner/setter_owner joins
  // Fields: customer_name, email, phone, address, city, state, zip, source, status, notes, service_type
  ;(data.leads || []).forEach(l => {
    index.push({
      text: extractSearchText(l),
      id: l.id,
      category: 'leads',
      title: l.customer_name || `${l.first_name || ''} ${l.last_name || ''}`.trim() || 'Unnamed Lead',
      subtitle: [l.status, l.source, fmtPhone(l.phone), l.city].filter(Boolean).join(' · '),
      data: l
    })
  })

  // Estimates (quotes) — query: *, lead:leads(id,customer_name), customer:customers(id,name,email,phone,address,business_name), salesperson
  // Fields: quote_number, estimate_name, status, summary, business_unit, total, customer (nested)
  ;(data.quotes || []).forEach(e => {
    const custName = e.customer?.name || e.customer?.business_name || e.lead?.customer_name || ''
    index.push({
      text: extractSearchText(e),
      id: e.id,
      category: 'estimates',
      title: e.estimate_name || e.quote_number || `EST-${String(e.id).slice(0,8)}`,
      subtitle: [custName, e.status, e.total ? fmtMoney(e.total) : null].filter(Boolean).join(' · '),
      data: e
    })
  })

  // Jobs — query: *, customer:customers(id,name,email,phone,address), salesperson, quote
  // Fields: job_id, job_title, job_number, status, job_address, description, customer (nested)
  ;(data.jobs || []).forEach(j => {
    const custName = j.customer?.name || ''
    index.push({
      text: extractSearchText(j),
      id: j.id,
      category: 'jobs',
      title: j.job_title || j.job_number || j.job_id || `Job #${String(j.id).slice(0,8)}`,
      subtitle: [custName, j.status, j.job_address, j.total ? fmtMoney(j.total) : null].filter(Boolean).join(' · '),
      data: j
    })
  })

  // Invoices — query: *, customer:customers(id,name), job:jobs(id,job_id,job_title)
  // Fields: invoice_number, status, po_number, total, customer (nested), job (nested)
  ;(data.invoices || []).forEach(inv => {
    const custName = inv.customer?.name || ''
    const jobTitle = inv.job?.job_title || inv.job?.job_id || ''
    index.push({
      text: extractSearchText(inv),
      id: inv.id,
      category: 'invoices',
      title: inv.invoice_number || `INV-${String(inv.id).slice(0,8)}`,
      subtitle: [custName, jobTitle, inv.status, inv.total ? fmtMoney(inv.total) : null].filter(Boolean).join(' · '),
      data: inv
    })
  })

  // Employees — query: *, role
  // Fields: name, first_name, last_name, email, phone, role, department
  ;(data.employees || []).forEach(e => {
    index.push({
      text: extractSearchText(e),
      id: e.id,
      category: 'employees',
      title: e.name || `${e.first_name || ''} ${e.last_name || ''}`.trim() || 'Unnamed',
      subtitle: [e.role, e.department, e.email].filter(Boolean).join(' · '),
      data: e
    })
  })

  // Products — query: *
  // Fields: name, sku, description, category, brand, price
  ;(data.products || []).forEach(p => {
    index.push({
      text: extractSearchText(p),
      id: p.id,
      category: 'products',
      title: p.name || p.sku || 'Unnamed Product',
      subtitle: [p.category, p.sku, p.price ? fmtMoney(p.price) : null].filter(Boolean).join(' · '),
      data: p
    })
  })

  // Fleet — query: *
  // Fields: name, vehicle_name, asset_id, make, model, year, license_plate, vin, status
  ;(data.fleet || []).forEach(f => {
    index.push({
      text: extractSearchText(f),
      id: f.id,
      category: 'fleet',
      title: f.name || f.vehicle_name || `${f.year || ''} ${f.make || ''} ${f.model || ''}`.trim() || 'Vehicle',
      subtitle: [f.license_plate, f.vin, f.status].filter(Boolean).join(' · '),
      data: f
    })
  })

  // Inventory — query: *
  // Fields: name, sku, description, category, location, quantity
  ;(data.inventory || []).forEach(i => {
    index.push({
      text: extractSearchText(i),
      id: i.id,
      category: 'inventory',
      title: i.name || i.sku || 'Inventory Item',
      subtitle: [i.category, i.location, i.quantity != null ? `Qty: ${i.quantity}` : null].filter(Boolean).join(' · '),
      data: i
    })
  })

  // Appointments — query: *, lead, customer, employee, setter, salesperson joins
  // Fields: date, time, status, notes, lead (nested), customer (nested), employee (nested)
  ;(data.appointments || []).forEach(a => {
    const name = a.customer?.name || a.lead?.customer_name || ''
    index.push({
      text: extractSearchText(a),
      id: a.id,
      category: 'appointments',
      title: name || `Appointment ${a.date || ''}`,
      subtitle: [a.status, a.date, a.employee?.name ? `w/ ${a.employee.name}` : null].filter(Boolean).join(' · '),
      data: a
    })
  })

  // Sales Pipeline — query: *, lead, customer, salesperson joins
  ;(data.salesPipeline || []).forEach(p => {
    const name = p.customer?.name || p.lead?.customer_name || ''
    index.push({
      text: extractSearchText(p),
      id: p.id,
      category: 'pipeline',
      title: name || 'Pipeline Entry',
      subtitle: [p.stage, p.salesperson?.name].filter(Boolean).join(' · '),
      data: p
    })
  })

  // Lighting Audits — query: *, customer, utility_provider joins
  ;(data.lightingAudits || []).forEach(a => {
    const custName = a.customer?.name || ''
    index.push({
      text: extractSearchText(a),
      id: a.id,
      category: 'audits',
      title: a.audit_name || a.audit_id || `Audit #${String(a.id).slice(0,8)}`,
      subtitle: [custName, a.status, a.utility_provider?.provider_name].filter(Boolean).join(' · '),
      data: a
    })
  })

  // Pages — always included
  PAGES.forEach(p => {
    index.push({
      text: `${p.name} ${p.keywords}`.toLowerCase(),
      id: p.id,
      category: 'pages',
      title: p.name,
      subtitle: '',
      data: p
    })
  })

  return index
}

export default function GlobalSearch({ mobile = false, onNavigate, theme }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef(null)
  const resultsRef = useRef(null)
  const containerRef = useRef(null)

  // Pull all data from store
  const customers = useStore(s => s.customers)
  const leads = useStore(s => s.leads)
  const quotes = useStore(s => s.quotes)
  const jobs = useStore(s => s.jobs)
  const invoices = useStore(s => s.invoices)
  const employees = useStore(s => s.employees)
  const products = useStore(s => s.products)
  const fleet = useStore(s => s.fleet)
  const inventory = useStore(s => s.inventory)
  const appointments = useStore(s => s.appointments)
  const salesPipeline = useStore(s => s.salesPipeline)
  const lightingAudits = useStore(s => s.lightingAudits)

  // Pre-build search index when data changes (not on every keystroke)
  const searchIndex = useMemo(() => {
    return buildIndex({ customers, leads, quotes, jobs, invoices, employees, products, fleet, inventory, appointments, salesPipeline, lightingAudits })
  }, [customers, leads, quotes, jobs, invoices, employees, products, fleet, inventory, appointments, salesPipeline, lightingAudits])

  // Keyboard shortcut: Ctrl+K or Cmd+K to focus
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        inputRef.current?.focus()
        setIsOpen(true)
      }
      if (e.key === 'Escape' && isOpen) {
        setIsOpen(false)
        setQuery('')
        inputRef.current?.blur()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen])

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return
    const handleClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [isOpen])

  // Search the pre-built index
  const results = useMemo(() => {
    const q = (query || '').trim()
    if (q.length < 1) return []
    const queryWords = q.toLowerCase().split(/\s+/).filter(Boolean)
    const MAX_PER_CAT = 5
    const catCounts = {}
    const out = []

    for (const entry of searchIndex) {
      const cat = entry.category
      if ((catCounts[cat] || 0) >= MAX_PER_CAT) continue
      if (fuzzyMatch(entry.text, queryWords)) {
        out.push(entry)
        catCounts[cat] = (catCounts[cat] || 0) + 1
      }
    }
    return out
  }, [query, searchIndex])

  // Group results by category
  const groupedResults = useMemo(() => {
    const groups = {}
    results.forEach(r => {
      if (!groups[r.category]) groups[r.category] = []
      groups[r.category].push(r)
    })
    return groups
  }, [results])

  const flatResults = results

  // Reset selection when results change
  useEffect(() => {
    setSelectedIndex(0)
  }, [query])

  const handleSelect = useCallback((result) => {
    const cat = CATEGORIES[result.category]
    if (cat) {
      navigate(cat.route(result.data))
      setQuery('')
      setIsOpen(false)
      inputRef.current?.blur()
      onNavigate?.()
    }
  }, [navigate, onNavigate])

  const handleKeyDown = (e) => {
    if (!isOpen || flatResults.length === 0) return

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex(prev => {
        const next = Math.min(prev + 1, flatResults.length - 1)
        setTimeout(() => resultsRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' }), 0)
        return next
      })
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex(prev => {
        const next = Math.max(prev - 1, 0)
        setTimeout(() => resultsRef.current?.querySelector(`[data-idx="${next}"]`)?.scrollIntoView({ block: 'nearest' }), 0)
        return next
      })
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (flatResults[selectedIndex]) handleSelect(flatResults[selectedIndex])
    }
  }

  const showResults = isOpen && query.length >= 1

  return (
    <div ref={containerRef} style={{ position: 'relative' }}>
      {/* Search Input */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <Search
          size={15}
          style={{
            position: 'absolute', left: '10px',
            color: isOpen ? theme.accent : theme.textMuted,
            transition: 'color 0.15s ease', pointerEvents: 'none', zIndex: 1
          }}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); setIsOpen(true) }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search everything..."
          style={{
            width: '100%',
            padding: '8px 36px 8px 32px',
            backgroundColor: isOpen ? theme.bgCard : theme.bg,
            border: `1px solid ${isOpen ? theme.accent : theme.border}`,
            borderRadius: '8px',
            color: theme.text,
            fontSize: '13px',
            outline: 'none',
            transition: 'all 0.2s ease',
            boxShadow: isOpen ? `0 0 0 3px ${theme.accent}20` : 'none'
          }}
        />
        {query ? (
          <button
            onClick={() => { setQuery(''); inputRef.current?.focus() }}
            style={{
              position: 'absolute', right: '6px', padding: '2px',
              backgroundColor: 'transparent', border: 'none',
              color: theme.textMuted, cursor: 'pointer',
              display: 'flex', alignItems: 'center', borderRadius: '4px'
            }}
          >
            <X size={14} />
          </button>
        ) : (
          <div style={{
            position: 'absolute', right: '8px',
            display: 'flex', alignItems: 'center', gap: '2px', pointerEvents: 'none'
          }}>
            <kbd style={{
              fontSize: '10px', color: theme.textMuted, backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`, borderRadius: '4px',
              padding: '1px 5px', fontFamily: 'inherit', lineHeight: '16px'
            }}>
              {navigator.platform?.includes('Mac') ? '\u2318' : 'Ctrl'}
            </kbd>
            <kbd style={{
              fontSize: '10px', color: theme.textMuted, backgroundColor: theme.bg,
              border: `1px solid ${theme.border}`, borderRadius: '4px',
              padding: '1px 5px', fontFamily: 'inherit', lineHeight: '16px'
            }}>
              K
            </kbd>
          </div>
        )}
      </div>

      {/* Results Dropdown */}
      {showResults && (
        <div
          ref={resultsRef}
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: '4px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '10px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.12), 0 2px 8px rgba(0,0,0,0.08)',
            maxHeight: '420px', overflowY: 'auto', zIndex: 200,
            overscrollBehavior: 'contain'
          }}
        >
          {flatResults.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
              <Search size={20} style={{ opacity: 0.4, marginBottom: '8px' }} />
              <div>No results for "{query}"</div>
              <div style={{ fontSize: '11px', marginTop: '4px' }}>
                Try a name, email, phone, address, status, or job title
              </div>
            </div>
          ) : (
            <div style={{ padding: '4px' }}>
              {Object.entries(groupedResults).map(([catKey, items]) => {
                const cat = CATEGORIES[catKey]
                if (!cat) return null
                const CatIcon = cat.icon
                return (
                  <div key={catKey}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: '6px',
                      padding: '8px 12px 4px', fontSize: '10px', fontWeight: '600',
                      color: cat.color, textTransform: 'uppercase', letterSpacing: '0.04em'
                    }}>
                      <CatIcon size={11} />
                      {cat.label}
                      <span style={{ color: theme.textMuted, fontWeight: '400' }}>({items.length})</span>
                    </div>
                    {items.map((result) => {
                      const globalIdx = flatResults.indexOf(result)
                      const isSelected = globalIdx === selectedIndex
                      return (
                        <button
                          key={`${result.category}-${result.id}`}
                          data-idx={globalIdx}
                          onClick={() => handleSelect(result)}
                          onMouseEnter={() => setSelectedIndex(globalIdx)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: '10px',
                            width: '100%', padding: '8px 12px',
                            backgroundColor: isSelected ? theme.accentBg : 'transparent',
                            border: 'none', borderRadius: '6px', cursor: 'pointer',
                            textAlign: 'left', transition: 'background-color 0.1s ease',
                            color: theme.text
                          }}
                        >
                          <div style={{
                            width: '28px', height: '28px', borderRadius: '6px',
                            backgroundColor: cat.color + '15',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                          }}>
                            <CatIcon size={14} style={{ color: cat.color }} />
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                              fontSize: '13px', fontWeight: '500', color: theme.text,
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
                            }}>
                              {result.title}
                            </div>
                            {result.subtitle && (
                              <div style={{
                                fontSize: '11px', color: theme.textMuted,
                                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '1px'
                              }}>
                                {result.subtitle}
                              </div>
                            )}
                          </div>
                          {isSelected && (
                            <ArrowRight size={14} style={{ color: theme.accent, flexShrink: 0 }} />
                          )}
                        </button>
                      )
                    })}
                  </div>
                )
              })}
              <div style={{
                padding: '6px 12px 8px', borderTop: `1px solid ${theme.border}`,
                marginTop: '4px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                gap: '12px', fontSize: '10px', color: theme.textMuted
              }}>
                <span>↑↓ navigate</span>
                <span>↵ select</span>
                <span>esc close</span>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
