import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X, Trophy } from 'lucide-react'
import { toastStore } from '../lib/toast'

const typeConfig = {
  success: {
    icon: CheckCircle,
    bg: 'rgba(74,124,89,0.95)',
    color: '#ffffff'
  },
  error: {
    icon: XCircle,
    bg: 'rgba(194,90,90,0.95)',
    color: '#ffffff'
  },
  info: {
    icon: Info,
    bg: 'rgba(90,155,213,0.95)',
    color: '#ffffff'
  },
  warning: {
    icon: AlertTriangle,
    bg: 'rgba(212,148,10,0.95)',
    color: '#ffffff'
  },
  announcement: {
    icon: Trophy,
    bg: 'linear-gradient(135deg, rgba(90,99,73,0.97), rgba(74,124,89,0.97))',
    color: '#ffffff'
  }
}

function ToastItem({ toast, onClose }) {
  const config = typeConfig[toast.type] || typeConfig.info
  const Icon = config.icon
  const isAnnouncement = toast.type === 'announcement'

  return (
    <div style={{
      display: 'flex',
      alignItems: isAnnouncement ? 'flex-start' : 'center',
      gap: '12px',
      padding: isAnnouncement ? '16px 18px' : '14px 16px',
      background: config.bg,
      color: config.color,
      borderRadius: isAnnouncement ? '12px' : '10px',
      boxShadow: isAnnouncement ? '0 8px 24px rgba(0,0,0,0.25)' : '0 4px 12px rgba(0,0,0,0.15)',
      minWidth: isAnnouncement ? '320px' : '280px',
      maxWidth: isAnnouncement ? '440px' : '400px',
      animation: isAnnouncement ? 'slideIn 0.3s ease, pulse 0.6s ease 0.3s' : 'slideIn 0.3s ease',
      border: isAnnouncement ? '1px solid rgba(255,255,255,0.2)' : 'none'
    }}>
      <Icon size={isAnnouncement ? 24 : 20} style={{ flexShrink: 0, marginTop: isAnnouncement ? '2px' : 0 }} />
      <div style={{ flex: 1 }}>
        {toast.title && (
          <div style={{ fontSize: '15px', fontWeight: '700', marginBottom: '4px' }}>
            {toast.title}
          </div>
        )}
        <div style={{
          fontSize: isAnnouncement ? '13px' : '14px',
          fontWeight: '500',
          opacity: isAnnouncement ? 0.95 : 1
        }}>
          {toast.message}
        </div>
      </div>
      <button
        onClick={() => onClose(toast.id)}
        style={{
          padding: '4px',
          backgroundColor: 'rgba(255,255,255,0.2)',
          border: 'none',
          borderRadius: '4px',
          color: 'inherit',
          cursor: 'pointer',
          display: 'flex'
        }}
      >
        <X size={16} />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    return toastStore.subscribe(setToasts)
  }, [])

  const handleClose = (id) => {
    toastStore.removeToast(id)
  }

  if (toasts.length === 0) return null

  return (
    <div style={{
      position: 'fixed',
      top: '20px',
      right: '20px',
      zIndex: 9999,
      display: 'flex',
      flexDirection: 'column',
      gap: '10px'
    }}>
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={handleClose} />
      ))}
      <style>{`
        @keyframes slideIn {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes pulse {
          0% { transform: scale(1); }
          50% { transform: scale(1.02); }
          100% { transform: scale(1); }
        }
      `}</style>
    </div>
  )
}
