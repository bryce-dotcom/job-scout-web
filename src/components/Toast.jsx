import { useState, useEffect } from 'react'
import { CheckCircle, XCircle, Info, AlertTriangle, X } from 'lucide-react'
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
  }
}

function ToastItem({ toast, onClose }) {
  const config = typeConfig[toast.type] || typeConfig.info
  const Icon = config.icon

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '12px',
      padding: '14px 16px',
      backgroundColor: config.bg,
      color: config.color,
      borderRadius: '10px',
      boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      minWidth: '280px',
      maxWidth: '400px',
      animation: 'slideIn 0.3s ease'
    }}>
      <Icon size={20} style={{ flexShrink: 0 }} />
      <div style={{
        flex: 1,
        fontSize: '14px',
        fontWeight: '500'
      }}>
        {toast.message}
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
      `}</style>
    </div>
  )
}
