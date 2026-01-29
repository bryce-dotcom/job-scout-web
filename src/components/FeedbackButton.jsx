import { useState } from 'react'
import { supabase } from '../lib/supabase'
import { useStore } from '../lib/store'
import { MessageSquare, X, Bug, Lightbulb, HelpCircle, Star, Send, CheckCircle } from 'lucide-react'

const FEEDBACK_TYPES = [
  { value: 'bug', label: 'Bug Report', icon: Bug, color: '#ef4444' },
  { value: 'feature', label: 'Feature Request', icon: Lightbulb, color: '#eab308' },
  { value: 'question', label: 'Question', icon: HelpCircle, color: '#f97316' },
  { value: 'feedback', label: 'General Feedback', icon: Star, color: '#22c55e' }
]

export default function FeedbackButton() {
  const user = useStore((state) => state.user)
  const activeCompany = useStore((state) => state.activeCompany)

  const [isOpen, setIsOpen] = useState(false)
  const [type, setType] = useState('feedback')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!message.trim()) return

    setSubmitting(true)

    try {
      const { error } = await supabase.from('feedback').insert({
        user_id: user?.id,
        company_id: activeCompany?.id,
        type,
        subject: subject.trim() || null,
        message: message.trim(),
        page_url: window.location.pathname,
        status: 'new'
      })

      if (error) throw error

      setSubmitted(true)
      setTimeout(() => {
        setIsOpen(false)
        setSubmitted(false)
        setType('feedback')
        setSubject('')
        setMessage('')
      }, 2000)
    } catch (err) {
      alert('Error submitting feedback: ' + err.message)
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return null

  return (
    <>
      {/* Floating Button */}
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: '#f97316',
          border: 'none',
          boxShadow: '0 4px 12px rgba(249, 115, 22, 0.4)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          transition: 'transform 0.2s, box-shadow 0.2s'
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.1)'
          e.currentTarget.style.boxShadow = '0 6px 16px rgba(249, 115, 22, 0.5)'
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)'
          e.currentTarget.style.boxShadow = '0 4px 12px rgba(249, 115, 22, 0.4)'
        }}
      >
        <MessageSquare size={24} color="#fff" />
      </button>

      {/* Modal Overlay */}
      {isOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1001,
            padding: '20px'
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsOpen(false)
          }}
        >
          <div
            style={{
              backgroundColor: '#1a1a1a',
              borderRadius: '16px',
              width: '100%',
              maxWidth: '480px',
              overflow: 'hidden',
              boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)'
            }}
          >
            {/* Header */}
            <div style={{
              padding: '20px 24px',
              borderBottom: '1px solid #2a2a2a',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <div>
                <div style={{ color: '#fff', fontSize: '18px', fontWeight: '600' }}>Send Feedback</div>
                <div style={{ color: '#888', fontSize: '13px' }}>Help us improve Job Scout</div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                style={{
                  padding: '8px',
                  backgroundColor: '#2a2a2a',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  color: '#888'
                }}
              >
                <X size={18} />
              </button>
            </div>

            {/* Content */}
            {submitted ? (
              <div style={{
                padding: '60px 24px',
                textAlign: 'center'
              }}>
                <div style={{
                  width: '64px',
                  height: '64px',
                  backgroundColor: 'rgba(34, 197, 94, 0.2)',
                  borderRadius: '50%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  margin: '0 auto 20px'
                }}>
                  <CheckCircle size={32} color="#22c55e" />
                </div>
                <div style={{ color: '#fff', fontSize: '20px', fontWeight: '600', marginBottom: '8px' }}>
                  Thanks for your feedback!
                </div>
                <div style={{ color: '#888', fontSize: '14px' }}>
                  We appreciate you taking the time to help us improve.
                </div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ padding: '24px' }}>
                {/* Type Selection */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ color: '#888', fontSize: '12px', marginBottom: '8px', display: 'block' }}>
                    What type of feedback?
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                    {FEEDBACK_TYPES.map(t => {
                      const Icon = t.icon
                      const isSelected = type === t.value

                      return (
                        <button
                          key={t.value}
                          type="button"
                          onClick={() => setType(t.value)}
                          style={{
                            padding: '12px',
                            backgroundColor: isSelected ? `${t.color}20` : '#2a2a2a',
                            border: `1px solid ${isSelected ? t.color : '#3a3a3a'}`,
                            borderRadius: '10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '10px',
                            color: isSelected ? t.color : '#888',
                            transition: 'all 0.15s'
                          }}
                        >
                          <Icon size={18} />
                          <span style={{ fontSize: '13px', fontWeight: '500' }}>{t.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Subject */}
                <div style={{ marginBottom: '16px' }}>
                  <label style={{ color: '#888', fontSize: '12px', marginBottom: '6px', display: 'block' }}>
                    Subject (optional)
                  </label>
                  <input
                    type="text"
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    placeholder="Brief summary..."
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #3a3a3a',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px'
                    }}
                  />
                </div>

                {/* Message */}
                <div style={{ marginBottom: '20px' }}>
                  <label style={{ color: '#888', fontSize: '12px', marginBottom: '6px', display: 'block' }}>
                    Message *
                  </label>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    placeholder="Tell us what's on your mind..."
                    rows={4}
                    required
                    style={{
                      width: '100%',
                      padding: '12px',
                      backgroundColor: '#2a2a2a',
                      border: '1px solid #3a3a3a',
                      borderRadius: '10px',
                      color: '#fff',
                      fontSize: '14px',
                      resize: 'vertical'
                    }}
                  />
                </div>

                {/* Submit */}
                <button
                  type="submit"
                  disabled={submitting || !message.trim()}
                  style={{
                    width: '100%',
                    padding: '14px',
                    backgroundColor: '#f97316',
                    border: 'none',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '15px',
                    fontWeight: '600',
                    cursor: submitting || !message.trim() ? 'not-allowed' : 'pointer',
                    opacity: submitting || !message.trim() ? 0.6 : 1,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '8px'
                  }}
                >
                  {submitting ? 'Sending...' : <>
                    <Send size={18} /> Send Feedback
                  </>}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
