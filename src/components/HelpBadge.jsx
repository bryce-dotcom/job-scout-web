import { HelpCircle } from 'lucide-react'
import Tooltip from './Tooltip'

export default function HelpBadge({ text, size = 14, position = 'top' }) {
  if (!text) return null

  return (
    <Tooltip text={text} position={position}>
      <HelpCircle
        size={size}
        style={{
          color: '#999',
          cursor: 'help',
          marginLeft: '6px',
          opacity: 0.7,
          flexShrink: 0
        }}
      />
    </Tooltip>
  )
}
