import { useState, useCallback, useRef, useEffect } from "react";

// ============================================================
// LENARD AZ SRP — SRP Lighting Rebate Calculator
// Dual program: Standard Business (SBS) + Small Business (SBC)
// Camera: Lenard AI fixture identification
// Offline: PWA with service worker
// ============================================================

// ==================== RATE TABLES ====================

// SBS: Standard Business Solutions FY26
// Calc method: $/watt reduced (fixture) + $/proposed watt (controls)
const SBS_RATES = {
  fixture: {
    'Interior LED Fixture': { rate: 0.35, label: 'Interior LED Fixture', desc: 'New fixture or retrofit kit' },
    'LED Re-Lamp':          { rate: 0.25, label: 'LED Re-Lamp', desc: 'Type A/B/C tube replacement' },
    'Exterior LED':         { rate: 0.15, label: 'Exterior LED', desc: 'All exterior applications' },
  },
  controls: {
    'none':        { rate: 0,    label: 'No Controls Upgrade' },
    'occupancy':   { rate: 0.15, label: 'Occupancy Sensor' },
    'daylight':    { rate: 0.15, label: 'Daylight Harvesting' },
    'occ_daylight':{ rate: 0.25, label: 'Occ + Daylight' },
    'networked':   { rate: 0.40, label: 'Networked (NLC)' },
    'occ_to_nlc':  { rate: 0.25, label: 'Occ \u2192 Networked' },
  },
  cap: 300000,
  desc: 'FY26 \u2022 $300K cap \u2022 Pre-approval required',
};

// SBC: Small Business Commercial
// Calc method: mixed — $/watt (exterior), $/fixture tiered (high bays), flat $/fixture (panels, strips)
const SBC_RATES = {
  categories: {
    exterior: {
      label: 'Exterior / Poles', icon: '\uD83C\uDFD7\uFE0F',
      subtypes: [{ id: 'ext', label: 'Exterior/Pole', ratePerWatt: 0.75, hasControls: false }],
    },
    highbay: {
      label: 'High Bays', icon: '\uD83C\uDFED',
      subtypes: [
        { id: 'hb_250',  label: '\u2264250W Reduced',    perFixture: 150, controlsRate: 0.40, hasControls: true },
        { id: 'hb_400',  label: '251-400W Reduced',  perFixture: 250, controlsRate: 0.40, hasControls: true },
        { id: 'hb_1000', label: '401-1000W Reduced', perFixture: 350, controlsRate: 0.40, hasControls: true },
      ],
    },
    panel: {
      label: 'Panels', icon: '\uD83D\uDCD0',
      subtypes: [
        { id: 'panel_2x2', label: '2\u00D72 Panel', perFixture: 80,  hasControls: false },
        { id: 'panel_2x4', label: '2\u00D74 Panel', perFixture: 110, hasControls: false },
      ],
    },
    strip: {
      label: 'Wraps & Strips', icon: '\uD83D\uDCCF',
      subtypes: [
        { id: 'strip_4', label: "4' Wrap/Strip", perFixture: 80,  hasControls: false },
        { id: 'strip_8', label: "8' Strip",      perFixture: 120, hasControls: false },
      ],
    },
  },
  desc: 'Simplified \u2022 Per-fixture rates',
};

// ==================== FIXTURE PRESETS ====================
// These let the crew tap once instead of typing wattages

