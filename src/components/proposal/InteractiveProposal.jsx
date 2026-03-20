import { useState } from 'react'
import { motion } from 'framer-motion'
import HeroSection from './HeroSection'
import SolutionSection from './SolutionSection'
import CostBreakdownSection from './CostBreakdownSection'
import SavingsSection from './SavingsSection'
import ROISection from './ROISection'
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
  const sections = layout?.sections || getDefaultSections(doc, customer, company)

  const logoUrl = business_unit?.logo_url || company?.logo_url
  const isApproved = doc.status === 'Approved' || !!approval || approvalSuccess
  const totalCost = line_items?.reduce((sum, li) => sum + (parseFloat(li.total) || 0), 0) || 0
  const annualSavings = findMetric(sections, 'annual_savings')
  const incentive = parseFloat(doc.utility_incentive) || 0

  // Render each section based on type
  const renderSection = (section, index) => {
    switch (section.type) {
      case 'hero':
        return (
          <HeroSection
            key={index}
            section={section}
            company={company}
            customer={customer}
            logoUrl={logoUrl}
          />
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
          />
        )

      case 'savings_timeline':
        return (
          <SavingsSection
            key={index}
            section={section}
            totalCost={totalCost}
            annualSavings={annualSavings}
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
          />
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
                  <span style={{ color: proposalTheme.textMuted, fontSize: '14px' }}>Net cost after incentive: </span>
                  <span style={{ color: proposalTheme.text, fontSize: '18px', fontWeight: '700' }}>
                    {formatCurrency(totalCost - incentive)}
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

      {/* Footer */}
      <div style={{
        textAlign: 'center',
        padding: '24px 16px 48px',
        borderTop: `1px solid ${proposalTheme.border}`,
      }}>
        <p style={{
          color: proposalTheme.textMuted,
          fontSize: '12px',
          margin: 0,
        }}>
          Powered by Job Scout
        </p>
      </div>
    </div>
  )
}

// Generate default section layout when AI hasn't generated one
function getDefaultSections(doc, customer, company) {
  return [
    { type: 'hero', heading: `Proposal for ${customer?.business_name || customer?.name || 'You'}`, subheading: `Prepared by ${company?.company_name || 'Our Team'}` },
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
