import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { CheckCircle } from 'lucide-react'
import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'

export default function ApprovalSection({
  section,
  isApproved,
  approvalSuccess,
  expirationDate,
  onApprove,
  approverName,
  setApproverName,
  approverEmail,
  setApproverEmail,
}) {
  const [showModal, setShowModal] = useState(false)
  const [approving, setApproving] = useState(false)

  const ctaText = section?.cta_text || 'Approve This Proposal'
  const approved = isApproved || approvalSuccess

  const handleApprove = async () => {
    setApproving(true)
    try {
      await onApprove()
    } finally {
      setApproving(false)
    }
  }

  const formatDate = (d) => {
    if (!d) return ''
    return new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  }

  return (
    <div style={{
      padding: '80px 24px',
      textAlign: 'center',
      backgroundColor: proposalTheme.heroBg,
      position: 'relative',
    }}>
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: proposalTheme.topoBgImage,
        backgroundSize: '400px 400px',
        opacity: 0.3,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: '500px', margin: '0 auto' }}>
        <ProposalSection>
          {approved ? (
            <div>
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
              >
                <CheckCircle size={64} color={proposalTheme.success} style={{ marginBottom: '16px' }} />
              </motion.div>
              <h2 style={{
                color: proposalTheme.heroText,
                fontSize: '28px',
                fontWeight: '700',
                margin: '0 0 8px',
              }}>
                Proposal Approved
              </h2>
              <p style={{
                color: proposalTheme.heroSubtext,
                fontSize: '16px',
                margin: 0,
              }}>
                Thank you! Your approval has been recorded. We'll be in touch shortly.
              </p>
            </div>
          ) : (
            <div>
              <h2 style={{
                color: proposalTheme.heroText,
                fontSize: '28px',
                fontWeight: '700',
                margin: '0 0 8px',
                fontFamily: proposalTheme.fontFamily,
              }}>
                Ready to Move Forward?
              </h2>
              <p style={{
                color: proposalTheme.heroSubtext,
                fontSize: '16px',
                margin: '0 0 32px',
                lineHeight: 1.6,
              }}>
                {section?.content || "Click below to approve this proposal and we'll get started right away."}
              </p>

              <motion.button
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowModal(true)}
                style={{
                  padding: '18px 48px',
                  backgroundColor: proposalTheme.success,
                  color: '#fff',
                  border: 'none',
                  borderRadius: '12px',
                  fontSize: '18px',
                  fontWeight: '600',
                  cursor: 'pointer',
                  fontFamily: proposalTheme.fontFamily,
                }}
              >
                {ctaText}
              </motion.button>

              {expirationDate && (
                <p style={{
                  color: proposalTheme.heroSubtext,
                  fontSize: '13px',
                  margin: '16px 0 0',
                }}>
                  Valid until {formatDate(expirationDate)}
                </p>
              )}
            </div>
          )}
        </ProposalSection>
      </div>

      {/* Approval Modal */}
      <AnimatePresence>
        {showModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              backgroundColor: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '16px',
              zIndex: 100,
            }}
            onClick={() => setShowModal(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: proposalTheme.bgCard,
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0,0,0,0.25)',
                width: '100%',
                maxWidth: '440px',
                textAlign: 'left',
              }}
            >
              <div style={{ padding: '24px 24px 0' }}>
                <h2 style={{
                  fontSize: '18px',
                  fontWeight: '700',
                  color: proposalTheme.text,
                  margin: '0 0 4px',
                }}>
                  Approve Proposal
                </h2>
                <p style={{
                  color: proposalTheme.textMuted,
                  fontSize: '14px',
                  margin: '0 0 20px',
                }}>
                  Confirm your information to approve.
                </p>
              </div>

              <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: proposalTheme.textSecondary, marginBottom: '6px' }}>
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={approverName}
                    onChange={(e) => setApproverName(e.target.value)}
                    placeholder="Full name"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${proposalTheme.border}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: proposalTheme.text,
                      backgroundColor: proposalTheme.bgCard,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '13px', fontWeight: '500', color: proposalTheme.textSecondary, marginBottom: '6px' }}>
                    Email Address
                  </label>
                  <input
                    type="email"
                    value={approverEmail}
                    onChange={(e) => setApproverEmail(e.target.value)}
                    placeholder="your@email.com"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      border: `1px solid ${proposalTheme.border}`,
                      borderRadius: '8px',
                      fontSize: '14px',
                      color: proposalTheme.text,
                      backgroundColor: proposalTheme.bgCard,
                      outline: 'none',
                      boxSizing: 'border-box',
                    }}
                  />
                </div>

                <div style={{
                  backgroundColor: proposalTheme.accentBg,
                  padding: '12px 16px',
                  borderRadius: '8px',
                  border: `1px solid ${proposalTheme.border}`,
                }}>
                  <p style={{
                    color: proposalTheme.textSecondary,
                    fontSize: '12px',
                    lineHeight: '1.5',
                    margin: 0,
                  }}>
                    By clicking "Approve," your name, email address, IP address, and timestamp will be recorded
                    as your electronic signature in accordance with the ESIGN Act (15 U.S.C. 7001 et seq.).
                  </p>
                </div>
              </div>

              <div style={{
                padding: '20px 24px',
                display: 'flex',
                gap: '12px',
                justifyContent: 'flex-end',
              }}>
                <button
                  onClick={() => setShowModal(false)}
                  style={{
                    padding: '12px 24px',
                    backgroundColor: proposalTheme.bg,
                    color: proposalTheme.textSecondary,
                    border: `1px solid ${proposalTheme.border}`,
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '500',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  onClick={handleApprove}
                  disabled={approving || !approverName}
                  style={{
                    padding: '12px 28px',
                    backgroundColor: proposalTheme.accent,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '14px',
                    fontWeight: '600',
                    cursor: approving || !approverName ? 'not-allowed' : 'pointer',
                    opacity: approving || !approverName ? 0.6 : 1,
                  }}
                >
                  {approving ? 'Approving...' : 'Approve'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
