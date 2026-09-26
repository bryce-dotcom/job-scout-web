import { Outlet } from 'react-router-dom'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'

// Sal the Solicitation Scout (Bryce, 2026-09-26: finding projects to bid on
// is marketing, so Sal is his own agent under Marketing). He finds the bids
// and hands the chosen ones to Benny, who builds them.
//
// Phase 0 tabs: the Inbox (everything a portal emailed to the tenant's bids+
// address, attachments kept) and Sources (the address itself and where to
// paste it). The board, scoring and the hand-off to Benny follow
// (SAL_SCOUT_PLAN.md §5).
const SAL_TABS = [
  { path: '/agents/sal', label: 'Inbox', icon: 'Inbox', end: true },
  { path: '/agents/sal/sources', label: 'Sources', icon: 'Radar' },
]

export default function SalWorkspace() {
  return (
    <AgentRequired slug="sal-scout">
      <div className="flex flex-col h-full">
        <AgentHeader slug="sal-scout" tabs={SAL_TABS} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  )
}
