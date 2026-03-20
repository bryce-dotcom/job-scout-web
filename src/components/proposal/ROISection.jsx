import ProposalSection from './ProposalSection'
import { AnimatedNumber } from './ProposalSection'
import proposalTheme from './proposalTheme'

export default function ROISection({ section, totalCost, annualSavings, incentive }) {
  const metrics = section?.metrics || {}
  const annual = metrics.annual_savings || annualSavings || 0
  const cost = totalCost || 0
  const netCost = incentive ? cost - incentive : cost
  const paybackMonths = metrics.payback_months || (annual > 0 ? Math.round((netCost / annual) * 12) : 0)
  const roiPercent = metrics.roi_percent || (netCost > 0 && annual > 0 ? Math.round(((annual * 5 - netCost) / netCost) * 100) : 0)

  const cards = [
    {
      label: 'Total Investment',
      value: cost,
      prefix: '$',
      format: 'currency',
      color: proposalTheme.text,
    },
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
      suffix: ' months',
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
              </div>
            </ProposalSection>
          ))}
        </div>
      </div>
    </div>
  )
}
