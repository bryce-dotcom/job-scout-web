import { useState } from 'react'
import { motion } from 'framer-motion'
import { Check } from 'lucide-react'
import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

const TIER_COLORS = {
  good: { bg: '#f0f4ed', border: '#b8c4a8', accent: '#6b7c5a', label: 'Good' },
  better: { bg: '#edf2f9', border: '#94aed4', accent: '#3b6eb5', label: 'Better' },
  best: { bg: '#fdf5e6', border: '#d4af37', accent: '#b8941e', label: 'Best Value' },
}

function TierCard({ tier, index, isRecommended, onSelect, selectedTier }) {
  const colors = TIER_COLORS[tier.id] || TIER_COLORS.good
  const isSelected = selectedTier === tier.id

  return (
    <ProposalSection delay={index * 0.12}>
      <motion.div
        whileHover={{ y: -4 }}
        transition={{ duration: 0.2 }}
        style={{
          backgroundColor: proposalTheme.bgCard,
          borderRadius: proposalTheme.cardRadius,
          border: `2px solid ${isRecommended ? colors.accent : proposalTheme.border}`,
          overflow: 'hidden',
          position: 'relative',
          boxShadow: isRecommended ? `0 8px 30px ${colors.accent}20` : 'none',
        }}
      >
        {/* Recommended badge */}
        {isRecommended && (
          <div style={{
            backgroundColor: colors.accent,
            color: '#fff',
            textAlign: 'center',
            padding: '6px 16px',
            fontSize: '11px',
            fontWeight: '700',
            letterSpacing: '1px',
            textTransform: 'uppercase',
          }}>
            Recommended
          </div>
        )}

        <div style={{ padding: '28px 24px' }}>
          {/* Tier label */}
          <div style={{
            display: 'inline-block',
            backgroundColor: colors.bg,
            color: colors.accent,
            padding: '4px 12px',
            borderRadius: '20px',
            fontSize: '12px',
            fontWeight: '700',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            marginBottom: '12px',
          }}>
            {colors.label}
          </div>

          {/* Tier name */}
          <h3 style={{
            fontSize: '20px',
            fontWeight: '700',
            color: proposalTheme.text,
            margin: '0 0 8px',
            fontFamily: proposalTheme.fontFamily,
          }}>
            {tier.name}
          </h3>

          {/* Price */}
          <div style={{ marginBottom: '16px' }}>
            <span style={{
              fontSize: '32px',
              fontWeight: '700',
              color: colors.accent,
              fontFamily: proposalTheme.fontFamily,
            }}>
              {formatCurrency(tier.price)}
            </span>
            {tier.net_price != null && tier.net_price !== tier.price && (
              <div style={{ marginTop: '4px' }}>
                <span style={{ fontSize: '13px', color: proposalTheme.textMuted }}>Net after rebate: </span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: proposalTheme.success }}>{formatCurrency(tier.net_price)}</span>
              </div>
            )}
          </div>

          {/* Description */}
          {tier.description && (
            <p style={{
              color: proposalTheme.textSecondary,
              fontSize: '14px',
              lineHeight: 1.6,
              margin: '0 0 20px',
            }}>
              {tier.description}
            </p>
          )}

          {/* Features */}
          {tier.features && tier.features.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '24px' }}>
              {tier.features.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
                  <div style={{
                    width: '20px',
                    height: '20px',
                    borderRadius: '50%',
                    backgroundColor: colors.bg,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                    marginTop: '1px',
                  }}>
                    <Check size={12} color={colors.accent} strokeWidth={3} />
                  </div>
                  <span style={{
                    fontSize: '14px',
                    color: proposalTheme.text,
                    lineHeight: 1.4,
                  }}>
                    {f}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Savings callout */}
          {tier.annual_savings > 0 && (
            <div style={{
              backgroundColor: colors.bg,
              borderRadius: '10px',
              padding: '12px 16px',
              marginBottom: '20px',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '13px', color: proposalTheme.textSecondary }}>Annual Savings</span>
                <span style={{ fontSize: '16px', fontWeight: '700', color: colors.accent }}>{formatCurrency(tier.annual_savings)}/yr</span>
              </div>
              {tier.payback_months > 0 && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px' }}>
                  <span style={{ fontSize: '13px', color: proposalTheme.textSecondary }}>Payback Period</span>
                  <span style={{ fontSize: '14px', fontWeight: '600', color: colors.accent }}>{tier.payback_months} months</span>
                </div>
              )}
            </div>
          )}

          {/* Select button */}
          {onSelect && (
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSelect(tier.id)}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: '10px',
                border: isSelected ? 'none' : `1px solid ${colors.border}`,
                backgroundColor: isSelected ? colors.accent : 'transparent',
                color: isSelected ? '#fff' : colors.accent,
                fontSize: '15px',
                fontWeight: '600',
                cursor: 'pointer',
                fontFamily: proposalTheme.fontFamily,
              }}
            >
              {isSelected ? 'Selected' : `Choose ${tier.name}`}
            </motion.button>
          )}
        </div>
      </motion.div>
    </ProposalSection>
  )
}

export default function PricingTiersSection({ section, onTierSelect }) {
  const [selectedTier, setSelectedTier] = useState(null)
  const tiers = section?.tiers || []
  const recommendedId = section?.recommended || 'better'

  if (tiers.length === 0) return null

  const handleSelect = (tierId) => {
    setSelectedTier(tierId)
    if (onTierSelect) onTierSelect(tierId)
  }

  return (
    <div style={{
      padding: proposalTheme.sectionPadding,
      maxWidth: '1000px',
      margin: '0 auto',
    }}>
      <ProposalSection>
        <h2 style={{
          fontSize: '28px',
          fontWeight: '700',
          color: proposalTheme.text,
          margin: '0 0 8px',
          textAlign: 'center',
          fontFamily: proposalTheme.fontFamily,
        }}>
          {section?.heading || 'Choose Your Package'}
        </h2>
        <p style={{
          color: proposalTheme.textMuted,
          fontSize: proposalTheme.bodySize,
          textAlign: 'center',
          margin: '0 0 40px',
          maxWidth: '600px',
          marginLeft: 'auto',
          marginRight: 'auto',
        }}>
          {section?.content || 'Select the option that best fits your needs and budget'}
        </p>
      </ProposalSection>

      <div style={{
        display: 'grid',
        gridTemplateColumns: tiers.length <= 3 ? `repeat(${tiers.length}, 1fr)` : 'repeat(auto-fit, minmax(280px, 1fr))',
        gap: '20px',
        alignItems: 'start',
      }}>
        {tiers.map((tier, i) => (
          <TierCard
            key={tier.id || i}
            tier={tier}
            index={i}
            isRecommended={tier.id === recommendedId}
            selectedTier={selectedTier}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  )
}
