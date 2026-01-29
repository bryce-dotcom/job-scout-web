import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import AdminModal, { FormField, FormInput, FormSelect, FormTextarea, FormToggle, ModalFooter } from './components/AdminModal'
import { Badge } from './components/AdminStats'
import { Plus, Search, Edit2, Trash2, Download, Upload, Zap } from 'lucide-react'

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY'
]

const FIXTURE_CATEGORIES = [
  'Linear', 'High Bay', 'Low Bay', 'Outdoor Area', 'Outdoor Wall', 'Decorative', 'Refrigeration', 'Other'
]

export default function DataConsoleUtilities() {
  const [providers, setProviders] = useState([])
  const [programs, setPrograms] = useState([])
  const [rates, setRates] = useState([])
  const [loading, setLoading] = useState({ providers: true, programs: false, rates: false })

  const [selectedProvider, setSelectedProvider] = useState(null)
  const [selectedProgram, setSelectedProgram] = useState(null)

  const [providerSearch, setProviderSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')

  const [editingProvider, setEditingProvider] = useState(null)
  const [editingProgram, setEditingProgram] = useState(null)
  const [editingRate, setEditingRate] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchProviders()
  }, [])

  useEffect(() => {
    if (selectedProvider) {
      fetchPrograms(selectedProvider.provider_name)
    } else {
      setPrograms([])
      setSelectedProgram(null)
    }
  }, [selectedProvider])

  useEffect(() => {
    if (selectedProgram) {
      fetchRates(selectedProgram.id)
    } else {
      setRates([])
    }
  }, [selectedProgram])

  const fetchProviders = async () => {
    setLoading(l => ({ ...l, providers: true }))
    const { data } = await supabase
      .from('utility_providers')
      .select('*')
      .order('provider_name')
    setProviders(data || [])
    setLoading(l => ({ ...l, providers: false }))
  }

  const fetchPrograms = async (providerName) => {
    setLoading(l => ({ ...l, programs: true }))
    const { data } = await supabase
      .from('utility_programs')
      .select('*')
      .eq('utility_name', providerName)
      .order('program_name')
    setPrograms(data || [])
    setLoading(l => ({ ...l, programs: false }))
  }

  const fetchRates = async (programId) => {
    setLoading(l => ({ ...l, rates: true }))
    const { data } = await supabase
      .from('rebate_rates')
      .select('*')
      .eq('program_id', programId)
      .order('fixture_category')
    setRates(data || [])
    setLoading(l => ({ ...l, rates: false }))
  }

  // Provider CRUD
  const handleSaveProvider = async () => {
    setSaving(true)
    try {
      if (editingProvider.id) {
        await supabase.from('utility_providers').update(editingProvider).eq('id', editingProvider.id)
      } else {
        await supabase.from('utility_providers').insert(editingProvider)
      }
      await fetchProviders()
      setEditingProvider(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const handleDeleteProvider = async (provider) => {
    if (!confirm(`Delete ${provider.provider_name}? This will also delete all programs and rates.`)) return
    await supabase.from('utility_providers').delete().eq('id', provider.id)
    await fetchProviders()
    if (selectedProvider?.id === provider.id) {
      setSelectedProvider(null)
    }
  }

  // Program CRUD
  const handleSaveProgram = async () => {
    setSaving(true)
    try {
      const data = { ...editingProgram, utility_name: selectedProvider.provider_name }
      if (editingProgram.id) {
        await supabase.from('utility_programs').update(data).eq('id', editingProgram.id)
      } else {
        await supabase.from('utility_programs').insert(data)
      }
      await fetchPrograms(selectedProvider.provider_name)
      setEditingProgram(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const handleDeleteProgram = async (program) => {
    if (!confirm(`Delete ${program.program_name}?`)) return
    await supabase.from('utility_programs').delete().eq('id', program.id)
    await fetchPrograms(selectedProvider.provider_name)
    if (selectedProgram?.id === program.id) {
      setSelectedProgram(null)
    }
  }

  // Rate CRUD
  const handleSaveRate = async () => {
    setSaving(true)
    try {
      const data = { ...editingRate, program_id: selectedProgram.id }
      if (editingRate.id) {
        await supabase.from('rebate_rates').update(data).eq('id', editingRate.id)
      } else {
        await supabase.from('rebate_rates').insert(data)
      }
      await fetchRates(selectedProgram.id)
      setEditingRate(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const handleDeleteRate = async (rate) => {
    if (!confirm('Delete this rate?')) return
    await supabase.from('rebate_rates').delete().eq('id', rate.id)
    await fetchRates(selectedProgram.id)
  }

  const filteredProviders = providers.filter(p => {
    const matchesSearch = p.provider_name?.toLowerCase().includes(providerSearch.toLowerCase())
    const matchesState = !stateFilter || p.state === stateFilter
    return matchesSearch && matchesState
  })

  const totalPrograms = programs.length
  const totalRates = rates.length

  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700' }}>
          Utilities & Rebates
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: adminTheme.textMuted, fontSize: '13px' }}>
            {providers.length} Providers | {programs.length} Programs | {rates.length} Rates
          </span>
          <button
            onClick={() => alert('Coming in Phase 5')}
            style={{
              padding: '8px 16px',
              backgroundColor: adminTheme.accentBg,
              border: 'none',
              borderRadius: '8px',
              color: adminTheme.accent,
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Zap size={16} /> AI Research
          </button>
        </div>
      </div>

      {/* Three Panel Layout */}
      <div style={{ display: 'flex', gap: '16px', flex: 1, overflow: 'hidden' }}>
        {/* Left Panel - Providers */}
        <div style={{
          width: '30%',
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px', borderBottom: `1px solid ${adminTheme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
              <span style={{ color: adminTheme.text, fontWeight: '600' }}>Utility Providers</span>
              <button
                onClick={() => setEditingProvider({ provider_name: '', state: '', has_rebate_program: true })}
                style={{
                  padding: '6px 12px',
                  backgroundColor: adminTheme.accent,
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                placeholder="Search..."
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '8px 10px',
                  backgroundColor: adminTheme.bgInput,
                  border: `1px solid ${adminTheme.border}`,
                  borderRadius: '6px',
                  color: adminTheme.text,
                  fontSize: '13px'
                }}
              />
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                style={{
                  padding: '8px',
                  backgroundColor: adminTheme.bgInput,
                  border: `1px solid ${adminTheme.border}`,
                  borderRadius: '6px',
                  color: adminTheme.text,
                  fontSize: '13px'
                }}
              >
                <option value="">All</option>
                {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loading.providers ? (
              <div style={{ padding: '20px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
            ) : filteredProviders.length === 0 ? (
              <div style={{ padding: '20px', textAlign: 'center', color: adminTheme.textMuted }}>No providers</div>
            ) : (
              filteredProviders.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProvider(p)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${adminTheme.border}`,
                    cursor: 'pointer',
                    backgroundColor: selectedProvider?.id === p.id ? adminTheme.accentBg : 'transparent',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedProvider?.id !== p.id) e.currentTarget.style.backgroundColor = adminTheme.bgHover
                  }}
                  onMouseLeave={(e) => {
                    if (selectedProvider?.id !== p.id) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div>
                    <div style={{ color: adminTheme.text, fontSize: '14px', fontWeight: '500' }}>{p.provider_name}</div>
                    <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                      <Badge>{p.state}</Badge>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditingProvider(p)} style={{ padding: '4px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}>
                      <Edit2 size={14} />
                    </button>
                    <button onClick={() => handleDeleteProvider(p)} style={{ padding: '4px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Middle Panel - Programs */}
        <div style={{
          width: '35%',
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px', borderBottom: `1px solid ${adminTheme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: adminTheme.text, fontWeight: '600' }}>
                {selectedProvider ? `${selectedProvider.provider_name} Programs` : 'Programs'}
              </span>
              <button
                onClick={() => setEditingProgram({ program_name: '', program_type: 'Prescriptive', business_size: 'All' })}
                disabled={!selectedProvider}
                style={{
                  padding: '6px 12px',
                  backgroundColor: selectedProvider ? adminTheme.accent : adminTheme.border,
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  cursor: selectedProvider ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!selectedProvider ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: adminTheme.textMuted }}>
                Select a provider to view programs
              </div>
            ) : loading.programs ? (
              <div style={{ padding: '20px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
            ) : programs.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: adminTheme.textMuted }}>
                No programs found
              </div>
            ) : (
              programs.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProgram(p)}
                  style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${adminTheme.border}`,
                    cursor: 'pointer',
                    backgroundColor: selectedProgram?.id === p.id ? adminTheme.accentBg : 'transparent'
                  }}
                  onMouseEnter={(e) => {
                    if (selectedProgram?.id !== p.id) e.currentTarget.style.backgroundColor = adminTheme.bgHover
                  }}
                  onMouseLeave={(e) => {
                    if (selectedProgram?.id !== p.id) e.currentTarget.style.backgroundColor = 'transparent'
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: adminTheme.text, fontSize: '14px', fontWeight: '500' }}>{p.program_name}</div>
                      <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                        <Badge color="accent">{p.program_type}</Badge>
                        <Badge>{p.business_size || 'All'}</Badge>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditingProgram(p)} style={{ padding: '4px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteProgram(p)} style={{ padding: '4px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Panel - Rates */}
        <div style={{
          width: '35%',
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px', borderBottom: `1px solid ${adminTheme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: adminTheme.text, fontWeight: '600' }}>
                {selectedProgram ? `${selectedProgram.program_name} Rates` : 'Rates'}
              </span>
              <button
                onClick={() => setEditingRate({ fixture_category: 'Linear', calc_method: 'Per Watt Reduced', rate: 0 })}
                disabled={!selectedProgram}
                style={{
                  padding: '6px 12px',
                  backgroundColor: selectedProgram ? adminTheme.accent : adminTheme.border,
                  border: 'none',
                  borderRadius: '6px',
                  color: '#fff',
                  fontSize: '12px',
                  cursor: selectedProgram ? 'pointer' : 'not-allowed',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px'
                }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!selectedProgram ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: adminTheme.textMuted }}>
                Select a program to view rates
              </div>
            ) : loading.rates ? (
              <div style={{ padding: '20px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
            ) : rates.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: adminTheme.textMuted }}>
                No rates defined
              </div>
            ) : (
              rates.map(r => (
                <div
                  key={r.id}
                  style={{
                    padding: '12px 16px',
                    borderBottom: `1px solid ${adminTheme.border}`
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <div style={{ color: adminTheme.text, fontSize: '14px', fontWeight: '500' }}>
                        {r.fixture_category}
                      </div>
                      <div style={{ color: adminTheme.accent, fontSize: '16px', fontWeight: '600', marginTop: '4px' }}>
                        ${r.rate} {r.rate_unit || '/watt'}
                      </div>
                      {(r.min_watts || r.max_watts) && (
                        <div style={{ color: adminTheme.textMuted, fontSize: '12px', marginTop: '2px' }}>
                          {r.min_watts || 0}W - {r.max_watts || '∞'}W
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '4px' }}>
                      <button onClick={() => setEditingRate(r)} style={{ padding: '4px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}>
                        <Edit2 size={14} />
                      </button>
                      <button onClick={() => handleDeleteRate(r)} style={{ padding: '4px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Provider Modal */}
      <AdminModal isOpen={!!editingProvider} onClose={() => setEditingProvider(null)} title={editingProvider?.id ? 'Edit Provider' : 'Add Provider'}>
        {editingProvider && (
          <>
            <FormField label="Provider Name" required>
              <FormInput value={editingProvider.provider_name} onChange={(v) => setEditingProvider({ ...editingProvider, provider_name: v })} />
            </FormField>
            <FormField label="State" required>
              <FormSelect
                value={editingProvider.state}
                onChange={(v) => setEditingProvider({ ...editingProvider, state: v })}
                options={US_STATES.map(s => ({ value: s, label: s }))}
                placeholder="Select state"
              />
            </FormField>
            <FormField label="Service Territory">
              <FormInput value={editingProvider.service_territory} onChange={(v) => setEditingProvider({ ...editingProvider, service_territory: v })} />
            </FormField>
            <FormField label="Rebate Program URL">
              <FormInput value={editingProvider.rebate_program_url} onChange={(v) => setEditingProvider({ ...editingProvider, rebate_program_url: v })} />
            </FormField>
            <FormField label="Contact Phone">
              <FormInput value={editingProvider.contact_phone} onChange={(v) => setEditingProvider({ ...editingProvider, contact_phone: v })} />
            </FormField>
            <FormToggle
              checked={editingProvider.has_rebate_program}
              onChange={(v) => setEditingProvider({ ...editingProvider, has_rebate_program: v })}
              label="Has Rebate Program"
            />
            <FormField label="Notes">
              <FormTextarea value={editingProvider.notes} onChange={(v) => setEditingProvider({ ...editingProvider, notes: v })} />
            </FormField>
            <ModalFooter onCancel={() => setEditingProvider(null)} onSave={handleSaveProvider} saving={saving} />
          </>
        )}
      </AdminModal>

      {/* Program Modal */}
      <AdminModal isOpen={!!editingProgram} onClose={() => setEditingProgram(null)} title={editingProgram?.id ? 'Edit Program' : 'Add Program'} width="600px">
        {editingProgram && (
          <>
            <FormField label="Program Name" required>
              <FormInput value={editingProgram.program_name} onChange={(v) => setEditingProgram({ ...editingProgram, program_name: v })} />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Program Type" required>
                <FormSelect
                  value={editingProgram.program_type}
                  onChange={(v) => setEditingProgram({ ...editingProgram, program_type: v })}
                  options={[
                    { value: 'Prescriptive', label: 'Prescriptive' },
                    { value: 'Custom', label: 'Custom' },
                    { value: 'Midstream', label: 'Midstream' }
                  ]}
                />
              </FormField>
              <FormField label="Business Size" required>
                <FormSelect
                  value={editingProgram.business_size}
                  onChange={(v) => setEditingProgram({ ...editingProgram, business_size: v })}
                  options={[
                    { value: 'Small', label: 'Small' },
                    { value: 'Medium', label: 'Medium' },
                    { value: 'Large', label: 'Large' },
                    { value: 'All', label: 'All' }
                  ]}
                />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Effective Date">
                <FormInput type="date" value={editingProgram.effective_date?.split('T')[0]} onChange={(v) => setEditingProgram({ ...editingProgram, effective_date: v })} />
              </FormField>
              <FormField label="Expiration Date">
                <FormInput type="date" value={editingProgram.expiration_date?.split('T')[0]} onChange={(v) => setEditingProgram({ ...editingProgram, expiration_date: v })} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Max Cap %">
                <FormInput type="number" value={editingProgram.max_cap_percent} onChange={(v) => setEditingProgram({ ...editingProgram, max_cap_percent: parseFloat(v) })} />
              </FormField>
              <FormField label="Annual Cap ($)">
                <FormInput type="number" value={editingProgram.annual_cap_dollars} onChange={(v) => setEditingProgram({ ...editingProgram, annual_cap_dollars: parseFloat(v) })} />
              </FormField>
            </div>
            <div style={{ display: 'flex', gap: '24px', margin: '16px 0' }}>
              <FormToggle checked={editingProgram.dlc_required} onChange={(v) => setEditingProgram({ ...editingProgram, dlc_required: v })} label="DLC Required" />
              <FormToggle checked={editingProgram.pre_approval_required} onChange={(v) => setEditingProgram({ ...editingProgram, pre_approval_required: v })} label="Pre-Approval Required" />
            </div>
            <FormField label="Program URL">
              <FormInput value={editingProgram.program_url} onChange={(v) => setEditingProgram({ ...editingProgram, program_url: v })} />
            </FormField>
            <ModalFooter onCancel={() => setEditingProgram(null)} onSave={handleSaveProgram} saving={saving} />
          </>
        )}
      </AdminModal>

      {/* Rate Modal */}
      <AdminModal isOpen={!!editingRate} onClose={() => setEditingRate(null)} title={editingRate?.id ? 'Edit Rate' : 'Add Rate'}>
        {editingRate && (
          <>
            <FormField label="Fixture Category" required>
              <FormSelect
                value={editingRate.fixture_category}
                onChange={(v) => setEditingRate({ ...editingRate, fixture_category: v })}
                options={FIXTURE_CATEGORIES.map(c => ({ value: c, label: c }))}
              />
            </FormField>
            <FormField label="Location Type">
              <FormSelect
                value={editingRate.location_type}
                onChange={(v) => setEditingRate({ ...editingRate, location_type: v })}
                options={[
                  { value: 'Indoor', label: 'Indoor' },
                  { value: 'Outdoor', label: 'Outdoor' },
                  { value: 'Both', label: 'Both' }
                ]}
                placeholder="Select location"
              />
            </FormField>
            <FormField label="Calculation Method" required>
              <FormSelect
                value={editingRate.calc_method}
                onChange={(v) => setEditingRate({ ...editingRate, calc_method: v })}
                options={[
                  { value: 'Per Watt Reduced', label: 'Per Watt Reduced' },
                  { value: 'Per Fixture', label: 'Per Fixture' },
                  { value: 'Custom', label: 'Custom' }
                ]}
              />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Rate" required>
                <FormInput type="number" step="0.01" value={editingRate.rate} onChange={(v) => setEditingRate({ ...editingRate, rate: parseFloat(v) })} />
              </FormField>
              <FormField label="Rate Unit">
                <FormInput value={editingRate.rate_unit} onChange={(v) => setEditingRate({ ...editingRate, rate_unit: v })} placeholder="e.g., /watt, /fixture" />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Min Watts">
                <FormInput type="number" value={editingRate.min_watts} onChange={(v) => setEditingRate({ ...editingRate, min_watts: parseInt(v) })} />
              </FormField>
              <FormField label="Max Watts">
                <FormInput type="number" value={editingRate.max_watts} onChange={(v) => setEditingRate({ ...editingRate, max_watts: parseInt(v) })} />
              </FormField>
            </div>
            <FormField label="Notes">
              <FormTextarea value={editingRate.notes} onChange={(v) => setEditingRate({ ...editingRate, notes: v })} />
            </FormField>
            <ModalFooter onCancel={() => setEditingRate(null)} onSave={handleSaveRate} saving={saving} />
          </>
        )}
      </AdminModal>
    </div>
  )
}
