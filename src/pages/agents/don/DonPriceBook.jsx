// Don — the price book. Unit prices and what they cost us.
//
// Seeded from packs per vertical so nobody starts at zero, but every row is
// meant to be edited on day one: a price book you didn't write is a price
// book you don't trust. Editing is inline with onBlur commits — no modal, no
// save button to hunt for, and no re-render storm while typing.

import { useState, useEffect, useMemo } from 'react'
import { Plus, DollarSign, Trash2, Download, Search } from 'lucide-react'
import { useStore } from '../../../lib/store'
import { useIsMobile } from '../../../hooks/useIsMobile'
import { supabase } from '../../../lib/supabase'
import { WORK_TYPES } from '../../../lib/digEstimator'
import { PRICE_BOOK_PACKS, VERTICALS, DEFAULT_VERTICALS, packRowsFor } from '../../../lib/donPriceBook'
import {
  T, Screen, Card, Btn, Field, TextInput, NumInput, Select, Sheet,
  Empty, Badge, SectionLabel, Note, fmtNum,
} from '../../../components/don/DonUI'

const UOMS = ['CY', 'LCY', 'CCY', 'LF', 'SF', 'TON', 'LOAD', 'HR', 'DAY', 'EA']
const WORK_TYPE_OPTIONS = Object.entries(WORK_TYPES).map(([value, w]) => ({ value, label: w.label }))

const blank = {
  code: '', label: '', work_type: '', vertical: '', uom: 'CY',
  unit_price: '', cost: '', kind: 'labor', min_charge: '', equipment: '',
}

