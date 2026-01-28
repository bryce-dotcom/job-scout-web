import { Outlet } from 'react-router-dom';
import AgentRequired from '../../../components/AgentRequired';
import AgentHeader from '../../../components/AgentHeader';

const LENARD_TABS = [
  { path: '/agents/lenard', label: 'Audits', icon: 'ClipboardList', end: true },
  { path: '/agents/lenard/fixture-types', label: 'Fixture Types', icon: 'Lightbulb' },
  { path: '/agents/lenard/providers', label: 'Providers', icon: 'Building2' },
  { path: '/agents/lenard/programs', label: 'Programs', icon: 'Bookmark' },
  { path: '/agents/lenard/rebates', label: 'Rebates', icon: 'DollarSign' },
];

export default function LenardWorkspace() {
  return (
    <AgentRequired slug="lenard-lighting">
      <div className="flex flex-col h-full">
        <AgentHeader slug="lenard-lighting" tabs={LENARD_TABS} />
        <div className="flex-1 overflow-auto">
          <Outlet />
        </div>
      </div>
    </AgentRequired>
  );
}
