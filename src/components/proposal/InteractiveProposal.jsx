import { useState } from 'react'
import { motion } from 'framer-motion'
import HeroSection from './HeroSection'
import SolutionSection from './SolutionSection'
import CostBreakdownSection from './CostBreakdownSection'
import SavingsSection from './SavingsSection'
import ROISection from './ROISection'
import PricingTiersSection from './PricingTiersSection'
import ApprovalSection from './ApprovalSection'
import ProposalSection from './ProposalSection'
import proposalTheme from './proposalTheme'

function formatCurrency(amount) {
  if (!amount && amount !== 0) return '$0.00'
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount)
}

export default function InteractiveProposal({
  data,
  onApprove,
  approverName,
  setApproverName,
  approverEmail,
  setApproverEmail,
  approvalSuccess,
}) {
  const { document: doc, line_items, company, customer, business_unit, approval } = data
  const layout = doc.settings_overrides?.proposal_layout
  const brandName = business_unit?.name || company?.company_name || 'Our Team'
  const sections = layout?.sections || getDefaultSections(doc, customer, brandName)
  const auditSummary = layout?.audit_summary || null
  const certified = !!layout?.audit_certified

  const logoUrl = business_unit?.logo_url || company?.logo_url
  const isApproved = doc.status === 'Approved' || !!approval || approvalSuccess
  const totalCost = line_items?.reduce((sum, li) => sum + (parseFloat(li.total) || 0), 0) || 0
  const annualSavings = findMetric(sections, 'annual_savings')
  const incentive = parseFloat(doc.utility_incentive) || 0
  const discountAmount = parseFloat(doc.discount) || 0

  // Render each section based on type
  const renderSection = (section, index) => {
    switch (section.type) {
      case 'hero':
        return (
          <div key={index}>
            <HeroSection
              section={section}
              company={company}
              customer={customer}
              logoUrl={logoUrl}
              certified={certified}
              brandName={brandName}
            />
            {certified && (
              <div style={{
                backgroundColor: '#1a1f16',
                borderBottom: '3px solid #d4af37',
                padding: '20px 24px',
                textAlign: 'center',
              }}>
                <div style={{
                  maxWidth: proposalTheme.maxWidth,
                  margin: '0 auto',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexWrap: 'wrap',
                  gap: '16px',
                }}>
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                  }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(212,175,55,0.15)',
                      border: '2px solid #d4af37',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d4af37" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                        <polyline points="22 4 12 14.01 9 11.01" />
                      </svg>
                    </div>
                    <div style={{ textAlign: 'left' }}>
                      <p style={{
                        color: '#d4af37',
                        fontSize: '14px',
                        fontWeight: '700',
                        letterSpacing: '1px',
                        textTransform: 'uppercase',
                        margin: 0,
                      }}>
                        Investment Grade Energy Audit
                      </p>
                      <p style={{
                        color: 'rgba(255,255,255,0.6)',
                        fontSize: '12px',
                        margin: '2px 0 0',
                      }}>
                        Certified by {brandName}
                      </p>
                    </div>
                  </div>
                  {auditSummary && (
                    <div style={{
                      display: 'flex',
                      gap: '24px',
                      flexWrap: 'wrap',
                      justifyContent: 'center',
                    }}>
                      {[
                        { label: 'Fixtures', value: auditSummary.total_fixtures },
                        { label: 'kWh/yr Saved', value: auditSummary.annual_kwh_savings?.toLocaleString() },
                        { label: 'Annual Savings', value: `$${auditSummary.annual_dollar_savings?.toLocaleString()}` },
                      ].filter(m => m.value).map(m => (
                        <div key={m.label} style={{ textAlign: 'center' }}>
                          <p style={{ color: '#ffffff', fontSize: '18px', fontWeight: '700', margin: 0 }}>{m.value}</p>
                          <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: '10px', textTransform: 'uppercase', letterSpacing: '0.5px', margin: 0 }}>{m.label}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )

      case 'executive_summary':
      case 'problem_statement':
        return (
          <div key={index} style={{
            padding: proposalTheme.sectionPadding,
            maxWidth: proposalTheme.maxWidth,
            margin: '0 auto',
          }}>
            <ProposalSection>
              <h2 style={{
                fontSize: '28px',
                fontWeight: '700',
                color: proposalTheme.text,
                margin: '0 0 16px',
                fontFamily: proposalTheme.fontFamily,
              }}>
                {section.type === 'executive_summary' ? 'Executive Summary' : 'The Challenge'}
              </h2>
              <p style={{
                color: proposalTheme.textSecondary,
                fontSize: '17px',
                lineHeight: 1.8,
                margin: 0,
              }}>
                {section.content}
              </p>
            </ProposalSection>
          </div>
        )

      case 'solution_overview':
      case 'line_items':
        return (
          <SolutionSection
            key={index}
            section={section}
            lineItems={line_items}
          />
        )

      case 'cost_breakdown':
        return (
          <CostBreakdownSection
            key={index}
            section={section}
            lineItems={line_items}
            auditSummary={auditSummary}
            certified={certified}
            brandName={brandName}
            totalCost={totalCost}
            incentive={incentive}
            discount={discountAmount}
            annualSavings={annualSavings}
          />
        )

      case 'pricing_tiers':
        return (
          <PricingTiersSection
            key={index}
            section={section}
          />
        )

      case 'savings_timeline':
        return (
          <SavingsSection
            key={index}
            section={section}
            totalCost={totalCost}
            annualSavings={annualSavings}
            auditSummary={auditSummary}
            certified={certified}
            brandName={brandName}
            incentive={incentive}
            discount={discountAmount}
          />
        )

      case 'roi_summary':
        return (
          <ROISection
            key={index}
            section={section}
            totalCost={totalCost}
            annualSavings={annualSavings}
            incentive={incentive}
            discount={discountAmount}
            certified={certified}
            brandName={brandName}
          />
        )

      case 'warranty':
        return (
          <div key={index} style={{
            padding: proposalTheme.sectionPadding,
            maxWidth: proposalTheme.maxWidth,
            margin: '0 auto',
          }}>
            <ProposalSection>
              <div style={{
                backgroundColor: proposalTheme.accentBg,
                borderRadius: proposalTheme.cardRadius,
                border: `1px solid ${proposalTheme.accent}`,
                padding: '32px',
                textAlign: 'center',
              }}>
                <div style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: '56px',
                  height: '56px',
                  borderRadius: '50%',
                  backgroundColor: proposalTheme.bgCard,
                  marginBottom: '16px',
                  border: `2px solid ${proposalTheme.accent}`,
                }}>
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={proposalTheme.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                </div>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: proposalTheme.text,
                  margin: '0 0 12px',
                  fontFamily: proposalTheme.fontFamily,
                }}>
                  Product Warranty
                </h2>
                <p style={{
                  color: proposalTheme.textSecondary,
                  fontSize: '16px',
                  lineHeight: 1.7,
                  margin: 0,
                  maxWidth: '500px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                }}>
                  {section.content || 'All products include a 5-year product warranty.'}
                </p>
              </div>
            </ProposalSection>
          </div>
        )

      case 'utility_incentive':
        if (!incentive) return null
        return (
          <div key={index} style={{
            padding: proposalTheme.sectionPadding,
            maxWidth: proposalTheme.maxWidth,
            margin: '0 auto',
          }}>
            <ProposalSection>
              <div style={{
                backgroundColor: proposalTheme.successBg,
                borderRadius: proposalTheme.cardRadius,
                border: `1px solid ${proposalTheme.success}`,
                padding: '32px',
                textAlign: 'center',
              }}>
                <h2 style={{
                  fontSize: '24px',
                  fontWeight: '700',
                  color: proposalTheme.success,
                  margin: '0 0 8px',
                }}>
                  Utility Incentive Available
                </h2>
                <p style={{
                  fontSize: '40px',
                  fontWeight: '700',
                  color: proposalTheme.success,
                  margin: '0 0 12px',
                }}>
                  {formatCurrency(incentive)}
                </p>
                <p style={{
                  color: proposalTheme.textSecondary,
                  fontSize: '16px',
                  margin: '0 0 16px',
                }}>
                  {section?.content || 'Estimated rebate from your utility provider'}
                </p>
                <div style={{
                  display: 'inline-block',
                  backgroundColor: proposalTheme.bgCard,
                  padding: '12px 24px',
                  borderRadius: '10px',
                  border: `1px solid ${proposalTheme.border}`,
                }}>
                  <span style={{ color: proposalTheme.textMuted, fontSize: '14px' }}>Net cost after {discountAmount > 0 ? 'discount & ' : ''}incentive: </span>
                  <span style={{ color: proposalTheme.text, fontSize: '18px', fontWeight: '700' }}>
                    {formatCurrency(totalCost - discountAmount - incentive)}
                  </span>
                </div>
              </div>
            </ProposalSection>
          </div>
        )

      case 'team':
        return (
          <div key={index} style={{
            padding: proposalTheme.sectionPadding,
            backgroundColor: proposalTheme.bgCard,
          }}>
            <div style={{ maxWidth: proposalTheme.maxWidth, margin: '0 auto', textAlign: 'center' }}>
              <ProposalSection>
                <h2 style={{
                  fontSize: '28px',
                  fontWeight: '700',
                  color: proposalTheme.text,
                  margin: '0 0 32px',
                  fontFamily: proposalTheme.fontFamily,
                }}>
                  Your Team
                </h2>
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  gap: '32px',
                  flexWrap: 'wrap',
                }}>
                  {doc.salesperson_name && (
                    <div style={{ textAlign: 'center' }}>
                      <div style={{
                        width: '80px',
                        height: '80px',
                        borderRadius: '50%',
                        backgroundColor: proposalTheme.accentBg,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        margin: '0 auto 12px',
                        fontSize: '28px',
                        fontWeight: '600',
                        color: proposalTheme.accent,
                      }}>
                        {doc.salesperson_name.charAt(0).toUpperCase()}
                      </div>
                      <p style={{ fontWeight: '600', color: proposalTheme.text, margin: '0 0 2px', fontSize: '15px' }}>
                        {doc.salesperson_name}
                      </p>
                      <p style={{ color: proposalTheme.textMuted, fontSize: '13px', margin: 0 }}>
                        Sales Representative
                      </p>
                    </div>
                  )}
                </div>
              </ProposalSection>
            </div>
          </div>
        )

      case 'approval':
        return (
          <ApprovalSection
            key={index}
            section={section}
            isApproved={isApproved}
            approvalSuccess={approvalSuccess}
            expirationDate={doc.expiration_date}
            onApprove={onApprove}
            approverName={approverName}
            setApproverName={setApproverName}
            approverEmail={approverEmail}
            setApproverEmail={setApproverEmail}
          />
        )

      default:
        return null
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: proposalTheme.bg,
      fontFamily: proposalTheme.fontFamily,
    }}>
      {/* Inject animations */}
      <style>{`
        @keyframes spin { to { transform: rotate(360deg) } }
        * { box-sizing: border-box; }
        html { scroll-behavior: smooth; }
      `}</style>

      {sections.map((section, i) => renderSection(section, i))}

      {/* Document Credentials Footer */}
      <div style={{
        borderTop: `1px solid ${proposalTheme.border}`,
        padding: '32px 24px 48px',
        maxWidth: proposalTheme.maxWidth,
        margin: '0 auto',
      }}>
        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          gap: '24px',
          marginBottom: '20px',
        }}>
          {/* Left: Document info */}
          <div style={{ fontSize: '11px', color: proposalTheme.textMuted, lineHeight: 1.8 }}>
            {doc.salesperson_name && (
              <div>Prepared by <span style={{ color: proposalTheme.textSecondary, fontWeight: '500' }}>{doc.salesperson_name}</span></div>
            )}
            <div>
              On behalf of <span style={{ color: proposalTheme.textSecondary, fontWeight: '500' }}>{brandName}</span>
            </div>
            {layout?.generated_at && (
              <div>Generated {new Date(layout.generated_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
            )}
            {doc.quote_number && <div>Reference: {doc.quote_number}</div>}
          </div>

          {/* Right: Certification & attribution */}
          <div style={{ fontSize: '11px', color: proposalTheme.textMuted, lineHeight: 1.8, textAlign: 'right' }}>
            {certified && (
              <div style={{ color: proposalTheme.certGold, fontWeight: '600' }}>
                Certified Investment Grade Energy Audit
              </div>
            )}
            {certified && (
              <div>Financial analysis produced by {brandName}</div>
            )}
            <div>Proposal content co-authored by Claude AI</div>
            <div>Powered by Job Scout</div>
          </div>
        </div>

        {/* Divider */}
        <div style={{ borderTop: `1px solid ${proposalTheme.border}`, paddingTop: '16px' }}>
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'space-between',
            gap: '12px',
            fontSize: '10px',
            color: proposalTheme.textMuted,
            lineHeight: 1.6,
          }}>
            <div style={{ maxWidth: '500px' }}>
              This proposal is confidential and intended solely for {customer?.business_name || customer?.name || 'the intended recipient'}.
              All pricing, projections, and financial estimates are valid as of the date above and subject to change.
              {certified && ' Energy savings projections are based on certified audit data and actual operating conditions; actual results may vary based on usage patterns and utility rate changes.'}
              {doc.expiration_date && ` This proposal expires ${new Date(doc.expiration_date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}.`}
            </div>
            <div style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
              &copy; {new Date().getFullYear()} {company?.company_name || brandName}. All rights reserved.
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

// Generate default section layout when AI hasn't generated one
function getDefaultSections(doc, customer, brandName) {
  return [
    { type: 'hero', heading: `Proposal for ${customer?.business_name || customer?.name || 'You'}`, subheading: `Prepared by ${brandName}` },
    { type: 'executive_summary', content: doc.estimate_message || 'Thank you for the opportunity to provide this proposal. We look forward to working with you.' },
    { type: 'line_items' },
    { type: 'cost_breakdown' },
    { type: 'roi_summary' },
    { type: 'approval', cta_text: 'Approve This Proposal' },
  ]
}

function findMetric(sections, key) {
  for (const s of sections) {
    if (s.metrics && s.metrics[key]) return s.metrics[key]
    if (s.type === 'roi_summary' && s.metrics?.[key]) return s.metrics[key]
    if (s.type === 'savings_timeline' && s[key]) return s[key]
  }
  return 0
}
