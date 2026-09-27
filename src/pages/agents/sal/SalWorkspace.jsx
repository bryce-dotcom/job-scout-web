import { Outlet } from 'react-router-dom'
import AgentRequired from '../../../components/AgentRequired'
import AgentHeader from '../../../components/AgentHeader'

// Sal the Solicitation Scout (Bryce, 2026-09-26: finding projects to bid on
// is marketing, so Sal is his own agent under Marketing). He finds the bids
// and hands the chosen ones to Benny, who builds them.
//
//   Board    what he found, scored — Shortlist / Dismiss / Choose
//   Inbox    everything a portal emailed to the tenant's bids+ address
//   Sources  the address, the feeds switched on, and their health
//   Profile  what a fit means here (SAL_SCOUT_PLAN.md §4.1)
const SAL_TABS = [
  { path: '/agents/sal', label: 'Board', icon: 'Radar', end: true },
  { path: '/agents/sal/inbox', label: 'Inbox', icon: 'Inbox' },
  { path: '/agents/sal/sources', label: 'Sources', icon: 'Rss' },
  { path: '/agents/sal/profile', label: 'Profile', icon: 'UserCircle' },
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
