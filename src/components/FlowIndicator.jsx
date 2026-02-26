import { useState, useEffect } from 'react'
import { Check, ChevronRight } from 'lucide-react'

const stages = [
  // Sales
  { id: 'New', label: 'New', color: '#3b82f6', phase: 'sales' },
  { id: 'Contacted', label: 'Contacted', color: '#8b5cf6', phase: 'sales' },
  { id: 'Appointment Set', label: 'Appt Set', color: '#22c55e', phase: 'sales' },
  { id: 'Qualified', label: 'Qualified', color: '#3b82f6', phase: 'sales' },
  { id: 'Quote Sent', label: 'Quote Sent', color: '#8b5cf6', phase: 'sales' },
  { id: 'Negotiation', label: 'Negotiation', color: '#f59e0b', phase: 'sales' },
  { id: 'Won', label: 'Won', color: '#10b981', phase: 'sales' },
  // Delivery
  { id: 'Job Scheduled', label: 'Scheduled', color: '#0ea5e9', phase: 'delivery' },
  { id: 'In Progress', label: 'In Progress', color: '#f97316', phase: 'delivery' },
  { id: 'Job Complete', label: 'Complete', color: '#22c55e', phase: 'delivery' },
  { id: 'Invoiced', label: 'Invoiced', color: '#8b5cf6', phase: 'delivery' },
  { id: 'Closed', label: 'Closed', color: '#6b7280', phase: 'delivery' },
  // Lost
  { id: 'Lost', label: 'Lost', color: '#64748b', phase: 'lost' }
]

export default function FlowIndicator({ currentStatus, showCompact = false, onStageClick }) {
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const currentIndex = stages.findIndex(s => s.id === currentStatus)
  const isLost = currentStatus === 'Lost'
  const currentPhase = currentIndex >= 0 ? stages[currentIndex].phase : 'sales'

  if ((showCompact || isMobile) && currentIndex >= 0) {
    const currentStage = stages[currentIndex]
    const nextStage = !isLost && currentStatus !== 'Closed' && currentIndex < stages.length - 2 ? stages[currentIndex + 1] : null

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#f7f5ef', borderRadius: '8px', fontSize: '13px', overflowX: 'auto', WebkitOverflowScrolling: 'touch', marginBottom: '16px' }}>
        {/* Phase label */}
        <div style={{ fontSize: '10px', fontWeight: '700', color: currentPhase === 'delivery' ? '#0ea5e9' : '#7d8a7f', textTransform: 'uppercase', letterSpacing: '0.5px', whiteSpace: 'nowrap' }}>
          {currentPhase === 'delivery' ? 'DELIVERY' : 'SALES'}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 10px', backgroundColor: currentStage.color + '20', color: currentStage.color, borderRadius: '16px', fontWeight: '600', whiteSpace: 'nowrap' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: currentStage.color }} />
          {currentStage.label}
        </div>
        {nextStage && (
          <>
            <ChevronRight size={16} style={{ color: '#7d8a7f', flexShrink: 0 }} />
            <div style={{ color: '#7d8a7f', fontSize: '12px', whiteSpace: 'nowrap' }}>Next: {nextStage.label}</div>
          </>
        )}
        {currentStatus === 'Closed' && <Check size={16} style={{ color: '#6b7280', flexShrink: 0 }} />}
      </div>
    )
  }

  // Full desktop flow
  const displayStages = stages.filter(s => s.id !== 'Lost')
  const wonIndex = displayStages.findIndex(s => s.id === 'Won')

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '8px', marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 'max-content', padding: '8px 4px' }}>
        {displayStages.map((stage, index) => {
          const isCompleted = !isLost && index < currentIndex
          const isCurrent = stage.id === currentStatus
          const showSeparator = index === wonIndex + 1 && wonIndex >= 0

          return (
            <div key={stage.id} style={{ display: 'flex', alignItems: 'center' }}>
              {/* Phase separator between sales and delivery */}
              {showSeparator && (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  margin: '0 6px',
                  padding: '4px 8px',
                  fontSize: '9px',
                  fontWeight: '700',
                  color: '#7d8a7f',
                  letterSpacing: '0.5px',
                  whiteSpace: 'nowrap'
                }}>
                  <div style={{ width: '12px', height: '1px', backgroundColor: '#d1d5db' }} />
                  <span>DELIVERY</span>
                  <div style={{ width: '12px', height: '1px', backgroundColor: '#d1d5db' }} />
                </div>
              )}
              <div onClick={() => onStageClick?.(stage.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: isMobile ? '8px 10px' : '6px 12px', borderRadius: '16px', fontSize: isMobile ? '11px' : '12px', fontWeight: isCurrent || isCompleted ? '600' : '400', cursor: onStageClick ? 'pointer' : 'default', transition: 'all 0.15s ease', minHeight: isMobile ? '36px' : 'auto', backgroundColor: isCurrent ? stage.color + '20' : isCompleted ? '#dcfce7' : '#f3f4f6', color: isCurrent ? stage.color : isCompleted ? '#16a34a' : '#9ca3af', border: isCurrent ? '2px solid ' + stage.color : '2px solid transparent' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: isCurrent ? stage.color : isCompleted ? '#16a34a' : '#d1d5db', color: '#fff', fontSize: '10px' }}>
                  {isCompleted ? <Check size={10} strokeWidth={3} /> : <span style={{ fontSize: '8px', fontWeight: '700' }}>{index + 1}</span>}
                </div>
                <span style={{ whiteSpace: 'nowrap' }}>{stage.label}</span>
              </div>
              {index < displayStages.length - 1 && !showSeparator && !(index === wonIndex) && (
                <div style={{ width: isMobile ? '12px' : '20px', height: '2px', backgroundColor: isCompleted ? '#16a34a' : '#e5e7eb', margin: '0 2px' }} />
              )}
              {index === wonIndex && (
                <div style={{ width: isMobile ? '6px' : '10px', height: '2px', backgroundColor: isCompleted ? '#16a34a' : '#e5e7eb', margin: '0 2px' }} />
              )}
            </div>
          )
        })}
      </div>
      {isLost && (
        <div style={{ marginTop: '8px', padding: '8px 12px', backgroundColor: '#fee2e2', borderRadius: '8px', display: 'inline-flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#dc2626' }}>
          <div style={{ width: '20px', height: '20px', borderRadius: '50%', backgroundColor: '#dc2626', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '12px', fontWeight: '700' }}>X</div>
          <span style={{ fontWeight: '600' }}>Lead Lost</span>
        </div>
      )}
    </div>
  )
}

export { stages }
