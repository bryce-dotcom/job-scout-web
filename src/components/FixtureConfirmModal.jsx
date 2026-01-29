import { useState, useEffect } from 'react';
import { X, Check, Edit2, Zap, AlertCircle } from 'lucide-react';

/**
 * FixtureConfirmModal - Confirm/edit AI fixture detection results
 */
export default function FixtureConfirmModal({
  detected,
  imagePreview,
  fixtureTypes = [],
  products = [],
  onConfirm,
  onCancel,
  theme
}) {
  const defaultTheme = {
    bg: '#f7f5ef',
    bgCard: '#ffffff',
    border: '#d6cdb8',
    text: '#2c3530',
    textSecondary: '#4d5a52',
    textMuted: '#7d8a7f',
    accent: '#5a6349',
    accentBg: 'rgba(90,99,73,0.12)'
  };
  const t = theme || defaultTheme;

  const [formData, setFormData] = useState({
    fixture_type: detected?.fixture_type || '',
    fixture_category: detected?.fixture_category || 'Indoor Linear',
    lamp_type: detected?.lamp_type || 'T8',
    lamp_count: detected?.lamp_count || 2,
    fixture_count: detected?.fixture_count || 1,
    existing_wattage: detected?.existing_wattage_per_fixture || 64,
    ceiling_height: detected?.ceiling_height_estimate || 10,
    mounting_type: detected?.mounting_type || 'Recessed',
    condition: detected?.condition || 'Good',
    notes: detected?.notes || ''
  });

  const [matchedFixtureType, setMatchedFixtureType] = useState(null);
  const [recommendedLED, setRecommendedLED] = useState(null);
  const [isEditing, setIsEditing] = useState(false);

  // Match to fixture types library
  useEffect(() => {
    if (fixtureTypes.length > 0 && formData.fixture_type) {
      const searchTerm = formData.fixture_type.toLowerCase();
      const match = fixtureTypes.find(ft =>
        ft.fixture_name?.toLowerCase().includes(searchTerm) ||
        ft.category?.toLowerCase() === formData.fixture_category?.toLowerCase()
      );
      setMatchedFixtureType(match);

      // Also find LED replacement
      if (match?.led_replacement_id) {
        const led = products.find(p => p.id === match.led_replacement_id);
        setRecommendedLED(led);
      }
    }
  }, [formData.fixture_type, formData.fixture_category, fixtureTypes, products]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleConfirm = () => {
    onConfirm?.({
      ...formData,
      total_existing_watts: formData.fixture_count * formData.existing_wattage,
      matched_fixture_type_id: matchedFixtureType?.id,
      recommended_led_id: recommendedLED?.id,
      ai_analysis_json: detected,
      image_preview: imagePreview
    });
  };

  const totalWatts = formData.fixture_count * formData.existing_wattage;
  const ledWatts = recommendedLED?.wattage || Math.round(formData.existing_wattage * 0.5);
  const savingsWatts = totalWatts - (formData.fixture_count * ledWatts);
  const annualSavings = Math.round(savingsWatts * 4000 * 0.12 / 1000); // 4000 hrs, $0.12/kWh

  const categories = ['Indoor Linear', 'Indoor High Bay', 'Outdoor', 'Decorative', 'Other'];
  const lampTypes = ['T8', 'T12', 'T5', 'Metal Halide', 'HPS', 'Incandescent', 'LED', 'CFL', 'Other'];
  const mountingTypes = ['Recessed', 'Surface', 'Suspended', 'Wall', 'Pole'];
  const conditions = ['Good', 'Fair', 'Poor'];

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      padding: '20px'
    }}>
      <div style={{
        background: t.bgCard,
        borderRadius: '16px',
        width: '100%',
        maxWidth: '600px',
        maxHeight: '90vh',
        overflow: 'auto'
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 20px',
          borderBottom: `1px solid ${t.border}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          background: t.bgCard,
          zIndex: 10
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              background: '#f59e0b20',
              borderRadius: '8px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <Zap style={{ width: '20px', height: '20px', color: '#f59e0b' }} />
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: t.text }}>
                Lenard Detected
              </h3>
              <span style={{
                fontSize: '12px',
                padding: '2px 8px',
                background: detected?.confidence === 'High' ? '#4a7c5920' : '#f59e0b20',
                color: detected?.confidence === 'High' ? '#4a7c59' : '#f59e0b',
                borderRadius: '4px'
              }}>
                {detected?.confidence || 'Medium'} Confidence
              </span>
            </div>
          </div>
          <button
            onClick={onCancel}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: t.textMuted,
              padding: '4px'
            }}
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {/* Image Preview */}
          {imagePreview && (
            <div style={{ marginBottom: '16px' }}>
              <img
                src={imagePreview}
                alt="Analyzed fixture"
                style={{
                  width: '100%',
                  maxHeight: '150px',
                  objectFit: 'cover',
                  borderRadius: '8px',
                  border: `1px solid ${t.border}`
                }}
              />
            </div>
          )}

          {/* Detection Summary */}
          <div style={{
            background: t.accentBg,
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '14px', fontWeight: '600', color: t.text, marginBottom: '4px' }}>
              "{formData.fixture_type}"
            </div>
            <div style={{ fontSize: '13px', color: t.textSecondary }}>
              {formData.lamp_count} lamps × {formData.existing_wattage}W = {formData.lamp_count * formData.existing_wattage}W per fixture
            </div>
            <div style={{ fontSize: '13px', color: t.textSecondary }}>
              {formData.fixture_count} fixtures detected • {totalWatts}W total
            </div>
          </div>

          {/* Edit Toggle */}
          <button
            onClick={() => setIsEditing(!isEditing)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              background: 'none',
              border: 'none',
              color: t.accent,
              fontSize: '13px',
              cursor: 'pointer',
              marginBottom: '12px',
              padding: 0
            }}
          >
            <Edit2 size={14} />
            {isEditing ? 'Hide details' : 'Edit detection'}
          </button>

          {/* Editable Fields */}
          {isEditing && (
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '16px'
            }}>
              <div>
                <label style={{ fontSize: '12px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>
                  Fixture Type
                </label>
                <input
                  type="text"
                  value={formData.fixture_type}
                  onChange={(e) => handleChange('fixture_type', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>
                  Category
                </label>
                <select
                  value={formData.fixture_category}
                  onChange={(e) => handleChange('fixture_category', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>
                  Lamp Type
                </label>
                <select
                  value={formData.lamp_type}
                  onChange={(e) => handleChange('lamp_type', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                >
                  {lampTypes.map(l => <option key={l} value={l}>{l}</option>)}
                </select>
              </div>
              <div>
                <label style={{ fontSize: '12px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>
                  Lamps per Fixture
                </label>
                <input
                  type="number"
                  value={formData.lamp_count}
                  onChange={(e) => handleChange('lamp_count', parseInt(e.target.value) || 1)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>
                  Fixture Count
                </label>
                <input
                  type="number"
                  value={formData.fixture_count}
                  onChange={(e) => handleChange('fixture_count', parseInt(e.target.value) || 1)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>
                  Watts per Fixture
                </label>
                <input
                  type="number"
                  value={formData.existing_wattage}
                  onChange={(e) => handleChange('existing_wattage', parseInt(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>
                  Ceiling Height (ft)
                </label>
                <input
                  type="number"
                  value={formData.ceiling_height}
                  onChange={(e) => handleChange('ceiling_height', parseInt(e.target.value) || 0)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                />
              </div>
              <div>
                <label style={{ fontSize: '12px', color: t.textMuted, display: 'block', marginBottom: '4px' }}>
                  Condition
                </label>
                <select
                  value={formData.condition}
                  onChange={(e) => handleChange('condition', e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    border: `1px solid ${t.border}`,
                    borderRadius: '6px',
                    fontSize: '13px'
                  }}
                >
                  {conditions.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
          )}

          {/* Savings Preview */}
          <div style={{
            background: '#4a7c5910',
            border: '1px solid #4a7c5930',
            borderRadius: '8px',
            padding: '12px',
            marginBottom: '16px'
          }}>
            <div style={{ fontSize: '12px', color: t.textMuted, marginBottom: '8px' }}>
              Estimated LED Retrofit Savings
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(3, 1fr)',
              gap: '12px',
              textAlign: 'center'
            }}>
              <div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#4a7c59' }}>
                  {savingsWatts.toLocaleString()}W
                </div>
                <div style={{ fontSize: '11px', color: t.textMuted }}>Watts Reduced</div>
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#4a7c59' }}>
                  {Math.round(savingsWatts * 4000 / 1000).toLocaleString()} kWh
                </div>
                <div style={{ fontSize: '11px', color: t.textMuted }}>Annual Savings</div>
              </div>
              <div>
                <div style={{ fontSize: '20px', fontWeight: '700', color: '#4a7c59' }}>
                  ${annualSavings.toLocaleString()}
                </div>
                <div style={{ fontSize: '11px', color: t.textMuted }}>Est. $/Year</div>
              </div>
            </div>
          </div>

          {/* Fixture Library Match */}
          {matchedFixtureType ? (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px',
              background: '#4a7c5910',
              borderRadius: '6px',
              marginBottom: '16px'
            }}>
              <Check size={16} style={{ color: '#4a7c59' }} />
              <span style={{ fontSize: '13px', color: t.text }}>
                Matched to: <strong>{matchedFixtureType.fixture_name}</strong>
              </span>
            </div>
          ) : (
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px',
              background: '#f59e0b10',
              borderRadius: '6px',
              marginBottom: '16px'
            }}>
              <AlertCircle size={16} style={{ color: '#f59e0b' }} />
              <span style={{ fontSize: '13px', color: t.text }}>
                No match in fixture library - will create new type
              </span>
            </div>
          )}

          {/* Notes */}
          {detected?.notes && (
            <div style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', color: t.textMuted, marginBottom: '4px' }}>
                Lenard's Notes
              </div>
              <div style={{
                padding: '10px',
                background: t.bg,
                borderRadius: '6px',
                fontSize: '13px',
                color: t.textSecondary,
                fontStyle: 'italic'
              }}>
                "{detected.notes}"
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div style={{
          padding: '16px 20px',
          borderTop: `1px solid ${t.border}`,
          display: 'flex',
          gap: '12px',
          justifyContent: 'flex-end',
          position: 'sticky',
          bottom: 0,
          background: t.bgCard
        }}>
          <button
            onClick={onCancel}
            style={{
              padding: '10px 20px',
              background: 'transparent',
              border: `1px solid ${t.border}`,
              borderRadius: '8px',
              color: t.textSecondary,
              fontSize: '14px',
              cursor: 'pointer'
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            style={{
              padding: '10px 20px',
              background: '#4a7c59',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              fontSize: '14px',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Check size={16} />
            Confirm & Add
          </button>
        </div>
      </div>
    </div>
  );
}
