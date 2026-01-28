import { NavLink } from 'react-router-dom';
import { useStore } from '../lib/store';
import * as Icons from 'lucide-react';

/**
 * AgentHeader - Workspace header with agent info and tabbed navigation
 */
export default function AgentHeader({ slug, tabs = [] }) {
  const { getAgent, getCompanyAgent } = useStore();

  const agent = getAgent(slug);
  const companyAgent = getCompanyAgent(slug);

  if (!agent) return null;

  // Get the icon component dynamically
  const IconComponent = Icons[agent.icon] || Icons.Bot;

  // Use custom name if set, otherwise agent's full name
  const displayName = companyAgent?.custom_name || agent.full_name;

  return (
    <div className="bg-stone-800 border-b border-stone-700">
      {/* Agent Info Bar */}
      <div className="px-6 py-4 flex items-center gap-4">
        <div className="w-12 h-12 bg-amber-600/20 rounded-lg flex items-center justify-center">
          <IconComponent className="w-6 h-6 text-amber-500" />
        </div>

        <div className="flex-1">
          <h1 className="text-lg font-semibold text-stone-100">
            {displayName}
          </h1>
          <p className="text-stone-400 text-sm">
            {agent.tagline}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-1 bg-green-600/20 text-green-400 text-xs font-medium rounded">
            Active
          </span>
          <span className="px-2 py-1 bg-stone-700 text-stone-400 text-xs font-medium rounded">
            {agent.trade_category}
          </span>
        </div>
      </div>

      {/* Tab Navigation */}
      {tabs.length > 0 && (
        <div className="px-6 flex gap-1 overflow-x-auto">
          {tabs.map((tab) => {
            const TabIcon = Icons[tab.icon] || Icons.Circle;
            return (
              <NavLink
                key={tab.path}
                to={tab.path}
                end={tab.end}
                className={({ isActive }) =>
                  `flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                    isActive
                      ? 'bg-stone-900 text-amber-500 border-b-2 border-amber-500'
                      : 'text-stone-400 hover:text-stone-200 hover:bg-stone-700/50'
                  }`
                }
              >
                <TabIcon className="w-4 h-4" />
                {tab.label}
              </NavLink>
            );
          })}
        </div>
      )}
    </div>
  );
}