export default function DonPriceBook() {
  const companyId = useStore((s) => s.companyId)
  const isMobile = useIsMobile()
  const [rows, setRows] = useState([])
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [draft, setDraft] = useState(blank)
  const [editingId, setEditingId] = useState(null)
  const [seeding, setSeeding] = useState(false)

  const load = async () => {
    if (!companyId) return
    setLoading(true)
    const [{ data: r }, { data: s }] = await Promise.all([
      supabase.from('dig_rates').select('*').eq('company_id', companyId).order('vertical').order('sort_order'),
      supabase.from('dig_settings').select('*').eq('company_id', companyId).maybeSingle(),
    ])
    setRows(r || [])
    setSettings(s || null)
    setLoading(false)
  }
  useEffect(() => { load() }, [companyId])

  const verticals = settings?.verticals || DEFAULT_VERTICALS
  const seeded = settings?.price_book_seeded || {}

  const missingPacks = useMemo(
    () => Object.entries(verticals).filter(([k, on]) => on && !seeded[k] && (PRICE_BOOK_PACKS[k] || []).length),
    [verticals, seeded]
  )

  const installPacks = async () => {
    setSeeding(true)
    const toInsert = packRowsFor(verticals, seeded, companyId)
    if (toInsert.length) {
      const { error } = await supabase.from('dig_rates').insert(toInsert)
      if (error) { setSeeding(false); alert('Could not install: ' + error.message); return }
    }
    const nextSeeded = { ...seeded }
    Object.entries(verticals).forEach(([k, on]) => { if (on) nextSeeded[k] = true })
    await supabase.from('dig_settings').upsert(
      { company_id: companyId, verticals, price_book_seeded: nextSeeded, updated_at: new Date().toISOString() },
      { onConflict: 'company_id' }
    )
    setSeeding(false)
    load()
  }

  // Inline commit — local state while typing, write on blur. Never on keystroke.
  const commit = async (row, field, value) => {
    const val = value === '' ? null : (['label', 'code', 'uom', 'kind', 'work_type', 'equipment'].includes(field) ? value : Number(value))
    if (String(row[field] ?? '') === String(val ?? '')) return
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, [field]: val } : r)))
    await supabase.from('dig_rates').update({ [field]: val, updated_at: new Date().toISOString() }).eq('id', row.id)
  }

  const remove = async (id) => {
    if (!confirm('Delete this price-book row?')) return
    await supabase.from('dig_rates').delete().eq('id', id)
    load()
  }

  const saveNew = async () => {
    if (!draft.label?.trim()) return
    const payload = {
      company_id: companyId,
      code: draft.code?.trim() || null,
      label: draft.label.trim(),
      work_type: draft.work_type || null,
      vertical: draft.vertical || null,
      uom: draft.uom || 'CY',
      unit_price: draft.unit_price === '' ? 0 : Number(draft.unit_price),
      cost: draft.cost === '' ? 0 : Number(draft.cost),
      kind: draft.kind || 'labor',
      min_charge: draft.min_charge === '' ? null : Number(draft.min_charge),
      equipment: draft.equipment || null,
      active: true,
      sort_order: rows.length,
    }
    const res = editingId
      ? await supabase.from('dig_rates').update(payload).eq('id', editingId)
      : await supabase.from('dig_rates').insert(payload)
    if (res.error) { alert(res.error.message); return }
    setSheetOpen(false)
    load()
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => [r.code, r.label, r.work_type, r.uom].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [rows, search])

  const grouped = useMemo(() => {
    const g = {}
    filtered.forEach((r) => {
      const k = r.vertical || 'other'
      if (!g[k]) g[k] = []
      g[k].push(r)
    })
    return g
  }, [filtered])

  return (
    <div style={{ background: T.bg, minHeight: '100%' }}>
      <Screen>
        <div style={{
          display: 'grid',
          gridTemplateColumns: isMobile ? 'minmax(0,1fr)' : 'minmax(0,1fr) auto',
          gap: 10,
        }}>
          <div style={{ position: 'relative', minWidth: 0 }}>
            <Search size={18} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search price book"
              style={{
                width: '100%', minHeight: 48, padding: '10px 12px 10px 40px',
                border: `1px solid ${T.border}`, borderRadius: 10,
                background: T.bgCard, color: T.text, fontSize: 16, boxSizing: 'border-box',
              }}
            />
          </div>
          <Btn onClick={() => { setDraft(blank); setEditingId(null); setSheetOpen(true) }} full={isMobile}>
            <Plus size={18} /> New row
          </Btn>
        </div>

        {missingPacks.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <Note tone="accent" icon={Download}>
              <div style={{ marginBottom: 10 }}>
                Starter prices are ready for{' '}
                <strong>{missingPacks.map(([k]) => VERTICALS[k]?.label || k).join(', ')}</strong>.
                Install them and edit to match your market — they are round numbers on purpose.
              </div>
              <Btn onClick={installPacks} disabled={seeding} variant="clay">
                {seeding ? 'Installing…' : `Install ${packRowsFor(verticals, seeded, companyId).length} rows`}
              </Btn>
            </Note>
          </div>
        )}

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: T.textMuted }}>Loading price book…</div>
        ) : rows.length === 0 ? (
          <div style={{ marginTop: 16 }}>
            <Empty
              icon={DollarSign}
              title="No price book yet"
              body="Don computes quantities without one, but every line will price at zero. Install a starter pack above, or add your own rows."
            />
          </div>
        ) : (
          Object.entries(grouped).map(([vert, list]) => (
            <div key={vert}>
              <SectionLabel>{VERTICALS[vert]?.label || 'Other'} · {list.length}</SectionLabel>
              <div style={{ display: 'grid', gap: 10 }}>
                {list.map((r) => (
                  <Card key={r.id}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, minWidth: 0 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          defaultValue={r.label || ''}
                          onBlur={(e) => commit(r, 'label', e.target.value)}
                          style={{
                            width: '100%', border: 'none', background: 'transparent', padding: 0,
                            fontSize: 15, fontWeight: 700, color: T.text, minHeight: 28,
                          }}
                        />
                        <div style={{ fontSize: 12, color: T.textMuted, marginTop: 2 }}>
                          {r.code ? `${r.code} · ` : ''}{WORK_TYPES[r.work_type]?.label || r.work_type || 'unmapped'}
                        </div>
                      </div>
                      <Badge tone={r.kind === 'materials' ? 'clay' : 'muted'}>{r.kind}</Badge>
                      <button onClick={() => remove(r.id)} style={{
                        minWidth: 44, minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'transparent', border: 'none', color: T.textMuted, cursor: 'pointer', flexShrink: 0,
                      }} aria-label="Delete row"><Trash2 size={16} /></button>
                    </div>

                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 110px), 1fr))',
                      gap: 8, marginTop: 10,
                    }}>
                      <MiniField label="Unit">
                        <select
                          defaultValue={r.uom}
                          onBlur={(e) => commit(r, 'uom', e.target.value)}
                          onChange={(e) => commit(r, 'uom', e.target.value)}
                          style={miniInput}
                        >
                          {UOMS.map((u) => <option key={u} value={u}>{u}</option>)}
                        </select>
                      </MiniField>
                      <MiniField label="Price">
                        <input type="number" inputMode="decimal" step="any" defaultValue={r.unit_price ?? ''}
                          onBlur={(e) => commit(r, 'unit_price', e.target.value)} style={miniInput} />
                      </MiniField>
                      <MiniField label="Cost">
                        <input type="number" inputMode="decimal" step="any" defaultValue={r.cost ?? ''}
                          onBlur={(e) => commit(r, 'cost', e.target.value)} style={miniInput} />
                      </MiniField>
                      <MiniField label="Margin">
                        <div style={{
                          ...miniInput, display: 'flex', alignItems: 'center',
                          color: (r.unit_price - r.cost) > 0 ? T.accent : T.danger, fontWeight: 700,
                          background: 'transparent', border: `1px solid transparent`,
                        }}>
                          {r.unit_price > 0 ? `${Math.round(((r.unit_price - r.cost) / r.unit_price) * 100)}%` : '—'}
                        </div>
                      </MiniField>
                    </div>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </Screen>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        isMobile={isMobile}
        title={editingId ? 'Edit row' : 'New price-book row'}
        footer={
          <div style={{ display: 'flex', gap: 8 }}>
            <Btn variant="ghost" onClick={() => setSheetOpen(false)} style={{ flex: 1 }}>Cancel</Btn>
            <Btn onClick={saveNew} disabled={!draft.label?.trim()} style={{ flex: 2 }}>Save</Btn>
          </div>
        }
      >
        <div style={{ display: 'grid', gap: 14 }}>
          <Field label="Label"><TextInput value={draft.label} onChange={(v) => setDraft({ ...draft, label: v })} placeholder="Trench excavation" /></Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            <Field label="Code"><TextInput value={draft.code} onChange={(v) => setDraft({ ...draft, code: v })} placeholder="TR-100" /></Field>
            <Field label="Unit">
              <Select value={draft.uom} onChange={(v) => setDraft({ ...draft, uom: v })} options={UOMS.map((u) => ({ value: u, label: u }))} />
            </Field>
          </div>
          <Field label="Work type" hint="What Don matches against when pricing a takeoff item">
            <Select value={draft.work_type} onChange={(v) => setDraft({ ...draft, work_type: v })} placeholder="Unmapped" options={WORK_TYPE_OPTIONS} />
          </Field>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}>
            <Field label="Unit price"><NumInput value={draft.unit_price} onChange={(v) => setDraft({ ...draft, unit_price: v })} unit="$" /></Field>
            <Field label="Our cost"><NumInput value={draft.cost} onChange={(v) => setDraft({ ...draft, cost: v })} unit="$" /></Field>
          </div>
          <Field label="Kind" hint="Materials vs labor drives the invoice split downstream — get it right.">
            <Select value={draft.kind} onChange={(v) => setDraft({ ...draft, kind: v })} options={[{ value: 'labor', label: 'Labor' }, { value: 'materials', label: 'Materials' }]} />
          </Field>
          <Field label="Minimum charge" hint="Optional — a small job still costs a mobilization.">
            <NumInput value={draft.min_charge} onChange={(v) => setDraft({ ...draft, min_charge: v })} unit="$" />
          </Field>
        </div>
      </Sheet>
    </div>
  )
}

const miniInput = {
  width: '100%', minHeight: 44, padding: '6px 8px',
  border: `1px solid ${T.border}`, borderRadius: 8,
  background: T.bg, color: T.text, fontSize: 16, boxSizing: 'border-box',
  fontVariantNumeric: 'tabular-nums',
}

function MiniField({ label, children }) {
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: T.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>{label}</div>
      {children}
    </div>
  )
}
