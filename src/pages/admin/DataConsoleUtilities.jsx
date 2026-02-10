import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import AdminModal, { FormField, FormInput, FormSelect, FormTextarea, FormToggle, ModalFooter } from './components/AdminModal'
import { Badge } from './components/AdminStats'
import { Plus, Search, Edit2, Trash2, Download, Upload, Zap, CheckSquare, Square, Loader, ExternalLink } from 'lucide-react'

const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN', 'IA',
  'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT', 'VT',
  'VA', 'WA', 'WV', 'WI', 'WY'
]

const FIXTURE_CATEGORIES = [
  'Linear', 'High Bay', 'Low Bay', 'Outdoor Area', 'Outdoor Wall', 'Decorative', 'Refrigeration', 'Other'
]

const MEASURE_TYPES = [
  'LED Retrofit', 'LED New Construction', 'LED Exterior', 'Controls', 'DLC Listed', 'VFD', 'Rooftop Unit', 'Walk-in Cooler', 'Insulation', 'Other'
]

const MEASURE_CATEGORIES = [
  'Lighting', 'HVAC', 'Motors', 'Refrigeration', 'Building Envelope', 'Controls', 'Other'
]

const PROGRAM_CATEGORIES = [
  'Lighting', 'HVAC', 'Motors', 'Refrigeration', 'Building Envelope', 'Comprehensive'
]

const DELIVERY_MECHANISMS = [
  'Prescriptive', 'Custom', 'Midstream', 'Direct Install', 'SMBE', 'SBDI'
]

const FUNDING_STATUSES = [
  'Open', 'Waitlisted', 'Exhausted', 'Paused'
]

const RATE_TYPES = [
  'Flat', 'Tiered', 'Time-of-Use', 'Seasonal', 'Demand'
]

const CUSTOMER_CATEGORIES = [
  'Residential', 'Small Commercial', 'Large Commercial', 'Industrial', 'Agricultural'
]

