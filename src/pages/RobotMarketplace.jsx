import { useTheme } from '../components/Layout'
import { useIsMobile } from '../hooks/useIsMobile'

export default function RobotMarketplace() {
  const isMobile = useIsMobile()
  const themeContext = useTheme()
  const theme = themeContext?.theme || {
    bg: '#f7f5ef',
    bgCard: '#ffffff',
    border: '#d6cdb8',
    text: '#2c3530',
    textSecondary: '#4d5a52',
    textMuted: '#7d8a7f',
    accent: '#5a6349'
  }

  const previewRobots = [
    { icon: '🛸', name: 'Audit Drone', desc: 'Ceiling inspection & photo capture', training: 'LED Audit Training' },
    { icon: '🤖', name: 'Inventory Bot', desc: 'Warehouse scanning & counting', training: 'Inventory Management' },
    { icon: '🔍', name: 'Inspector Bot', desc: 'Quality control & documentation', training: 'QC Inspection' },
    { icon: '🚁', name: 'Survey Drone', desc: 'Site mapping & measurements', training: 'Site Survey Training' },
    { icon: '🧹', name: 'Cleaning Bot', desc: 'Commercial floor maintenance', training: 'Facility Maintenance' },
    { icon: '📦', name: 'Delivery Bot', desc: 'Material transport on job sites', training: 'Logistics Training' }
  ]

  return (
    <div style={{ padding: isMobile ? '16px' : '24px', minHeight: '100vh' }}>
      {/* Header */}
      <div style={{ marginBottom: isMobile ? '20px' : '32px' }}>
        <h1 style={{ fontSize: isMobile ? '22px' : '28px', fontWeight: '700', color: theme.text, marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: isMobile ? '26px' : '32px' }}>🤖</span>
          Robot Marketplace
        </h1>
        <p style={{ color: theme.textSecondary, fontSize: '15px' }}>
          Physical robots and job-specific training programs for field service automation
        </p>
      </div>

      {/* Coming Soon Hero Card */}
      <div style={{
        backgroundColor: theme.bgCard,
        border: `1px solid ${theme.border}`,
        borderRadius: '16px',
        padding: isMobile ? '32px 20px' : '60px 40px',
        textAlign: 'center',
        marginBottom: isMobile ? '20px' : '32px'
      }}>
        <div style={{ fontSize: isMobile ? '48px' : '72px', marginBottom: '20px' }}>🚀</div>
        <h2 style={{ color: theme.text, fontSize: isMobile ? '22px' : '28px', fontWeight: '700', marginBottom: '16px' }}>
          Coming Soon
        </h2>
        <p style={{ color: theme.textMuted, maxWidth: '500px', margin: '0 auto', lineHeight: '1.6', fontSize: '15px' }}>
          Deploy physical robots to automate field service tasks. Each robot comes with
          customizable training programs tailored to your specific workflows - LED audits,
          inventory management, site inspections, and more.
        </p>

        {/* Feature Pills */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '24px', flexWrap: 'wrap' }}>
          {['Inspection Drones', 'Inventory Bots', 'Training Programs', 'Job Scout Integration'].map((feature, i) => (
            <span key={i} style={{
              padding: '8px 16px',
              backgroundColor: 'rgba(168,85,247,0.1)',
              color: '#a855f7',
              borderRadius: '20px',
              fontSize: '13px',
              fontWeight: '500'
            }}>
              {feature}
            </span>
          ))}
        </div>
      </div>

      {/* How It Works */}
      <div style={{ marginBottom: isMobile ? '20px' : '32px' }}>
        <h3 style={{ fontSize: isMobile ? '16px' : '18px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
          How It Works
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fit, minmax(200px, 1fr))', gap: isMobile ? '10px' : '16px' }}>
          {[
            { step: '1', title: 'Choose Robot', desc: 'Select from drones, bots, and automated systems' },
            { step: '2', title: 'Add Training', desc: 'Pick job-specific training programs' },
            { step: '3', title: 'Deploy', desc: 'Integrate with your Job Scout workflows' },
            { step: '4', title: 'Automate', desc: 'Let robots handle repetitive tasks' }
          ].map((item, i) => (
            <div key={i} style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '12px',
              padding: '20px'
            }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: theme.accent,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '700',
                fontSize: '14px',
                marginBottom: '12px'
              }}>
                {item.step}
              </div>
              <h4 style={{ color: theme.text, fontSize: '15px', fontWeight: '600', marginBottom: '4px' }}>{item.title}</h4>
              <p style={{ color: theme.textMuted, fontSize: '13px' }}>{item.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Preview Robot Cards */}
      <div>
        <h3 style={{ fontSize: '18px', fontWeight: '600', color: theme.text, marginBottom: '16px' }}>
          Preview: Available Robots
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(280px, 1fr))', gap: isMobile ? '12px' : '20px' }}>
          {previewRobots.map((robot, i) => (
            <div key={i} style={{
              backgroundColor: theme.bgCard,
              border: `1px solid ${theme.border}`,
              borderRadius: '12px',
              padding: '24px',
              opacity: 0.7,
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Coming Soon Badge */}
              <div style={{
                position: 'absolute',
                top: '12px',
                right: '12px',
                padding: '4px 10px',
                backgroundColor: 'rgba(249,115,22,0.1)',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: '500',
                color: '#f97316'
              }}>
                Coming Soon
              </div>

              <div style={{ fontSize: '48px', marginBottom: '16px' }}>{robot.icon}</div>
              <h3 style={{ color: theme.text, fontSize: '18px', fontWeight: '600', marginBottom: '6px' }}>{robot.name}</h3>
              <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '16px' }}>{robot.desc}</p>

              {/* Training Badge */}
              <div style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 12px',
                backgroundColor: 'rgba(34,197,94,0.1)',
                borderRadius: '6px',
                fontSize: '12px',
                color: '#22c55e'
              }}>
                <span>📚</span>
                {robot.training}
              </div>

              {/* Disabled Button */}
              <button
                disabled
                style={{
                  width: '100%',
                  marginTop: '16px',
                  padding: '10px',
                  backgroundColor: theme.bg,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  color: theme.textMuted,
                  fontSize: '13px',
                  cursor: 'not-allowed'
                }}
              >
                View Details
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Notify Section */}
      <div style={{
        marginTop: '40px',
        backgroundColor: 'rgba(168,85,247,0.05)',
        border: '1px solid rgba(168,85,247,0.2)',
        borderRadius: '12px',
        padding: '24px',
        textAlign: 'center'
      }}>
        <h3 style={{ color: theme.text, fontSize: '16px', fontWeight: '600', marginBottom: '8px' }}>
          Interested in Robot Automation?
        </h3>
        <p style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '16px' }}>
          We're building the future of field service automation. Stay tuned for launch.
        </p>
        <button
          disabled
          style={{
            padding: '10px 24px',
            backgroundColor: '#a855f7',
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            fontSize: '14px',
            fontWeight: '500',
            cursor: 'not-allowed',
            opacity: 0.6
          }}
        >
          Get Notified (Coming Soon)
        </button>
      </div>
    </div>
  )
}
