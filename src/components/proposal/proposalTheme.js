// Extended theme for interactive proposals
// Builds on the base topo theme with full-width section styling

const proposalTheme = {
  // Base colors (same as app theme)
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentHover: '#4a5239',
  accentBg: 'rgba(90,99,73,0.12)',
  success: '#4a7c59',
  successBg: 'rgba(74,124,89,0.12)',
  error: '#8b5a5a',
  errorBg: 'rgba(139,90,90,0.12)',

  // Proposal-specific
  heroBg: '#2c3530',
  heroText: '#ffffff',
  heroSubtext: 'rgba(255,255,255,0.75)',
  sectionPadding: '64px 24px',
  sectionPaddingMobile: '48px 16px',
  maxWidth: '900px',
  cardRadius: '16px',
  chartColors: ['#5a6349', '#7d8a7f', '#a8b5a0', '#d6cdb8', '#4a7c59', '#8b5a5a'],

  // Typography
  fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
  headingSize: '36px',
  headingSizeMobile: '28px',
  subheadingSize: '20px',
  bodySize: '16px',
  smallSize: '14px',

  // Certification gold
  certGold: '#d4af37',
  certGoldBg: 'rgba(212,175,55,0.12)',
  certGoldBorder: 'rgba(212,175,55,0.4)',

  // Topo pattern SVG (subtle background)
  topoBgImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='400' viewBox='0 0 400 400'%3E%3Cpath d='M50 200 Q100 150 200 180 Q300 210 350 160' fill='none' stroke='%23d6cdb8' stroke-width='1' opacity='0.3'/%3E%3Cpath d='M30 280 Q130 230 230 260 Q330 290 380 240' fill='none' stroke='%23d6cdb8' stroke-width='1' opacity='0.25'/%3E%3Cpath d='M60 120 Q160 70 260 100 Q360 130 390 80' fill='none' stroke='%23d6cdb8' stroke-width='1' opacity='0.2'/%3E%3Cpath d='M20 350 Q120 300 220 330 Q320 360 370 310' fill='none' stroke='%23d6cdb8' stroke-width='1' opacity='0.15'/%3E%3C/svg%3E")`,
}

export default proposalTheme
