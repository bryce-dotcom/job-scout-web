import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

function LineItemCard({ item, index }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <ProposalSection delay={index * 0.08}>
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          backgroundColor: proposalTheme.bgCard,
          borderRadius: proposalTheme.cardRadius,
          border: `1px solid ${proposalTheme.border}`,
          overflow: 'hidden',
          cursor: 'pointer',
          transition: 'box-shadow 0.2s ease',
        }}
      >
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          padding: '20px',
        }}>
          {item.image_url && (
            <img
              src={item.image_url}
              alt={item.item_name || ''}
              style={{
                width: '64px',
                height: '64px',
                objectFit: 'cover',
                borderRadius: '10px',
                flexShrink: 0,
              }}
            />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              fontWeight: '600',
              color: proposalTheme.text,
              margin: '0 0 4px',
              fontSize: '15px',
            }}>
              {item.item_name || item.description || 'Item'}
            </p>
            <p style={{
              color: proposalTheme.textMuted,
              fontSize: '13px',
              margin: 0,
            }}>
              {item.quantity || 1} x {formatCurrency(item.price)}
            </p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <p style={{
              fontWeight: '700',
              color: proposalTheme.accent,
              margin: 0,
              fontSize: '16px',
            }}>
              {formatCurrency(item.total || item.line_total)}
            </p>
            <motion.div
              animate={{ rotate: expanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown size={18} color={proposalTheme.textMuted} />
            </motion.div>
          </div>
        </div>

        <AnimatePresence>
          {expanded && item.description && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25 }}
              style={{ overflow: 'hidden' }}
            >
              <div style={{
                padding: '0 20px 20px',
                borderTop: `1px solid ${proposalTheme.border}`,
                paddingTop: '16px',
              }}>
                <p style={{
                  color: proposalTheme.textSecondary,
                  fontSize: '14px',
                  lineHeight: 1.6,
                  margin: 0,
                }}>
                  {item.description}
                </p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </ProposalSection>
  )
}

export default function SolutionSection({ section, lineItems }) {
  const content = section?.content
  const highlights = section?.highlights

  return (
    <div style={{
      padding: proposalTheme.sectionPadding,
      maxWidth: proposalTheme.maxWidth,
      margin: '0 auto',
    }}>
      <ProposalSection>
        <h2 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: proposalTheme.text,
          margin: '0 0 8px',
          fontFamily: proposalTheme.fontFamily,
        }}>
          Proposed Solution
        </h2>
        {content && (
          <p style={{
            color: proposalTheme.textSecondary,
            fontSize: proposalTheme.bodySize,
            lineHeight: 1.7,
            margin: '0 0 24px',
          }}>
            {content}
          </p>
        )}
      </ProposalSection>

      {highlights && highlights.length > 0 && (
        <ProposalSection delay={0.1}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '10px',
            marginBottom: '28px',
          }}>
            {highlights.map((h, i) => (
              <span key={i} style={{
                display: 'inline-block',
                backgroundColor: proposalTheme.accentBg,
                color: proposalTheme.accent,
                padding: '6px 14px',
                borderRadius: '20px',
                fontSize: '13px',
                fontWeight: '500',
              }}>
                {h}
              </span>
            ))}
          </div>
        </ProposalSection>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {(lineItems || []).map((item, i) => (
          <LineItemCard key={item.id || i} item={item} index={i} />
        ))}
      </div>

      {lineItems && lineItems.length > 0 && (
        <ProposalSection delay={0.2}>
          <div style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '20px 0',
            borderTop: `2px solid ${proposalTheme.border}`,
            marginTop: '16px',
          }}>
            <div style={{ textAlign: 'right' }}>
              <p style={{ color: proposalTheme.textMuted, fontSize: '13px', margin: '0 0 4px' }}>Total Investment</p>
              <p style={{
                fontSize: '28px',
                fontWeight: '700',
                color: proposalTheme.accent,
                margin: 0,
              }}>
                {formatCurrency(lineItems.reduce((sum, li) => sum + (parseFloat(li.total || li.line_total) || 0), 0))}
              </p>
            </div>
          </div>
        </ProposalSection>
      )}
    </div>
  )
}
