import { motion } from 'framer-motion'
import proposalTheme from './proposalTheme'

export default function HeroSection({ section, company, customer, logoUrl }) {
  const heading = section?.heading || `Proposal for ${customer?.business_name || customer?.name || 'You'}`
  const subheading = section?.subheading || `Prepared by ${company?.company_name || 'Our Team'}`

  return (
    <div style={{
      position: 'relative',
      backgroundColor: proposalTheme.heroBg,
      padding: '80px 24px',
      textAlign: 'center',
      overflow: 'hidden',
      minHeight: '320px',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
    }}>
      {/* Topo pattern overlay */}
      <div style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: proposalTheme.topoBgImage,
        backgroundSize: '400px 400px',
        opacity: 0.4,
      }} />

      <div style={{ position: 'relative', zIndex: 1, maxWidth: proposalTheme.maxWidth, margin: '0 auto' }}>
        {logoUrl && (
          <motion.img
            src={logoUrl}
            alt={company?.company_name || ''}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5 }}
            style={{
              maxHeight: '70px',
              maxWidth: '220px',
              objectFit: 'contain',
              marginBottom: '24px',
              filter: 'brightness(0) invert(1)',
            }}
          />
        )}

        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          style={{
            color: proposalTheme.heroText,
            fontSize: proposalTheme.headingSize,
            fontWeight: '700',
            lineHeight: 1.2,
            margin: '0 0 12px',
            fontFamily: proposalTheme.fontFamily,
          }}
        >
          {heading}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          style={{
            color: proposalTheme.heroSubtext,
            fontSize: proposalTheme.subheadingSize,
            fontWeight: '400',
            margin: '0 0 32px',
            fontFamily: proposalTheme.fontFamily,
          }}
        >
          {subheading}
        </motion.p>

        {customer && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.6 }}
            style={{
              display: 'inline-block',
              backgroundColor: 'rgba(255,255,255,0.1)',
              padding: '12px 28px',
              borderRadius: '30px',
              border: '1px solid rgba(255,255,255,0.15)',
            }}
          >
            <span style={{ color: proposalTheme.heroSubtext, fontSize: '14px' }}>Prepared for </span>
            <span style={{ color: proposalTheme.heroText, fontSize: '14px', fontWeight: '600' }}>
              {customer.business_name || customer.name}
            </span>
          </motion.div>
        )}
      </div>
    </div>
  )
}
