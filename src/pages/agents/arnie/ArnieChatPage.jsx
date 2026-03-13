import { useLocation } from 'react-router-dom'
import ArnieChat from './ArnieChat'

export default function ArnieChatPage() {
  const location = useLocation()
  const sessionId = location.state?.sessionId || null

  return <ArnieChat sessionId={sessionId} />
}
