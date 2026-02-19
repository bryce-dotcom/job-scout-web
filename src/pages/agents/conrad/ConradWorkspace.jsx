import { Outlet } from 'react-router-dom';
import AgentRequired from '../../../components/AgentRequired';
import AgentHeader from '../../../components/AgentHeader';

const CONRAD_TABS = [
  { path: '/agents/conrad-connect', label: 'Dashboard', icon: 'LayoutDashboard', end: true },
  { path: '/agents/conrad-connect/campaigns', label: 'Campaigns', icon: 'Send' },
  { path: '/agents/conrad-connect/templates', label: 'Templates', icon: 'FileText' },
  { path: '/agents/conrad-connect/contacts', label: 'Contacts', icon: 'Users' },
  { path: '/agents/conrad-connect/automations', label: 'Automations', icon: 'Zap' },
  { path: '/agents/conrad-connect/settings', label: 'Settings', icon: 'Settings' },
];

export default function ConradWorkspace() {
  return (
    <AgentRequired slug="conrad-connect">
      <div className="flex flex-col h-full">
        <AgentHeader slug="conrad-connect" tabs={CONRAD_TABS} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  );
}
