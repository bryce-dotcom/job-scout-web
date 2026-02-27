import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';
import * as Icons from 'lucide-react';
import { Search, Filter, CheckCircle, Clock, ArrowRight } from 'lucide-react';

// Light theme fallback
const defaultTheme = {
  bg: '#f7f5ef',
  bgCard: '#ffffff',
  bgCardHover: '#eef2eb',
  border: '#d6cdb8',
  text: '#2c3530',
  textSecondary: '#4d5a52',
  textMuted: '#7d8a7f',
  accent: '#5a6349',
  accentBg: 'rgba(90,99,73,0.12)'
};

const statusConfig = {
  active: { color: '#4a7c59', bg: 'rgba(74,124,89,0.15)', label: 'Active' },
  coming_soon: { color: '#7d8a7f', bg: 'rgba(125,138,127,0.15)', label: 'Coming Soon' },
  beta: { color: '#6a5acd', bg: 'rgba(106,90,205,0.15)', label: 'Beta' }
};

const categoryColors = {
  Energy: '#f59e0b',
  Operations: '#3b82f6',
  Cleaning: '#10b981',
  Painting: '#ec4899',
  Roofing: '#ef4444',
  Landscaping: '#22c55e',
  Plumbing: '#06b6d4',
  Electrical: '#eab308',
  Masonry: '#78716c',
  Flooring: '#a855f7',
  HVAC: '#f97316',
  Exteriors: '#64748b',
  Safety: '#dc2626',
  Documentation: '#8b5cf6'
};

