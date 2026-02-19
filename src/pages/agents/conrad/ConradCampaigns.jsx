import { useState } from 'react'
import { useStore } from '../../../lib/store'
import { useTheme } from '../../../components/Layout'
import { Plus, Send, Trash2, X, Eye, RefreshCw, Sparkles } from 'lucide-react'

const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
}

const statusColors = {
  draft: { bg: 'rgba(107,114,128,0.15)', text: '#6b7280' },
  scheduled: { bg: 'rgba(59,130,246,0.15)', text: '#3b82f6' },
  sending: { bg: 'rgba(245,158,11,0.15)', text: '#f59e0b' },
  sent: { bg: 'rgba(34,197,94,0.15)', text: '#16a34a' },
  cancelled: { bg: 'rgba(239,68,68,0.15)', text: '#ef4444' },
}

const emptyForm = {
  name: '',
  subject: '',
  from_name: '',
  from_email: '',
  template_id: '',
  recipient_list_type: 'all',
  scheduled_at: '',
}

export default function ConradCampaigns() {
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  const companyId = useStore(s => s.companyId)
  const emailCampaigns = useStore(s => s.emailCampaigns)
  const emailTemplates = useStore(s => s.emailTemplates)
  const ccIntegration = useStore(s => s.ccIntegration)
  const createEmailCampaign = useStore(s => s.createEmailCampaign)
  const updateEmailCampaign = useStore(s => s.updateEmailCampaign)
  const deleteEmailCampaign = useStore(s => s.deleteEmailCampaign)
  const fetchEmailCampaigns = useStore(s => s.fetchEmailCampaigns)

  const [showModal, setShowModal] = useState(false)
  const [showPreview, setShowPreview] = useState(false)
  const [previewHtml, setPreviewHtml] = useState('')
  const [formData, setFormData] = useState(emptyForm)
  const [generatedContent, setGeneratedContent] = useState(null)
  const [loading, setLoading] = useState(false)
  const [generating, setGenerating] = useState(false)
  const [sending, setSending] = useState(false)

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: theme.bg,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box'
  }

  const labelStyle = {
    display: 'block',
    fontSize: '13px',
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: '4px'
  }

  const openNewCampaign = () => {
    setFormData({
      ...emptyForm,
      from_name: ccIntegration?.settings?.default_from_name || '',
      from_email: ccIntegration?.settings?.default_from_email || '',
    })
    setGeneratedContent(null)
    setShowModal(true)
  }

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData(prev => ({ ...prev, [name]: value }))
  }

  const handleGenerateAI = async () => {
    setGenerating(true)
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-generate-email`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            company_id: companyId,
            subject: formData.subject || formData.name,
            type: 'campaign',
            tone: 'professional'
          })
        }
      )
      const data = await response.json()
      if (data.html_content) {
        setGeneratedContent(data)
      }
    } catch (e) {
      console.error('Generate email error:', e)
    } finally {
      setGenerating(false)
    }
  }

  const handlePreview = () => {
    const template = emailTemplates.find(t => t.id === formData.template_id)
    const html = generatedContent?.html_content || template?.html_content || '<p>No content to preview</p>'
    setPreviewHtml(html)
    setShowPreview(true)
  }

  const handleSend = async () => {
    setSending(true)
    try {
      // Create campaign first
      const campaignData = {
        name: formData.name,
        subject: formData.subject,
        from_name: formData.from_name,
        from_email: formData.from_email,
        template_id: formData.template_id || null,
        recipient_list_type: formData.recipient_list_type,
        status: formData.scheduled_at ? 'scheduled' : 'draft',
        scheduled_at: formData.scheduled_at || null,
      }

      const { data: campaign, error } = await createEmailCampaign(campaignData)
      if (error) throw error

      // Call send edge function
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-send-campaign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            company_id: companyId,
            campaign_id: campaign.id,
            html_content: generatedContent?.html_content || null
          })
        }
      )
      const result = await response.json()

      if (result.error) {
        console.error('Send campaign error:', result.error)
      }

      await fetchEmailCampaigns()
      setShowModal(false)
      setFormData(emptyForm)
      setGeneratedContent(null)
    } catch (e) {
      console.error('Send campaign error:', e)
    } finally {
      setSending(false)
    }
  }

  const handleRefreshStats = async (campaignId) => {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/cc-analytics`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({ company_id: companyId, campaign_id: campaignId })
        }
      )
      await response.json()
      await fetchEmailCampaigns()
    } catch (e) {
      console.error('Refresh stats error:', e)
    }
  }

  const handleDelete = async (campaign) => {
    if (!confirm(`Delete campaign "${campaign.name}"?`)) return
    await deleteEmailCampaign(campaign.id)
  }

  return (
    <div style={{ padding: '24px', maxWidth: '1200px', margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>Campaigns</h1>
        <button
          onClick={openNewCampaign}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: theme.accent,
            color: '#fff',
            borderRadius: '8px',
            border: 'none',
            cursor: 'pointer',
            fontWeight: '600',
            fontSize: '13px'
          }}
        >
          <Plus size={16} />
          New Campaign
        </button>
      </div>

      {/* Campaigns Table */}
      <div style={{
        background: theme.bgCard,
        borderRadius: '12px',
        border: `1px solid ${theme.border}`,
        overflow: 'hidden'
      }}>
        {emailCampaigns.length === 0 ? (
          <div style={{ padding: '48px', textAlign: 'center' }}>
            <Send size={40} style={{ color: theme.textMuted, marginBottom: '12px' }} />
            <p style={{ color: theme.textSecondary }}>No campaigns yet. Create your first campaign to start reaching your audience.</p>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Name</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Status</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Recipients</th>
                <th style={{ textAlign: 'left', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Sent Date</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Opens</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Clicks</th>
                <th style={{ textAlign: 'right', padding: '10px 12px', fontSize: '12px', fontWeight: '600', color: theme.textMuted, borderBottom: `1px solid ${theme.border}`, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {emailCampaigns.map(c => {
                const sc = statusColors[c.status] || statusColors.draft
                return (
                  <tr key={c.id}>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.text, borderBottom: `1px solid ${theme.border}` }}>
                      <div style={{ fontWeight: '500' }}>{c.name}</div>
                      <div style={{ fontSize: '12px', color: theme.textMuted }}>{c.subject}</div>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', borderBottom: `1px solid ${theme.border}` }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: '12px',
                        fontSize: '11px',
                        fontWeight: '600',
                        backgroundColor: sc.bg,
                        color: sc.text
                      }}>
                        {c.status}
                      </span>
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, textAlign: 'right' }}>
                      {c.recipient_count || '--'}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}` }}>
                      {c.sent_at ? new Date(c.sent_at).toLocaleDateString() : '--'}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, textAlign: 'right' }}>
                      {c.stats?.opens ?? '--'}
                    </td>
                    <td style={{ padding: '12px', fontSize: '14px', color: theme.textSecondary, borderBottom: `1px solid ${theme.border}`, textAlign: 'right' }}>
                      {c.stats?.clicks ?? '--'}
                    </td>
                    <td style={{ padding: '12px', borderBottom: `1px solid ${theme.border}`, textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '4px', justifyContent: 'flex-end' }}>
                        {c.status === 'sent' && (
                          <button
                            onClick={() => handleRefreshStats(c.id)}
                            title="Refresh stats"
                            style={{
                              padding: '6px',
                              background: 'transparent',
                              border: `1px solid ${theme.border}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: theme.textMuted,
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                        {c.status === 'draft' && (
                          <button
                            onClick={() => handleDelete(c)}
                            title="Delete"
                            style={{
                              padding: '6px',
                              background: 'transparent',
                              border: `1px solid ${theme.border}`,
                              borderRadius: '6px',
                              cursor: 'pointer',
                              color: '#ef4444',
                              display: 'flex',
                              alignItems: 'center'
                            }}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* New Campaign Modal */}
      {showModal && (
        <>
          <div onClick={() => setShowModal(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 50 }} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            width: '100%',
            maxWidth: '560px',
            maxHeight: '90vh',
            overflow: 'auto',
            zIndex: 51,
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: '700', color: theme.text }}>New Campaign</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              <div>
                <label style={labelStyle}>Campaign Name</label>
                <input name="name" value={formData.name} onChange={handleChange} style={inputStyle} placeholder="e.g. Spring Newsletter" />
              </div>

              <div>
                <label style={labelStyle}>Subject Line</label>
                <input name="subject" value={formData.subject} onChange={handleChange} style={inputStyle} placeholder="Email subject" />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={labelStyle}>From Name</label>
                  <input name="from_name" value={formData.from_name} onChange={handleChange} style={inputStyle} placeholder="Your Name" />
                </div>
                <div>
                  <label style={labelStyle}>From Email</label>
                  <input name="from_email" value={formData.from_email} onChange={handleChange} style={inputStyle} placeholder="you@company.com" />
                </div>
              </div>

              <div>
                <label style={labelStyle}>Template</label>
                <select name="template_id" value={formData.template_id} onChange={handleChange} style={inputStyle}>
                  <option value="">-- No Template --</option>
                  {emailTemplates.map(t => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Recipients</label>
                <select name="recipient_list_type" value={formData.recipient_list_type} onChange={handleChange} style={inputStyle}>
                  <option value="all">All Contacts</option>
                  <option value="customers">Customers Only</option>
                  <option value="leads">Leads Only</option>
                </select>
              </div>

              <div>
                <label style={labelStyle}>Schedule (optional -- leave blank to send immediately)</label>
                <input type="datetime-local" name="scheduled_at" value={formData.scheduled_at} onChange={handleChange} style={inputStyle} />
              </div>

              {/* Generate with AI */}
              <button
                onClick={handleGenerateAI}
                disabled={generating}
                style={{
                  padding: '10px 16px',
                  background: 'transparent',
                  color: theme.accent,
                  borderRadius: '8px',
                  border: `1px solid ${theme.accent}`,
                  cursor: generating ? 'wait' : 'pointer',
                  fontWeight: '600',
                  fontSize: '13px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  opacity: generating ? 0.7 : 1
                }}
              >
                <Sparkles size={16} />
                {generating ? 'Generating...' : 'Generate with AI'}
              </button>

              {generatedContent && (
                <div style={{
                  background: theme.accentBg,
                  borderRadius: '8px',
                  padding: '12px',
                  fontSize: '13px',
                  color: theme.textSecondary
                }}>
                  AI content generated. Use Preview to see the result.
                </div>
              )}

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '8px' }}>
                <button
                  onClick={handlePreview}
                  style={{
                    padding: '10px 16px',
                    background: 'transparent',
                    color: theme.accent,
                    borderRadius: '8px',
                    border: `1px solid ${theme.accent}`,
                    cursor: 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}
                >
                  <Eye size={14} />
                  Preview
                </button>

                <button
                  onClick={handleSend}
                  disabled={!formData.name || !formData.subject || sending}
                  style={{
                    padding: '10px 16px',
                    background: theme.accent,
                    color: '#fff',
                    borderRadius: '8px',
                    border: 'none',
                    cursor: (!formData.name || !formData.subject || sending) ? 'not-allowed' : 'pointer',
                    fontWeight: '600',
                    fontSize: '13px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    opacity: (!formData.name || !formData.subject || sending) ? 0.5 : 1
                  }}
                >
                  <Send size={14} />
                  {sending ? 'Sending...' : formData.scheduled_at ? 'Schedule' : 'Send Now'}
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <>
          <div onClick={() => setShowPreview(false)} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 60 }} />
          <div style={{
            position: 'fixed',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            backgroundColor: '#ffffff',
            borderRadius: '16px',
            border: `1px solid ${theme.border}`,
            width: '100%',
            maxWidth: '640px',
            maxHeight: '80vh',
            overflow: 'auto',
            zIndex: 61,
            padding: '24px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: '700', color: theme.text }}>Email Preview</h2>
              <button onClick={() => setShowPreview(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: theme.textMuted }}>
                <X size={20} />
              </button>
            </div>
            <div
              style={{ border: `1px solid ${theme.border}`, borderRadius: '8px', padding: '16px', background: '#fff' }}
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        </>
      )}
    </div>
  )
}
