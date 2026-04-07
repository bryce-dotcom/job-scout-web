import { useEffect, useMemo, useState } from 'react'
import { X, Plus, Trash2, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react'
import { buildDefaultTerms } from './formalProposalDefaults'

/**
 * Section-based contract editor. Parses the legal terms markdown into
 * an array of editable clauses so reps can add, remove, reorder, and
 * rewrite each section with simple form fields instead of hand-editing
 * raw markdown.
 *
 * Props:
 * - open: boolean
 * - initialMarkdown: string (current legal_terms_md)
 * - onClose: () => void
 * - onSave: (markdown: string) => Promise<void>
 * - defaultsInput: optional args to rebuild the default template
 *     ({ company, customer, quote, lineItems, downPaymentLabel, downPaymentAmount })
 */
export default function FormalTermsEditor({ open, initialMarkdown, onClose, onSave, defaultsInput }) {
  const [preamble, setPreamble] = useState('')
  const [sections, setSections] = useState([])
  const [title, setTitle] = useState('Proposal Agreement')
  const [saving, setSaving] = useState(false)

  // Rehydrate every time the modal opens
  useEffect(() => {
    if (!open) return
    const md = initialMarkdown && initialMarkdown.trim()
      ? initialMarkdown
      : (defaultsInput ? buildDefaultTerms(defaultsInput) : '')
    const parsed = parseMarkdown(md)
    setTitle(parsed.title)
    setPreamble(parsed.preamble)
    setSections(parsed.sections.map((s, i) => ({ ...s, id: `s-${i}-${Math.random().toString(36).slice(2, 7)}` })))
  }, [open, initialMarkdown])

  const addSection = () => {
    setSections((prev) => [
      ...prev,
      { id: `s-${Date.now()}`, heading: 'New Section', body: '' },
    ])
  }

  const removeSection = (id) => {
    setSections((prev) => prev.filter((s) => s.id !== id))
  }

  const moveSection = (id, dir) => {
    setSections((prev) => {
      const idx = prev.findIndex((s) => s.id === id)
      if (idx < 0) return prev
      const nextIdx = idx + dir
      if (nextIdx < 0 || nextIdx >= prev.length) return prev
      const copy = [...prev]
      const [item] = copy.splice(idx, 1)
      copy.splice(nextIdx, 0, item)
      return copy
    })
  }

  const updateSection = (id, patch) => {
    setSections((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  }

  const resetToDefault = () => {
    if (!defaultsInput) return
    if (!confirm('Reset all sections back to the default contract template? Your current edits will be lost.')) return
    const md = buildDefaultTerms(defaultsInput)
    const parsed = parseMarkdown(md)
    setTitle(parsed.title)
    setPreamble(parsed.preamble)
    setSections(parsed.sections.map((s, i) => ({ ...s, id: `s-${i}-${Math.random().toString(36).slice(2, 7)}` })))
  }

  const serialized = useMemo(() => serializeMarkdown({ title, preamble, sections }), [title, preamble, sections])

  const handleSave = async () => {
    setSaving(true)
    try {
      await onSave?.(serialized)
      onClose?.()
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.() }}
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15,20,17,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
        zIndex: 2000,
      }}
    >
      <div style={{
        width: '100%',
        maxWidth: 880,
        height: '90vh',
        backgroundColor: '#ffffff',
        borderRadius: 16,
        border: '1px solid #d6cdb8',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{ padding: '20px 28px', borderBottom: '1px solid #eef2eb', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 800, color: '#2c3530' }}>Edit Contract</h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#7d8a7f' }}>
              Click any section to rewrite it. Add, delete, or reorder clauses as needed. Changes save when you hit the button below.
            </p>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#7d8a7f', padding: 8 }}
          >
            <X size={22} />
          </button>
        </div>

        {/* Editable sections */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 28px', background: '#f7f5ef' }}>
          {/* Title */}
          <label style={labelStyle}>Contract Title</label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ ...inputStyle, fontSize: 17, fontWeight: 700, marginBottom: 18 }}
            placeholder="Proposal Agreement"
          />

          {/* Preamble */}
          <label style={labelStyle}>Preamble / Intro Paragraph</label>
          <textarea
            value={preamble}
            onChange={(e) => setPreamble(e.target.value)}
            rows={3}
            style={{ ...inputStyle, marginBottom: 22, resize: 'vertical', lineHeight: 1.6 }}
            placeholder="This Proposal Agreement is entered into as of..."
          />

          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, fontWeight: 700, color: '#5a6349', textTransform: 'uppercase', letterSpacing: 0.8 }}>
              Contract Sections ({sections.length})
            </span>
            {defaultsInput && (
              <button
                type="button"
                onClick={resetToDefault}
                style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'none', border: 'none', color: '#8b5a5a',
                  fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: 0,
                }}
              >
                <RotateCcw size={12} /> Reset to default
              </button>
            )}
          </div>

          {sections.map((s, idx) => (
            <SectionCard
              key={s.id}
              index={idx}
              total={sections.length}
              section={s}
              onChange={(patch) => updateSection(s.id, patch)}
              onRemove={() => removeSection(s.id)}
              onMoveUp={() => moveSection(s.id, -1)}
              onMoveDown={() => moveSection(s.id, 1)}
            />
          ))}

          <button
            type="button"
            onClick={addSection}
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: 12,
              border: '2px dashed #d6cdb8',
              background: 'transparent',
              color: '#5a6349',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              marginTop: 6,
              marginBottom: 10,
            }}
          >
            <Plus size={16} /> Add Section
          </button>
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #eef2eb', display: 'flex', justifyContent: 'flex-end', gap: 12, flexShrink: 0, backgroundColor: '#ffffff' }}>
          <button
            onClick={onClose}
            style={{
              padding: '12px 20px',
              borderRadius: 10,
              border: '1px solid #d6cdb8',
              background: 'transparent',
              color: '#4d5a52',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            style={{
              padding: '12px 24px',
              borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #5a6349 0%, #4a5239 100%)',
              color: '#ffffff',
              fontSize: 14,
              fontWeight: 700,
              cursor: saving ? 'wait' : 'pointer',
              opacity: saving ? 0.7 : 1,
            }}
          >
            {saving ? 'Saving...' : 'Save Contract'}
          </button>
        </div>
      </div>
    </div>
  )
}

