import { Outlet } from 'react-router-dom';
import AgentRequired from '../../../components/AgentRequired';
import AgentHeader from '../../../components/AgentHeader';

const FREDDY_TABS = [
  { path: '/agents/freddy', label: 'Fleet', icon: 'Truck', end: true, primary: true },
  { path: '/agents/freddy/tracking', label: 'Tracking', icon: 'MapPin', primary: true },
  { path: '/agents/freddy/trips', label: 'Trips', icon: 'Route' },
  { path: '/agents/freddy/costs', label: 'Costs', icon: 'DollarSign', primary: true },
  { path: '/agents/freddy/drivers', label: 'Drivers', icon: 'UserCheck' },
  { path: '/agents/freddy/alerts', label: 'Alerts', icon: 'Bell', primary: true },
  { path: '/agents/freddy/calendar', label: 'Calendar', icon: 'Calendar' },
  { path: '/agents/freddy/settings', label: 'Settings', icon: 'Settings' },
];

export default function FreddyWorkspace() {
  return (
    <AgentRequired slug="freddy-fleet">
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
        <AgentHeader slug="freddy-fleet" tabs={FREDDY_TABS} />
        {/* minWidth 0 so a wide child (a table, a map) scrolls inside itself
            instead of pushing the page sideways — the app root hides
            overflowX, so the overflow just silently clips. */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  );
}