const PRESETS = {
  troffers: {
    label: 'Troffers / Panels',
    items: [
      { name: '4L T8 4ft Troffer',  existW: 112, newW: 32, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture' },
      { name: '3L T8 4ft Troffer',  existW: 84,  newW: 28, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture' },
      { name: '2L T8 4ft Troffer',  existW: 56,  newW: 24, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture' },
      { name: '4L T12 4ft Troffer', existW: 172, newW: 32, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture' },
      { name: '2L T12 4ft Troffer', existW: 86,  newW: 24, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture' },
      { name: '2L T8 2x2 Troffer',  existW: 56,  newW: 20, cat: 'panel', sub: 'panel_2x2', sbsType: 'Interior LED Fixture' },
    ],
  },
  strips: {
    label: 'Strips / Wraps',
    items: [
      { name: '2L T8 4ft Strip',  existW: 56,  newW: 22, cat: 'strip', sub: 'strip_4', sbsType: 'Interior LED Fixture' },
      { name: '1L T8 4ft Strip',  existW: 28,  newW: 15, cat: 'strip', sub: 'strip_4', sbsType: 'Interior LED Fixture' },
      { name: '2L T8 8ft Strip',  existW: 112, newW: 44, cat: 'strip', sub: 'strip_8', sbsType: 'Interior LED Fixture' },
      { name: '2L T12 8ft Strip', existW: 150, newW: 44, cat: 'strip', sub: 'strip_8', sbsType: 'Interior LED Fixture' },
    ],
  },
  highbays: {
    label: 'High Bays',
    items: [
      { name: '6L T5HO High Bay',   existW: 351,  newW: 150, cat: 'highbay', sub: 'hb_250',  sbsType: 'Interior LED Fixture' },
      { name: '4L T5HO High Bay',   existW: 234,  newW: 110, cat: 'highbay', sub: 'hb_250',  sbsType: 'Interior LED Fixture' },
      { name: '400W MH High Bay',   existW: 458,  newW: 150, cat: 'highbay', sub: 'hb_400',  sbsType: 'Interior LED Fixture' },
      { name: '250W MH High Bay',   existW: 288,  newW: 100, cat: 'highbay', sub: 'hb_250',  sbsType: 'Interior LED Fixture' },
      { name: '1000W MH High Bay',  existW: 1080, newW: 300, cat: 'highbay', sub: 'hb_1000', sbsType: 'Interior LED Fixture' },
    ],
  },
  exterior: {
    label: 'Exterior',
    items: [
      { name: '400W HPS Shoebox',  existW: 465, newW: 150, cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED' },
      { name: '250W HPS Shoebox',  existW: 295, newW: 100, cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED' },
      { name: '175W MH Wall Pack', existW: 210, newW: 40,  cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED' },
      { name: '100W MH Wall Pack', existW: 120, newW: 25,  cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED' },
      { name: '150W HPS Pole',     existW: 188, newW: 60,  cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED' },
      { name: '400W MH Pole',      existW: 458, newW: 150, cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED' },
    ],
  },
};

// ==================== INCENTIVE CALCULATION ENGINES ====================

function calcSBS(line) {
  const q = line.qty || 0, eW = line.existW || 0, nW = line.newW || 0;
  const wattsReduced = Math.max(0, (eW - nW) * q);
  const fixtRate = SBS_RATES.fixture[line.fixtureType]?.rate || 0.35;
  const ctrlRate = SBS_RATES.controls[line.controlsType]?.rate || 0;
  const fixtureRebate = +(wattsReduced * fixtRate).toFixed(2);
  const controlsRebate = +(nW * q * ctrlRate).toFixed(2);
  return {
    wattsReduced, existTotal: eW * q, newTotal: nW * q,
    fixtureRebate, controlsRebate,
    totalIncentive: +(fixtureRebate + controlsRebate).toFixed(2),
  };
}

function calcSBC(line) {
  const q = line.qty || 0, eW = line.existW || 0, nW = line.newW || 0;
  const existTotal = eW * q, newTotal = nW * q;
  const wattsReduced = Math.max(0, existTotal - newTotal);
  let sub = null;
  for (const cat of Object.values(SBC_RATES.categories)) {
    const f = cat.subtypes.find(s => s.id === line.subtype);
    if (f) { sub = f; break; }
  }
  if (!sub) return { wattsReduced, existTotal, newTotal, fixtureRebate: 0, controlsRebate: 0, totalIncentive: 0 };
  let fixtureRebate = 0, controlsRebate = 0;
  if (sub.ratePerWatt) {
    fixtureRebate = +(wattsReduced * sub.ratePerWatt).toFixed(2);
  } else if (sub.perFixture !== undefined) {
    fixtureRebate = q > 0 ? +(sub.perFixture * q).toFixed(2) : 0;
    if (sub.hasControls && line.controls) {
      controlsRebate = +(newTotal * sub.controlsRate).toFixed(2);
    }
  }
  return {
    wattsReduced, existTotal, newTotal,
    fixtureRebate, controlsRebate,
    totalIncentive: +(fixtureRebate + controlsRebate).toFixed(2),
  };
}

// ==================== THEME (OG DiX dark) ====================

const T = {
  bg: '#0a0a0b', bgCard: '#141416', bgInput: '#1a1a1e', border: '#2a2a30',
  text: '#f0f0f2', textSec: '#a0a0a8', textMuted: '#606068',
  accent: '#f97316', accentDim: 'rgba(249,115,22,0.12)',
  green: '#22c55e', red: '#ef4444', blue: '#3b82f6', blueDim: 'rgba(59,130,246,0.12)',
};

// ==================== MAIN COMPONENT ====================

export default function LenardAZSRP() {
  const [program, setProgram] = useState('sbc');
  const [projectName, setProjectName] = useState('');
  const [lines, setLines] = useState([]);
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [activeTab, setActiveTab] = useState('exterior');
  const [expandedLine, setExpandedLine] = useState(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [newlyAdded, setNewlyAdded] = useState(new Set());
  const lineIdRef = useRef(0);
  const toastTimer = useRef(null);

  // Toast helper
  const showToast = useCallback((message, icon = '✓') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, icon });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // Reset lines when switching programs
  useEffect(() => { setLines([]); setExpandedLine(null); setNewlyAdded(new Set()); }, [program]);

  // Register PWA service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-lenard.js').catch(() => {});
    }
  }, []);

  // ---- LINE MANAGEMENT ----
  const addLine = useCallback((preset = null) => {
    const id = ++lineIdRef.current;
    const base = { id, qty: preset?.qty || 1, existW: preset?.existW || 0, newW: preset?.newW || 0, name: preset?.name || '' };
    if (program === 'sbs') {
      setLines(prev => [...prev, { ...base, fixtureType: preset?.sbsType || 'Interior LED Fixture', controlsType: 'none' }]);
    } else {
      const cat = preset?.cat || activeTab;
      setLines(prev => [...prev, { ...base, category: cat, subtype: preset?.sub || SBC_RATES.categories[cat]?.subtypes[0]?.id || 'ext', controls: cat === 'highbay' }]);
    }
    // Highlight newly added line briefly
    setNewlyAdded(prev => new Set(prev).add(id));
    setTimeout(() => setNewlyAdded(prev => { const next = new Set(prev); next.delete(id); return next; }), 2000);
  }, [program, activeTab]);

  const updateLine = useCallback((id, field, value) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }, []);

  const removeLine = useCallback((id) => {
    setLines(prev => prev.filter(l => l.id !== id));
    if (expandedLine === id) setExpandedLine(null);
    showToast('Line removed', '🗑');
  }, [expandedLine, showToast]);

  // ---- LENARD AI CAMERA ----
  const analyzePhoto = async (file) => {
    if (!navigator.onLine) { alert('\uD83D\uDCF7 Lenard needs internet to identify fixtures'); return; }
    setCameraLoading(true);
    try {
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(',')[1]);
        r.onerror = () => rej(new Error('Read failed'));
        r.readAsDataURL(file);
      });
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({ imageBase64: base64, mediaType: 'image/jpeg' }),
      });
      const data = await resp.json();
      if (data.fixtures && Array.isArray(data.fixtures)) {
        if (data.fixtures.length === 0) {
          showToast("Couldn't identify fixtures — try a clearer photo", '📷');
        } else {
          data.fixtures.forEach(f => {
            addLine({ name: f.name, existW: f.existW, newW: f.newW, qty: f.count || 1, cat: f.category, sub: f.subtype, sbsType: f.sbsType });
          });
          showToast(`Lenard found ${data.fixtures.length} fixture${data.fixtures.length > 1 ? 's' : ''}`, '📷');
        }
      } else {
        showToast("Couldn't identify fixtures — try a clearer photo", '📷');
      }
    } catch (err) {
      console.error('Lenard error:', err);
      showToast("Couldn't analyze that photo", '📷');
    }
    setCameraLoading(false);
  };

  const openCamera = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = (e) => { const f = e.target.files?.[0]; if (f) analyzePhoto(f); };
    input.click();
  };

  // ---- INCENTIVE CALCULATIONS ----
  const results = lines.map(l => ({ ...l, calc: program === 'sbs' ? calcSBS(l) : calcSBC(l) }));
  const totals = results.reduce((a, r) => ({
    existWatts: a.existWatts + r.calc.existTotal, newWatts: a.newWatts + r.calc.newTotal,
    wattsReduced: a.wattsReduced + r.calc.wattsReduced, fixtureRebate: a.fixtureRebate + r.calc.fixtureRebate,
    controlsRebate: a.controlsRebate + r.calc.controlsRebate, totalIncentive: a.totalIncentive + r.calc.totalIncentive,
  }), { existWatts: 0, newWatts: 0, wattsReduced: 0, fixtureRebate: 0, controlsRebate: 0, totalIncentive: 0 });
  const reductionPct = totals.existWatts > 0 ? ((totals.wattsReduced / totals.existWatts) * 100).toFixed(0) : 0;
  const filteredResults = program === 'sbc' ? results.filter(r => r.category === activeTab) : results;

  // ---- COPY SUMMARY TO CLIPBOARD ----
  const copySummary = () => {
    const p = program === 'sbs' ? 'SRP Standard Business' : 'SRP Small Business (SBC)';
    let t = `${p} Quick Quote${projectName ? ` \u2014 ${projectName}` : ''}\n${'='.repeat(50)}\n\n`;
    results.forEach(r => {
      t += `${r.name || (program === 'sbs' ? r.fixtureType : r.subtype)}: ${r.qty}\u00D7 | ${r.existW}W \u2192 ${r.newW}W | ${r.calc.totalIncentive.toLocaleString()}\n`;
    });
    t += `\n${'\u2014'.repeat(50)}\nExisting: ${totals.existWatts.toLocaleString()}W \u2192 New: ${totals.newWatts.toLocaleString()}W (${reductionPct}% reduction)\n`;
    t += `Fixture Rebate: ${totals.fixtureRebate.toLocaleString()}\nControls Rebate: ${totals.controlsRebate.toLocaleString()}\n`;
    t += `TOTAL ESTIMATED INCENTIVE: ${totals.totalIncentive.toLocaleString()}\n\n\u26A0\uFE0F Estimate only \u2014 subject to SRP review`;
    navigator.clipboard?.writeText(t); setShowSummary(false); showToast('Copied to clipboard', '📋');
  };

  // ---- STYLES ----
  const S = {
    card: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '14px', padding: '14px', marginBottom: '10px' },
    input: { width: '100%', padding: '10px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
    select: { width: '100%', padding: '10px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text, fontSize: '13px', outline: 'none', boxSizing: 'border-box', appearance: 'auto' },
    label: { display: 'block', fontSize: '11px', color: T.textMuted, marginBottom: '4px', textTransform: 'uppercase', letterSpacing: '0.5px' },
    btn: { padding: '10px 16px', background: T.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
    btnGhost: { padding: '8px 14px', background: 'transparent', color: T.textSec, border: `1px solid ${T.border}`, borderRadius: '8px', fontSize: '13px', cursor: 'pointer' },
    money: { color: T.green, fontWeight: '700', fontFamily: "'SF Mono', 'Fira Code', monospace" },
  };

  // ==================== RENDER ====================
  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', background: T.bg, minHeight: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: T.text, paddingBottom: '80px' }}>

      {/* ===== TOAST ===== */}
      {toast && (
        <div style={{
          position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)',
          background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px',
          padding: '10px 18px', zIndex: 100, display: 'flex', alignItems: 'center', gap: '8px',
          boxShadow: '0 4px 20px rgba(0,0,0,0.4)', animation: 'toastSlide 0.25s ease-out',
          fontSize: '14px', fontWeight: '500', color: T.text, maxWidth: '90%',
        }}>
          <span>{toast.icon}</span>
          <span>{toast.message}</span>
        </div>
      )}
      <style>{`@keyframes toastSlide { from { opacity: 0; transform: translateX(-50%) translateY(-16px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>

      {/* ===== STICKY HEADER ===== */}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: T.bg, borderBottom: `1px solid ${T.border}`, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px' }}>
              <span style={{ color: T.accent }}>Lenard</span> AZ SRP
            </div>
            <div style={{ fontSize: '11px', color: T.textMuted }}>{program === 'sbs' ? SBS_RATES.desc : SBC_RATES.desc}</div>
          </div>
          {totals.totalIncentive > 0 && <div style={{ ...S.money, fontSize: '20px' }}>${totals.totalIncentive.toLocaleString()}</div>}
        </div>
        <div style={{ display: 'flex', gap: '4px', background: T.bgInput, borderRadius: '10px', padding: '3px' }}>
          {['sbc', 'sbs'].map(p => (
            <button key={p} onClick={() => setProgram(p)} style={{
              flex: 1, padding: '8px', background: program === p ? T.accent : 'transparent',
              color: program === p ? '#fff' : T.textSec, border: 'none', borderRadius: '8px',
              fontSize: '13px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s',
            }}>{p === 'sbc' ? '\u26A1 Small Business' : '\uD83C\uDFE2 Standard Business'}</button>
          ))}
        </div>
      </div>

      {/* ===== PROJECT NAME ===== */}
      <div style={{ padding: '12px 16px 4px' }}>
        <input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} placeholder="Project / Customer Name"
          style={{ ...S.input, background: 'transparent', border: 'none', borderBottom: `1px solid ${T.border}`, borderRadius: 0, padding: '8px 0', fontSize: '15px', fontWeight: '500' }} />
      </div>

      {/* ===== SBC CATEGORY TABS ===== */}
      {program === 'sbc' && (
        <div style={{ display: 'flex', gap: '6px', padding: '8px 16px', overflowX: 'auto' }}>
          {Object.entries(SBC_RATES.categories).map(([key, cat]) => {
            const catTotal = results.filter(r => r.category === key).reduce((s, r) => s + r.calc.totalIncentive, 0);
            return (
              <button key={key} onClick={() => setActiveTab(key)} style={{
                flexShrink: 0, padding: '8px 12px', background: activeTab === key ? T.accentDim : T.bgCard,
                color: activeTab === key ? T.accent : T.textSec, border: `1px solid ${activeTab === key ? T.accent : T.border}`,
                borderRadius: '10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{cat.icon} {cat.label}{catTotal > 0 && <span style={{ marginLeft: '4px', color: T.green }}>${catTotal.toLocaleString()}</span>}</button>
            );
          })}
        </div>
      )}

      {/* ===== SBS RATE INFO ===== */}
      {program === 'sbs' && results.length === 0 && (
        <div style={{ margin: '8px 16px', padding: '12px', background: T.blueDim, border: `1px solid ${T.blue}`, borderRadius: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: T.blue, marginBottom: '6px' }}>Standard Business Rates (FY26)</div>
          <div style={{ fontSize: '12px', color: T.textSec, lineHeight: '1.6' }}>
            Interior LED Fixture: <span style={{ color: T.text }}>$0.35/W reduced</span><br/>
            LED Re-Lamp: <span style={{ color: T.text }}>$0.25/W reduced</span><br/>
            Exterior LED: <span style={{ color: T.text }}>$0.15/W reduced</span><br/>
            Controls: <span style={{ color: T.text }}>$0.15\u2013$0.40/W</span> on proposed watts
          </div>
        </div>
      )}

      {/* ===== CAMERA LOADING ===== */}
      {cameraLoading && (
        <div style={{ margin: '8px 16px', padding: '16px', background: T.accentDim, border: `1px solid ${T.accent}`, borderRadius: '10px', textAlign: 'center' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>{'\uD83D\uDD0D'}</div>
          <div style={{ fontSize: '14px', fontWeight: '600', color: T.accent }}>Lenard is analyzing...</div>
          <div style={{ fontSize: '12px', color: T.textMuted }}>Identifying fixtures and wattages</div>
        </div>
      )}

      {/* ===== LINE ITEMS ===== */}
      <div style={{ padding: '8px 16px' }}>
        {filteredResults.length === 0 && !cameraLoading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: T.textMuted }}>
            <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.5 }}>{program === 'sbc' ? SBC_RATES.categories[activeTab]?.icon : '\uD83C\uDFE2'}</div>
            <div style={{ fontSize: '14px', marginBottom: '4px' }}>No fixtures yet</div>
            <div style={{ fontSize: '12px' }}>Tap + to add, {'\u26A1'} for presets, or {'\uD83D\uDCF7'} snap a photo</div>
          </div>
        )}

        {filteredResults.map(r => {
          const isExp = expandedLine === r.id;
          const isNew = newlyAdded.has(r.id);
          const hasRebate = r.calc.totalIncentive > 0;
          const subtypeInfo = program === 'sbs'
            ? `${r.fixtureType} \u2022 $${SBS_RATES.fixture[r.fixtureType]?.rate || '0.35'}/W`
            : (() => { let sub = null; for (const cat of Object.values(SBC_RATES.categories)) { const f = cat.subtypes.find(s => s.id === r.subtype); if (f) { sub = f; break; } } return sub ? `${sub.label} \u2022 ${sub.ratePerWatt ? `$${sub.ratePerWatt}/W` : `$${sub.perFixture}/fixture`}` : r.subtype; })();
          return (
            <div key={r.id} style={{
              ...S.card,
              borderColor: isExp ? T.accent : isNew ? T.green : T.border,
              borderLeft: `3px solid ${isExp ? T.accent : hasRebate ? T.green : T.border}`,
              transition: 'border-color 0.3s ease',
            }}>
              <div onClick={() => setExpandedLine(isExp ? null : r.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name || (program === 'sbs' ? r.fixtureType : SBC_RATES.categories[r.category]?.subtypes.find(s => s.id === r.subtype)?.label || r.subtype)}
                  </div>
                  <div style={{ fontSize: '11px', color: T.textSec, marginTop: '2px' }}>{subtypeInfo}</div>
                  <div style={{ fontSize: '12px', color: T.textMuted, marginTop: '2px' }}>{r.qty}\u00D7 | {r.existW}W \u2192 {r.newW}W | \u2212{r.calc.wattsReduced}W</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...S.money, fontSize: '16px' }}>${r.calc.totalIncentive.toLocaleString()}</div>
                    {r.calc.controlsRebate > 0 && <div style={{ fontSize: '10px', color: T.blue }}>+${r.calc.controlsRebate} ctrl</div>}
                  </div>
                  <div style={{ fontSize: '14px', color: T.textMuted, transition: 'transform 0.2s', transform: isExp ? 'rotate(90deg)' : 'none' }}>{'\u25B8'}</div>
                </div>
              </div>

              {isExp && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${T.border}` }}>
                  <div style={{ marginBottom: '10px' }}><label style={S.label}>Description</label><input type="text" value={r.name} onChange={e => updateLine(r.id, 'name', e.target.value)} placeholder="Optional label" style={S.input} /></div>

                  {program === 'sbs' && <div style={{ marginBottom: '10px' }}><label style={S.label}>Fixture Type</label><select value={r.fixtureType} onChange={e => updateLine(r.id, 'fixtureType', e.target.value)} style={S.select}>{Object.entries(SBS_RATES.fixture).map(([k, v]) => <option key={k} value={k}>{v.label} — ${v.rate}/W</option>)}</select></div>}
                  {program === 'sbc' && <div style={{ marginBottom: '10px' }}><label style={S.label}>Fixture Subtype</label><select value={r.subtype} onChange={e => updateLine(r.id, 'subtype', e.target.value)} style={S.select}>{SBC_RATES.categories[r.category]?.subtypes.map(s => <option key={s.id} value={s.id}>{s.label} — {s.ratePerWatt ? `${s.ratePerWatt}/W` : `${s.perFixture}/fixture`}</option>)}</select></div>}

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
                    <div><label style={S.label}>Qty</label><input type="number" inputMode="numeric" value={r.qty || ''} onChange={e => updateLine(r.id, 'qty', parseInt(e.target.value) || 0)} style={S.input} /></div>
                    <div><label style={S.label}>Exist W</label><input type="number" inputMode="numeric" value={r.existW || ''} onChange={e => updateLine(r.id, 'existW', parseInt(e.target.value) || 0)} style={S.input} /></div>
                    <div><label style={S.label}>New W</label><input type="number" inputMode="numeric" value={r.newW || ''} onChange={e => updateLine(r.id, 'newW', parseInt(e.target.value) || 0)} style={S.input} /></div>
                  </div>

                  {program === 'sbs' && <div style={{ marginBottom: '10px' }}><label style={S.label}>Controls Upgrade</label><select value={r.controlsType} onChange={e => updateLine(r.id, 'controlsType', e.target.value)} style={S.select}>{Object.entries(SBS_RATES.controls).map(([k, v]) => <option key={k} value={k}>{v.label}{v.rate > 0 ? ` — ${v.rate}/W` : ''}</option>)}</select></div>}

                  {program === 'sbc' && SBC_RATES.categories[r.category]?.subtypes.find(s => s.id === r.subtype)?.hasControls && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                      <button onClick={() => updateLine(r.id, 'controls', !r.controls)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: r.controls ? T.accent : T.bgInput, border: `1px solid ${r.controls ? T.accent : T.border}`, cursor: 'pointer', position: 'relative', transition: 'all 0.2s', flexShrink: 0, padding: 0 }}>
                        <div style={{ width: '18px', height: '18px', borderRadius: '9px', background: '#fff', position: 'absolute', top: '2px', left: r.controls ? '22px' : '2px', transition: 'left 0.2s' }} />
                      </button>
                      <span style={{ fontSize: '13px', color: T.textSec }}>Controls ($0.40/W on new LED watts)</span>
                    </div>
                  )}

                  <div style={{ background: T.bgInput, borderRadius: '8px', padding: '10px', fontSize: '12px', color: T.textSec }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Fixture Rebate</span><span style={S.money}>${r.calc.fixtureRebate.toLocaleString()}</span></div>
                    {r.calc.controlsRebate > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Controls Rebate</span><span style={{ color: T.blue, fontWeight: '600' }}>${r.calc.controlsRebate}</span></div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: `1px solid ${T.border}` }}><span style={{ fontWeight: '600', color: T.text }}>Line Total</span><span style={{ ...S.money, fontSize: '14px' }}>${r.calc.totalIncentive.toLocaleString()}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button onClick={() => setExpandedLine(null)} style={{ ...S.btn, flex: 1, fontSize: '13px' }}>Done</button>
                    <button onClick={() => removeLine(r.id)} style={{ ...S.btnGhost, color: T.red, borderColor: T.red, fontSize: '12px', padding: '10px 14px' }}>{'\uD83D\uDDD1'} Remove</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ===== PROJECT TOTALS ===== */}
      {results.length > 0 && (
        <div style={{ ...S.card, margin: '8px 16px', background: T.accentDim, borderColor: T.accent }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center', marginBottom: '8px' }}>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>EXISTING</div><div style={{ fontSize: '14px', fontWeight: '600' }}>{totals.existWatts.toLocaleString()}W</div></div>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>NEW LED</div><div style={{ fontSize: '14px', fontWeight: '600' }}>{totals.newWatts.toLocaleString()}W</div></div>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>REDUCED</div><div style={{ fontSize: '14px', fontWeight: '600', color: T.green }}>{reductionPct}%</div></div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: `1px solid ${T.border}` }}>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>TOTAL ESTIMATED INCENTIVE</div><div style={{ ...S.money, fontSize: '22px' }}>${totals.totalIncentive.toLocaleString()}</div></div>
            <button onClick={() => setShowSummary(true)} style={{ ...S.btn, fontSize: '12px', padding: '8px 14px' }}>{'\uD83D\uDCCB'} Summary</button>
          </div>
        </div>
      )}

      {/* ===== BOTTOM ACTION BAR ===== */}
      <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', background: T.bgCard, borderTop: `1px solid ${T.border}`, padding: '10px 16px', display: 'flex', gap: '8px', zIndex: 40, boxSizing: 'border-box' }}>
        <button onClick={() => addLine()} style={{ ...S.btn, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>{'\uFF0B'} Add Line</button>
        <button onClick={() => setShowQuickAdd(true)} style={{ ...S.btnGhost, flex: 1 }}>{'\u26A1'} Quick Add</button>
        <button onClick={openCamera} disabled={cameraLoading} style={{ ...S.btnGhost, padding: '10px 14px', opacity: cameraLoading ? 0.5 : 1 }}>{cameraLoading ? '\u23F3' : '\uD83D\uDCF7'}</button>
      </div>

      {/* ===== QUICK ADD MODAL ===== */}
      {showQuickAdd && (<>
        <div onClick={() => setShowQuickAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', background: T.bgCard, borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '70vh', overflow: 'auto', zIndex: 51, padding: '20px 16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700' }}>{'\u26A1'} Quick Add Preset</div>
            <button onClick={() => setShowQuickAdd(false)} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: '20px', cursor: 'pointer' }}>{'\u2715'}</button>
          </div>
          {Object.entries(PRESETS).map(([gk, group]) => (
            <div key={gk} style={{ marginBottom: '16px' }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: T.textMuted, textTransform: 'uppercase', marginBottom: '8px' }}>{group.label}</div>
              {group.items.map((item, i) => (
                <button key={i} onClick={() => { addLine(item); showToast(`Added ${item.name}`, '\u2713'); setShowQuickAdd(false); }} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text, cursor: 'pointer', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><div style={{ fontSize: '13px', fontWeight: '500' }}>{item.name}</div><div style={{ fontSize: '11px', color: T.textMuted }}>{item.existW}W {'\u2192'} {item.newW}W</div></div>
                  <div style={{ fontSize: '12px', color: T.accent }}>{'\uFF0B'}</div>
                </button>
              ))}
            </div>
          ))}
        </div>
      </>)}

      {/* ===== SUMMARY MODAL ===== */}
      {showSummary && (<>
        <div onClick={() => setShowSummary(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '90%', maxWidth: '440px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '16px', maxHeight: '80vh', overflow: 'auto', zIndex: 51, padding: '24px' }}>
          <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>{program === 'sbs' ? '\uD83C\uDFE2' : '\u26A1'} Project Summary</div>
          <div style={{ fontSize: '12px', color: T.textMuted, marginBottom: '16px' }}>{program === 'sbs' ? 'SRP Standard Business Solutions' : 'SRP Small Business Commercial'}{projectName ? ` \u2014 ${projectName}` : ''}</div>
          {results.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: '13px' }}>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.qty}\u00D7 {r.name || (program === 'sbs' ? r.fixtureType : r.subtype)}</div>
              <div style={S.money}>${r.calc.totalIncentive.toLocaleString()}</div>
            </div>
          ))}
          <div style={{ marginTop: '16px', padding: '12px', background: T.bgInput, borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: T.textSec }}><span>Fixture Rebate</span><span>${totals.fixtureRebate.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: T.textSec }}><span>Controls Rebate</span><span>${totals.controlsRebate.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px', color: T.textSec }}><span>Watts Reduced</span><span>{totals.wattsReduced.toLocaleString()}W ({reductionPct}%)</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '700', paddingTop: '8px', borderTop: `1px solid ${T.border}` }}><span>Total Incentive</span><span style={S.money}>${totals.totalIncentive.toLocaleString()}</span></div>
          </div>
          <div style={{ fontSize: '11px', color: T.textMuted, marginTop: '12px', textAlign: 'center' }}>{'\u26A0\uFE0F'} Estimate only \u2014 subject to SRP review and approval</div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
            <button onClick={copySummary} style={{ ...S.btn, flex: 1 }}>{'\uD83D\uDCCB'} Copy to Clipboard</button>
            <button onClick={() => setShowSummary(false)} style={{ ...S.btnGhost, flex: 1 }}>Close</button>
          </div>
        </div>
      </>)}

      <div style={{ textAlign: 'center', padding: '20px 16px 0', fontSize: '11px', color: T.textMuted }}>Powered by <span style={{ color: T.accent }}>Job Scout</span> {'\u2022'} HHH Building Services</div>
    </div>
  );
}
