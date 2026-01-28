import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '../lib/store';
import { useTheme } from '../components/Layout';
import * as Icons from 'lucide-react';
import { Users, ArrowRight, Edit2, Check, X, Plus } from 'lucide-react';

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

export default function MyCrew() {
  const navigate = useNavigate();
  const companyId = useStore((state) => state.companyId);
  const companyAgents = useStore((state) => state.companyAgents);
  const updateAgentNickname = useStore((state) => state.updateAgentNickname);
  const fetchCompanyAgents = useStore((state) => state.fetchCompanyAgents);

  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [saving, setSaving] = useState(false);

  // Theme with fallback
  const themeContext = useTheme();
  const theme = themeContext?.theme || defaultTheme;

  useEffect(() => {
    if (!companyId) {
      navigate('/');
      return;
    }
    fetchCompanyAgents();
  }, [companyId, navigate, fetchCompanyAgents]);

  const handleStartEdit = (companyAgent) => {
    setEditingId(companyAgent.id);
    setEditName(companyAgent.custom_name || companyAgent.agent?.name || '');
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditName('');
  };

  const handleSaveNickname = async (companyAgentId) => {
    setSaving(true);
    await updateAgentNickname(companyAgentId, editName.trim() || null);
    setSaving(false);
    setEditingId(null);
    setEditName('');
  };

  const navigateToWorkspace = (agent) => {
    if (agent.slug === 'lenard-lighting') {
      navigate('/agents/lenard');
    } else if (agent.slug === 'freddy-fleet') {
      navigate('/agents/freddy');
    }
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric'
    });
  };

  // Calculate monthly cost
  const monthlyCost = companyAgents.reduce((sum, ca) => {
    if (ca.agent?.is_free) return sum;
    return sum + (parseFloat(ca.agent?.price_monthly) || 0);
  }, 0);

  return (
    <div style={{ padding: '24px' }}>
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
            <Users style={{ width: '24px', height: '24px', color: theme.accent }} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '24px', fontWeight: '600', color: theme.text }}>
              My Crew
            </h1>
            <p style={{ margin: '4px 0 0', color: theme.textMuted }}>
              Your recruited AI experts
            </p>
          </div>
        </div>

        <button
          onClick={() => navigate('/base-camp')}
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
          <Plus style={{ width: '18px', height: '18px' }} />
          Recruit More
        </button>
      </div>

      {/* Stats Row */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '16px'
        }}>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Crew Size</div>
          <div style={{ fontSize: '28px', fontWeight: '600', color: theme.text }}>{companyAgents.length}</div>
        </div>
        <div style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '16px'
        }}>
          <div style={{ color: theme.textMuted, fontSize: '13px', marginBottom: '4px' }}>Monthly Cost</div>
          <div style={{ fontSize: '28px', fontWeight: '600', color: theme.accent }}>
            ${monthlyCost.toFixed(2)}
          </div>
        </div>
      </div>

      {/* Crew List */}
      {companyAgents.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {companyAgents.map(companyAgent => {
            const agent = companyAgent.agent;
            if (!agent) return null;

            const IconComponent = Icons[agent.icon] || Icons.Bot;
            const categoryColor = categoryColors[agent.trade_category] || theme.accent;
            const displayName = companyAgent.custom_name || agent.full_name;
            const isEditing = editingId === companyAgent.id;

            return (
              <div
                key={companyAgent.id}
                style={{
                  background: theme.bgCard,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '12px',
                  padding: '20px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px'
                }}
              >
                {/* Icon */}
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

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {isEditing ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder={agent.name}
                        autoFocus
                        style={{
                          padding: '8px 12px',
                          border: `1px solid ${theme.border}`,
                          borderRadius: '6px',
                          background: theme.bg,
                          color: theme.text,
                          fontSize: '16px',
                          fontWeight: '600',
                          width: '200px'
                        }}
                      />
                      <button
                        onClick={() => handleSaveNickname(companyAgent.id)}
                        disabled={saving}
                        style={{
                          padding: '8px',
                          background: '#4a7c59',
                          color: '#fff',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <Check style={{ width: '18px', height: '18px' }} />
                      </button>
                      <button
                        onClick={handleCancelEdit}
                        style={{
                          padding: '8px',
                          background: theme.border,
                          color: theme.textSecondary,
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}
                      >
                        <X style={{ width: '18px', height: '18px' }} />
                      </button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600', color: theme.text }}>
                        {displayName}
                      </h3>
                      <button
                        onClick={() => handleStartEdit(companyAgent)}
                        style={{
                          padding: '4px',
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          color: theme.textMuted,
                          display: 'flex',
                          alignItems: 'center'
                        }}
                        title="Edit nickname"
                      >
                        <Edit2 style={{ width: '14px', height: '14px' }} />
                      </button>
                    </div>
                  )}

                  <p style={{ margin: '4px 0 0', color: theme.textSecondary, fontSize: '14px' }}>
                    {agent.title}
                  </p>
                  <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                    <span style={{
                      padding: '3px 8px',
                      background: `${categoryColor}20`,
                      color: categoryColor,
                      borderRadius: '4px',
                      fontSize: '12px',
                      fontWeight: '500'
                    }}>
                      {agent.trade_category}
                    </span>
                    <span style={{ color: theme.textMuted, fontSize: '12px' }}>
                      Recruited {formatDate(companyAgent.activated_at)}
                    </span>
                  </div>
                </div>

                {/* Price */}
                <div style={{ textAlign: 'right', marginRight: '16px' }}>
                  {agent.is_free ? (
                    <span style={{ color: '#4a7c59', fontWeight: '600' }}>Free</span>
                  ) : (
                    <div>
                      <span style={{ color: theme.text, fontWeight: '600' }}>
                        ${parseFloat(agent.price_monthly).toFixed(2)}
                      </span>
                      <span style={{ color: theme.textMuted, fontSize: '12px' }}>/mo</span>
                    </div>
                  )}
                </div>

                {/* Action */}
                <button
                  onClick={() => navigateToWorkspace(agent)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '10px 16px',
                    background: categoryColor,
                    color: '#fff',
                    border: 'none',
                    borderRadius: '8px',
                    cursor: 'pointer',
                    fontSize: '14px',
                    fontWeight: '500',
                    flexShrink: 0
                  }}
                >
                  Open Workspace
                  <ArrowRight style={{ width: '16px', height: '16px' }} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{
          background: theme.bgCard,
          border: `1px solid ${theme.border}`,
          borderRadius: '12px',
          padding: '60px 20px',
          textAlign: 'center'
        }}>
          <Icons.UserX style={{
            width: '48px',
            height: '48px',
            color: theme.textMuted,
            margin: '0 auto 16px',
            opacity: 0.5
          }} />
          <h3 style={{ margin: '0 0 8px', color: theme.text, fontSize: '18px' }}>
            No crew members yet
          </h3>
          <p style={{ margin: '0 0 20px', color: theme.textMuted }}>
            Visit Base Camp to recruit AI experts for your team
          </p>
          <button
            onClick={() => navigate('/base-camp')}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: theme.accent,
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            <Icons.Tent style={{ width: '18px', height: '18px' }} />
            Browse Base Camp
          </button>
        </div>
      )}
    </div>
  );
}
