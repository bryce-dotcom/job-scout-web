// Small floating button used inside walkthroughs to toggle voiceover.
// Anchored in a corner of the animation surface; uses the shared theme.

import { Volume2, VolumeX } from 'lucide-react'

export default function VoiceToggle({ enabled, onToggle, theme }) {
  const Icon = enabled ? Volume2 : VolumeX
  return (
    <button
      onClick={onToggle}
      aria-label={enabled ? 'Mute narration' : 'Unmute narration'}
      title={enabled ? 'Mute narration' : 'Unmute narration'}
      style={{
        position: 'absolute',
        top: 14,
        right: 14,
        width: 36,
        height: 36,
        borderRadius: '50%',
        backgroundColor: 'rgba(44,53,48,0.85)',
        color: '#fff',
        border: 'none',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
        backdropFilter: 'blur(4px)',
        zIndex: 5,
      }}
    >
      <Icon size={16} />
    </button>
  )
}