export default function DataConsoleUtilities() {
  const [providers, setProviders] = useState([])
  const [programs, setPrograms] = useState([])
  const [incentives, setIncentives] = useState([])
  const [rateSchedules, setRateSchedules] = useState([])
  const [loading, setLoading] = useState({ providers: true, programs: false, incentives: false, rateSchedules: false })

  const [selectedProvider, setSelectedProvider] = useState(null)
  const [selectedProgram, setSelectedProgram] = useState(null)

  const [providerSearch, setProviderSearch] = useState('')
  const [stateFilter, setStateFilter] = useState('')

  const [editingProvider, setEditingProvider] = useState(null)
  const [editingProgram, setEditingProgram] = useState(null)
  const [editingIncentive, setEditingIncentive] = useState(null)
  const [editingRateSchedule, setEditingRateSchedule] = useState(null)
  const [saving, setSaving] = useState(false)

  // Detail modal state
  const [viewingProvider, setViewingProvider] = useState(null)
  const [viewingProgram, setViewingProgram] = useState(null)
  const [viewingIncentive, setViewingIncentive] = useState(null)
  const [viewingRateSchedule, setViewingRateSchedule] = useState(null)

  // AI Research state
  const [researchState, setResearchState] = useState('')
  const [researching, setResearching] = useState(false)
  const [researchResults, setResearchResults] = useState(null)
  const [showResearchModal, setShowResearchModal] = useState(false)
  const [checkedProviders, setCheckedProviders] = useState({})
  const [checkedPrograms, setCheckedPrograms] = useState({})
  const [checkedIncentives, setCheckedIncentives] = useState({})
  const [checkedRateSchedules, setCheckedRateSchedules] = useState({})
  const [importing, setImporting] = useState(false)

  useEffect(() => {
    fetchProviders()
  }, [])

  useEffect(() => {
    if (selectedProvider) {
      fetchPrograms(selectedProvider.provider_name)
      fetchRateSchedules(selectedProvider.id)
    } else {
      setPrograms([])
      setSelectedProgram(null)
      setRateSchedules([])
    }
  }, [selectedProvider])

  useEffect(() => {
    if (selectedProgram) {
      fetchIncentives(selectedProgram.id)
    } else {
      setIncentives([])
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

  const fetchIncentives = async (programId) => {
    setLoading(l => ({ ...l, incentives: true }))
    const { data } = await supabase
      .from('incentive_measures')
      .select('*')
      .eq('program_id', programId)
      .order('fixture_category')
    setIncentives(data || [])
    setLoading(l => ({ ...l, incentives: false }))
  }

  const fetchRateSchedules = async (providerId) => {
    setLoading(l => ({ ...l, rateSchedules: true }))
    const { data } = await supabase
      .from('utility_rate_schedules')
      .select('*')
      .eq('provider_id', providerId)
      .order('schedule_name')
    setRateSchedules(data || [])
    setLoading(l => ({ ...l, rateSchedules: false }))
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
    if (!confirm(`Delete ${provider.provider_name}? This will also delete all programs, incentives, and rate schedules.`)) return
    // Delete incentives for all programs under this provider first
    const { data: providerPrograms } = await supabase
      .from('utility_programs')
      .select('id')
      .eq('utility_name', provider.provider_name)
    if (providerPrograms?.length) {
      for (const prog of providerPrograms) {
        await supabase.from('incentive_measures').delete().eq('program_id', prog.id)
      }
    }
    // Delete rate schedules for this provider
    await supabase.from('utility_rate_schedules').delete().eq('provider_id', provider.id)
    // Delete programs
    await supabase.from('utility_programs').delete().eq('utility_name', provider.provider_name)
    // Delete the provider
    const { error } = await supabase.from('utility_providers').delete().eq('id', provider.id)
    if (error) {
      alert('Delete failed: ' + error.message)
      return
    }
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
    if (!confirm(`Delete ${program.program_name}? This will also delete its incentives.`)) return
    await supabase.from('incentive_measures').delete().eq('program_id', program.id)
    const { error } = await supabase.from('utility_programs').delete().eq('id', program.id)
    if (error) {
      alert('Delete failed: ' + error.message)
      return
    }
    await fetchPrograms(selectedProvider.provider_name)
    if (selectedProgram?.id === program.id) {
      setSelectedProgram(null)
    }
  }

  // Incentive CRUD
  const handleSaveIncentive = async () => {
    setSaving(true)
    try {
      const data = {
        ...editingIncentive,
        program_id: selectedProgram.id,
        rate: editingIncentive.rate_value ?? editingIncentive.rate,
        rate_value: editingIncentive.rate_value ?? editingIncentive.rate
      }
      if (editingIncentive.id) {
        await supabase.from('incentive_measures').update(data).eq('id', editingIncentive.id)
      } else {
        await supabase.from('incentive_measures').insert(data)
      }
      await fetchIncentives(selectedProgram.id)
      setEditingIncentive(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const handleDeleteIncentive = async (incentive) => {
    if (!confirm('Delete this incentive?')) return
    const { error } = await supabase.from('incentive_measures').delete().eq('id', incentive.id)
    if (error) {
      alert('Delete failed: ' + error.message)
      return
    }
    await fetchIncentives(selectedProgram.id)
  }

  // Rate Schedule CRUD
  const handleSaveRateSchedule = async () => {
    setSaving(true)
    try {
      const data = { ...editingRateSchedule, provider_id: selectedProvider.id }
      if (editingRateSchedule.id) {
        await supabase.from('utility_rate_schedules').update(data).eq('id', editingRateSchedule.id)
      } else {
        await supabase.from('utility_rate_schedules').insert(data)
      }
      await fetchRateSchedules(selectedProvider.id)
      setEditingRateSchedule(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const handleDeleteRateSchedule = async (schedule) => {
    if (!confirm('Delete this rate schedule?')) return
    const { error } = await supabase.from('utility_rate_schedules').delete().eq('id', schedule.id)
    if (error) {
      alert('Delete failed: ' + error.message)
      return
    }
    await fetchRateSchedules(selectedProvider.id)
  }

  // Delete All handlers
  const handleDeleteAllProviders = async () => {
    if (!confirm(`Delete ALL ${filteredProviders.length} providers${stateFilter ? ` in ${stateFilter}` : ''}? This will also delete their programs, incentives, and rate schedules. This cannot be undone.`)) return
    let errors = 0
    for (const p of filteredProviders) {
      const { data: providerPrograms } = await supabase
        .from('utility_programs')
        .select('id')
        .eq('utility_name', p.provider_name)
      if (providerPrograms?.length) {
        for (const prog of providerPrograms) {
          const { error: rateErr } = await supabase.from('incentive_measures').delete().eq('program_id', prog.id)
          if (rateErr) errors++
        }
      }
      const { error: schedErr } = await supabase.from('utility_rate_schedules').delete().eq('provider_id', p.id)
      if (schedErr) errors++
      const { error: progErr } = await supabase.from('utility_programs').delete().eq('utility_name', p.provider_name)
      if (progErr) errors++
      const { error } = await supabase.from('utility_providers').delete().eq('id', p.id)
      if (error) errors++
    }
    if (errors > 0) alert(`Completed with ${errors} error(s). Check console for details.`)
    await fetchProviders()
    setSelectedProvider(null)
  }

  const handleDeleteAllPrograms = async () => {
    if (!selectedProvider) return
    if (!confirm(`Delete ALL ${programs.length} programs for ${selectedProvider.provider_name}? This will also delete their incentives. This cannot be undone.`)) return
    let errors = 0
    for (const p of programs) {
      const { error: rateErr } = await supabase.from('incentive_measures').delete().eq('program_id', p.id)
      if (rateErr) errors++
    }
    for (const p of programs) {
      const { error } = await supabase.from('utility_programs').delete().eq('id', p.id)
      if (error) errors++
    }
    if (errors > 0) alert(`Completed with ${errors} error(s). Check console for details.`)
    await fetchPrograms(selectedProvider.provider_name)
    setSelectedProgram(null)
  }

  const handleDeleteAllIncentives = async () => {
    if (!selectedProgram) return
    if (!confirm(`Delete ALL ${incentives.length} incentives for ${selectedProgram.program_name}? This cannot be undone.`)) return
    let errors = 0
    for (const r of incentives) {
      const { error } = await supabase.from('incentive_measures').delete().eq('id', r.id)
      if (error) errors++
    }
    if (errors > 0) alert(`Completed with ${errors} error(s). Check console for details.`)
    await fetchIncentives(selectedProgram.id)
  }

  const handleDeleteAllRateSchedules = async () => {
    if (!selectedProvider) return
    if (!confirm(`Delete ALL ${rateSchedules.length} rate schedules for ${selectedProvider.provider_name}? This cannot be undone.`)) return
    let errors = 0
    for (const s of rateSchedules) {
      const { error } = await supabase.from('utility_rate_schedules').delete().eq('id', s.id)
      if (error) errors++
    }
    if (errors > 0) alert(`Completed with ${errors} error(s). Check console for details.`)
    await fetchRateSchedules(selectedProvider.id)
  }

  // AI Research
  const handleAIResearch = async () => {
    if (!researchState) {
      alert('Please select a state from the Research dropdown first.')
      return
    }

    setResearching(true)
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ai-utility-research`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ state: researchState === 'ALL' ? 'all US states' : researchState })
        }
      )

      const data = await response.json()

      if (data?.success && data?.results) {
        const results = data.results
        // Normalize: if old "rates" key present, map to "incentives"
        if (results.rates && !results.incentives) {
          results.incentives = results.rates
          delete results.rates
        }
        if (!results.rate_schedules) results.rate_schedules = []

        setResearchResults(results)
        // Default all items to checked
        const pChecked = {}
        results.providers.forEach((_, i) => { pChecked[i] = true })
        setCheckedProviders(pChecked)
        const prChecked = {}
        results.programs.forEach((_, i) => { prChecked[i] = true })
        setCheckedPrograms(prChecked)
        const iChecked = {}
        results.incentives.forEach((_, i) => { iChecked[i] = true })
        setCheckedIncentives(iChecked)
        const rsChecked = {}
        results.rate_schedules.forEach((_, i) => { rsChecked[i] = true })
        setCheckedRateSchedules(rsChecked)
        setShowResearchModal(true)
      } else {
        alert('Research failed: ' + (data?.error || 'Unknown error'))
      }
    } catch (err) {
      alert('Research error: ' + err.message)
    }
    setResearching(false)
  }

  const handleImportSelected = async () => {
    if (!researchResults) return
    setImporting(true)

    try {
      // 1. Insert selected providers
      const selectedProvidersList = researchResults.providers.filter((_, i) => checkedProviders[i])
      const providerNameMap = {}

      for (const p of selectedProvidersList) {
        const { data, error } = await supabase
          .from('utility_providers')
          .insert({
            provider_name: p.provider_name,
            state: p.state,
            service_territory: p.service_territory || null,
            has_rebate_program: p.has_rebate_program ?? true,
            rebate_program_url: p.rebate_program_url || null,
            contact_phone: p.contact_phone || null,
            notes: p.notes || null
          })
          .select()
          .single()

        if (error) {
          console.error('Provider insert error:', error)
          continue
        }
        providerNameMap[p.provider_name] = data
      }

      // 2. Insert selected programs
      const selectedProgramsList = researchResults.programs.filter((_, i) => checkedPrograms[i])
      const programNameMap = {}

      for (const pr of selectedProgramsList) {
        const { data, error } = await supabase
          .from('utility_programs')
          .insert({
            utility_name: pr.provider_name,
            program_name: pr.program_name,
            program_type: pr.program_type || 'Prescriptive',
            program_category: pr.program_category || 'Lighting',
            delivery_mechanism: pr.delivery_mechanism || null,
            business_size: pr.business_size || 'All',
            dlc_required: pr.dlc_required ?? false,
            pre_approval_required: pr.pre_approval_required ?? false,
            application_required: pr.application_required ?? false,
            post_inspection_required: pr.post_inspection_required ?? false,
            contractor_prequalification: pr.contractor_prequalification ?? false,
            program_url: pr.program_url || null,
            max_cap_percent: pr.max_cap_percent || null,
            annual_cap_dollars: pr.annual_cap_dollars || null,
            source_year: pr.source_year || null,
            eligible_sectors: pr.eligible_sectors || null,
            eligible_building_types: pr.eligible_building_types || null,
            required_documents: pr.required_documents || null,
            stacking_allowed: pr.stacking_allowed ?? true,
            stacking_rules: pr.stacking_rules || null,
            funding_status: pr.funding_status || 'Open',
            processing_time_days: pr.processing_time_days || null,
            rebate_payment_method: pr.rebate_payment_method || null,
            program_notes_ai: pr.program_notes_ai || null
          })
          .select()
          .single()

        if (error) {
          console.error('Program insert error:', error)
          continue
        }
        programNameMap[`${pr.provider_name}|${pr.program_name}`] = data
      }

      // 3. Insert selected incentives
      const selectedIncentivesList = researchResults.incentives.filter((_, i) => checkedIncentives[i])

      for (const r of selectedIncentivesList) {
        const programKey = `${r.provider_name}|${r.program_name}`
        const program = programNameMap[programKey]
        if (!program) {
          console.warn('Skipping incentive - program not found:', programKey)
          continue
        }

        const { error } = await supabase
          .from('incentive_measures')
          .insert({
            program_id: program.id,
            fixture_category: r.fixture_category,
            measure_category: r.measure_category || 'Lighting',
            measure_subcategory: r.measure_subcategory || null,
            measure_type: r.measure_type || 'LED Retrofit',
            calc_method: r.calc_method || 'Per Watt Reduced',
            rate: r.rate_value ?? r.rate,
            rate_value: r.rate_value ?? r.rate,
            rate_unit: r.rate_unit || '/watt',
            tier: r.tier || null,
            cap_amount: r.cap_amount || null,
            cap_percent: r.cap_percent || null,
            per_unit_cap: r.per_unit_cap || null,
            equipment_requirements: r.equipment_requirements || null,
            installation_requirements: r.installation_requirements || null,
            baseline_description: r.baseline_description || null,
            replacement_description: r.replacement_description || null,
            requirements: r.requirements || null,
            effective_date: r.effective_date || null,
            expiration_date: r.expiration_date || null,
            min_watts: r.min_watts || null,
            max_watts: r.max_watts || null,
            notes: r.notes || null
          })

        if (error) {
          console.error('Incentive insert error:', error)
        }
      }

      // 4. Insert selected rate schedules
      const selectedSchedulesList = researchResults.rate_schedules.filter((_, i) => checkedRateSchedules[i])

      for (const rs of selectedSchedulesList) {
        // Match provider_name to get provider_id
        const provider = providerNameMap[rs.provider_name]
        if (!provider) {
          console.warn('Skipping rate schedule - provider not found:', rs.provider_name)
          continue
        }

        const { error } = await supabase
          .from('utility_rate_schedules')
          .insert({
            provider_id: provider.id,
            schedule_name: rs.schedule_name,
            customer_category: rs.customer_category || null,
            rate_type: rs.rate_type || 'Flat',
            rate_per_kwh: rs.rate_per_kwh || null,
            peak_rate_per_kwh: rs.peak_rate_per_kwh || null,
            off_peak_rate_per_kwh: rs.off_peak_rate_per_kwh || null,
            summer_rate_per_kwh: rs.summer_rate_per_kwh || null,
            winter_rate_per_kwh: rs.winter_rate_per_kwh || null,
            demand_charge: rs.demand_charge || null,
            min_demand_charge: rs.min_demand_charge || null,
            customer_charge: rs.customer_charge || null,
            time_of_use: rs.time_of_use ?? false,
            effective_date: rs.effective_date || null,
            source_url: rs.source_url || null,
            description: rs.description || null,
            notes: rs.notes || null
          })

        if (error) {
          console.error('Rate schedule insert error:', error)
        }
      }

      // Refresh data
      await fetchProviders()
      setSelectedProvider(null)
      setShowResearchModal(false)
      setResearchResults(null)
    } catch (err) {
      alert('Import error: ' + err.message)
    }
    setImporting(false)
  }

  const filteredProviders = providers.filter(p => {
    const matchesSearch = p.provider_name?.toLowerCase().includes(providerSearch.toLowerCase())
    const matchesState = !stateFilter || p.state === stateFilter
    return matchesSearch && matchesState
  })

  // Detail row helper for detail modals
  const DetailRow = ({ label, value, isUrl }) => {
    if (value === null || value === undefined || value === '') return null
    return (
      <div style={{ display: 'flex', padding: '8px 0', borderBottom: `1px solid ${adminTheme.border}` }}>
        <span style={{ color: adminTheme.textMuted, fontSize: '13px', width: '160px', flexShrink: 0 }}>{label}</span>
        {isUrl ? (
          <a href={value} target="_blank" rel="noopener noreferrer" style={{ color: adminTheme.accent, fontSize: '13px', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '4px', wordBreak: 'break-all' }}>
            {value} <ExternalLink size={12} />
          </a>
        ) : (
          <span style={{ color: adminTheme.text, fontSize: '13px', flex: 1, wordBreak: 'break-word' }}>{String(value)}</span>
        )}
      </div>
    )
  }

  // Checkbox helper
  const Checkbox = ({ checked, onChange }) => (
    <div
      onClick={(e) => { e.stopPropagation(); onChange(!checked) }}
      style={{ cursor: 'pointer', color: checked ? adminTheme.accent : adminTheme.textMuted, flexShrink: 0 }}
    >
      {checked ? <CheckSquare size={18} /> : <Square size={18} />}
    </div>
  )

  return (
    <div style={{ padding: '24px', height: 'calc(100vh - 48px)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700' }}>
          Utilities & Rebates
        </h1>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
          <span style={{ color: adminTheme.textMuted, fontSize: '13px' }}>
            {providers.length} Providers | {programs.length} Programs | {incentives.length} Incentives | {rateSchedules.length} Schedules
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: adminTheme.textMuted, fontSize: '12px' }}>Research:</span>
            <select
              value={researchState}
              onChange={(e) => setResearchState(e.target.value)}
              style={{
                padding: '8px',
                backgroundColor: adminTheme.bgInput,
                border: `1px solid ${adminTheme.border}`,
                borderRadius: '6px',
                color: adminTheme.text,
                fontSize: '13px'
              }}
            >
              <option value="">Select</option>
              <option value="ALL">All States</option>
              {US_STATES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <button
            onClick={handleAIResearch}
            disabled={researching || !researchState}
            style={{
              padding: '8px 16px',
              backgroundColor: (researching || !researchState) ? adminTheme.border : adminTheme.accentBg,
              border: 'none',
              borderRadius: '8px',
              color: (researching || !researchState) ? adminTheme.textMuted : adminTheme.accent,
              fontSize: '13px',
              cursor: (researching || !researchState) ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            {researching ? <Loader size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <Zap size={16} />}
            {researching ? 'Researching...' : 'AI Research'}
          </button>
        </div>
      </div>

      <style>{`
        .util-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; flex: 1; overflow: auto; min-height: 0; }
        @media (max-width: 1400px) { .util-grid { grid-template-columns: repeat(2, 1fr); } }
        @media (max-width: 900px) { .util-grid { grid-template-columns: 1fr; } }
        .util-panel { min-width: 0; min-height: 280px; display: flex; flex-direction: column; overflow: hidden; }
        @media (max-width: 1400px) { .util-panel { min-height: 300px; } }
        @media (max-width: 480px) {
          .util-grid { gap: 8px; }
          .util-panel { min-height: 200px; }
          .util-panel button { min-height: 36px; }
        }
      `}</style>

      {/* Four Panel Layout */}
      <div className="util-grid">
        {/* Panel 1 - Providers */}
        <div className="util-panel" style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
        }}>
          <div style={{ padding: '12px', borderBottom: `1px solid ${adminTheme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span style={{ color: adminTheme.text, fontWeight: '600', fontSize: '13px' }}>Providers</span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {filteredProviders.length > 0 && (
                  <button
                    onClick={handleDeleteAllProviders}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${adminTheme.error}`,
                      borderRadius: '6px',
                      color: adminTheme.error,
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Trash2 size={12} /> All
                  </button>
                )}
                <button
                  onClick={() => setEditingProvider({ provider_name: '', state: '', has_rebate_program: true })}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: adminTheme.accent,
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '11px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <input
                placeholder="Search..."
                value={providerSearch}
                onChange={(e) => setProviderSearch(e.target.value)}
                style={{
                  flex: 1,
                  padding: '6px 8px',
                  backgroundColor: adminTheme.bgInput,
                  border: `1px solid ${adminTheme.border}`,
                  borderRadius: '6px',
                  color: adminTheme.text,
                  fontSize: '12px'
                }}
              />
              <select
                value={stateFilter}
                onChange={(e) => setStateFilter(e.target.value)}
                style={{
                  padding: '6px',
                  backgroundColor: adminTheme.bgInput,
                  border: `1px solid ${adminTheme.border}`,
                  borderRadius: '6px',
                  color: adminTheme.text,
                  fontSize: '12px',
                  width: '60px'
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
              <div style={{ padding: '20px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '13px' }}>No providers</div>
            ) : (
              filteredProviders.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProvider(p)}
                  style={{
                    padding: '10px 12px',
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
                  <div style={{ minWidth: 0, flex: 1 }} onClick={(e) => { e.stopPropagation(); setSelectedProvider(p); setViewingProvider(p) }}>
                    <div style={{ color: adminTheme.text, fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.provider_name}</div>
                    <div style={{ display: 'flex', gap: '6px', marginTop: '3px' }}>
                      <Badge>{p.state}</Badge>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                    <button onClick={() => setEditingProvider(p)} style={{ padding: '3px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}>
                      <Edit2 size={13} />
                    </button>
                    <button onClick={() => handleDeleteProvider(p)} style={{ padding: '3px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 2 - Programs */}
        <div className="util-panel" style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
        }}>
          <div style={{ padding: '12px', borderBottom: `1px solid ${adminTheme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: adminTheme.text, fontWeight: '600', fontSize: '13px' }}>
                {selectedProvider ? 'Programs' : 'Programs'}
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {programs.length > 0 && (
                  <button
                    onClick={handleDeleteAllPrograms}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${adminTheme.error}`,
                      borderRadius: '6px',
                      color: adminTheme.error,
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Trash2 size={12} /> All
                  </button>
                )}
                <button
                  onClick={() => setEditingProgram({ program_name: '', program_type: 'Prescriptive', business_size: 'All' })}
                  disabled={!selectedProvider}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: selectedProvider ? adminTheme.accent : adminTheme.border,
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '11px',
                    cursor: selectedProvider ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!selectedProvider ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '13px' }}>
                Select a provider
              </div>
            ) : loading.programs ? (
              <div style={{ padding: '20px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
            ) : programs.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '13px' }}>
                No programs found
              </div>
            ) : (
              programs.map(p => (
                <div
                  key={p.id}
                  onClick={() => setSelectedProgram(p)}
                  style={{
                    padding: '10px 12px',
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
                    <div style={{ minWidth: 0, flex: 1 }} onClick={(e) => { e.stopPropagation(); setSelectedProgram(p); setViewingProgram(p) }}>
                      <div style={{ color: adminTheme.text, fontSize: '13px', fontWeight: '500', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.program_name}</div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                        <Badge color="accent">{p.program_type}</Badge>
                        <Badge>{p.business_size || 'All'}</Badge>
                        {p.source_year && <Badge color="accent">{p.source_year}</Badge>}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditingProgram(p)} style={{ padding: '3px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDeleteProgram(p)} style={{ padding: '3px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 3 - Incentives */}
        <div className="util-panel" style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
        }}>
          <div style={{ padding: '12px', borderBottom: `1px solid ${adminTheme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: adminTheme.text, fontWeight: '600', fontSize: '13px' }}>
                Incentives
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {incentives.length > 0 && (
                  <button
                    onClick={handleDeleteAllIncentives}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${adminTheme.error}`,
                      borderRadius: '6px',
                      color: adminTheme.error,
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Trash2 size={12} /> All
                  </button>
                )}
                <button
                  onClick={() => setEditingIncentive({ fixture_category: 'Linear', measure_type: 'LED Retrofit', calc_method: 'Per Watt Reduced', rate_value: 0, rate_unit: '/watt' })}
                  disabled={!selectedProgram}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: selectedProgram ? adminTheme.accent : adminTheme.border,
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '11px',
                    cursor: selectedProgram ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!selectedProgram ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '13px' }}>
                Select a program
              </div>
            ) : loading.incentives ? (
              <div style={{ padding: '20px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
            ) : incentives.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '13px' }}>
                No incentives defined
              </div>
            ) : (
              incentives.map(r => (
                <div
                  key={r.id}
                  onClick={() => setViewingIncentive(r)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: `1px solid ${adminTheme.border}`,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = adminTheme.bgHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: adminTheme.text, fontSize: '13px', fontWeight: '500' }}>{r.fixture_category}</span>
                        {r.measure_type && <Badge>{r.measure_type}</Badge>}
                      </div>
                      <div style={{ color: adminTheme.accent, fontSize: '15px', fontWeight: '600', marginTop: '3px' }}>
                        ${r.rate_value ?? r.rate} {r.rate_unit || '/watt'}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '2px', flexWrap: 'wrap' }}>
                        <Badge>{r.calc_method}</Badge>
                        {r.cap_amount && <span style={{ color: adminTheme.textMuted, fontSize: '11px' }}>Cap: ${r.cap_amount}</span>}
                        {r.cap_percent && <span style={{ color: adminTheme.textMuted, fontSize: '11px' }}>Cap: {r.cap_percent}%</span>}
                      </div>
                      {r.requirements && (
                        <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {r.requirements}
                        </div>
                      )}
                      {(r.min_watts || r.max_watts) && (
                        <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginTop: '1px' }}>
                          {r.min_watts || 0}W - {r.max_watts || '\u221E'}W
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditingIncentive(r)} style={{ padding: '3px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDeleteIncentive(r)} style={{ padding: '3px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Panel 4 - Rate Schedules */}
        <div className="util-panel" style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
        }}>
          <div style={{ padding: '12px', borderBottom: `1px solid ${adminTheme.border}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: adminTheme.text, fontWeight: '600', fontSize: '13px' }}>
                Rate Schedules
              </span>
              <div style={{ display: 'flex', gap: '4px' }}>
                {rateSchedules.length > 0 && (
                  <button
                    onClick={handleDeleteAllRateSchedules}
                    style={{
                      padding: '4px 8px',
                      backgroundColor: 'transparent',
                      border: `1px solid ${adminTheme.error}`,
                      borderRadius: '6px',
                      color: adminTheme.error,
                      fontSize: '11px',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '3px'
                    }}
                  >
                    <Trash2 size={12} /> All
                  </button>
                )}
                <button
                  onClick={() => setEditingRateSchedule({ schedule_name: '', customer_category: 'Small Commercial', rate_per_kwh: 0, time_of_use: false })}
                  disabled={!selectedProvider}
                  style={{
                    padding: '4px 8px',
                    backgroundColor: selectedProvider ? adminTheme.accent : adminTheme.border,
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontSize: '11px',
                    cursor: selectedProvider ? 'pointer' : 'not-allowed',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '3px'
                  }}
                >
                  <Plus size={12} /> Add
                </button>
              </div>
            </div>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {!selectedProvider ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '13px' }}>
                Select a provider
              </div>
            ) : loading.rateSchedules ? (
              <div style={{ padding: '20px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
            ) : rateSchedules.length === 0 ? (
              <div style={{ padding: '40px 16px', textAlign: 'center', color: adminTheme.textMuted, fontSize: '13px' }}>
                No rate schedules
              </div>
            ) : (
              rateSchedules.map(s => (
                <div
                  key={s.id}
                  onClick={() => setViewingRateSchedule(s)}
                  style={{
                    padding: '10px 12px',
                    borderBottom: `1px solid ${adminTheme.border}`,
                    cursor: 'pointer'
                  }}
                  onMouseEnter={(e) => { e.currentTarget.style.backgroundColor = adminTheme.bgHover }}
                  onMouseLeave={(e) => { e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ color: adminTheme.text, fontSize: '13px', fontWeight: '600' }}>{s.schedule_name}</div>
                      <div style={{ display: 'flex', gap: '4px', marginTop: '3px', flexWrap: 'wrap' }}>
                        {s.customer_category && <Badge>{s.customer_category}</Badge>}
                        {s.time_of_use && <Badge color="accent">TOU</Badge>}
                      </div>
                      <div style={{ color: adminTheme.accent, fontSize: '14px', fontWeight: '600', marginTop: '3px' }}>
                        {s.rate_per_kwh != null ? `$${Number(s.rate_per_kwh).toFixed(4)}/kWh` : '-'}
                        {s.demand_charge ? <span style={{ color: adminTheme.textMuted, fontSize: '12px', fontWeight: '400', marginLeft: '8px' }}>${s.demand_charge}/kW</span> : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: '2px', flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => setEditingRateSchedule(s)} style={{ padding: '3px', background: 'none', border: 'none', color: adminTheme.textMuted, cursor: 'pointer' }}>
                        <Edit2 size={13} />
                      </button>
                      <button onClick={() => handleDeleteRateSchedule(s)} style={{ padding: '3px', background: 'none', border: 'none', color: adminTheme.error, cursor: 'pointer' }}>
                        <Trash2 size={13} />
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <FormField label="Effective Date">
                <FormInput type="date" value={editingProgram.effective_date?.split('T')[0]} onChange={(v) => setEditingProgram({ ...editingProgram, effective_date: v })} />
              </FormField>
              <FormField label="Expiration Date">
                <FormInput type="date" value={editingProgram.expiration_date?.split('T')[0]} onChange={(v) => setEditingProgram({ ...editingProgram, expiration_date: v })} />
              </FormField>
              <FormField label="Source Year">
                <FormInput type="number" value={editingProgram.source_year} onChange={(v) => setEditingProgram({ ...editingProgram, source_year: v ? parseInt(v) : null })} placeholder="e.g. 2026" />
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

      {/* Incentive Modal */}
      <AdminModal isOpen={!!editingIncentive} onClose={() => setEditingIncentive(null)} title={editingIncentive?.id ? 'Edit Incentive' : 'Add Incentive'} width="600px">
        {editingIncentive && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Fixture Category" required>
                <FormSelect
                  value={editingIncentive.fixture_category}
                  onChange={(v) => setEditingIncentive({ ...editingIncentive, fixture_category: v })}
                  options={FIXTURE_CATEGORIES.map(c => ({ value: c, label: c }))}
                />
              </FormField>
              <FormField label="Measure Type">
                <FormSelect
                  value={editingIncentive.measure_type}
                  onChange={(v) => setEditingIncentive({ ...editingIncentive, measure_type: v })}
                  options={MEASURE_TYPES.map(m => ({ value: m, label: m }))}
                  placeholder="Select type"
                />
              </FormField>
            </div>
            <FormField label="Location Type">
              <FormSelect
                value={editingIncentive.location_type}
                onChange={(v) => setEditingIncentive({ ...editingIncentive, location_type: v })}
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
                value={editingIncentive.calc_method}
                onChange={(v) => setEditingIncentive({ ...editingIncentive, calc_method: v })}
                options={[
                  { value: 'Per Watt Reduced', label: 'Per Watt Reduced' },
                  { value: 'Per Fixture', label: 'Per Fixture' },
                  { value: 'Custom', label: 'Custom' }
                ]}
              />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Rate Value" required>
                <FormInput type="number" step="0.01" value={editingIncentive.rate_value} onChange={(v) => setEditingIncentive({ ...editingIncentive, rate_value: parseFloat(v) })} />
              </FormField>
              <FormField label="Rate Unit">
                <FormInput value={editingIncentive.rate_unit} onChange={(v) => setEditingIncentive({ ...editingIncentive, rate_unit: v })} placeholder="e.g., /watt, /fixture" />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Cap Amount ($)">
                <FormInput type="number" step="0.01" value={editingIncentive.cap_amount} onChange={(v) => setEditingIncentive({ ...editingIncentive, cap_amount: v ? parseFloat(v) : null })} />
              </FormField>
              <FormField label="Cap Percent (%)">
                <FormInput type="number" step="0.1" value={editingIncentive.cap_percent} onChange={(v) => setEditingIncentive({ ...editingIncentive, cap_percent: v ? parseFloat(v) : null })} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Min Watts">
                <FormInput type="number" value={editingIncentive.min_watts} onChange={(v) => setEditingIncentive({ ...editingIncentive, min_watts: parseInt(v) })} />
              </FormField>
              <FormField label="Max Watts">
                <FormInput type="number" value={editingIncentive.max_watts} onChange={(v) => setEditingIncentive({ ...editingIncentive, max_watts: parseInt(v) })} />
              </FormField>
            </div>
            <FormField label="Requirements">
              <FormTextarea value={editingIncentive.requirements} onChange={(v) => setEditingIncentive({ ...editingIncentive, requirements: v })} placeholder="Eligibility requirements..." />
            </FormField>
            <FormField label="Notes">
              <FormTextarea value={editingIncentive.notes} onChange={(v) => setEditingIncentive({ ...editingIncentive, notes: v })} />
            </FormField>
            <ModalFooter onCancel={() => setEditingIncentive(null)} onSave={handleSaveIncentive} saving={saving} />
          </>
        )}
      </AdminModal>

      {/* Rate Schedule Modal */}
      <AdminModal isOpen={!!editingRateSchedule} onClose={() => setEditingRateSchedule(null)} title={editingRateSchedule?.id ? 'Edit Rate Schedule' : 'Add Rate Schedule'} width="550px">
        {editingRateSchedule && (
          <>
            <FormField label="Schedule Name" required>
              <FormInput value={editingRateSchedule.schedule_name} onChange={(v) => setEditingRateSchedule({ ...editingRateSchedule, schedule_name: v })} placeholder="e.g. Schedule 6 - General Service" />
            </FormField>
            <FormField label="Customer Category">
              <FormSelect
                value={editingRateSchedule.customer_category}
                onChange={(v) => setEditingRateSchedule({ ...editingRateSchedule, customer_category: v })}
                options={CUSTOMER_CATEGORIES.map(c => ({ value: c, label: c }))}
                placeholder="Select category"
              />
            </FormField>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Rate ($/kWh)" required>
                <FormInput type="number" step="0.0001" value={editingRateSchedule.rate_per_kwh} onChange={(v) => setEditingRateSchedule({ ...editingRateSchedule, rate_per_kwh: parseFloat(v) })} placeholder="e.g. 0.0845" />
              </FormField>
              <FormField label="Demand Charge ($/kW)">
                <FormInput type="number" step="0.01" value={editingRateSchedule.demand_charge} onChange={(v) => setEditingRateSchedule({ ...editingRateSchedule, demand_charge: v ? parseFloat(v) : null })} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Effective Date">
                <FormInput type="date" value={editingRateSchedule.effective_date?.split('T')[0]} onChange={(v) => setEditingRateSchedule({ ...editingRateSchedule, effective_date: v || null })} />
              </FormField>
              <div style={{ paddingTop: '24px' }}>
                <FormToggle
                  checked={editingRateSchedule.time_of_use}
                  onChange={(v) => setEditingRateSchedule({ ...editingRateSchedule, time_of_use: v })}
                  label="Time of Use"
                />
              </div>
            </div>
            <FormField label="Description">
              <FormTextarea value={editingRateSchedule.description} onChange={(v) => setEditingRateSchedule({ ...editingRateSchedule, description: v })} />
            </FormField>
            <FormField label="Notes">
              <FormTextarea value={editingRateSchedule.notes} onChange={(v) => setEditingRateSchedule({ ...editingRateSchedule, notes: v })} />
            </FormField>
            <ModalFooter onCancel={() => setEditingRateSchedule(null)} onSave={handleSaveRateSchedule} saving={saving} />
          </>
        )}
      </AdminModal>

      {/* Provider Detail Modal */}
      <AdminModal isOpen={!!viewingProvider} onClose={() => setViewingProvider(null)} title="Provider Details" width="550px">
        {viewingProvider && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600' }}>{viewingProvider.provider_name}</div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px' }}>
                <Badge>{viewingProvider.state}</Badge>
                <Badge color={viewingProvider.has_rebate_program ? 'accent' : undefined}>
                  {viewingProvider.has_rebate_program ? 'Has Rebate Program' : 'No Rebate Program'}
                </Badge>
              </div>
            </div>
            <DetailRow label="State" value={viewingProvider.state} />
            <DetailRow label="Service Territory" value={viewingProvider.service_territory} />
            <DetailRow label="Contact Phone" value={viewingProvider.contact_phone} />
            <DetailRow label="Website" value={viewingProvider.rebate_program_url} isUrl />
            <DetailRow label="Has Rebate Program" value={viewingProvider.has_rebate_program ? 'Yes' : 'No'} />
            <DetailRow label="Notes" value={viewingProvider.notes} />
            {programs.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ color: adminTheme.text, fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
                  Linked Programs ({programs.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {programs.map(prog => (
                    <div key={prog.id} style={{
                      padding: '8px 10px',
                      backgroundColor: adminTheme.bgInput,
                      borderRadius: '6px',
                      border: `1px solid ${adminTheme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px'
                    }}>
                      <span style={{ color: adminTheme.text, fontSize: '13px' }}>{prog.program_name}</span>
                      <Badge color="accent">{prog.program_type}</Badge>
                      {prog.source_year && <Badge color="accent">{prog.source_year}</Badge>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </AdminModal>

      {/* Program Detail Modal */}
      <AdminModal isOpen={!!viewingProgram} onClose={() => setViewingProgram(null)} title="Program Details" width="650px">
        {viewingProgram && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600' }}>{viewingProgram.program_name}</span>
                {viewingProgram.source_year && (
                  <span style={{ padding: '2px 8px', backgroundColor: '#22c55e20', color: '#22c55e', borderRadius: '4px', fontSize: '13px', fontWeight: '600' }}>
                    {viewingProgram.source_year}
                  </span>
                )}
                {viewingProgram.funding_status && viewingProgram.funding_status !== 'Open' && (
                  <span style={{ padding: '2px 8px', backgroundColor: viewingProgram.funding_status === 'Exhausted' ? '#ef444420' : '#f59e0b20', color: viewingProgram.funding_status === 'Exhausted' ? '#ef4444' : '#f59e0b', borderRadius: '4px', fontSize: '12px', fontWeight: '600' }}>
                    {viewingProgram.funding_status}
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                <Badge color="accent">{viewingProgram.program_type}</Badge>
                {viewingProgram.delivery_mechanism && viewingProgram.delivery_mechanism !== viewingProgram.program_type && (
                  <Badge color="accent">{viewingProgram.delivery_mechanism}</Badge>
                )}
                <Badge>{viewingProgram.business_size || 'All'}</Badge>
                {viewingProgram.program_category && viewingProgram.program_category !== 'Lighting' && (
                  <Badge>{viewingProgram.program_category}</Badge>
                )}
              </div>
              {(viewingProgram.program_url || viewingProgram.pdf_url) && (
                <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                  {viewingProgram.program_url && (
                    <a href={viewingProgram.program_url} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 14px', backgroundColor: adminTheme.accentBg, color: adminTheme.accent, border: `1px solid ${adminTheme.accent}`, borderRadius: '6px', fontSize: '13px', fontWeight: '500', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <ExternalLink size={14} /> View Program Website
                    </a>
                  )}
                  {viewingProgram.pdf_url && (
                    <a href={viewingProgram.pdf_url} target="_blank" rel="noopener noreferrer" style={{ padding: '6px 14px', backgroundColor: adminTheme.bgInput, color: adminTheme.text, border: `1px solid ${adminTheme.border}`, borderRadius: '6px', fontSize: '13px', fontWeight: '500', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <Download size={14} /> Download PDF
                    </a>
                  )}
                </div>
              )}
            </div>
            <DetailRow label="Provider" value={viewingProgram.utility_name} />
            <DetailRow label="Program Type" value={viewingProgram.program_type} />
            <DetailRow label="Delivery Mechanism" value={viewingProgram.delivery_mechanism} />
            <DetailRow label="Program Category" value={viewingProgram.program_category} />
            <DetailRow label="Business Size" value={viewingProgram.business_size} />
            <DetailRow label="Source Year" value={viewingProgram.source_year} />
            <DetailRow label="Effective Date" value={viewingProgram.effective_date?.split('T')[0]} />
            <DetailRow label="Expiration Date" value={viewingProgram.expiration_date?.split('T')[0]} />
            <DetailRow label="Funding Status" value={viewingProgram.funding_status} />
            <DetailRow label="Processing Time" value={viewingProgram.processing_time_days ? `${viewingProgram.processing_time_days} days` : null} />
            <DetailRow label="Payment Method" value={viewingProgram.rebate_payment_method} />
            <DetailRow label="Pre-Approval Required" value={viewingProgram.pre_approval_required ? 'Yes' : 'No'} />
            <DetailRow label="Application Required" value={viewingProgram.application_required ? 'Yes' : 'No'} />
            <DetailRow label="Post-Inspection" value={viewingProgram.post_inspection_required ? 'Yes' : 'No'} />
            <DetailRow label="Contractor Prequal" value={viewingProgram.contractor_prequalification ? 'Yes' : 'No'} />
            <DetailRow label="DLC Required" value={viewingProgram.dlc_required ? 'Yes' : 'No'} />
            <DetailRow label="Max Cap Percent" value={viewingProgram.max_cap_percent ? `${viewingProgram.max_cap_percent}%` : null} />
            <DetailRow label="Annual Cap" value={viewingProgram.annual_cap_dollars ? `$${Number(viewingProgram.annual_cap_dollars).toLocaleString()}` : null} />
            <DetailRow label="Eligible Sectors" value={viewingProgram.eligible_sectors?.length ? viewingProgram.eligible_sectors.join(', ') : null} />
            <DetailRow label="Building Types" value={viewingProgram.eligible_building_types?.length ? viewingProgram.eligible_building_types.join(', ') : null} />
            <DetailRow label="Required Documents" value={viewingProgram.required_documents?.length ? viewingProgram.required_documents.join(', ') : null} />
            <DetailRow label="Stacking Allowed" value={viewingProgram.stacking_allowed === false ? 'No' : viewingProgram.stacking_allowed === true ? 'Yes' : null} />
            <DetailRow label="Stacking Rules" value={viewingProgram.stacking_rules} />
            <DetailRow label="Program URL" value={viewingProgram.program_url} isUrl />
            <DetailRow label="AI Notes" value={viewingProgram.program_notes_ai} />
            <DetailRow label="Notes" value={viewingProgram.notes} />
            {incentives.length > 0 && (
              <div style={{ marginTop: '16px' }}>
                <div style={{ color: adminTheme.text, fontSize: '13px', fontWeight: '600', marginBottom: '8px' }}>
                  Linked Incentives ({incentives.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {incentives.map(inc => (
                    <div key={inc.id} style={{
                      padding: '8px 10px',
                      backgroundColor: adminTheme.bgInput,
                      borderRadius: '6px',
                      border: `1px solid ${adminTheme.border}`,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      flexWrap: 'wrap'
                    }}>
                      <span style={{ color: adminTheme.text, fontSize: '13px' }}>{inc.fixture_category}</span>
                      {inc.measure_type && <Badge>{inc.measure_type}</Badge>}
                      <span style={{ color: adminTheme.accent, fontWeight: '600', fontSize: '13px' }}>
                        ${inc.rate_value ?? inc.rate}{inc.rate_unit || '/watt'}
                      </span>
                      <Badge>{inc.calc_method}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </AdminModal>

      {/* Incentive Detail Modal */}
      <AdminModal isOpen={!!viewingIncentive} onClose={() => setViewingIncentive(null)} title="Incentive Details" width="600px">
        {viewingIncentive && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                <span style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600' }}>{viewingIncentive.fixture_category}</span>
                {viewingIncentive.measure_type && <Badge>{viewingIncentive.measure_type}</Badge>}
                {viewingIncentive.measure_category && viewingIncentive.measure_category !== 'Lighting' && (
                  <Badge color="accent">{viewingIncentive.measure_category}</Badge>
                )}
                {viewingIncentive.tier && <Badge color="accent">{viewingIncentive.tier}</Badge>}
              </div>
              <div style={{ color: adminTheme.accent, fontSize: '22px', fontWeight: '700', marginTop: '6px' }}>
                ${viewingIncentive.rate_value ?? viewingIncentive.rate} {viewingIncentive.rate_unit || '/watt'}
              </div>
              {viewingIncentive.measure_subcategory && (
                <div style={{ color: adminTheme.textMuted, fontSize: '13px', marginTop: '4px' }}>{viewingIncentive.measure_subcategory}</div>
              )}
            </div>
            <DetailRow label="Measure Category" value={viewingIncentive.measure_category} />
            <DetailRow label="Subcategory" value={viewingIncentive.measure_subcategory} />
            <DetailRow label="Measure Type" value={viewingIncentive.measure_type} />
            <DetailRow label="Fixture Category" value={viewingIncentive.fixture_category} />
            <DetailRow label="Tier" value={viewingIncentive.tier} />
            <DetailRow label="Calculation Method" value={viewingIncentive.calc_method} />
            <DetailRow label="Rate Value" value={viewingIncentive.rate_value ?? viewingIncentive.rate} />
            <DetailRow label="Rate Unit" value={viewingIncentive.rate_unit} />
            <DetailRow label="Min Watts" value={viewingIncentive.min_watts} />
            <DetailRow label="Max Watts" value={viewingIncentive.max_watts} />
            <DetailRow label="Cap Amount" value={viewingIncentive.cap_amount ? `$${viewingIncentive.cap_amount}` : null} />
            <DetailRow label="Cap Percent" value={viewingIncentive.cap_percent ? `${viewingIncentive.cap_percent}%` : null} />
            <DetailRow label="Per Unit Cap" value={viewingIncentive.per_unit_cap ? `$${viewingIncentive.per_unit_cap}` : null} />
            <DetailRow label="Project Cap %" value={viewingIncentive.project_cap_percent ? `${viewingIncentive.project_cap_percent}%` : null} />
            <DetailRow label="Equipment Req." value={viewingIncentive.equipment_requirements} />
            <DetailRow label="Installation Req." value={viewingIncentive.installation_requirements} />
            <DetailRow label="Baseline" value={viewingIncentive.baseline_description} />
            <DetailRow label="Replacement" value={viewingIncentive.replacement_description} />
            <DetailRow label="Requirements" value={viewingIncentive.requirements} />
            <DetailRow label="Effective Date" value={viewingIncentive.effective_date?.split('T')[0]} />
            <DetailRow label="Expiration Date" value={viewingIncentive.expiration_date?.split('T')[0]} />
            <DetailRow label="Location Type" value={viewingIncentive.location_type} />
            <DetailRow label="Notes" value={viewingIncentive.notes} />
          </div>
        )}
      </AdminModal>

      {/* Rate Schedule Detail Modal */}
      <AdminModal isOpen={!!viewingRateSchedule} onClose={() => setViewingRateSchedule(null)} title="Rate Schedule Details" width="600px">
        {viewingRateSchedule && (
          <div>
            <div style={{ marginBottom: '16px' }}>
              <div style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600' }}>{viewingRateSchedule.schedule_name}</div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                {viewingRateSchedule.customer_category && <Badge>{viewingRateSchedule.customer_category}</Badge>}
                {viewingRateSchedule.rate_type && viewingRateSchedule.rate_type !== 'Flat' && <Badge color="accent">{viewingRateSchedule.rate_type}</Badge>}
                {viewingRateSchedule.time_of_use && <Badge color="accent">Time of Use</Badge>}
              </div>
              <div style={{ color: adminTheme.accent, fontSize: '22px', fontWeight: '700', marginTop: '8px' }}>
                {viewingRateSchedule.rate_per_kwh != null ? `$${Number(viewingRateSchedule.rate_per_kwh).toFixed(4)}/kWh` : '-'}
              </div>
            </div>
            <DetailRow label="Schedule Name" value={viewingRateSchedule.schedule_name} />
            <DetailRow label="Customer Category" value={viewingRateSchedule.customer_category} />
            <DetailRow label="Rate Type" value={viewingRateSchedule.rate_type} />
            <DetailRow label="Base Rate" value={viewingRateSchedule.rate_per_kwh != null ? `$${Number(viewingRateSchedule.rate_per_kwh).toFixed(4)}/kWh` : null} />
            <DetailRow label="Peak Rate" value={viewingRateSchedule.peak_rate_per_kwh != null ? `$${Number(viewingRateSchedule.peak_rate_per_kwh).toFixed(4)}/kWh` : null} />
            <DetailRow label="Off-Peak Rate" value={viewingRateSchedule.off_peak_rate_per_kwh != null ? `$${Number(viewingRateSchedule.off_peak_rate_per_kwh).toFixed(4)}/kWh` : null} />
            <DetailRow label="Summer Rate" value={viewingRateSchedule.summer_rate_per_kwh != null ? `$${Number(viewingRateSchedule.summer_rate_per_kwh).toFixed(4)}/kWh` : null} />
            <DetailRow label="Winter Rate" value={viewingRateSchedule.winter_rate_per_kwh != null ? `$${Number(viewingRateSchedule.winter_rate_per_kwh).toFixed(4)}/kWh` : null} />
            <DetailRow label="Demand Charge" value={viewingRateSchedule.demand_charge ? `$${viewingRateSchedule.demand_charge}/kW` : null} />
            <DetailRow label="Min Demand Charge" value={viewingRateSchedule.min_demand_charge ? `$${viewingRateSchedule.min_demand_charge}/mo` : null} />
            <DetailRow label="Customer Charge" value={viewingRateSchedule.customer_charge ? `$${viewingRateSchedule.customer_charge}/mo` : null} />
            <DetailRow label="Time of Use" value={viewingRateSchedule.time_of_use ? 'Yes' : 'No'} />
            <DetailRow label="Description" value={viewingRateSchedule.description} />
            <DetailRow label="Effective Date" value={viewingRateSchedule.effective_date?.split('T')[0]} />
            <DetailRow label="Source URL" value={viewingRateSchedule.source_url} isUrl />
            <DetailRow label="Notes" value={viewingRateSchedule.notes} />
          </div>
        )}
      </AdminModal>

      {/* AI Research Review Modal */}
      <AdminModal
        isOpen={showResearchModal}
        onClose={() => setShowResearchModal(false)}
        title={`AI Research Results \u2014 ${researchResults?.providers?.[0]?.state || ''}`}
        width="1000px"
      >
        {researchResults && (
          <>
            <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>

            {/* Providers Section */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: adminTheme.text, fontWeight: '600', fontSize: '14px' }}>
                  Providers ({researchResults.providers.length})
                </span>
                <button
                  onClick={() => {
                    const allChecked = researchResults.providers.every((_, i) => checkedProviders[i])
                    const next = {}
                    researchResults.providers.forEach((_, i) => { next[i] = !allChecked })
                    setCheckedProviders(next)
                  }}
                  style={{ background: 'none', border: 'none', color: adminTheme.accent, fontSize: '12px', cursor: 'pointer' }}
                >
                  {researchResults.providers.every((_, i) => checkedProviders[i]) ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {researchResults.providers.map((p, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 10px',
                    backgroundColor: adminTheme.bgInput,
                    borderRadius: '6px',
                    border: `1px solid ${adminTheme.border}`
                  }}>
                    <Checkbox checked={!!checkedProviders[i]} onChange={(v) => setCheckedProviders({ ...checkedProviders, [i]: v })} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: adminTheme.text, fontWeight: '500', fontSize: '13px' }}>{p.provider_name}</span>
                        <Badge>{p.state}</Badge>
                        {p.has_rebate_program && <Badge color="accent">Rebate Program</Badge>}
                      </div>
                      {p.service_territory && (
                        <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginTop: '2px' }}>
                          Territory: {p.service_territory}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Programs Section */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: adminTheme.text, fontWeight: '600', fontSize: '14px' }}>
                  Programs ({researchResults.programs.length})
                </span>
                <button
                  onClick={() => {
                    const allChecked = researchResults.programs.every((_, i) => checkedPrograms[i])
                    const next = {}
                    researchResults.programs.forEach((_, i) => { next[i] = !allChecked })
                    setCheckedPrograms(next)
                  }}
                  style={{ background: 'none', border: 'none', color: adminTheme.accent, fontSize: '12px', cursor: 'pointer' }}
                >
                  {researchResults.programs.every((_, i) => checkedPrograms[i]) ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {researchResults.programs.map((pr, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 10px',
                    backgroundColor: adminTheme.bgInput,
                    borderRadius: '6px',
                    border: `1px solid ${adminTheme.border}`
                  }}>
                    <Checkbox checked={!!checkedPrograms[i]} onChange={(v) => setCheckedPrograms({ ...checkedPrograms, [i]: v })} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: adminTheme.text, fontWeight: '500', fontSize: '13px' }}>{pr.program_name}</span>
                        <Badge color="accent">{pr.program_type}</Badge>
                        <Badge>{pr.business_size || 'All'}</Badge>
                        {pr.source_year && (
                          <span style={{
                            padding: '1px 6px',
                            backgroundColor: '#22c55e20',
                            color: '#22c55e',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: '600'
                          }}>
                            {pr.source_year}
                          </span>
                        )}
                      </div>
                      <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginTop: '2px' }}>
                        {pr.provider_name}
                        {pr.delivery_mechanism && pr.delivery_mechanism !== pr.program_type && ` \u2022 ${pr.delivery_mechanism}`}
                        {pr.program_category && pr.program_category !== 'Lighting' && ` \u2022 ${pr.program_category}`}
                        {pr.dlc_required && ' \u2022 DLC Required'}
                        {pr.pre_approval_required && ' \u2022 Pre-Approval'}
                        {pr.funding_status && pr.funding_status !== 'Open' && ` \u2022 ${pr.funding_status}`}
                        {pr.stacking_allowed === false && ' \u2022 No Stacking'}
                        {pr.required_documents?.length > 0 && ` \u2022 ${pr.required_documents.length} docs required`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Incentives Section */}
            <div style={{ marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <span style={{ color: adminTheme.text, fontWeight: '600', fontSize: '14px' }}>
                  Incentives ({researchResults.incentives.length})
                </span>
                <button
                  onClick={() => {
                    const allChecked = researchResults.incentives.every((_, i) => checkedIncentives[i])
                    const next = {}
                    researchResults.incentives.forEach((_, i) => { next[i] = !allChecked })
                    setCheckedIncentives(next)
                  }}
                  style={{ background: 'none', border: 'none', color: adminTheme.accent, fontSize: '12px', cursor: 'pointer' }}
                >
                  {researchResults.incentives.every((_, i) => checkedIncentives[i]) ? 'Deselect All' : 'Select All'}
                </button>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {researchResults.incentives.map((r, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '8px',
                    padding: '8px 10px',
                    backgroundColor: adminTheme.bgInput,
                    borderRadius: '6px',
                    border: `1px solid ${adminTheme.border}`
                  }}>
                    <Checkbox checked={!!checkedIncentives[i]} onChange={(v) => setCheckedIncentives({ ...checkedIncentives, [i]: v })} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                        <span style={{ color: adminTheme.text, fontWeight: '500', fontSize: '13px' }}>{r.fixture_category}</span>
                        {r.measure_category && r.measure_category !== 'Lighting' && <Badge color="accent">{r.measure_category}</Badge>}
                        {r.measure_type && <Badge>{r.measure_type}</Badge>}
                        {r.tier && <Badge color="accent">{r.tier}</Badge>}
                        <span style={{ color: adminTheme.accent, fontWeight: '600', fontSize: '13px' }}>
                          ${r.rate_value ?? r.rate}{r.rate_unit || '/watt'}
                        </span>
                        <Badge>{r.calc_method}</Badge>
                      </div>
                      <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginTop: '2px' }}>
                        {r.provider_name} \u2014 {r.program_name}
                        {r.cap_amount && ` \u2022 Cap: $${r.cap_amount}`}
                        {r.cap_percent && ` \u2022 Cap: ${r.cap_percent}%`}
                        {r.effective_date && ` \u2022 From: ${r.effective_date}`}
                        {r.expiration_date && ` \u2022 Until: ${r.expiration_date}`}
                      </div>
                      {(r.equipment_requirements || r.baseline_description) && (
                        <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginTop: '1px' }}>
                          {r.equipment_requirements && `Equip: ${r.equipment_requirements}`}
                          {r.equipment_requirements && r.baseline_description && ' \u2022 '}
                          {r.baseline_description && `Baseline: ${r.baseline_description}`}
                        </div>
                      )}
                      {r.requirements && (
                        <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginTop: '1px', fontStyle: 'italic' }}>
                          {r.requirements}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Rate Schedules Section */}
            {researchResults.rate_schedules.length > 0 && (
              <div style={{ marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span style={{ color: adminTheme.text, fontWeight: '600', fontSize: '14px' }}>
                    Rate Schedules ({researchResults.rate_schedules.length})
                  </span>
                  <button
                    onClick={() => {
                      const allChecked = researchResults.rate_schedules.every((_, i) => checkedRateSchedules[i])
                      const next = {}
                      researchResults.rate_schedules.forEach((_, i) => { next[i] = !allChecked })
                      setCheckedRateSchedules(next)
                    }}
                    style={{ background: 'none', border: 'none', color: adminTheme.accent, fontSize: '12px', cursor: 'pointer' }}
                  >
                    {researchResults.rate_schedules.every((_, i) => checkedRateSchedules[i]) ? 'Deselect All' : 'Select All'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {researchResults.rate_schedules.map((rs, i) => (
                    <div key={i} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '8px',
                      padding: '8px 10px',
                      backgroundColor: adminTheme.bgInput,
                      borderRadius: '6px',
                      border: `1px solid ${adminTheme.border}`
                    }}>
                      <Checkbox checked={!!checkedRateSchedules[i]} onChange={(v) => setCheckedRateSchedules({ ...checkedRateSchedules, [i]: v })} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                          <span style={{ color: adminTheme.text, fontWeight: '500', fontSize: '13px' }}>{rs.schedule_name}</span>
                          {rs.customer_category && <Badge>{rs.customer_category}</Badge>}
                          {rs.rate_type && rs.rate_type !== 'Flat' && <Badge color="accent">{rs.rate_type}</Badge>}
                          {rs.time_of_use && <Badge color="accent">TOU</Badge>}
                        </div>
                        <div style={{ display: 'flex', gap: '12px', marginTop: '2px', flexWrap: 'wrap' }}>
                          <span style={{ color: adminTheme.accent, fontWeight: '600', fontSize: '13px' }}>
                            {rs.rate_per_kwh != null ? `$${Number(rs.rate_per_kwh).toFixed(4)}/kWh` : '-'}
                          </span>
                          {rs.peak_rate_per_kwh != null && (
                            <span style={{ color: adminTheme.textMuted, fontSize: '12px' }}>
                              Peak: ${Number(rs.peak_rate_per_kwh).toFixed(4)}
                            </span>
                          )}
                          {rs.off_peak_rate_per_kwh != null && (
                            <span style={{ color: adminTheme.textMuted, fontSize: '12px' }}>
                              Off-Peak: ${Number(rs.off_peak_rate_per_kwh).toFixed(4)}
                            </span>
                          )}
                          {rs.demand_charge && (
                            <span style={{ color: adminTheme.textMuted, fontSize: '12px' }}>
                              ${rs.demand_charge}/kW demand
                            </span>
                          )}
                        </div>
                        <div style={{ color: adminTheme.textMuted, fontSize: '11px', marginTop: '1px' }}>
                          {rs.provider_name}
                          {rs.effective_date && ` \u2022 Effective: ${rs.effective_date}`}
                          {rs.source_url && ` \u2022 Source available`}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Import Footer */}
            <div style={{
              display: 'flex',
              gap: '12px',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: '20px',
              paddingTop: '16px',
              borderTop: `1px solid ${adminTheme.border}`
            }}>
              <span style={{ color: adminTheme.textMuted, fontSize: '12px' }}>
                {Object.values(checkedProviders).filter(Boolean).length} providers,{' '}
                {Object.values(checkedPrograms).filter(Boolean).length} programs,{' '}
                {Object.values(checkedIncentives).filter(Boolean).length} incentives,{' '}
                {Object.values(checkedRateSchedules).filter(Boolean).length} schedules
              </span>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  onClick={() => setShowResearchModal(false)}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: adminTheme.bgHover,
                    color: adminTheme.text,
                    border: `1px solid ${adminTheme.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    cursor: 'pointer'
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleImportSelected}
                  disabled={importing}
                  style={{
                    padding: '10px 20px',
                    backgroundColor: importing ? adminTheme.border : adminTheme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: importing ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  {importing ? 'Importing...' : 'Import Selected'}
                </button>
              </div>
            </div>
          </>
        )}
      </AdminModal>
    </div>
  )
}
