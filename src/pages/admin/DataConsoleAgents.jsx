import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { adminTheme } from './components/adminTheme'
import AdminStats from './components/AdminStats'
import AdminModal, { FormField, FormInput, FormSelect, FormTextarea, FormToggle, ModalFooter } from './components/AdminModal'
import { Badge } from './components/AdminStats'
import {
  Bot, Plus, Edit2, Users, Lightbulb, Truck, Wrench, Hammer, HardHat,
  Leaf, Droplets, Wind, Flame, Shield, Clipboard, Calculator, Brain
} from 'lucide-react'

const ICON_OPTIONS = [
  { value: 'Lightbulb', label: 'Lightbulb', icon: Lightbulb },
  { value: 'Truck', label: 'Truck', icon: Truck },
  { value: 'Wrench', label: 'Wrench', icon: Wrench },
  { value: 'Hammer', label: 'Hammer', icon: Hammer },
  { value: 'HardHat', label: 'Hard Hat', icon: HardHat },
  { value: 'Leaf', label: 'Leaf', icon: Leaf },
  { value: 'Droplets', label: 'Droplets', icon: Droplets },
  { value: 'Wind', label: 'Wind', icon: Wind },
  { value: 'Flame', label: 'Flame', icon: Flame },
  { value: 'Shield', label: 'Shield', icon: Shield },
  { value: 'Clipboard', label: 'Clipboard', icon: Clipboard },
  { value: 'Calculator', label: 'Calculator', icon: Calculator },
  { value: 'Brain', label: 'Brain', icon: Brain },
  { value: 'Bot', label: 'Bot', icon: Bot }
]

const TRADE_CATEGORIES = [
  'Energy', 'Operations', 'Fleet', 'Cleaning', 'Construction',
  'HVAC', 'Plumbing', 'Electrical', 'Landscaping', 'Security', 'General'
]

const STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'coming_soon', label: 'Coming Soon' },
  { value: 'disabled', label: 'Disabled' }
]

