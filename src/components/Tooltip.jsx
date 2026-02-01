import { useState } from 'react'

export default function Tooltip({ children, text, position = 'top' }) {
  const [show, setShow] = useState(false)

  if (!text) return children

  const positions = {
    top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' },
    bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' },
    left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' },
    right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' }
  }

  const arrowPositions = {
    top: { bottom: '-4px', left: '50%', marginLeft: '-4px' },
    bottom: { top: '-4px', left: '50%', marginLeft: '-4px' },
    left: { right: '-4px', top: '50%', marginTop: '-4px' },
    right: { left: '-4px', top: '50%', marginTop: '-4px' }
  }

  return (
    <div
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      {children}
      {show && (
        <div style={{
          position: 'absolute',
          ...positions[position],
          padding: '8px 12px',
          backgroundColor: '#1a1a1a',
          color: '#fff',
          fontSize: '12px',
          borderRadius: '6px',
          zIndex: 1000,
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          maxWidth: '250px',
          whiteSpace: 'normal',
          lineHeight: '1.4',
          textAlign: 'left'
        }}>
          {text}
          <div style={{
            position: 'absolute',
            width: '8px',
            height: '8px',
            backgroundColor: '#1a1a1a',
            transform: 'rotate(45deg)',
            ...arrowPositions[position]
          }} />
        </div>
      )}
    </div>
  )
}
