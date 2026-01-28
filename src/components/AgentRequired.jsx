import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { Lock, ArrowRight } from 'lucide-react';

/**
 * AgentRequired - Guard component for agent workspaces
 * Checks if the company has recruited the specified agent
 * Shows upgrade prompt if not recruited
 */
export default function AgentRequired({ slug, children }) {
  const navigate = useNavigate();
  const { hasAgent, getAgent } = useStore();

  const agent = getAgent(slug);
  const isRecruited = hasAgent(slug);

  // If agent not found, show error
  if (!agent) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="text-red-500 text-lg font-medium">Agent Not Found</div>
          <p className="text-stone-500 mt-2">The requested agent could not be found.</p>
          <button
            onClick={() => navigate('/base-camp')}
            className="mt-4 px-4 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors"
          >
            Browse Base Camp
          </button>
        </div>
      </div>
    );
  }

  // If not recruited, show upgrade prompt
  if (!isRecruited) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="bg-stone-800 border border-stone-700 rounded-xl p-8 max-w-md text-center">
          <div className="w-16 h-16 bg-amber-600/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Lock className="w-8 h-8 text-amber-500" />
          </div>

          <h2 className="text-xl font-semibold text-stone-100 mb-2">
            {agent.full_name}
          </h2>

          <p className="text-stone-400 mb-4">
            {agent.tagline}
          </p>

          <p className="text-stone-500 text-sm mb-6">
            {agent.description}
          </p>

          <div className="flex flex-col gap-3">
            <button
              onClick={() => navigate('/base-camp')}
              className="flex items-center justify-center gap-2 px-6 py-3 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors font-medium"
            >
              Recruit {agent.name}
              <ArrowRight className="w-4 h-4" />
            </button>

            <div className="text-stone-500 text-sm">
              {agent.is_free ? (
                <span className="text-green-500 font-medium">Free</span>
              ) : (
                <>
                  Starting at <span className="text-amber-500 font-medium">${agent.price_monthly}/mo</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Agent is recruited, render children
  return children;
}
