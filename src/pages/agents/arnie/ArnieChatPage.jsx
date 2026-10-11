import { useLocation } from 'react-router-dom'
import ArnieChat from './ArnieChat'
import ArnieComputerStrip from './ArnieComputerStrip'

export default function ArnieChatPage() {
  const location = useLocation()
  const sessionId = location.state?.sessionId || null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      {/* Above the conversation, not inside it. A handoff — "sign in and I'll
          carry on" — is the one thing that must not scroll away, and it is the
          moment the whole no-credentials design rests on. The strip renders
          nothing at all unless a computer session is live. */}
      <div style={{ padding: '12px 16px 0', flexShrink: 0 }}>
        <ArnieComputerStrip />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ArnieChat sessionId={sessionId} />
      </div>
    </div>
  )
}
