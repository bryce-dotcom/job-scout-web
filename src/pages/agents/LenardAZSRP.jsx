import { useState, useCallback, useEffect } from 'react'

// ===================================================================
// Lenard AZ SRP — Public SRP Lighting Rebate Calculator
// Self-contained, no auth, no store.js, no Layout wrapper
// ===================================================================

// SRP rebate rates by lamp type and wattage range (per fixture, prescriptive)
// Based on SRP Business Solutions Commercial Lighting program
const SRP_REBATES = {
  'T12': [
    { minW: 0, maxW: 60, ledW: 15, rebate: 20, label: '1-lamp 4ft' },
    { minW: 61, maxW: 80, ledW: 25, rebate: 30, label: '2-lamp 4ft' },
    { minW: 81, maxW: 100, ledW: 30, rebate: 40, label: '2-lamp 4ft (high)' },
    { minW: 101, maxW: 140, ledW: 40, rebate: 50, label: '3-lamp 4ft' },
    { minW: 141, maxW: 170, ledW: 50, rebate: 60, label: '4-lamp 4ft' },
    { minW: 171, maxW: 999, ledW: 55, rebate: 75, label: '4-lamp 4ft (high)' },
  ],
  'T8': [
    { minW: 0, maxW: 40, ledW: 12, rebate: 15, label: '1-lamp 4ft' },
    { minW: 41, maxW: 70, ledW: 25, rebate: 25, label: '2-lamp 4ft' },
    { minW: 71, maxW: 95, ledW: 35, rebate: 35, label: '3-lamp 4ft' },
    { minW: 96, maxW: 120, ledW: 45, rebate: 45, label: '4-lamp 4ft' },
    { minW: 121, maxW: 999, ledW: 48, rebate: 50, label: '4-lamp 4ft (high)' },
  ],
  'T5': [
    { minW: 0, maxW: 35, ledW: 12, rebate: 20, label: '1-lamp' },
    { minW: 36, maxW: 70, ledW: 25, rebate: 30, label: '2-lamp' },
    { minW: 71, maxW: 999, ledW: 35, rebate: 40, label: '3-lamp' },
  ],
  'T5HO': [
    { minW: 0, maxW: 130, ledW: 50, rebate: 40, label: '1-lamp' },
    { minW: 131, maxW: 260, ledW: 95, rebate: 65, label: '2-lamp' },
    { minW: 261, maxW: 380, ledW: 140, rebate: 90, label: '3-lamp' },
    { minW: 381, maxW: 999, ledW: 180, rebate: 110, label: '4-lamp' },
  ],
  'Metal Halide': [
    { minW: 0, maxW: 100, ledW: 30, rebate: 50, label: '70W MH' },
    { minW: 101, maxW: 150, ledW: 45, rebate: 75, label: '100W MH' },
    { minW: 151, maxW: 220, ledW: 70, rebate: 100, label: '150-175W MH' },
    { minW: 221, maxW: 300, ledW: 80, rebate: 125, label: '200-250W MH' },
    { minW: 301, maxW: 500, ledW: 100, rebate: 175, label: '320-400W MH' },
    { minW: 501, maxW: 999, ledW: 150, rebate: 250, label: '400W+ MH' },
    { minW: 1000, maxW: 9999, ledW: 400, rebate: 350, label: '1000W MH' },
  ],
  'HPS': [
    { minW: 0, maxW: 100, ledW: 30, rebate: 50, label: '70W HPS' },
    { minW: 101, maxW: 150, ledW: 45, rebate: 75, label: '100W HPS' },
    { minW: 151, maxW: 250, ledW: 70, rebate: 100, label: '150W HPS' },
    { minW: 251, maxW: 320, ledW: 90, rebate: 125, label: '250W HPS' },
    { minW: 321, maxW: 500, ledW: 100, rebate: 175, label: '320-400W HPS' },
    { minW: 501, maxW: 999, ledW: 150, rebate: 225, label: '400W+ HPS' },
    { minW: 1000, maxW: 9999, ledW: 400, rebate: 350, label: '1000W HPS' },
  ],
  'Mercury Vapor': [
    { minW: 0, maxW: 220, ledW: 70, rebate: 100, label: '175W MV' },
    { minW: 221, maxW: 320, ledW: 100, rebate: 150, label: '250W MV' },
    { minW: 321, maxW: 500, ledW: 150, rebate: 200, label: '400W MV' },
    { minW: 501, maxW: 9999, ledW: 400, rebate: 300, label: '1000W MV' },
  ],
  'Halogen': [
    { minW: 0, maxW: 60, ledW: 7, rebate: 5, label: 'PAR20/MR16' },
    { minW: 61, maxW: 100, ledW: 10, rebate: 8, label: 'PAR30' },
    { minW: 101, maxW: 160, ledW: 12, rebate: 10, label: 'PAR38' },
    { minW: 161, maxW: 350, ledW: 18, rebate: 15, label: 'PAR38 High' },
    { minW: 351, maxW: 999, ledW: 36, rebate: 25, label: 'PAR56/Flood' },
  ],
  'Incandescent': [
    { minW: 0, maxW: 50, ledW: 6, rebate: 3, label: 'A19' },
    { minW: 51, maxW: 70, ledW: 9, rebate: 5, label: 'A19 60W' },
    { minW: 71, maxW: 85, ledW: 11, rebate: 6, label: 'A19 75W' },
    { minW: 86, maxW: 120, ledW: 15, rebate: 8, label: 'A21 100W' },
    { minW: 121, maxW: 999, ledW: 20, rebate: 10, label: 'PS25 150W' },
  ],
  'CFL': [
    { minW: 0, maxW: 15, ledW: 9, rebate: 5, label: '13W CFL' },
    { minW: 16, maxW: 22, ledW: 12, rebate: 8, label: '18W CFL' },
    { minW: 23, maxW: 30, ledW: 15, rebate: 10, label: '26W CFL' },
    { minW: 31, maxW: 38, ledW: 18, rebate: 12, label: '32W CFL' },
    { minW: 39, maxW: 999, ledW: 24, rebate: 15, label: '42W CFL' },
  ],
}

