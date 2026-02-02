import { useState, useEffect } from 'react'
import { Check, ChevronRight } from 'lucide-react'

const stages = [
  { id: 'New', label: 'New', color: '#3b82f6' },
  { id: 'Contacted', label: 'Contacted', color: '#8b5cf6' },
  { id: 'Callback', label: 'Callback', color: '#f59e0b' },
  { id: 'Appointment Set', label: 'Appt Set', color: '#22c55e' },
  { id: 'Qualified', label: 'Qualified', color: '#3b82f6' },
  { id: 'Quote Sent', label: 'Quote Sent', color: '#8b5cf6' },
  { id: 'Negotiation', label: 'Negotiation', color: '#f59e0b' },
  { id: 'Won', label: 'Won', color: '#10b981' },
  { id: 'Lost', label: 'Lost', color: '#64748b' }
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

  if ((showCompact || isMobile) && currentIndex >= 0) {
    const currentStage = stages[currentIndex]
    const nextStage = !isLost && currentIndex < stages.length - 2 ? stages[currentIndex + 1] : null

    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', backgroundColor: '#f7f5ef', borderRadius: '8px', fontSize: '13px', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
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
        {currentStatus === 'Won' && <Check size={16} style={{ color: '#10b981', flexShrink: 0 }} />}
      </div>
    )
  }

  return (
    <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: '8px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '4px', minWidth: 'max-content', padding: '8px 4px' }}>
        {stages.filter(s => s.id !== 'Lost').map((stage, index) => {
          const isCompleted = !isLost && index < currentIndex
          const isCurrent = stage.id === currentStatus
          const isWon = stage.id === 'Won' && currentStatus === 'Won'
          return (
            <div key={stage.id} style={{ display: 'flex', alignItems: 'center' }}>
              <div onClick={() => onStageClick?.(stage.id)} style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: isMobile ? '8px 10px' : '6px 12px', borderRadius: '16px', fontSize: isMobile ? '11px' : '12px', fontWeight: isCurrent || isCompleted ? '600' : '400', cursor: onStageClick ? 'pointer' : 'default', transition: 'all 0.15s ease', minHeight: isMobile ? '36px' : 'auto', backgroundColor: isCurrent ? stage.color + '20' : isCompleted ? '#dcfce7' : '#f3f4f6', color: isCurrent ? stage.color : isCompleted ? '#16a34a' : '#9ca3af', border: isCurrent ? '2px solid ' + stage.color : '2px solid transparent' }}>
                <div style={{ width: '16px', height: '16px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: isCurrent ? stage.color : isCompleted ? '#16a34a' : '#d1d5db', color: '#fff', fontSize: '10px' }}>
                  {isCompleted || isWon ? <Check size={10} strokeWidth={3} /> : <span style={{ fontSize: '8px', fontWeight: '700' }}>{index + 1}</span>}
                </div>
                <span style={{ whiteSpace: 'nowrap' }}>{stage.label}</span>
              </div>
              {index < stages.length - 2 && <div style={{ width: isMobile ? '12px' : '20px', height: '2px', backgroundColor: isCompleted ? '#16a34a' : '#e5e7eb', margin: '0 2px' }} />}
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