export default function BaseCamp() {
  const navigate = useNavigate();
  const companyId = useStore((state) => state.companyId);
  const agents = useStore((state) => state.agents);
  const companyAgents = useStore((state) => state.companyAgents);
  const fetchAgents = useStore((state) => state.fetchAgents);
  const recruitAgent = useStore((state) => state.recruitAgent);
  const hasAgent = useStore((state) => state.hasAgent);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [recruiting, setRecruiting] = useState(null);

  // Theme with fallback
  const themeContext = useTheme();
  const theme = themeContext?.theme || defaultTheme;

  useEffect(() => {
    if (!companyId) {
      navigate('/');
      return;
    }
    fetchAgents();
  }, [companyId, navigate, fetchAgents]);

  // Get unique categories
  const categories = [...new Set(agents.map(a => a.trade_category).filter(Boolean))].sort();

  // Filter agents
  const filteredAgents = agents.filter(agent => {
    // Search filter
    const searchLower = searchTerm.toLowerCase();
    if (searchTerm) {
      const matchesName = agent.name?.toLowerCase().includes(searchLower);
      const matchesTitle = agent.title?.toLowerCase().includes(searchLower);
      const matchesDescription = agent.description?.toLowerCase().includes(searchLower);
      const matchesCategory = agent.trade_category?.toLowerCase().includes(searchLower);
      if (!matchesName && !matchesTitle && !matchesDescription && !matchesCategory) {
        return false;
      }
    }

    // Category filter
    if (filterCategory !== 'all' && agent.trade_category !== filterCategory) {
      return false;
    }

    // Status filter
    if (filterStatus !== 'all' && agent.status !== filterStatus) {
      return false;
    }

    return true;
  });

  const handleRecruit = async (agent) => {
    if (agent.status !== 'active') return;
    if (hasAgent(agent.slug)) {
      // Already recruited, navigate to workspace
      navigateToWorkspace(agent);
      return;
    }

    setRecruiting(agent.id);
    const { error } = await recruitAgent(agent.id);
    setRecruiting(null);

    if (!error) {
      // Navigate to the agent's workspace
      navigateToWorkspace(agent);
    }
  };

  const navigateToWorkspace = (agent) => {
    if (agent.slug === 'lenard-lighting') {
      navigate('/agents/lenard');
    } else if (agent.slug === 'freddy-fleet') {
      navigate('/agents/freddy');
    }
  };

  const formatPrice = (price) => {
    return '$' + parseFloat(price).toFixed(2);
  };

  // Stats
  const recruitedCount = companyAgents.length;
  const activeAgents = agents.filter(a => a.status === 'active').length;
  const comingSoonAgents = agents.filter(a => a.status === 'coming_soon').length;

  return (
    <div style={{ padding: '24px', maxWidth: '100%', overflowX: 'hidden' }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '48px',
            height: '48px',
            background: theme.accentBg,
            borderRadius: '12px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <Icons.Tent style={{ width: '24px', height: '24px', color: theme.accent }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '600', color: theme.text }}>
              Base Camp
            </h1>
            <p style={{ margin: '4px 0 0', color: theme.textMuted }}>
              Recruit AI experts for your crew
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/my-crew')}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 16px',
            background: theme.accent,
            color: '#fff',
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
            fontSize: '14px',
            fontWeight: '500'
          }}
        >
          <Icons.Users style={{ width: '18px', height: '18px' }} />
          My Crew ({recruitedCount})
        </button>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '16px'
        }}>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Your Crew</div>
          <div style={{ fontSize: '28px', fontWeight: '600', color: theme.text }}>{recruitedCount}</div>
        </div>
        <div style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '16px'
        }}>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Available Now</div>
          <div style={{ fontSize: '28px', fontWeight: '600', color: '#4a7c59' }}>{activeAgents}</div>
        </div>
        <div style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '16px'
        }}>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Coming Soon</div>
          <div style={{ fontSize: '28px', fontWeight: '600', color: theme.textMuted }}>{comingSoonAgents}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{
        display: 'flex',
        gap: '12px',
        marginBottom: '24px',
        flexWrap: 'wrap'
      }}>
        <div style={{ position: 'relative', flex: '1', minWidth: '200px' }}>
          <Search style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            width: '18px',
            height: '18px',
            color: theme.textMuted
          }} />
          <input
            type="text"
            placeholder="Search agents..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 12px 10px 40px',
              border: `1px solid ${theme.border}`,
              borderRadius: '8px',
              background: theme.bgCard,
              color: theme.text,
              fontSize: '14px',
              outline: 'none'
            }}
          />
        </div>

        <select
          value={filterCategory}
          onChange={(e) => setFilterCategory(e.target.value)}
          style={{
            padding: '10px 32px 10px 12px',
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            background: theme.bgCard,
            color: theme.text,
            fontSize: '14px',
            cursor: 'pointer',
            outline: 'none',
            minWidth: '150px'
          }}
        >
          <option value="all">All Categories</option>
          {categories.map(cat => (
            <option key={cat} value={cat}>{cat}</option>
          ))}
        </select>

        <select
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          style={{
            padding: '10px 32px 10px 12px',
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            background: theme.bgCard,
            color: theme.text,
            fontSize: '14px',
            cursor: 'pointer',
            outline: 'none',
            minWidth: '140px'
          }}
        >
          <option value="all">All Status</option>
          <option value="active">Active</option>
          <option value="coming_soon">Coming Soon</option>
        </select>
      </div>

      {/* Agent Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
        gap: '20px'
      }}>
        {filteredAgents.map(agent => {
          const IconComponent = Icons[agent.icon] || Icons.Bot;
          const isRecruited = hasAgent(agent.slug);
          const isActive = agent.status === 'active';
          const statusStyle = statusConfig[agent.status] || statusConfig.coming_soon;
          const categoryColor = categoryColors[agent.trade_category] || theme.accent;

          return (
            <div
              key={agent.id}
              style={{
                background: theme.bgCard,
                border: `1px solid ${isRecruited ? '#4a7c59' : theme.border}`,
                borderRadius: '16px',
                padding: '20px',
                opacity: isActive ? 1 : 0.7,
                transition: 'all 0.2s',
                position: 'relative'
              }}
            >
              {/* Recruited Badge */}
              {isRecruited && (
                <div style={{
                  position: 'absolute',
                  top: '12px',
                  right: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '4px 8px',
                  background: 'rgba(74,124,89,0.15)',
                  borderRadius: '6px',
                  color: '#4a7c59',
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  <CheckCircle style={{ width: '14px', height: '14px' }} />
                  Recruited
                </div>
              )}

              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '12px' }}>
                <div style={{
                  width: '56px',
                  height: '56px',
                  background: `${categoryColor}20`,
                  borderRadius: '12px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <IconComponent style={{ width: '28px', height: '28px', color: categoryColor }} />
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: theme.text }}>
                    {agent.full_name}
                  </h3>
                  <p style={{
                    margin: '4px 0 0',
                    fontSize: '14px',
                    color: theme.accent,
                    fontStyle: 'italic'
                  }}>
                    "{agent.tagline}"
                  </p>
                </div>
              </div>

              {/* Description */}
              <p style={{
                margin: '0 0 16px',
                color: theme.textSecondary,
                fontSize: '14px',
                lineHeight: '1.5',
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden'
              }}>
                {agent.description}
              </p>

              {/* Tags */}
              <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
                <span style={{
                  padding: '4px 10px',
                  background: `${categoryColor}20`,
                  color: categoryColor,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  {agent.trade_category}
                </span>
                <span style={{
                  padding: '4px 10px',
                  background: statusStyle.bg,
                  color: statusStyle.color,
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: '500'
                }}>
                  {statusStyle.label}
                </span>
              </div>

              {/* Pricing & Action */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: '16px',
                borderTop: `1px solid ${theme.border}`
              }}>
                <div>
                  {agent.is_free ? (
                    <span style={{ color: '#4a7c59', fontWeight: '600', fontSize: '18px' }}>Free</span>
                  ) : (
                    <div>
                      <span style={{ color: theme.text, fontWeight: '600', fontSize: '18px' }}>
                        {formatPrice(agent.price_monthly)}
                      </span>
                      <span style={{ color: theme.textMuted, fontSize: '13px' }}>/mo</span>
                    </div>
                  )}
                </div>

                {isActive ? (
                  <button
                    onClick={() => handleRecruit(agent)}
                    disabled={recruiting === agent.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 16px',
                      background: isRecruited ? theme.accent : categoryColor,
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: '500',
                      opacity: recruiting === agent.id ? 0.7 : 1
                    }}
                  >
                    {recruiting === agent.id ? (
                      'Recruiting...'
                    ) : isRecruited ? (
                      <>
                        Open Workspace
                        <ArrowRight style={{ width: '16px', height: '16px' }} />
                      </>
                    ) : (
                      <>
                        Recruit
                        <Icons.UserPlus style={{ width: '16px', height: '16px' }} />
                      </>
                    )}
                  </button>
                ) : (
                  <button
                    disabled
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '6px',
                      padding: '10px 16px',
                      background: theme.border,
                      color: theme.textMuted,
                      border: 'none',
                      borderRadius: '8px',
                      cursor: 'not-allowed',
                      fontSize: '14px',
                      fontWeight: '500'
                    }}
                  >
                    <Clock style={{ width: '16px', height: '16px' }} />
                    Coming Soon
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredAgents.length === 0 && (
        <div style={{
          textAlign: 'center',
          padding: '60px 20px',
          color: theme.textMuted
        }}>
          <Icons.SearchX style={{ width: '48px', height: '48px', margin: '0 auto 16px', opacity: 0.5 }} />
          <p style={{ margin: 0, fontSize: '16px' }}>No agents match your filters</p>
          <button
            onClick={() => {
              setSearchTerm('');
              setFilterCategory('all');
              setFilterStatus('all');
            }}
            style={{
              marginTop: '12px',
              padding: '8px 16px',
              background: 'transparent',
              border: `1px solid ${theme.border}`,
              borderRadius: '6px',
              color: theme.textSecondary,
              cursor: 'pointer',
              fontSize: '14px'
            }}
          >
            Clear Filters
          </button>
        </div>
      )}
    </div>
  );
}
