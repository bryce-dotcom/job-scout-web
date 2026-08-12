import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'
import {
  TrendingUp, Receipt, Users, Sparkles, ShieldCheck, Wrench, Thermometer, BadgeCheck, Building2,
} from 'lucide-react'

// Why the project is worth doing beyond the energy bill.
//
// Noah asked for this: building owners care about what the work does to the
// asset and to the people in it, not only the kWh. Bryce wanted it to land
// emotionally and to adapt to whatever kind of project it is — the claims are
// written per estimate by generate-proposal-layout, so a window-cleaning job
// argues appearance and tenant impression while a lighting retrofit argues
// property value and light quality.
//
// Everything rendered here has been through lib/valueClaims first: no figure
// may sit on a tax claim, property and rent claims are ranges with a stated
// basis rather than promises, and the advisor line is attached automatically.
// This becomes part of a signed document, so the copy is filtered rather than
// trusted.

const ICONS = {
  property_value: Building2,
  tax: Receipt,
  rentability: TrendingUp,
  appearance: Sparkles,
  productivity: Users,
  safety: ShieldCheck,
  maintenance: Wrench,
  comfort: Thermometer,
  compliance: BadgeCheck,
}

export default function AddedValueSection({ section }) {
  const claims = section?.claims || []
  if (claims.length === 0) return null

  return (
    <div style={{
      padding: proposalTheme.sectionPadding,
      maxWidth: proposalTheme.maxWidth,
      margin: '0 auto',
    }}>
      <ProposalSection>
        <h2 style={{
          fontSize: '28px', fontWeight: '700', color: proposalTheme.text,
          margin: '0 0 8px', textAlign: 'center',
        }}>
          {section.heading || 'Beyond the energy savings'}
        </h2>
        {section.content && (
          <p style={{
            fontSize: '16px', lineHeight: 1.6, color: proposalTheme.textMuted,
            margin: '0 auto 28px', textAlign: 'center', maxWidth: '640px',
          }}>
            {section.content}
          </p>
        )}

        <div style={{
          display: 'grid',
          // minmax(0, …) so a long claim cannot force the grid wider than the
          // phone — the root clips overflow silently.
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(260px, 100%), 1fr))',
          gap: '16px',
        }}>
          {claims.map((c, i) => {
            const Icon = ICONS[c.kind] || Sparkles
            return (
              <div key={i} style={{
                backgroundColor: proposalTheme.bgCard,
                border: `1px solid ${proposalTheme.border}`,
                borderRadius: proposalTheme.cardRadius,
                padding: '20px',
                display: 'flex', flexDirection: 'column', gap: '10px',
                minWidth: 0,
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '36px', height: '36px', borderRadius: '10px',
                    backgroundColor: proposalTheme.accentBg || 'rgba(90,99,73,0.12)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                  }}>
                    <Icon size={18} color={proposalTheme.accent} />
                  </div>
                  <h3 style={{
                    fontSize: '16px', fontWeight: '700', color: proposalTheme.text,
                    margin: 0, minWidth: 0,
                  }}>
                    {c.title}
                  </h3>
                </div>

                <p style={{
                  fontSize: '14px', lineHeight: 1.6, color: proposalTheme.textMuted,
                  margin: 0, wordBreak: 'break-word',
                }}>
                  {c.detail}
                </p>

                {/* The basis is what turns a claim into something defensible.
                    Shown quietly, but shown. */}
                {c.basis && (
                  <p style={{ fontSize: '12px', color: proposalTheme.textMuted, margin: 0, fontStyle: 'italic', opacity: 0.85 }}>
                    {c.basis}
                  </p>
                )}

                {/* Never optional on a tax claim. */}
                {c.disclaimer && (
                  <p style={{
                    fontSize: '12px', color: proposalTheme.textMuted, margin: 0,
                    paddingTop: '8px', borderTop: `1px solid ${proposalTheme.border}`,
                  }}>
                    {c.disclaimer}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      </ProposalSection>
    </div>
  )
}