// Common existing system wattages for quick-select (includes ballast losses)
const COMMON_WATTAGES = {
  'T12':            [46, 72, 86, 128, 158, 172],
  'T8':             [32, 59, 85, 112, 118],
  'T5':             [28, 58, 84],
  'T5HO':           [118, 234, 348, 464],
  'Metal Halide':   [85, 120, 185, 210, 290, 455, 1080],
  'HPS':            [85, 120, 185, 240, 295, 465, 1100],
  'Mercury Vapor':  [200, 290, 455, 1075],
  'Halogen':        [50, 75, 90, 150, 300, 500],
  'Incandescent':   [40, 60, 75, 100, 150],
  'CFL':            [13, 18, 26, 32, 42],
}

const LAMP_TYPES = Object.keys(SRP_REBATES)

// SRP default electric rate ($/kWh)
const SRP_DEFAULT_RATE = 0.1024

function lookupRebate(lampType, wattage) {
  const schedule = SRP_REBATES[lampType]
  if (!schedule) return null
  for (const tier of schedule) {
    if (wattage >= tier.minW && wattage <= tier.maxW) {
      return tier
    }
  }
  return null
}

function formatMoney(val) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

function formatMoneyDecimal(val) {
  return val.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatNumber(val) {
  return val.toLocaleString('en-US', { maximumFractionDigits: 0 })
}

// --- Styles ---
const theme = {
  bg: '#0a0a0b',
  bgCard: '#18181b',
  bgInput: '#27272a',
  border: '#3f3f46',
  borderHover: '#52525b',
  text: '#fafafa',
  textSecondary: '#a1a1aa',
  textMuted: '#71717a',
  accent: '#f97316',
  accentBg: 'rgba(249,115,22,0.12)',
  accentHover: '#ea580c',
  green: '#22c55e',
  greenBg: 'rgba(34,197,94,0.12)',
  blue: '#3b82f6',
  blueBg: 'rgba(59,130,246,0.12)',
}

const emptyLine = () => ({
  id: Date.now() + Math.random(),
  lampType: 'T8',
  wattage: '',
  ledWattage: '',
  quantity: 1,
  rebatePerFixture: 0,
})

export default function LenardAZSRP() {
  const [lines, setLines] = useState([emptyLine()])
  const [electricRate, setElectricRate] = useState(SRP_DEFAULT_RATE)
  const [hoursPerDay, setHoursPerDay] = useState(10)
  const [daysPerYear, setDaysPerYear] = useState(260)

  // Register service worker + manifest for offline PWA support
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-lenard.js').catch(() => {});
    }
    // Inject Lenard-specific manifest (separate from main app PWA)
    const link = document.createElement('link');
    link.rel = 'manifest';
    link.href = '/manifest-lenard.json';
    document.head.appendChild(link);
    // Set theme-color for mobile browser chrome
    let meta = document.querySelector('meta[name="theme-color"]');
    const original = meta?.getAttribute('content');
    if (meta) meta.setAttribute('content', '#f97316');
    return () => {
      document.head.removeChild(link);
      if (meta && original) meta.setAttribute('content', original);
    };
  }, []);

  const annualHours = hoursPerDay * daysPerYear

  const updateLine = useCallback((id, field, value) => {
    setLines(prev => prev.map(line => {
      if (line.id !== id) return line
      const updated = { ...line, [field]: value }

      // Auto-fill LED wattage and rebate when lamp type or wattage changes
      if (field === 'lampType' || field === 'wattage') {
        const w = field === 'wattage' ? Number(value) : Number(updated.wattage)
        const lt = field === 'lampType' ? value : updated.lampType
        if (w > 0) {
          const tier = lookupRebate(lt, w)
          if (tier) {
            updated.ledWattage = tier.ledW
            updated.rebatePerFixture = tier.rebate
          } else {
            updated.ledWattage = ''
            updated.rebatePerFixture = 0
          }
        }
      }
      return updated
    }))
  }, [])

  const addLine = () => setLines(prev => [...prev, emptyLine()])

  const removeLine = (id) => {
    setLines(prev => {
      if (prev.length <= 1) return prev
      return prev.filter(l => l.id !== id)
    })
  }

  // Calculations
  const summary = lines.reduce((acc, line) => {
    const qty = Number(line.quantity) || 0
    const existW = Number(line.wattage) || 0
    const ledW = Number(line.ledWattage) || 0
    const rebate = Number(line.rebatePerFixture) || 0
    const wattsReduced = Math.max(0, existW - ledW)

    acc.totalFixtures += qty
    acc.totalExistingWatts += existW * qty
    acc.totalLedWatts += ledW * qty
    acc.totalWattsReduced += wattsReduced * qty
    acc.totalRebate += rebate * qty
    return acc
  }, { totalFixtures: 0, totalExistingWatts: 0, totalLedWatts: 0, totalWattsReduced: 0, totalRebate: 0 })

  const annualKwhSaved = (summary.totalWattsReduced * annualHours) / 1000
  const annualDollarSaved = annualKwhSaved * electricRate

  // --- Inline styles ---
  const containerStyle = {
    minHeight: '100vh',
    backgroundColor: theme.bg,
    color: theme.text,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  }

  const headerStyle = {
    background: 'linear-gradient(135deg, #18181b 0%, #1c1917 100%)',
    borderBottom: `1px solid ${theme.border}`,
    padding: '20px 24px',
    textAlign: 'center',
  }

  const cardStyle = {
    background: theme.bgCard,
    borderRadius: '12px',
    border: `1px solid ${theme.border}`,
    padding: '20px',
    marginBottom: '16px',
  }

  const inputStyle = {
    width: '100%',
    padding: '10px 12px',
    background: theme.bgInput,
    border: `1px solid ${theme.border}`,
    borderRadius: '8px',
    color: theme.text,
    fontSize: '14px',
    outline: 'none',
    boxSizing: 'border-box',
  }

  const selectStyle = {
    ...inputStyle,
    cursor: 'pointer',
    appearance: 'none',
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%2371717a' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 12px center',
    paddingRight: '32px',
  }

  const labelStyle = {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: theme.textSecondary,
    marginBottom: '4px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
  }

  const btnPrimary = {
    padding: '10px 20px',
    background: theme.accent,
    color: '#fff',
    borderRadius: '8px',
    border: 'none',
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '14px',
  }

  const btnOutline = {
    padding: '8px 16px',
    background: 'transparent',
    color: theme.accent,
    borderRadius: '8px',
    border: `1px solid ${theme.accent}`,
    cursor: 'pointer',
    fontWeight: '600',
    fontSize: '13px',
  }

  const statCard = (value, label, color, bgColor) => (
    <div style={{
      background: bgColor,
      borderRadius: '12px',
      border: `1px solid ${theme.border}`,
      padding: '16px',
      textAlign: 'center',
      flex: 1,
      minWidth: '140px',
    }}>
      <div style={{ fontSize: '28px', fontWeight: '700', color, lineHeight: '1.1' }}>{value}</div>
      <div style={{ fontSize: '12px', color: theme.textMuted, marginTop: '6px' }}>{label}</div>
    </div>
  )

  return (
    <div style={containerStyle}>
      {/* Header */}
      <div style={headerStyle}>
        <h1 style={{ fontSize: '28px', fontWeight: '800', margin: '0 0 6px 0', lineHeight: '1.2' }}>
          <span style={{ color: theme.accent }}>Lenard</span>{' '}
          <span style={{ color: theme.text }}>AZ SRP</span>
        </h1>
        <p style={{ fontSize: '14px', color: theme.textSecondary, margin: 0 }}>
          SRP Lighting Rebate Calculator &bull; by Job Scout
        </p>
      </div>

      {/* Main content */}
      <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 16px 80px' }}>

        {/* Project Settings */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginTop: 0, marginBottom: '16px' }}>
            Project Settings
          </h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '12px' }}>
            <div>
              <label style={labelStyle}>Electric Rate ($/kWh)</label>
              <input
                type="number"
                step="0.001"
                value={electricRate}
                onChange={(e) => setElectricRate(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Hours / Day</label>
              <input
                type="number"
                value={hoursPerDay}
                onChange={(e) => setHoursPerDay(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Days / Year</label>
              <input
                type="number"
                value={daysPerYear}
                onChange={(e) => setDaysPerYear(Number(e.target.value) || 0)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Annual Hours</label>
              <div style={{
                padding: '10px 12px',
                background: theme.bgInput,
                borderRadius: '8px',
                border: `1px solid ${theme.border}`,
                fontSize: '14px',
                color: theme.accent,
                fontWeight: '600',
              }}>
                {formatNumber(annualHours)}
              </div>
            </div>
          </div>
        </div>

        {/* Fixture Line Items */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, margin: 0 }}>
              Fixtures
            </h2>
            <button onClick={addLine} style={btnOutline}>
              + Add Fixture
            </button>
          </div>

          {/* Header row (desktop) */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '140px 1fr 100px 100px 80px 90px 40px',
            gap: '8px',
            padding: '0 0 8px',
            borderBottom: `1px solid ${theme.border}`,
            marginBottom: '12px',
          }}>
            <div style={labelStyle}>Lamp Type</div>
            <div style={labelStyle}>Existing Watts</div>
            <div style={labelStyle}>LED Watts</div>
            <div style={labelStyle}>Qty</div>
            <div style={labelStyle}>Rebate/ea</div>
            <div style={labelStyle}>Total</div>
            <div />
          </div>

          {lines.map((line) => {
            const lineRebateTotal = (Number(line.rebatePerFixture) || 0) * (Number(line.quantity) || 0)
            const quickWatts = COMMON_WATTAGES[line.lampType] || []

            return (
              <div key={line.id} style={{ marginBottom: '16px' }}>
                {/* Main row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '140px 1fr 100px 100px 80px 90px 40px',
                  gap: '8px',
                  alignItems: 'center',
                }}>
                  {/* Lamp Type */}
                  <select
                    value={line.lampType}
                    onChange={(e) => updateLine(line.id, 'lampType', e.target.value)}
                    style={selectStyle}
                  >
                    {LAMP_TYPES.map(lt => (
                      <option key={lt} value={lt}>{lt}</option>
                    ))}
                  </select>

                  {/* Existing Wattage */}
                  <input
                    type="number"
                    placeholder="System watts"
                    value={line.wattage}
                    onChange={(e) => updateLine(line.id, 'wattage', e.target.value)}
                    style={inputStyle}
                  />

                  {/* LED Watts */}
                  <input
                    type="number"
                    placeholder="LED W"
                    value={line.ledWattage}
                    onChange={(e) => updateLine(line.id, 'ledWattage', e.target.value)}
                    style={inputStyle}
                  />

                  {/* Quantity */}
                  <input
                    type="number"
                    min="1"
                    value={line.quantity}
                    onChange={(e) => updateLine(line.id, 'quantity', e.target.value)}
                    style={inputStyle}
                  />

                  {/* Rebate per fixture */}
                  <div style={{
                    padding: '10px 8px',
                    fontSize: '14px',
                    color: line.rebatePerFixture > 0 ? theme.green : theme.textMuted,
                    fontWeight: '600',
                    textAlign: 'right',
                  }}>
                    {line.rebatePerFixture > 0 ? formatMoney(line.rebatePerFixture) : '--'}
                  </div>

                  {/* Line total */}
                  <div style={{
                    padding: '10px 8px',
                    fontSize: '14px',
                    color: lineRebateTotal > 0 ? theme.green : theme.textMuted,
                    fontWeight: '700',
                    textAlign: 'right',
                  }}>
                    {lineRebateTotal > 0 ? formatMoney(lineRebateTotal) : '--'}
                  </div>

                  {/* Remove */}
                  <button
                    onClick={() => removeLine(line.id)}
                    style={{
                      background: 'transparent',
                      border: 'none',
                      color: theme.textMuted,
                      cursor: lines.length > 1 ? 'pointer' : 'not-allowed',
                      fontSize: '18px',
                      opacity: lines.length > 1 ? 1 : 0.3,
                      padding: '4px',
                    }}
                    disabled={lines.length <= 1}
                    title="Remove line"
                  >
                    &times;
                  </button>
                </div>

                {/* Quick-select wattage buttons */}
                {quickWatts.length > 0 && (
                  <div style={{
                    display: 'flex',
                    gap: '6px',
                    marginTop: '6px',
                    marginLeft: '148px',
                    flexWrap: 'wrap',
                  }}>
                    {quickWatts.map(w => (
                      <button
                        key={w}
                        onClick={() => updateLine(line.id, 'wattage', String(w))}
                        style={{
                          padding: '3px 10px',
                          fontSize: '12px',
                          borderRadius: '14px',
                          border: Number(line.wattage) === w
                            ? `1px solid ${theme.accent}`
                            : `1px solid ${theme.border}`,
                          background: Number(line.wattage) === w ? theme.accentBg : 'transparent',
                          color: Number(line.wattage) === w ? theme.accent : theme.textMuted,
                          cursor: 'pointer',
                          fontWeight: '500',
                        }}
                      >
                        {w}W
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          })}

          <button onClick={addLine} style={{ ...btnPrimary, width: '100%', marginTop: '8px' }}>
            + Add Another Fixture
          </button>
        </div>

        {/* Summary Cards */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '16px',
          flexWrap: 'wrap',
        }}>
          {statCard(formatNumber(summary.totalFixtures), 'Total Fixtures', theme.text, theme.bgCard)}
          {statCard(formatNumber(summary.totalWattsReduced), 'Watts Reduced', theme.blue, theme.blueBg)}
          {statCard(formatMoney(summary.totalRebate), 'SRP Rebate', theme.green, theme.greenBg)}
          {statCard(formatMoneyDecimal(annualDollarSaved), 'Annual Savings', theme.accent, theme.accentBg)}
        </div>

        {/* Detailed Summary */}
        <div style={cardStyle}>
          <h2 style={{ fontSize: '16px', fontWeight: '600', color: theme.text, marginTop: 0, marginBottom: '16px' }}>
            Project Summary
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            <SummaryRow label="Total Fixtures" value={formatNumber(summary.totalFixtures)} />
            <SummaryRow label="Existing System Watts" value={`${formatNumber(summary.totalExistingWatts)}W`} />
            <SummaryRow label="Proposed LED Watts" value={`${formatNumber(summary.totalLedWatts)}W`} />
            <SummaryRow label="Total Watt Reduction" value={`${formatNumber(summary.totalWattsReduced)}W`} color={theme.blue} />
            <div style={{ borderTop: `1px solid ${theme.border}`, margin: '4px 0' }} />
            <SummaryRow label="Annual kWh Saved" value={`${formatNumber(annualKwhSaved)} kWh`} />
            <SummaryRow label={`Annual Energy Savings (@ ${electricRate}/kWh)`} value={formatMoneyDecimal(annualDollarSaved)} color={theme.accent} />
            <div style={{ borderTop: `1px solid ${theme.border}`, margin: '4px 0' }} />
            <SummaryRow label="SRP Rebate Total" value={formatMoney(summary.totalRebate)} color={theme.green} bold />
          </div>
        </div>

        {/* SRP Program Notes */}
        <div style={{
          ...cardStyle,
          background: theme.accentBg,
          border: `1px solid rgba(249,115,22,0.25)`,
        }}>
          <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.accent, margin: '0 0 8px' }}>
            SRP Business Solutions Program Notes
          </h3>
          <ul style={{
            fontSize: '13px',
            color: theme.textSecondary,
            margin: 0,
            paddingLeft: '20px',
            lineHeight: '1.8',
          }}>
            <li>Rebates shown are estimates based on SRP prescriptive lighting schedules</li>
            <li>LED replacements must be DLC-listed or ENERGY STAR qualified</li>
            <li>Minimum 2,000 annual operating hours required for most measures</li>
            <li>Rebate cannot exceed 75% of total project cost</li>
            <li>Pre-approval may be required for projects over $25,000</li>
            <li>Rates subject to change &mdash; verify with SRP before finalizing quotes</li>
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div style={{
        borderTop: `1px solid ${theme.border}`,
        padding: '16px 24px',
        textAlign: 'center',
        fontSize: '12px',
        color: theme.textMuted,
      }}>
        Powered by HHH Building Services
      </div>
    </div>
  )
}

function SummaryRow({ label, value, color, bold }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <span style={{ fontSize: '14px', color: theme.textSecondary }}>{label}</span>
      <span style={{
        fontSize: bold ? '18px' : '14px',
        fontWeight: bold ? '700' : '600',
        color: color || theme.text,
      }}>{value}</span>
    </div>
  )
}