function SectionCard({ index, total, section, onChange, onRemove, onMoveUp, onMoveDown }) {
  return (
    <div style={{
      backgroundColor: '#ffffff',
      border: '1px solid #d6cdb8',
      borderRadius: 12,
      padding: '14px 16px',
      marginBottom: 12,
      boxShadow: '0 1px 3px rgba(44,53,48,0.04)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <div style={{
          width: 28, height: 28, borderRadius: 8,
          background: 'rgba(90,99,73,0.12)',
          color: '#5a6349',
          fontSize: 12, fontWeight: 700,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          {index + 1}
        </div>
        <input
          value={section.heading}
          onChange={(e) => onChange({ heading: e.target.value })}
          placeholder="Section heading (e.g. Scope of Work)"
          style={{
            flex: 1,
            padding: '9px 12px',
            borderRadius: 8,
            border: '1px solid #eef2eb',
            fontSize: 14,
            fontWeight: 700,
            color: '#2c3530',
            backgroundColor: '#fbfaf6',
            outline: 'none',
          }}
        />
        <button
          type="button"
          onClick={onMoveUp}
          disabled={index === 0}
          title="Move up"
          style={{ ...iconBtn, opacity: index === 0 ? 0.3 : 1 }}
        >
          <ArrowUp size={14} />
        </button>
        <button
          type="button"
          onClick={onMoveDown}
          disabled={index === total - 1}
          title="Move down"
          style={{ ...iconBtn, opacity: index === total - 1 ? 0.3 : 1 }}
        >
          <ArrowDown size={14} />
        </button>
        <button
          type="button"
          onClick={() => {
            if (!confirm('Delete this section?')) return
            onRemove()
          }}
          title="Delete section"
          style={{ ...iconBtn, color: '#8b5a5a', borderColor: 'rgba(139,90,90,0.3)' }}
        >
          <Trash2 size={14} />
        </button>
      </div>
      <textarea
        value={section.body}
        onChange={(e) => onChange({ body: e.target.value })}
        placeholder="Type the contents of this clause here. Use **bold** or bullet lists with a dash (-) at the start of a line."
        rows={Math.max(3, Math.min(12, Math.floor((section.body || '').length / 70) + 2))}
        style={{
          width: '100%',
          padding: '10px 12px',
          borderRadius: 8,
          border: '1px solid #eef2eb',
          fontSize: 13,
          lineHeight: 1.6,
          color: '#2c3530',
          backgroundColor: '#fbfaf6',
          resize: 'vertical',
          outline: 'none',
          fontFamily: 'inherit',
          boxSizing: 'border-box',
        }}
      />
    </div>
  )
}

// ---------- Markdown parser / serializer ----------

/**
 * Parse the markdown contract body into { title, preamble, sections[] }.
 * Rules (intentionally simple and forgiving):
 * - First-level H1 line (# ...) becomes the title (optional)
 * - Everything between the title and the first H2 is the preamble
 * - Each subsequent H2 (## ...) starts a new section; everything until the
 *   next H2 or end-of-document is that section's body
 * - A trailing `---` horizontal rule and any italic closing paragraph are
 *   folded into the last section's body so nothing is lost on round-trip
 */
export function parseMarkdown(md) {
  const text = (md || '').replace(/\r/g, '').trim()
  if (!text) {
    return { title: 'Proposal Agreement', preamble: '', sections: [] }
  }
  const lines = text.split('\n')
  let title = 'Proposal Agreement'
  let preamble = ''
  const sections = []

  let i = 0
  // Pick up the first H1 as the title if present
  if (lines[i] && /^#\s+/.test(lines[i])) {
    title = lines[i].replace(/^#\s+/, '').trim()
    i++
  }
  // Accumulate preamble lines until we hit the first H2
  const preambleLines = []
  while (i < lines.length && !/^##\s+/.test(lines[i])) {
    preambleLines.push(lines[i])
    i++
  }
  preamble = preambleLines.join('\n').trim()

  // Walk through H2 sections
  let current = null
  while (i < lines.length) {
    const line = lines[i]
    if (/^##\s+/.test(line)) {
      if (current) sections.push(current)
      current = { heading: line.replace(/^##\s+/, '').trim(), body: '' }
    } else if (current) {
      current.body += (current.body ? '\n' : '') + line
    } else {
      // Content before any section heading (rare) — fold into preamble
      preamble += '\n' + line
    }
    i++
  }
  if (current) sections.push(current)

  // Trim trailing whitespace on each body
  for (const s of sections) {
    s.body = (s.body || '').trim()
  }

  return { title, preamble: preamble.trim(), sections }
}

export function serializeMarkdown({ title, preamble, sections }) {
  const parts = []
  if (title && title.trim()) parts.push(`# ${title.trim()}`)
  if (preamble && preamble.trim()) {
    parts.push('')
    parts.push(preamble.trim())
  }
  for (const s of sections || []) {
    parts.push('')
    parts.push(`## ${(s.heading || '').trim() || 'Untitled Section'}`)
    if (s.body && s.body.trim()) {
      parts.push('')
      parts.push(s.body.trim())
    }
  }
  return parts.join('\n')
}

// ---------- Styles ----------

const labelStyle = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: '#7d8a7f',
  textTransform: 'uppercase',
  letterSpacing: 0.6,
  marginBottom: 6,
}

const inputStyle = {
  width: '100%',
  padding: '11px 14px',
  borderRadius: 10,
  border: '1px solid #d6cdb8',
  fontSize: 14,
  color: '#2c3530',
  backgroundColor: '#ffffff',
  outline: 'none',
  boxSizing: 'border-box',
}

const iconBtn = {
  width: 30, height: 30,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 7, border: '1px solid #d6cdb8',
  background: '#ffffff', color: '#5a6349',
  cursor: 'pointer', flexShrink: 0, padding: 0,
}