export default function DataConsoleAgents() {
  const [agents, setAgents] = useState([])
  const [recruitments, setRecruitments] = useState([])
  const [loading, setLoading] = useState(true)
  const [editingAgent, setEditingAgent] = useState(null)
  const [saving, setSaving] = useState(false)
  const [showRecruitments, setShowRecruitments] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [agentsRes, recruitmentsRes] = await Promise.all([
        supabase.from('agents').select('*').order('display_order'),
        supabase.from('company_agents').select('*, company:companies(id, name), agent:agents(name)')
      ])
      setAgents(agentsRes.data || [])
      setRecruitments(recruitmentsRes.data || [])
    } catch (err) {
      console.error('Error:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      const data = { ...editingAgent }
      if (editingAgent.id) {
        await supabase.from('agents').update(data).eq('id', editingAgent.id)
      } else {
        await supabase.from('agents').insert(data)
      }
      await fetchData()
      setEditingAgent(null)
    } catch (err) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  const getIcon = (iconName) => {
    const found = ICON_OPTIONS.find(i => i.value === iconName)
    return found ? found.icon : Bot
  }

  const getRecruitmentCount = (agentId) => {
    return recruitments.filter(r => r.agent_id === agentId).length
  }

  const stats = [
    { icon: Bot, label: 'Total Agents', value: agents.length },
    { icon: Bot, label: 'Active', value: agents.filter(a => a.status === 'active').length, color: adminTheme.success },
    { icon: Bot, label: 'Coming Soon', value: agents.filter(a => a.status === 'coming_soon').length, color: adminTheme.warning },
    { icon: Users, label: 'Recruitments', value: recruitments.length, color: adminTheme.accent }
  ]

  return (
    <div style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ color: adminTheme.text, fontSize: '24px', fontWeight: '700' }}>
          AI Agents
        </h1>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => setShowRecruitments(!showRecruitments)}
            style={{
              padding: '8px 16px',
              backgroundColor: showRecruitments ? adminTheme.accentBg : adminTheme.bgHover,
              border: `1px solid ${showRecruitments ? adminTheme.accent : adminTheme.border}`,
              borderRadius: '8px',
              color: showRecruitments ? adminTheme.accent : adminTheme.textMuted,
              fontSize: '13px',
              cursor: 'pointer'
            }}
          >
            {showRecruitments ? 'Show Agents' : 'Show Recruitments'}
          </button>
          <button
            onClick={() => setEditingAgent({
              slug: '',
              name: '',
              title: '',
              full_name: '',
              description: '',
              icon: 'Bot',
              trade_category: 'General',
              price_monthly: 0,
              price_yearly: 0,
              is_free: false,
              status: 'coming_soon',
              display_order: agents.length + 1
            })}
            style={{
              padding: '8px 16px',
              backgroundColor: adminTheme.accent,
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '13px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Plus size={16} /> Add Agent
          </button>
        </div>
      </div>

      <AdminStats stats={stats} />

      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: adminTheme.textMuted }}>Loading...</div>
      ) : showRecruitments ? (
        /* Recruitments Table */
        <div style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '10px',
          overflow: 'hidden'
        }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Company</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Agent</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Nickname</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Recruited</th>
                <th style={{ padding: '12px 16px', textAlign: 'left', color: adminTheme.textMuted, fontSize: '12px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {recruitments.map(r => (
                <tr key={r.id} style={{ borderBottom: `1px solid ${adminTheme.border}` }}>
                  <td style={{ padding: '12px 16px', color: adminTheme.text, fontSize: '14px' }}>{r.company?.name}</td>
                  <td style={{ padding: '12px 16px', color: adminTheme.text, fontSize: '14px' }}>{r.agent?.name}</td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>{r.nickname || '-'}</td>
                  <td style={{ padding: '12px 16px', color: adminTheme.textMuted, fontSize: '13px' }}>
                    {r.recruited_at ? new Date(r.recruited_at).toLocaleDateString() : '-'}
                  </td>
                  <td style={{ padding: '12px 16px' }}>
                    <Badge color={r.subscription_status === 'active' ? 'success' : 'default'}>
                      {r.subscription_status || 'active'}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        /* Agents Grid */
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: '16px'
        }}>
          {agents.map(agent => {
            const IconComponent = getIcon(agent.icon)
            const recruitCount = getRecruitmentCount(agent.id)

            return (
              <div
                key={agent.id}
                style={{
                  backgroundColor: adminTheme.bgCard,
                  border: `1px solid ${adminTheme.border}`,
                  borderRadius: '12px',
                  padding: '20px',
                  position: 'relative'
                }}
              >
                {/* Status badge */}
                <div style={{ position: 'absolute', top: '12px', right: '12px' }}>
                  <Badge color={
                    agent.status === 'active' ? 'success' :
                    agent.status === 'coming_soon' ? 'warning' : 'default'
                  }>
                    {agent.status === 'coming_soon' ? 'Coming Soon' : agent.status}
                  </Badge>
                </div>

                {/* Icon */}
                <div style={{
                  width: '56px',
                  height: '56px',
                  backgroundColor: adminTheme.accentBg,
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '16px'
                }}>
                  <IconComponent size={28} style={{ color: adminTheme.accent }} />
                </div>

                {/* Name & Title */}
                <div style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600', marginBottom: '4px' }}>
                  {agent.name}
                </div>
                <div style={{ color: adminTheme.textMuted, fontSize: '13px', marginBottom: '12px' }}>
                  {agent.title}
                </div>

                {/* Trade category */}
                <Badge color="accent">{agent.trade_category}</Badge>

                {/* Price */}
                <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: `1px solid ${adminTheme.border}` }}>
                  {agent.is_free ? (
                    <div style={{ color: adminTheme.success, fontSize: '18px', fontWeight: '600' }}>Free</div>
                  ) : (
                    <div>
                      <span style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600' }}>
                        ${agent.price_monthly}
                      </span>
                      <span style={{ color: adminTheme.textMuted, fontSize: '13px' }}>/mo</span>
                    </div>
                  )}
                </div>

                {/* Recruitment count */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  marginTop: '12px',
                  color: adminTheme.textMuted,
                  fontSize: '13px'
                }}>
                  <Users size={14} />
                  <span>Recruited by {recruitCount} companies</span>
                </div>

                {/* Edit button */}
                <button
                  onClick={() => setEditingAgent(agent)}
                  style={{
                    marginTop: '16px',
                    width: '100%',
                    padding: '10px',
                    backgroundColor: adminTheme.bgHover,
                    border: `1px solid ${adminTheme.border}`,
                    borderRadius: '8px',
                    color: adminTheme.text,
                    fontSize: '13px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px'
                  }}
                >
                  <Edit2 size={14} /> Edit Agent
                </button>
              </div>
            )
          })}
        </div>
      )}

      {/* Agent Modal */}
      <AdminModal isOpen={!!editingAgent} onClose={() => setEditingAgent(null)} title={editingAgent?.id ? 'Edit Agent' : 'Add Agent'} width="600px">
        {editingAgent && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Slug" required>
                <FormInput
                  value={editingAgent.slug}
                  onChange={(v) => setEditingAgent({ ...editingAgent, slug: v })}
                  placeholder="e.g., lenard"
                  disabled={!!editingAgent.id}
                />
              </FormField>
              <FormField label="Name" required>
                <FormInput
                  value={editingAgent.name}
                  onChange={(v) => setEditingAgent({ ...editingAgent, name: v })}
                  placeholder="e.g., Lenard"
                />
              </FormField>
            </div>

            <FormField label="Title" required>
              <FormInput
                value={editingAgent.title}
                onChange={(v) => setEditingAgent({ ...editingAgent, title: v })}
                placeholder="e.g., The Lighting Expert"
              />
            </FormField>

            <FormField label="Full Name" required>
              <FormInput
                value={editingAgent.full_name}
                onChange={(v) => setEditingAgent({ ...editingAgent, full_name: v })}
                placeholder="e.g., Lenard Lumens"
              />
            </FormField>

            <FormField label="Tagline">
              <FormInput
                value={editingAgent.tagline}
                onChange={(v) => setEditingAgent({ ...editingAgent, tagline: v })}
                placeholder="Short catchy phrase"
              />
            </FormField>

            <FormField label="Description" required>
              <FormTextarea
                value={editingAgent.description}
                onChange={(v) => setEditingAgent({ ...editingAgent, description: v })}
                rows={3}
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <FormField label="Icon" required>
                <FormSelect
                  value={editingAgent.icon}
                  onChange={(v) => setEditingAgent({ ...editingAgent, icon: v })}
                  options={ICON_OPTIONS.map(i => ({ value: i.value, label: i.label }))}
                />
              </FormField>
              <FormField label="Trade Category" required>
                <FormSelect
                  value={editingAgent.trade_category}
                  onChange={(v) => setEditingAgent({ ...editingAgent, trade_category: v })}
                  options={TRADE_CATEGORIES.map(c => ({ value: c, label: c }))}
                />
              </FormField>
            </div>

            <FormField label="Avatar URL">
              <FormInput
                value={editingAgent.avatar_url}
                onChange={(v) => setEditingAgent({ ...editingAgent, avatar_url: v })}
                placeholder="URL to custom illustration"
              />
            </FormField>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
              <FormField label="Monthly Price ($)">
                <FormInput
                  type="number"
                  step="0.01"
                  value={editingAgent.price_monthly}
                  onChange={(v) => setEditingAgent({ ...editingAgent, price_monthly: parseFloat(v) })}
                />
              </FormField>
              <FormField label="Yearly Price ($)">
                <FormInput
                  type="number"
                  step="0.01"
                  value={editingAgent.price_yearly}
                  onChange={(v) => setEditingAgent({ ...editingAgent, price_yearly: parseFloat(v) })}
                />
              </FormField>
              <FormField label="Display Order">
                <FormInput
                  type="number"
                  value={editingAgent.display_order}
                  onChange={(v) => setEditingAgent({ ...editingAgent, display_order: parseInt(v) })}
                />
              </FormField>
            </div>

            <FormField label="Status" required>
              <FormSelect
                value={editingAgent.status}
                onChange={(v) => setEditingAgent({ ...editingAgent, status: v })}
                options={STATUS_OPTIONS}
              />
            </FormField>

            <div style={{ marginTop: '16px' }}>
              <FormToggle
                checked={editingAgent.is_free}
                onChange={(v) => setEditingAgent({ ...editingAgent, is_free: v })}
                label="Free Agent (no subscription required)"
              />
            </div>

            <ModalFooter onCancel={() => setEditingAgent(null)} onSave={handleSave} saving={saving} />
          </>
        )}
      </AdminModal>
    </div>
  )
}
