import ProposalSection from './ProposalSection'
import { AnimatedNumber } from './ProposalSection'
import proposalTheme from './proposalTheme'

export default function ROISection({ section, totalCost, annualSavings, incentive, discount, certified, brandName }) {
  const metrics = section?.metrics || {}
  const annual = metrics.annual_savings || annualSavings || 0
  const cost = totalCost || 0
  const netCost = cost - (discount || 0) - (incentive || 0)
  const paybackMonths = metrics.payback_months || (annual > 0 ? Math.round((netCost / annual) * 12) : 0)
  const roiPercent = metrics.roi_percent || (netCost > 0 && annual > 0 ? Math.round(((annual * 5 - netCost) / netCost) * 100) : 0)

  const hasIncentive = (incentive || 0) + (discount || 0) > 0

  const cards = [
    ...(hasIncentive ? [{
      label: 'Net Investment',
      value: netCost,
      prefix: '$',
      format: 'currency',
      color: proposalTheme.text,
      note: `after ${incentive > 0 ? 'rebate' : 'discount'}`,
    }] : [{
      label: 'Total Investment',
      value: cost,
      prefix: '$',
      format: 'currency',
      color: proposalTheme.text,
    }]),
    {
      label: 'Annual Savings',
      value: annual,
      prefix: '$',
      format: 'currency',
      color: proposalTheme.success,
    },
    {
      label: 'Payback Period',
      value: paybackMonths,
      suffix: ' mo',
      color: proposalTheme.accent,
    },
    {
      label: '5-Year ROI',
      value: roiPercent,
      suffix: '%',
      color: proposalTheme.accent,
    },
  ]

  return (
    <div style={{
      padding: proposalTheme.sectionPadding,
      backgroundColor: proposalTheme.bgCard,
    }}>
      <div style={{ maxWidth: proposalTheme.maxWidth, margin: '0 auto' }}>
        <ProposalSection>
          {certified && (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
              marginBottom: '12px',
            }}>
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                backgroundColor: proposalTheme.certGoldBg,
                padding: '6px 14px',
                borderRadius: '20px',
                border: `1px solid ${proposalTheme.certGoldBorder}`,
              }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={proposalTheme.certGold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                </svg>
                <span style={{ fontSize: '12px', fontWeight: '700', color: proposalTheme.certGold, letterSpacing: '1px', textTransform: 'uppercase' }}>
                  Investment Grade Analysis {brandName ? `— ${brandName}` : ''}
                </span>
              </div>
            </div>
          )}
          <h2 style={{
            fontSize: '28px',
            fontWeight: '700',
            color: proposalTheme.text,
            margin: '0 0 8px',
            textAlign: 'center',
            fontFamily: proposalTheme.fontFamily,
          }}>
            Return on Investment
          </h2>
          <p style={{
            color: proposalTheme.textMuted,
            fontSize: proposalTheme.bodySize,
            textAlign: 'center',
            margin: '0 0 40px',
          }}>
            {section?.content || 'The numbers that matter'}
          </p>
        </ProposalSection>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '20px',
        }}>
          {cards.map((card, i) => (
            <ProposalSection key={card.label} delay={i * 0.12}>
              <div style={{
                textAlign: 'center',
                padding: '28px 16px',
                backgroundColor: proposalTheme.bg,
                borderRadius: proposalTheme.cardRadius,
                border: `1px solid ${proposalTheme.border}`,
              }}>
                <p style={{
                  fontSize: '36px',
                  fontWeight: '700',
                  color: card.color,
                  margin: '0 0 8px',
                  fontFamily: proposalTheme.fontFamily,
                }}>
                  {card.format === 'currency' ? (
                    <AnimatedNumber
                      value={card.value}
                      prefix="$"
                      duration={1.5}
                    />
                  ) : (
                    <AnimatedNumber
                      value={card.value}
                      prefix={card.prefix || ''}
                      suffix={card.suffix || ''}
                      duration={1.5}
                    />
                  )}
                </p>
                <p style={{
                  color: proposalTheme.textMuted,
                  fontSize: '14px',
                  fontWeight: '500',
                  margin: 0,
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}>
                  {card.label}
                </p>
                {card.note && (
                  <p style={{ color: proposalTheme.textMuted, fontSize: '11px', margin: '2px 0 0', fontStyle: 'italic' }}>
                    {card.note}
                  </p>
                )}
              </div>
            </ProposalSection>
          ))}
        </div>

        {/* Net cost after incentive callout */}
        {incentive > 0 && (
          <ProposalSection delay={0.5}>
            <div style={{
              textAlign: 'center',
              marginTop: '20px',
              padding: '16px',
              backgroundColor: proposalTheme.bg,
              borderRadius: '10px',
              border: `1px solid ${proposalTheme.border}`,
            }}>
              <span style={{ color: proposalTheme.textMuted, fontSize: '14px' }}>Net investment after rebate: </span>
              <span style={{ color: proposalTheme.success, fontSize: '20px', fontWeight: '700' }}>
                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(netCost)}
              </span>
            </div>
          </ProposalSection>
        )}
      </div>
    </div>
  )
}
