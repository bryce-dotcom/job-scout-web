import { adminTheme } from './adminTheme'
import { X } from 'lucide-react'

export default function AdminModal({ isOpen, onClose, title, children, width = '500px' }) {
  if (!isOpen) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: adminTheme.bgCard,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '12px',
          width: '100%',
          maxWidth: width,
          maxHeight: '90vh',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column'
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '16px 20px',
          borderBottom: `1px solid ${adminTheme.border}`
        }}>
          <h2 style={{ color: adminTheme.text, fontSize: '18px', fontWeight: '600', margin: 0 }}>
            {title}
          </h2>
          <button
            onClick={onClose}
            style={{
              padding: '6px',
              backgroundColor: 'transparent',
              border: 'none',
              borderRadius: '6px',
              cursor: 'pointer',
              color: adminTheme.textMuted,
              display: 'flex'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px', overflowY: 'auto', flex: 1 }}>
          {children}
        </div>
      </div>
    </div>
  )
}

// Form field wrapper
export function FormField({ label, required, children }) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <label style={{
        display: 'block',
        fontSize: '12px',
        fontWeight: '500',
        color: adminTheme.textMuted,
        marginBottom: '6px'
      }}>
        {label}{required && <span style={{ color: adminTheme.error }}> *</span>}
      </label>
      {children}
    </div>
  )
}

// Form input
export function FormInput({ type = 'text', value, onChange, placeholder, ...props }) {
  return (
    <input
      type={type}
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      style={{
        width: '100%',
        padding: '10px 12px',
        backgroundColor: adminTheme.bgInput,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '8px',
        color: adminTheme.text,
        fontSize: '14px',
        outline: 'none'
      }}
      {...props}
    />
  )
}

// Form select
export function FormSelect({ value, onChange, options, placeholder, ...props }) {
  return (
    <select
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: '100%',
        padding: '10px 12px',
        backgroundColor: adminTheme.bgInput,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '8px',
        color: adminTheme.text,
        fontSize: '14px',
        outline: 'none'
      }}
      {...props}
    >
      {placeholder && <option value="">{placeholder}</option>}
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  )
}

// Form textarea
export function FormTextarea({ value, onChange, placeholder, rows = 3, ...props }) {
  return (
    <textarea
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      style={{
        width: '100%',
        padding: '10px 12px',
        backgroundColor: adminTheme.bgInput,
        border: `1px solid ${adminTheme.border}`,
        borderRadius: '8px',
        color: adminTheme.text,
        fontSize: '14px',
        outline: 'none',
        resize: 'vertical'
      }}
      {...props}
    />
  )
}

// Form toggle
export function FormToggle({ checked, onChange, label }) {
  return (
    <label style={{
      display: 'flex',
      alignItems: 'center',
      gap: '10px',
      cursor: 'pointer'
    }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: '44px',
          height: '24px',
          backgroundColor: checked ? adminTheme.accent : adminTheme.bgHover,
          borderRadius: '12px',
          position: 'relative',
          transition: 'background-color 0.2s',
          border: `1px solid ${checked ? adminTheme.accent : adminTheme.border}`
        }}
      >
        <div style={{
          width: '18px',
          height: '18px',
          backgroundColor: '#fff',
          borderRadius: '50%',
          position: 'absolute',
          top: '2px',
          left: checked ? '22px' : '2px',
          transition: 'left 0.2s'
        }} />
      </div>
      {label && <span style={{ color: adminTheme.text, fontSize: '14px' }}>{label}</span>}
    </label>
  )
}

// Modal footer buttons
export function ModalFooter({ onCancel, onSave, saving, saveLabel = 'Save' }) {
  return (
    <div style={{
      display: 'flex',
      gap: '12px',
      justifyContent: 'flex-end',
      marginTop: '24px',
      paddingTop: '16px',
      borderTop: `1px solid ${adminTheme.border}`
    }}>
      <button
        onClick={onCancel}
        style={{
          padding: '10px 20px',
          backgroundColor: adminTheme.bgHover,
          color: adminTheme.text,
          border: `1px solid ${adminTheme.border}`,
          borderRadius: '8px',
          fontSize: '14px',
          cursor: 'pointer'
        }}
      >
        Cancel
      </button>
      <button
        onClick={onSave}
        disabled={saving}
        style={{
          padding: '10px 20px',
          backgroundColor: saving ? adminTheme.border : adminTheme.accent,
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '14px',
          fontWeight: '500',
          cursor: saving ? 'not-allowed' : 'pointer'
        }}
      >
        {saving ? 'Saving...' : saveLabel}
      </button>
    </div>
  )
}
