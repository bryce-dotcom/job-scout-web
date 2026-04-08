import { useMemo, useState, useRef, useEffect } from 'react'
import { X, ChevronDown, Check } from 'lucide-react'

/**
 * SalespeopleMultiSelect
 *
 * Pick one or more sales reps from the company employees list. Renders
 * the current selection as removable chips and a "+ Add rep" pill that
 * opens a search dropdown.
 *
 * Props:
 * - employees: full company employees array
 * - selectedIds: number[]
 * - onChange: (ids: number[]) => void
 * - theme: theme object
 * - allowedRoles?: string[] - which roles to show (default: Sales/Salesman/Manager/Admin)
 */
export default function SalespeopleMultiSelect({
  employees = [],
  selectedIds = [],
  onChange,
  theme,
  allowedRoles = ['Sales', 'Salesman', 'Manager', 'Admin'],
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef(null)

  const t = theme || {
    bg: '#f7f5ef',
    bgCard: '#ffffff',
    border: '#d6cdb8',
    text: '#2c3530',
    textMuted: '#7d8a7f',
    accent: '#5a6349',
    accentBg: 'rgba(90,99,73,0.12)',
  }

  // Pool of selectable reps
  const pool = useMemo(() => {
    return (employees || []).filter(e => allowedRoles.includes(e.role) && e.active !== false)
  }, [employees, allowedRoles])

  const selected = useMemo(() => {
    const set = new Set(selectedIds.map(String))
    return pool.filter(e => set.has(String(e.id)))
  }, [pool, selectedIds])

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase()
    const selectedSet = new Set(selectedIds.map(String))
    return pool.filter(e => !selectedSet.has(String(e.id)) && (!q || e.name.toLowerCase().includes(q)))
  }, [pool, query, selectedIds])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const add = (id) => {
    const next = [...selectedIds.filter(x => String(x) !== String(id)), id]
    onChange?.(next)
    setQuery('')
  }

  const remove = (id) => {
    onChange?.(selectedIds.filter(x => String(x) !== String(id)))
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 6,
          padding: '8px 10px',
          minHeight: 44,
          border: `1px solid ${t.border}`,
          borderRadius: 8,
          backgroundColor: t.bgCard,
          alignItems: 'center',
          cursor: 'text',
        }}
        onClick={() => setOpen(true)}
      >
        {selected.length === 0 && (
          <span style={{ fontSize: 13, color: t.textMuted }}>Select sales reps…</span>
        )}
        {selected.map((emp, idx) => (
          <span
            key={emp.id}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '4px 8px 4px 10px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              color: '#fff',
              background: idx === 0 ? t.accent : 'rgba(90,99,73,0.78)',
            }}
          >
            {emp.name}
            {idx === 0 && selected.length > 1 && (
              <span style={{ fontSize: 9, fontWeight: 700, opacity: 0.8, marginLeft: 2 }}>PRIMARY</span>
            )}
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); remove(emp.id) }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', color: '#fff' }}
              aria-label={`Remove ${emp.name}`}
            >
              <X size={12} />
            </button>
          </span>
        ))}
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setOpen(o => !o) }}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 4,
            padding: '4px 10px',
            borderRadius: 999,
            border: `1px dashed ${t.border}`,
            background: 'transparent',
            color: t.accent,
            fontSize: 12,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          + Add rep
          <ChevronDown size={12} />
        </button>
      </div>

      {open && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 100,
            backgroundColor: t.bgCard,
            border: `1px solid ${t.border}`,
            borderRadius: 10,
            boxShadow: '0 10px 30px rgba(0,0,0,0.12)',
            maxHeight: 280,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <input
            autoFocus
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reps…"
            style={{
              padding: '10px 12px',
              border: 'none',
              outline: 'none',
              borderBottom: `1px solid ${t.border}`,
              fontSize: 13,
              color: t.text,
              backgroundColor: t.bgCard,
            }}
          />
          <div style={{ overflowY: 'auto', maxHeight: 220 }}>
            {filteredOptions.length === 0 && (
              <div style={{ padding: '14px 12px', fontSize: 12, color: t.textMuted, textAlign: 'center' }}>
                {pool.length === 0 ? 'No sales reps in this company yet.' : 'No matches.'}
              </div>
            )}
            {filteredOptions.map(emp => (
              <button
                key={emp.id}
                type="button"
                onClick={() => add(emp.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                  padding: '10px 12px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontSize: 13,
                  color: t.text,
                  borderBottom: `1px solid ${t.border}`,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = t.accentBg }}
                onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
              >
                <Check size={14} style={{ opacity: 0, color: t.accent }} />
                {emp.name}
                {emp.role && (
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: t.textMuted, fontWeight: 600 }}>{emp.role}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
