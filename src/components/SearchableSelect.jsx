import { useState, useRef, useEffect, useCallback } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'

/**
 * SearchableSelect — drop-in replacement for <select> with search.
 *
 * Props:
 *   options    — [{ value, label }]  (required)
 *   value      — currently selected value
 *   onChange   — (value) => void
 *   placeholder — text when nothing selected
 *   theme      — theme object for styling
 *   style      — override wrapper style
 *   disabled   — disable the input
 *   name       — form field name (for compatibility)
 */
export default function SearchableSelect({
  options = [],
  value,
  onChange,
  placeholder = '-- Select --',
  theme = {},
  style = {},
  disabled = false,
  name,
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [highlightIdx, setHighlightIdx] = useState(0)
  const wrapperRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)

  const selected = options.find(o => String(o.value) === String(value))

  const filtered = search
    ? (() => {
        const tokens = search.toLowerCase().split(/\s+/).filter(Boolean)
        return options.filter(o => {
          const label = o.label.toLowerCase()
          return tokens.every(t => label.includes(t))
        })
      })()
    : options

  // Close on click outside
  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
        setSearch('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Auto-focus search input when opened
  useEffect(() => {
    if (open && inputRef.current) {
      inputRef.current.focus()
    }
  }, [open])

  // Scroll highlighted item into view
  useEffect(() => {
    if (open && listRef.current) {
      const item = listRef.current.children[highlightIdx]
      if (item) item.scrollIntoView({ block: 'nearest' })
    }
  }, [highlightIdx, open])

  // Reset highlight when search changes
  useEffect(() => { setHighlightIdx(0) }, [search])

  const handleSelect = useCallback((val) => {
    onChange(val)
    setOpen(false)
    setSearch('')
  }, [onChange])

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIdx(i => Math.min(i + 1, filtered.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filtered[highlightIdx]) handleSelect(filtered[highlightIdx].value)
    } else if (e.key === 'Escape') {
      setOpen(false)
      setSearch('')
    }
  }, [filtered, highlightIdx, handleSelect])

  const bg = theme.bgCard || '#fff'
  const border = theme.border || '#d6cdb8'
  const text = theme.text || '#2c3530'
  const textMuted = theme.textMuted || '#7d8a7f'
  const accent = theme.accent || '#5a6349'
  const accentBg = theme.accentBg || 'rgba(90,99,73,0.12)'
  const hoverBg = theme.bgCardHover || '#eef2eb'

  return (
    <div ref={wrapperRef} style={{ position: 'relative', ...style }}>
      {/* Trigger button */}
      <div
        onClick={() => { if (!disabled) setOpen(!open) }}
        style={{
          width: '100%',
          padding: '10px 12px',
          border: `1px solid ${open ? accent : border}`,
          borderRadius: '8px',
          fontSize: '14px',
          color: selected ? text : textMuted,
          backgroundColor: disabled ? (theme.bg || '#f7f5ef') : bg,
          cursor: disabled ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          outline: 'none',
          boxSizing: 'border-box',
          opacity: disabled ? 0.6 : 1,
          transition: 'border-color 0.15s',
        }}
      >
        <span style={{
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
        }}>
          {selected ? selected.label : placeholder}
        </span>
        {selected && !disabled ? (
          <X
            size={14}
            style={{ color: textMuted, flexShrink: 0, cursor: 'pointer' }}
            onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false) }}
          />
        ) : (
          <ChevronDown size={14} style={{ color: textMuted, flexShrink: 0 }} />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          right: 0,
          marginTop: '4px',
          backgroundColor: bg,
          border: `1px solid ${border}`,
          borderRadius: '10px',
          boxShadow: '0 12px 32px rgba(0,0,0,0.12)',
          zIndex: 999,
          overflow: 'hidden',
          maxHeight: '280px',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {/* Search input */}
          <div style={{
            padding: '8px',
            borderBottom: `1px solid ${border}`,
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
          }}>
            <Search size={14} style={{ color: textMuted, flexShrink: 0 }} />
            <input
              ref={inputRef}
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              style={{
                border: 'none',
                outline: 'none',
                flex: 1,
                fontSize: '14px',
                color: text,
                backgroundColor: 'transparent',
              }}
            />
            {search && (
              <X
                size={14}
                style={{ color: textMuted, cursor: 'pointer', flexShrink: 0 }}
                onClick={() => setSearch('')}
              />
            )}
          </div>

          {/* Options list */}
          <div ref={listRef} style={{ overflowY: 'auto', maxHeight: '232px' }}>
            {filtered.length === 0 ? (
              <div style={{
                padding: '16px',
                textAlign: 'center',
                color: textMuted,
                fontSize: '13px',
              }}>
                No matches found
              </div>
            ) : (
              filtered.map((opt, idx) => {
                const isSelected = String(opt.value) === String(value)
                const isHighlighted = idx === highlightIdx
                return (
                  <div
                    key={opt.value}
                    onClick={() => handleSelect(opt.value)}
                    onMouseEnter={() => setHighlightIdx(idx)}
                    style={{
                      padding: '9px 12px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      color: isSelected ? accent : text,
                      fontWeight: isSelected ? '600' : '400',
                      backgroundColor: isSelected ? accentBg : isHighlighted ? hoverBg : 'transparent',
                      transition: 'background-color 0.1s',
                      borderLeft: isSelected ? `3px solid ${accent}` : '3px solid transparent',
                    }}
                  >
                    {opt.label}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
