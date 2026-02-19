import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { jsPDF } from "jspdf";

// ============================================================
// LENARD AZ SRP — SRP Lighting Rebate Calculator
// Dual program: Standard Business (SBS) + Small Business (SBC)
// Camera: Lenard AI fixture identification
// Offline: PWA with service worker
// ============================================================

// ==================== RATE TABLES ====================

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

// ==================== FIXTURE PRESETS (with default heights) ====================

const PRESETS = {
  troffers: {
    label: 'Troffers / Panels',
    items: [
      { name: '4L T8 4ft Troffer',  existW: 112, newW: 32, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture', height: 9 },
      { name: '3L T8 4ft Troffer',  existW: 84,  newW: 28, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture', height: 9 },
      { name: '2L T8 4ft Troffer',  existW: 56,  newW: 24, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture', height: 9 },
      { name: '4L T12 4ft Troffer', existW: 172, newW: 32, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture', height: 9 },
      { name: '2L T12 4ft Troffer', existW: 86,  newW: 24, cat: 'panel', sub: 'panel_2x4', sbsType: 'Interior LED Fixture', height: 9 },
      { name: '2L T8 2x2 Troffer',  existW: 56,  newW: 20, cat: 'panel', sub: 'panel_2x2', sbsType: 'Interior LED Fixture', height: 9 },
    ],
  },
  strips: {
    label: 'Strips / Wraps',
    items: [
      { name: '2L T8 4ft Strip',  existW: 56,  newW: 22, cat: 'strip', sub: 'strip_4', sbsType: 'Interior LED Fixture', height: 10 },
      { name: '1L T8 4ft Strip',  existW: 28,  newW: 15, cat: 'strip', sub: 'strip_4', sbsType: 'Interior LED Fixture', height: 10 },
      { name: '2L T8 8ft Strip',  existW: 112, newW: 44, cat: 'strip', sub: 'strip_8', sbsType: 'Interior LED Fixture', height: 10 },
      { name: '2L T12 8ft Strip', existW: 150, newW: 44, cat: 'strip', sub: 'strip_8', sbsType: 'Interior LED Fixture', height: 10 },
    ],
  },
  highbays: {
    label: 'High Bays',
    items: [
      { name: '6L T5HO High Bay',   existW: 351,  newW: 150, cat: 'highbay', sub: 'hb_250',  sbsType: 'Interior LED Fixture', height: 20 },
      { name: '4L T5HO High Bay',   existW: 234,  newW: 110, cat: 'highbay', sub: 'hb_250',  sbsType: 'Interior LED Fixture', height: 20 },
      { name: '400W MH High Bay',   existW: 458,  newW: 150, cat: 'highbay', sub: 'hb_400',  sbsType: 'Interior LED Fixture', height: 20 },
      { name: '250W MH High Bay',   existW: 288,  newW: 100, cat: 'highbay', sub: 'hb_250',  sbsType: 'Interior LED Fixture', height: 20 },
      { name: '1000W MH High Bay',  existW: 1080, newW: 300, cat: 'highbay', sub: 'hb_1000', sbsType: 'Interior LED Fixture', height: 20 },
    ],
  },
  exterior: {
    label: 'Exterior',
    items: [
      { name: '400W HPS Shoebox',  existW: 465, newW: 150, cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED', height: 25 },
      { name: '250W HPS Shoebox',  existW: 295, newW: 100, cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED', height: 25 },
      { name: '175W MH Wall Pack', existW: 210, newW: 40,  cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED', height: 25 },
      { name: '100W MH Wall Pack', existW: 120, newW: 25,  cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED', height: 25 },
      { name: '150W HPS Pole',     existW: 188, newW: 60,  cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED', height: 25 },
      { name: '400W MH Pole',      existW: 458, newW: 150, cat: 'exterior', sub: 'ext', sbsType: 'Exterior LED', height: 25 },
    ],
  },
};

// Default heights by category
const DEFAULT_HEIGHTS = { panel: 9, strip: 10, highbay: 20, exterior: 25 };

// Map SBC/SBS categories to lighting audit FIXTURE_CATEGORIES
const CATEGORY_TO_FIXTURE_CAT = {
  panel: 'Recessed', strip: 'Linear', highbay: 'High Bay', exterior: 'Outdoor',
};

// Infer lamp type from fixture name for the lighting audit
function inferLampType(name) {
  if (!name) return '';
  const n = name.toLowerCase();
  if (n.includes('t12')) return 'T12';
  if (n.includes('t5ho') || n.includes('t5 ho')) return 'T5HO';
  if (n.includes('t5')) return 'T5';
  if (n.includes('t8')) return 'T8';
  if (n.includes('metal halide') || n.includes(' mh ') || n.includes('mh ')) return 'Metal Halide';
  if (n.includes('hps') || n.includes('sodium')) return 'HPS';
  if (n.includes('led')) return 'LED';
  if (n.includes('cfl')) return 'CFL';
  return '';
}

// Fixture categories and lamp types (matching lightingConstants.js)
const FIXTURE_CATEGORIES = ['Linear', 'High Bay', 'Low Bay', 'Surface Mount', 'Outdoor', 'Recessed', 'Track', 'Wall Pack', 'Flood', 'Area Light', 'Canopy', 'Other'];
const LAMP_TYPES = ['T12', 'T8', 'T5', 'T5HO', 'Metal Halide', 'HPS', 'Mercury Vapor', 'Halogen', 'Incandescent', 'CFL', 'LED', 'Other'];

// Common wattages and LED replacements by lamp type (matching lightingConstants.js)
const COMMON_WATTAGES = {
  'T12': [46, 72, 86, 128, 158, 172], 'T8': [32, 59, 85, 112, 118], 'T5': [28, 58, 84],
  'T5HO': [118, 234, 348, 464], 'Metal Halide': [85, 120, 185, 210, 290, 455, 1080],
  'HPS': [85, 120, 185, 240, 295, 465, 1100], 'Mercury Vapor': [200, 290, 455, 1075],
  'Halogen': [50, 75, 90, 150, 300, 500], 'Incandescent': [40, 60, 75, 100, 150],
  'CFL': [13, 18, 26, 32, 42], 'LED': [10, 20, 30, 50, 100, 150, 200, 300, 400], 'Other': [],
};
const LED_REPLACEMENT_MAP = {
  'T12': { 46: 15, 72: 25, 86: 30, 128: 40, 158: 50, 172: 55 },
  'T8': { 32: 12, 59: 25, 85: 35, 112: 45, 118: 48 },
  'T5': { 28: 12, 58: 25, 84: 35 },
  'T5HO': { 118: 50, 234: 95, 348: 140, 464: 180 },
  'Metal Halide': { 85: 30, 120: 45, 185: 70, 210: 80, 290: 100, 455: 150, 1080: 400 },
  'HPS': { 85: 30, 120: 45, 185: 70, 240: 90, 295: 100, 465: 150, 1100: 400 },
  'Mercury Vapor': { 200: 70, 290: 100, 455: 150, 1075: 400 },
  'Halogen': { 50: 7, 75: 10, 90: 12, 150: 18, 300: 36, 500: 60 },
  'Incandescent': { 40: 6, 60: 9, 75: 11, 100: 15, 150: 20 },
  'CFL': { 13: 9, 18: 12, 26: 15, 32: 18, 42: 24 },
  'LED': {}, 'Other': {},
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

// ==================== THEME ====================

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
  const [quickAddTab, setQuickAddTab] = useState('troffers');
  const [showSummary, setShowSummary] = useState(false);
  const [expandedLine, setExpandedLine] = useState(null);
  const [cameraLoading, setCameraLoading] = useState(false);
  const [toast, setToast] = useState(null);
  const [newlyAdded, setNewlyAdded] = useState(new Set());
  const lineIdRef = useRef(0);
  const toastTimer = useRef(null);

  // SBE Products
  const [sbeProducts, setSbeProducts] = useState([]);

  // Financial settings
  const [showFinancials, setShowFinancials] = useState(false);
  const [operatingHours, setOperatingHours] = useState(12);
  const [daysPerYear, setDaysPerYear] = useState(365);
  const [energyRate, setEnergyRate] = useState(0.10);

  // Save project — customer info matching step 1 basic info
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savePhone, setSavePhone] = useState('');
  const [saveEmail, setSaveEmail] = useState('');
  const [saveAddress, setSaveAddress] = useState('');
  const [saveCity, setSaveCity] = useState('');
  const [saveState, setSaveState] = useState('AZ');
  const [saveZip, setSaveZip] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedLeadId, setSavedLeadId] = useState(null);

  // Projects list
  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);

  // Camera photos (stored for audit)
  const [capturedPhotos, setCapturedPhotos] = useState([]);

  // Toast helper
  const showToast = useCallback((message, icon = '\u2713') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, icon });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  // Reset lines when switching programs
  useEffect(() => { setLines([]); setExpandedLine(null); setNewlyAdded(new Set()); setSavedLeadId(null); setCapturedPhotos([]); setSaveCity(''); setSaveState('AZ'); setSaveZip(''); }, [program]);

  // Register PWA service worker
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw-lenard.js').catch(() => {});
    }
  }, []);

  // Fetch SBE products on mount
  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-products`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
          body: '{}',
        });
        const data = await resp.json();
        if (data.products) setSbeProducts(data.products);
      } catch (_) { /* SBE products optional */ }
    };
    fetchProducts();
  }, []);

  // ---- LINE MANAGEMENT ----
  const addLine = useCallback((preset = null) => {
    const id = ++lineIdRef.current;
    const cat = preset?.cat || 'panel';
    const defaultHeight = DEFAULT_HEIGHTS[cat] || 9;
    const base = {
      id,
      qty: preset?.qty || 1,
      existW: preset?.existW || 0,
      newW: preset?.newW || 0,
      name: preset?.name || '',
      height: preset?.height || defaultHeight,
      productId: preset?.productId || null,
      productName: preset?.productName || '',
      productPrice: preset?.productPrice || 0,
      // Audit-matching fields
      fixtureCategory: preset?.fixtureCategory || CATEGORY_TO_FIXTURE_CAT[cat] || 'Linear',
      lightingType: preset?.lightingType || inferLampType(preset?.name || ''),
      confirmed: false,
      overrideNotes: '',
    };
    if (program === 'sbs') {
      setLines(prev => [...prev, { ...base, fixtureType: preset?.sbsType || 'Interior LED Fixture', controlsType: 'none' }]);
    } else {
      setLines(prev => [...prev, { ...base, category: cat, subtype: preset?.sub || SBC_RATES.categories[cat]?.subtypes[0]?.id || 'ext', controls: cat === 'highbay' }]);
    }
    setNewlyAdded(prev => new Set(prev).add(id));
    setTimeout(() => setNewlyAdded(prev => { const next = new Set(prev); next.delete(id); return next; }), 2000);
  }, [program]);

  const updateLine = useCallback((id, field, value) => {
    setLines(prev => prev.map(l => l.id === id ? { ...l, [field]: value } : l));
  }, []);

  const removeLine = useCallback((id) => {
    setLines(prev => prev.filter(l => l.id !== id));
    if (expandedLine === id) setExpandedLine(null);
    showToast('Line removed', '\uD83D\uDDD1');
  }, [expandedLine, showToast]);

  // Select SBE product for a line
  const selectProduct = useCallback((lineId, product) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const updates = { productId: product.id, productName: product.name, productPrice: product.unit_price || 0 };
      // Try to extract wattage from product name/description
      const wattMatch = (product.description || product.name || '').match(/(\d+)\s*[wW]/);
      if (wattMatch) updates.newW = parseInt(wattMatch[1]);
      return { ...l, ...updates };
    }));
  }, []);

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

      // Store photo for audit
      setCapturedPhotos(prev => [...prev, base64]);

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
          showToast("Couldn't identify fixtures \u2014 try a clearer photo", '\uD83D\uDCF7');
        } else {
          data.fixtures.forEach(f => {
            addLine({
              name: f.name, existW: f.existW, newW: f.newW, qty: f.count || 1,
              cat: f.category, sub: f.subtype, sbsType: f.sbsType,
              height: f.height || DEFAULT_HEIGHTS[f.category] || 9,
              fixtureCategory: CATEGORY_TO_FIXTURE_CAT[f.category] || 'Linear',
              lightingType: inferLampType(f.name),
            });
          });
          showToast(`Lenard found ${data.fixtures.length} fixture${data.fixtures.length > 1 ? 's' : ''}`, '\uD83D\uDCF7');
        }
      } else {
        showToast("Couldn't identify fixtures \u2014 try a clearer photo", '\uD83D\uDCF7');
      }
    } catch (err) {
      console.error('Lenard error:', err);
      showToast("Couldn't analyze that photo", '\uD83D\uDCF7');
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

  // ---- FINANCIAL ANALYSIS ----
  const financials = useMemo(() => {
    const annualHours = operatingHours * daysPerYear;
    const annualKwhSaved = (totals.wattsReduced * annualHours) / 1000;
    const annualEnergySavings = annualKwhSaved * energyRate;
    const projectCost = lines.reduce((s, l) => s + ((l.productPrice || 0) * (l.qty || 0)), 0);
    const netProjectCost = projectCost - totals.totalIncentive;
    const simplePayback = annualEnergySavings > 0 ? netProjectCost / annualEnergySavings : 0;
    const roi = netProjectCost > 0 ? (annualEnergySavings / netProjectCost) * 100 : 0;
    const tenYearSavings = (annualEnergySavings * 10) - netProjectCost;
    return { annualHours, annualKwhSaved, annualEnergySavings, projectCost, netProjectCost, simplePayback, roi, tenYearSavings };
  }, [operatingHours, daysPerYear, energyRate, totals, lines]);

  // ---- SAVE PROJECT ----
  const saveProject = async () => {
    if (!projectName.trim()) { showToast('Enter a customer name first', '\u26A0\uFE0F'); return; }
    setSaving(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const projectData = {
        lines: lines.map(l => ({
          name: l.name, qty: l.qty, existW: l.existW, newW: l.newW,
          height: l.height, productId: l.productId, productName: l.productName, productPrice: l.productPrice,
          category: l.category, subtype: l.subtype, fixtureType: l.fixtureType,
          fixtureCategory: l.fixtureCategory, lightingType: l.lightingType,
          confirmed: l.confirmed, overrideNotes: l.overrideNotes,
        })),
        totals, financials,
        totalIncentive: totals.totalIncentive,
        projectCost: financials.projectCost,
        operatingHours, daysPerYear, energyRate,
        city: saveCity, state: saveState, zip: saveZip,
        photos: capturedPhotos,
      };
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
        body: JSON.stringify({
          customerName: projectName,
          phone: savePhone,
          email: saveEmail,
          address: saveAddress,
          city: saveCity,
          state: saveState,
          zip: saveZip,
          projectData,
          programType: program,
        }),
      });
      const data = await resp.json();
      if (data.success) {
        setSavedLeadId(data.leadId);
        setShowSaveModal(false);
        showToast('Project saved as lead + audit', '\u2713');
      } else {
        showToast(data.error || 'Save failed', '\u26A0\uFE0F');
      }
    } catch (err) {
      console.error('Save error:', err);
      showToast('Could not save project', '\u26A0\uFE0F');
    }
    setSaving(false);
  };

  // ---- LOAD PROJECTS ----
  const loadProjects = async () => {
    setLoadingProjects(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-projects`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` },
        body: '{}',
      });
      const data = await resp.json();
      if (data.projects) setProjects(data.projects);
    } catch (_) { showToast('Could not load projects', '\u26A0\uFE0F'); }
    setLoadingProjects(false);
  };

  const loadProject = (project) => {
    try {
      // Full JSON is stored in audit.notes (lead notes are human-readable)
      const rawNotes = project.audit?.notes || project.notes;
      const pd = JSON.parse(rawNotes);
      setProjectName(project.customerName || '');
      setSavePhone(project.phone || '');
      setSaveEmail(project.email || '');
      setSaveAddress(project.address || '');
      setSaveCity(pd.city || '');
      setSaveState(pd.state || 'AZ');
      setSaveZip(pd.zip || '');
      if (pd.operatingHours) setOperatingHours(pd.operatingHours);
      if (pd.daysPerYear) setDaysPerYear(pd.daysPerYear);
      if (pd.energyRate) setEnergyRate(pd.energyRate);
      setSavedLeadId(project.id);
      if (pd.lines) {
        lineIdRef.current = 0;
        const loaded = pd.lines.map(l => {
          const id = ++lineIdRef.current;
          return { ...l, id };
        });
        setLines(loaded);
      }
      setShowProjects(false);
      showToast('Project loaded', '\uD83D\uDCC2');
    } catch (_) {
      showToast('Could not parse project data', '\u26A0\uFE0F');
    }
  };

  // ---- COPY SUMMARY TO CLIPBOARD ----
  const copySummary = () => {
    const p = program === 'sbs' ? 'SRP Standard Business' : 'SRP Small Business (SBC)';
    let t = `${p} Quick Quote${projectName ? ` \u2014 ${projectName}` : ''}\n${'='.repeat(50)}\n\n`;
    results.forEach(r => {
      t += `${r.name || (program === 'sbs' ? r.fixtureType : r.subtype)}: ${r.qty}\u00D7 | ${r.existW}W \u2192 ${r.newW}W | ${r.height}ft | $${r.calc.totalIncentive.toLocaleString()}\n`;
    });
    t += `\n${'\u2014'.repeat(50)}\nExisting: ${totals.existWatts.toLocaleString()}W \u2192 New: ${totals.newWatts.toLocaleString()}W (${reductionPct}% reduction)\n`;
    t += `Fixture Rebate: $${totals.fixtureRebate.toLocaleString()}\nControls Rebate: $${totals.controlsRebate.toLocaleString()}\n`;
    t += `TOTAL ESTIMATED INCENTIVE: $${totals.totalIncentive.toLocaleString()}\n\n`;
    if (financials.projectCost > 0) {
      t += `Project Cost: $${financials.projectCost.toLocaleString()} | Net: $${financials.netProjectCost.toLocaleString()}\n`;
      t += `Payback: ${financials.simplePayback.toFixed(1)} yrs | 10-Year Savings: $${Math.round(financials.tenYearSavings).toLocaleString()}\n\n`;
    }
    t += `\u26A0\uFE0F Estimate only \u2014 subject to SRP review`;
    navigator.clipboard?.writeText(t); setShowSummary(false); showToast('Copied to clipboard', '\uD83D\uDCCB');
  };

  // ---- PDF GENERATION ----
  const generatePDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();   // 215.9
    const H = doc.internal.pageSize.getHeight();   // 279.4
    const M = 16; // margin
    const LW = W - M * 2; // line width
    const COL2 = W - M; // right-align anchor
    const orange = [249, 115, 22];
    const dark = [30, 30, 34];
    const green = [22, 163, 74];
    const red = [220, 38, 38];
    const gray = [120, 120, 120];
    const ltGray = [230, 230, 230];
    let y = 0;
    let pg = 1;

    const $ = (v) => `$${Math.round(v).toLocaleString()}`;
    const $c = (v) => `$${v.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const pct = (v) => `${Math.round(v)}%`;
    const checkPage = (need = 20) => { if (y > H - need) { addFooter(); doc.addPage(); pg++; y = 18; } };

    const addFooter = () => {
      doc.setFontSize(7);
      doc.setTextColor(...gray);
      doc.text('HHH Building Services  |  Powered by Job Scout', M, H - 8);
      doc.text(`Page ${pg}`, COL2, H - 8, { align: 'right' });
    };

    // Helpers
    const sectionTitle = (title) => {
      checkPage(30);
      y += 3;
      doc.setFillColor(...orange);
      doc.rect(M, y - 4, 3, 7, 'F');
      doc.setFontSize(13);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...dark);
      doc.text(title, M + 6, y);
      y += 8;
    };

    const tableHeader = (cols) => {
      checkPage(14);
      doc.setFillColor(...dark);
      doc.rect(M, y - 4, LW, 7, 'F');
      doc.setFontSize(8);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(255, 255, 255);
      cols.forEach(c => doc.text(c.label, c.x, y, c.align ? { align: c.align } : {}));
      y += 5;
      doc.setTextColor(...dark);
      doc.setFont(undefined, 'normal');
    };

    const dataRow = (cols, stripe = false) => {
      checkPage(8);
      if (stripe) { doc.setFillColor(248, 248, 250); doc.rect(M, y - 3.5, LW, 5, 'F'); }
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...dark);
      cols.forEach(c => {
        if (c.bold) doc.setFont(undefined, 'bold');
        if (c.color) doc.setTextColor(...c.color);
        doc.text(String(c.val), c.x, y, c.align ? { align: c.align } : {});
        doc.setFont(undefined, 'normal');
        doc.setTextColor(...dark);
      });
      y += 4.5;
    };

    const summaryRow = (label, value, opts = {}) => {
      checkPage(8);
      if (opts.topBorder) { doc.setDrawColor(...ltGray); doc.line(M, y - 2, COL2, y - 2); y += 1; }
      doc.setFontSize(opts.big ? 11 : 9);
      doc.setFont(undefined, opts.bold ? 'bold' : 'normal');
      doc.setTextColor(...dark);
      doc.text(label, M + (opts.indent || 0), y);
      if (opts.color) doc.setTextColor(...opts.color);
      doc.text(value, COL2, y, { align: 'right' });
      doc.setTextColor(...dark);
      y += opts.big ? 7 : 5;
    };

    // ===================================================================
    // PAGE 1 — COVER / HEADER
    // ===================================================================
    y = 20;
    doc.setFontSize(22);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...dark);
    doc.text('HHH Building Services', M, y);
    y += 8;
    doc.setFontSize(14);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...orange);
    doc.text('Commercial Lighting Retrofit  |  Financial Audit', M, y);
    y += 5;
    doc.setDrawColor(...orange);
    doc.setLineWidth(0.8);
    doc.line(M, y, COL2, y);
    y += 8;

    // Date + Program
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    doc.text(`Date: ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`, M, y);
    const programLabel = program === 'sbs' ? 'SRP Standard Business Solutions' : 'SRP Small Business Commercial (SBC)';
    doc.text(`Program: ${programLabel}`, COL2, y, { align: 'right' });
    y += 8;

    // Customer Info Box
    doc.setFillColor(248, 248, 250);
    doc.setDrawColor(...ltGray);
    const custBoxH = 26 + (saveAddress || saveCity ? 4.5 : 0);
    doc.roundedRect(M, y - 4, LW, custBoxH, 2, 2, 'FD');
    doc.setFontSize(10);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...dark);
    doc.text('Customer', M + 4, y);
    y += 5;
    doc.setFontSize(10);
    doc.setFont(undefined, 'normal');
    doc.text(projectName || 'N/A', M + 4, y);
    y += 5;
    const fullAddr = [saveAddress, saveCity, saveState, saveZip].filter(Boolean).join(', ');
    if (fullAddr) { doc.setFontSize(9); doc.setTextColor(...gray); doc.text(fullAddr, M + 4, y); y += 4.5; }
    doc.setFontSize(9);
    doc.setTextColor(...gray);
    const contactParts = [savePhone, saveEmail].filter(Boolean).join('  |  ');
    if (contactParts) { doc.text(contactParts, M + 4, y); y += 4.5; }
    y += 6;

    // Operating Assumptions
    doc.setFontSize(8);
    doc.setTextColor(...gray);
    doc.text(`Operating Hours: ${operatingHours}hrs/day  x  ${daysPerYear} days/yr  =  ${(operatingHours * daysPerYear).toLocaleString()} hrs/yr   |   Electric Rate: ${$c(energyRate)}/kWh`, M, y);
    y += 8;

    // ===================================================================
    // FIXTURE SCHEDULE
    // ===================================================================
    sectionTitle('Fixture Schedule');

    const c0 = M + 1;
    const c1 = M + 10;
    const c2 = M + 56;
    const c3 = M + 72;
    const c4 = M + 86;
    const c5 = M + 130;
    const c6 = M + 148;
    const c7 = COL2;

    tableHeader([
      { label: 'Qty', x: c0 },
      { label: 'Area / Existing Fixture', x: c1 },
      { label: 'Ht (ft)', x: c2 },
      { label: 'Exist W', x: c3 },
      { label: 'LED Replacement', x: c4 },
      { label: 'New W', x: c5 },
      { label: 'Reduced', x: c6 },
      { label: 'Rebate', x: c7, align: 'right' },
    ]);

    results.forEach((r, i) => {
      dataRow([
        { val: r.qty, x: c0 },
        { val: (r.name || r.fixtureType || r.subtype || 'Fixture').substring(0, 26), x: c1 },
        { val: r.height ? `${r.height}'` : '-', x: c2 },
        { val: `${r.existW}W`, x: c3 },
        { val: (r.productName || '-').substring(0, 24), x: c4 },
        { val: `${r.newW}W`, x: c5 },
        { val: `${r.calc.wattsReduced}W`, x: c6 },
        { val: $(r.calc.totalIncentive), x: c7, align: 'right' },
      ], i % 2 === 0);
    });

    // Fixture totals row
    y += 1;
    doc.setDrawColor(...orange);
    doc.setLineWidth(0.4);
    doc.line(M, y - 2, COL2, y - 2);
    dataRow([
      { val: `${results.reduce((s, r) => s + r.qty, 0)} total`, x: c0, bold: true },
      { val: '', x: c1 },
      { val: '', x: c2 },
      { val: `${totals.existWatts.toLocaleString()}W`, x: c3, bold: true },
      { val: '', x: c4 },
      { val: `${totals.newWatts.toLocaleString()}W`, x: c5, bold: true },
      { val: `${totals.wattsReduced.toLocaleString()}W`, x: c6, bold: true },
      { val: $(totals.totalIncentive), x: c7, align: 'right', bold: true, color: orange },
    ]);
    y += 4;

    // ===================================================================
    // ENERGY ANALYSIS
    // ===================================================================
    sectionTitle('Energy Analysis');

    const annualExistKwh = (totals.existWatts * financials.annualHours) / 1000;
    const annualNewKwh = (totals.newWatts * financials.annualHours) / 1000;

    summaryRow('Current Annual Consumption', `${Math.round(annualExistKwh).toLocaleString()} kWh`);
    summaryRow('Proposed Annual Consumption', `${Math.round(annualNewKwh).toLocaleString()} kWh`);
    summaryRow('Annual kWh Reduction', `${Math.round(financials.annualKwhSaved).toLocaleString()} kWh`, { bold: true, color: green });
    summaryRow('Wattage Reduction', `${totals.wattsReduced.toLocaleString()}W  (${reductionPct}% reduction)`);
    y += 2;
    summaryRow('Annual Energy Cost (Current)', $(annualExistKwh * energyRate));
    summaryRow('Annual Energy Cost (Proposed)', $(annualNewKwh * energyRate));
    summaryRow('Annual Energy Cost Savings', $(financials.annualEnergySavings), { bold: true, color: green, topBorder: true });
    y += 2;

    // ===================================================================
    // INCENTIVE BREAKDOWN
    // ===================================================================
    sectionTitle('SRP Incentive Breakdown');

    summaryRow('Fixture Rebate', $(totals.fixtureRebate));
    summaryRow('Controls Rebate', $(totals.controlsRebate));
    summaryRow('Total Estimated SRP Incentive', $(totals.totalIncentive), { bold: true, big: true, color: orange, topBorder: true });
    y += 2;

    // ===================================================================
    // INVESTMENT ANALYSIS
    // ===================================================================
    sectionTitle('Investment Analysis');

    const projCost = financials.projectCost;
    const netCost = financials.netProjectCost;
    const annSav = financials.annualEnergySavings;
    const payback = financials.simplePayback;
    const roiVal = financials.roi;
    const tenYr = financials.tenYearSavings;
    const fiveYr = (annSav * 5) - netCost;
    const lifetimeSavings = annSav * 15; // 15-year LED life
    const lifetimeNet = lifetimeSavings - netCost;
    const monthlyPayback = payback * 12;

    if (projCost > 0) {
      summaryRow('Total Project Cost', $(projCost));
      summaryRow('Less: SRP Incentive', `(${$(totals.totalIncentive)})`, { color: green });
      summaryRow('Net Investment', $(netCost), { bold: true, topBorder: true });
      y += 3;
      summaryRow('Annual Energy Savings', $(annSav), { color: green });
      summaryRow('Monthly Equivalent Savings', $c(annSav / 12), { color: green, indent: 4 });
      y += 3;

      // Key Metrics Box
      checkPage(40);
      doc.setFillColor(248, 248, 250);
      doc.setDrawColor(...orange);
      doc.setLineWidth(0.4);
      doc.roundedRect(M, y - 4, LW, 36, 2, 2, 'FD');
      const metricY = y;
      const col1x = M + 4;
      const col2x = M + LW / 3 + 4;
      const col3x = M + (LW * 2 / 3) + 4;

      const drawMetric = (x, yy, label, value, clr) => {
        doc.setFontSize(8);
        doc.setTextColor(...gray);
        doc.text(label, x, yy);
        doc.setFontSize(16);
        doc.setFont(undefined, 'bold');
        doc.setTextColor(...(clr || dark));
        doc.text(value, x, yy + 7);
        doc.setFont(undefined, 'normal');
      };

      drawMetric(col1x, metricY, 'Simple Payback', payback < 1 ? `${Math.round(monthlyPayback)} months` : `${payback.toFixed(1)} years`, orange);
      drawMetric(col2x, metricY, 'Annual ROI', `${Math.round(roiVal)}%`, green);
      drawMetric(col3x, metricY, '10-Year Net Savings', $(tenYr), tenYr >= 0 ? green : red);

      const metricY2 = metricY + 18;
      drawMetric(col1x, metricY2, 'Net Investment', $(netCost), dark);
      drawMetric(col2x, metricY2, '5-Year Net Savings', $(fiveYr), fiveYr >= 0 ? green : red);
      drawMetric(col3x, metricY2, '15-Year LED Lifetime', $(lifetimeNet), green);

      y = metricY + 36;
    } else {
      // No project cost — still show savings
      summaryRow('Project Cost', 'Not specified — enter product prices for full analysis', { color: gray });
      summaryRow('Annual Energy Savings', $(annSav), { bold: true, color: green });
      y += 2;
    }

    // ===================================================================
    // 10-YEAR CASH FLOW PROJECTION (new page)
    // ===================================================================
    if (projCost > 0 && annSav > 0) {
      checkPage(90);
      sectionTitle('10-Year Cash Flow Projection');

      const t0 = M + 1;
      const t1 = M + 18;
      const t2 = M + 48;
      const t3 = M + 80;
      const t4 = M + 112;
      const t5 = COL2;

      tableHeader([
        { label: 'Year', x: t0 },
        { label: 'Energy Savings', x: t1 },
        { label: 'Rebate', x: t2 },
        { label: 'Net Cash Flow', x: t3 },
        { label: 'Cumulative', x: t4 },
        { label: 'Net Position', x: t5, align: 'right' },
      ]);

      // Year 0 — initial investment
      dataRow([
        { val: '0', x: t0 },
        { val: '-', x: t1 },
        { val: $(totals.totalIncentive), x: t2, color: green },
        { val: `(${$(projCost - totals.totalIncentive)})`, x: t3, color: red },
        { val: `(${$(netCost)})`, x: t4, color: red },
        { val: `(${$(netCost)})`, x: t5, align: 'right', color: red, bold: true },
      ], false);

      for (let yr = 1; yr <= 10; yr++) {
        const cumSavings = annSav * yr;
        const netPos = cumSavings - netCost;
        const isPositive = netPos >= 0;
        const isBreakeven = yr > 0 && yr === Math.ceil(payback);
        dataRow([
          { val: String(yr), x: t0, bold: isBreakeven },
          { val: $(annSav), x: t1 },
          { val: '-', x: t2 },
          { val: $(annSav), x: t3, color: green },
          { val: $(cumSavings), x: t4 },
          { val: isPositive ? $(netPos) : `(${$(Math.abs(netPos))})`, x: t5, align: 'right', bold: true, color: isPositive ? green : red },
        ], yr % 2 === 0);

        // Mark payback year
        if (isBreakeven) {
          doc.setFontSize(7);
          doc.setTextColor(...orange);
          doc.text('< PAYBACK', t5 - 42, y - 4.5);
          doc.setTextColor(...dark);
        }
      }

      // 10-year total row
      y += 1;
      doc.setDrawColor(...orange);
      doc.setLineWidth(0.4);
      doc.line(M, y - 2, COL2, y - 2);
      const totalCash = annSav * 10;
      dataRow([
        { val: 'TOTAL', x: t0, bold: true },
        { val: $(totalCash), x: t1, bold: true },
        { val: $(totals.totalIncentive), x: t2, bold: true },
        { val: '', x: t3 },
        { val: '', x: t4 },
        { val: $(tenYr), x: t5, align: 'right', bold: true, color: tenYr >= 0 ? green : red },
      ]);
      y += 4;

      // Break-even summary
      checkPage(20);
      doc.setFontSize(9);
      doc.setTextColor(...dark);
      doc.setFont(undefined, 'normal');
      const paybackMo = Math.round(payback * 12);
      const paybackYr = Math.floor(paybackMo / 12);
      const paybackRemMo = paybackMo % 12;
      const paybackStr = paybackYr > 0 ? `${paybackYr} year${paybackYr > 1 ? 's' : ''}${paybackRemMo > 0 ? `, ${paybackRemMo} month${paybackRemMo > 1 ? 's' : ''}` : ''}` : `${paybackMo} months`;
      doc.text(`Break-even point: ${paybackStr}. After payback, the project generates ${$c(annSav)}/year in pure savings.`, M, y);
      y += 4;
      doc.text(`Over 10 years, every $1 invested returns $${((totalCash / netCost) || 0).toFixed(2)} in energy savings.`, M, y);
      y += 6;
    }

    // ===================================================================
    // ASSUMPTIONS & DISCLAIMER
    // ===================================================================
    checkPage(25);
    y += 2;
    doc.setDrawColor(...ltGray);
    doc.line(M, y, COL2, y);
    y += 5;
    doc.setFontSize(7);
    doc.setTextColor(...gray);
    const disclaimers = [
      'ASSUMPTIONS: Energy savings based on stated operating hours and current electric rate. Actual savings may vary with usage patterns and rate changes.',
      'INCENTIVES: Estimated SRP rebate amounts are subject to SRP program review, approval, and available funding. Pre-approval is recommended.',
      'LED LIFETIME: LED products typically rated for 50,000-100,000 hours (10-20+ years at stated operating hours). No lamp replacement costs included.',
      'This document is an estimate for planning purposes only and does not constitute a binding offer or guarantee of savings.',
    ];
    disclaimers.forEach(d => {
      doc.text(d, M, y, { maxWidth: LW });
      y += 6;
    });

    // Final footer
    addFooter();

    // ===================================================================
    // OUTPUT — Share or Download
    // ===================================================================
    const blob = doc.output('blob');
    const fileName = `Lighting_Audit_${(projectName || 'Project').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });

    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: `Lighting Audit - ${projectName}` }).catch(() => {
        downloadBlob(blob, fileName);
      });
    } else {
      downloadBlob(blob, fileName);
    }
    showToast('PDF generated', '\uD83D\uDCC4');
  };

  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  // Audible click + haptic vibration for counter buttons (matching NewLightingAudit)
  const playClick = useCallback(() => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = 1200;
      gain.gain.value = 0.08;
      osc.start();
      osc.stop(ctx.currentTime + 0.04);
    } catch (_) { /* silent fallback */ }
    try { navigator.vibrate?.(15); } catch (_) { /* no vibration support */ }
  }, []);

  // ---- STYLES ----
  const S = {
    card: { background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '14px', padding: '14px', marginBottom: '10px' },
    input: { width: '100%', padding: '10px 12px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box' },
    select: { width: '100%', padding: '10px 12px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text, fontSize: '14px', outline: 'none', boxSizing: 'border-box', WebkitAppearance: 'none', MozAppearance: 'none', appearance: 'none', backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%23a0a0a8' d='M2 4l4 4 4-4'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 10px center', paddingRight: '30px' },
    label: { display: 'block', fontSize: '13px', fontWeight: '500', color: T.textSec, marginBottom: '6px' },
    btn: { padding: '10px 16px', background: T.accent, color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer' },
    btnGhost: { padding: '8px 14px', background: 'transparent', color: T.textSec, border: `1px solid ${T.border}`, borderRadius: '8px', fontSize: '13px', cursor: 'pointer' },
    money: { color: T.green, fontWeight: '700', fontFamily: "'SF Mono', 'Fira Code', monospace" },
  };

  // ==================== RENDER ====================
  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', background: T.bg, minHeight: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: T.text, paddingBottom: '20px' }}>

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
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {totals.totalIncentive > 0 && <div style={{ ...S.money, fontSize: '20px' }}>${totals.totalIncentive.toLocaleString()}</div>}
            <button onClick={() => { setShowProjects(true); loadProjects(); }} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: '8px', padding: '6px 10px', color: T.textSec, cursor: 'pointer', fontSize: '13px' }}>{'\uD83D\uDCC1'}</button>
          </div>
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

      {/* ===== ACTION BUTTONS (moved from bottom bar) ===== */}
      <div style={{ display: 'flex', gap: '8px', padding: '10px 16px' }}>
        <button onClick={() => addLine()} style={{ ...S.btn, flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px', fontSize: '13px' }}>{'\uFF0B'} Add Line</button>
        <button onClick={() => setShowQuickAdd(true)} style={{ ...S.btnGhost, flex: 1, fontSize: '13px' }}>{'\u26A1'} Quick Add</button>
        <button onClick={openCamera} disabled={cameraLoading} style={{ ...S.btnGhost, padding: '10px 14px', opacity: cameraLoading ? 0.5 : 1, fontSize: '13px' }}>{cameraLoading ? '\u23F3' : '\uD83D\uDCF7'}</button>
      </div>

      {/* ===== FINANCIAL SETTINGS (collapsible) ===== */}
      <div style={{ padding: '0 16px', marginBottom: '4px' }}>
        <button onClick={() => setShowFinancials(!showFinancials)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', color: T.textSec, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
          <span>{'\u2699\uFE0F'} Financial Settings</span>
          <span style={{ fontSize: '11px', color: T.textMuted }}>{operatingHours}h/day \u2022 {daysPerYear}d/yr \u2022 ${energyRate}/kWh {showFinancials ? '\u25B4' : '\u25BE'}</span>
        </button>
        {showFinancials && (
          <div style={{ ...S.card, marginTop: '6px', marginBottom: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
              <div><label style={S.label}>Hours/Day</label><input type="number" inputMode="decimal" value={operatingHours} onChange={e => setOperatingHours(parseFloat(e.target.value) || 0)} style={S.input} /></div>
              <div><label style={S.label}>Days/Year</label><input type="number" inputMode="numeric" value={daysPerYear} onChange={e => setDaysPerYear(parseInt(e.target.value) || 0)} style={S.input} /></div>
              <div><label style={S.label}>$/kWh</label><input type="number" inputMode="decimal" step="0.01" value={energyRate} onChange={e => setEnergyRate(parseFloat(e.target.value) || 0)} style={S.input} /></div>
            </div>
          </div>
        )}
      </div>

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
          <div style={{ fontSize: '12px', color: T.textMuted }}>Identifying fixtures, wattages & heights</div>
        </div>
      )}

      {/* ===== LINE ITEMS (show ALL, no filtering) ===== */}
      <div style={{ padding: '8px 16px' }}>
        {results.length === 0 && !cameraLoading && (
          <div style={{ textAlign: 'center', padding: '40px 20px', color: T.textMuted }}>
            <div style={{ fontSize: '36px', marginBottom: '12px', opacity: 0.5 }}>{'\uD83D\uDCA1'}</div>
            <div style={{ fontSize: '14px', marginBottom: '4px' }}>No fixtures yet</div>
            <div style={{ fontSize: '12px' }}>Tap + to add, {'\u26A1'} for presets, or {'\uD83D\uDCF7'} snap a photo</div>
          </div>
        )}

        {results.map(r => {
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
                  <div style={{ fontSize: '11px', color: T.textSec, marginTop: '2px' }}>{subtypeInfo} {'\u2022'} {r.height || 0}ft{r.fixtureCategory ? ` \u2022 ${r.fixtureCategory}` : ''}{r.confirmed ? ' \u2713' : ''}</div>
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
                  {/* Area Name — matches audit area modal */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Area Name *</label>
                    <input type="text" value={r.name} onChange={e => updateLine(r.id, 'name', e.target.value)} placeholder="e.g., Warehouse Bay 1, Office, Parking Lot" style={S.input} />
                  </div>

                  {/* 3-column: Fixture Category, Lighting Type, Ceiling Height — matches audit area modal */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    <div>
                      <label style={S.label}>Fixture Category</label>
                      <select value={r.fixtureCategory || ''} onChange={e => updateLine(r.id, 'fixtureCategory', e.target.value)} style={S.select}>
                        {FIXTURE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Lighting Type</label>
                      <select value={r.lightingType || ''} onChange={e => updateLine(r.id, 'lightingType', e.target.value)} style={S.select}>
                        <option value="">Select Type</option>
                        {LAMP_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                    <div>
                      <label style={S.label}>Ceiling Height (ft)</label>
                      <input type="number" inputMode="numeric" value={r.height || ''} onChange={e => updateLine(r.id, 'height', parseInt(e.target.value) || 0)} placeholder="Optional" style={S.input} />
                    </div>
                  </div>

                  {/* Fixture Count — big +/- counter matching audit area modal */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Fixture Count *</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0', maxWidth: '240px' }}>
                      <button type="button" onClick={() => { playClick(); updateLine(r.id, 'qty', Math.max(1, (r.qty || 1) - 1)); }} style={{ width: '52px', height: '48px', borderRadius: '10px 0 0 10px', border: `2px solid ${T.accent}`, borderRight: 'none', background: T.accentDim, color: T.accent, fontSize: '24px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', padding: 0, WebkitTapHighlightColor: 'transparent' }}>{'\u2212'}</button>
                      <input type="number" min="1" inputMode="numeric" value={r.qty || ''} onChange={e => updateLine(r.id, 'qty', e.target.value === '' ? 1 : (parseInt(e.target.value) || 1))} style={{ flex: 1, minWidth: 0, height: '48px', border: `2px solid ${T.border}`, borderLeft: 'none', borderRight: 'none', background: T.bgInput, color: T.text, fontSize: '22px', fontWeight: '700', textAlign: 'center', MozAppearance: 'textfield', WebkitAppearance: 'none', outline: 'none', boxSizing: 'border-box' }} />
                      <button type="button" onClick={() => { playClick(); updateLine(r.id, 'qty', (r.qty || 0) + 1); }} style={{ width: '52px', height: '48px', borderRadius: '0 10px 10px 0', border: `2px solid ${T.accent}`, borderLeft: 'none', background: T.accent, color: '#fff', fontSize: '24px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', padding: 0, WebkitTapHighlightColor: 'transparent' }}>{'\uFF0B'}</button>
                    </div>
                  </div>

                  {/* 2-column: Existing Watts / New Watts — matches audit area modal */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    <div>
                      <label style={S.label}>Existing Watts</label>
                      <input type="number" min="0" inputMode="numeric" value={r.existW || ''} onChange={e => updateLine(r.id, 'existW', e.target.value === '' ? 0 : (parseInt(e.target.value) || 0))} style={S.input} />
                    </div>
                    <div>
                      <label style={S.label}>New Watts</label>
                      <input type="number" min="0" inputMode="numeric" value={r.newW || ''} onChange={e => updateLine(r.id, 'newW', e.target.value === '' ? 0 : (parseInt(e.target.value) || 0))} style={S.input} />
                    </div>
                  </div>

                  {/* Quick-select wattage buttons — matches audit area modal */}
                  {r.lightingType && COMMON_WATTAGES[r.lightingType]?.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', color: T.textMuted, marginBottom: '6px', display: 'block' }}>
                        Common {r.lightingType} wattages (tap to fill):
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '5px' }}>
                        {COMMON_WATTAGES[r.lightingType].map(w => {
                          const ledW = LED_REPLACEMENT_MAP[r.lightingType]?.[w];
                          const isSelected = r.existW === w;
                          return (
                            <button key={w} type="button" onClick={() => {
                              updateLine(r.id, 'existW', w);
                              if (ledW) updateLine(r.id, 'newW', ledW);
                            }} style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${isSelected ? T.accent : T.border}`, background: isSelected ? T.accentDim : T.bgInput, color: isSelected ? T.accent : T.textSec, fontSize: '12px', fontWeight: isSelected ? '600' : '400', cursor: 'pointer' }}>
                              {w}W{ledW ? ` \u2192 ${ledW}W` : ''}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Replacement Product — always shown, matches audit area modal */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Replacement Product</label>
                    <select
                      value={r.productId || ''}
                      onChange={e => {
                        const prod = sbeProducts.find(p => String(p.id) === e.target.value);
                        if (prod) selectProduct(r.id, prod);
                        else setLines(prev => prev.map(l => l.id === r.id ? { ...l, productId: null, productName: '', productPrice: 0 } : l));
                      }}
                      style={S.select}
                    >
                      <option value="">{sbeProducts.length > 0 ? 'Select Product (Optional)' : 'No products loaded'}</option>
                      {sbeProducts.map(p => <option key={p.id} value={p.id}>{p.name}{p.unit_price ? ` \u2014 $${p.unit_price}` : ''}</option>)}
                    </select>
                    {r.productPrice > 0 && <div style={{ fontSize: '11px', color: T.accent, marginTop: '4px' }}>${r.productPrice}/unit \u00D7 {r.qty} = ${(r.productPrice * r.qty).toLocaleString()}</div>}
                  </div>

                  {/* Notes — textarea matching audit area modal */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Notes</label>
                    <textarea value={r.overrideNotes || ''} onChange={e => updateLine(r.id, 'overrideNotes', e.target.value)} rows={2} placeholder="Optional notes..." style={{ ...S.input, resize: 'vertical' }} />
                  </div>

                  {/* Confirmed — checkbox matching audit area modal */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
                    <input type="checkbox" checked={!!r.confirmed} onChange={e => updateLine(r.id, 'confirmed', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: T.green }} />
                    <span style={{ fontSize: '14px', color: T.text }}>Confirmed</span>
                  </label>

                  {/* SRP Program-specific: rebate type / controls */}
                  {program === 'sbs' && <div style={{ marginBottom: '10px' }}><label style={S.label}>SRP Fixture Type</label><select value={r.fixtureType} onChange={e => updateLine(r.id, 'fixtureType', e.target.value)} style={S.select}>{Object.entries(SBS_RATES.fixture).map(([k, v]) => <option key={k} value={k}>{v.label} — ${v.rate}/W</option>)}</select></div>}
                  {program === 'sbc' && <div style={{ marginBottom: '10px' }}><label style={S.label}>SRP Category / Subtype</label><select value={`${r.category}|${r.subtype}`} onChange={e => { const [cat, sub] = e.target.value.split('|'); updateLine(r.id, 'category', cat); updateLine(r.id, 'subtype', sub); }} style={S.select}>{Object.entries(SBC_RATES.categories).map(([catKey, cat]) => cat.subtypes.map(s => <option key={s.id} value={`${catKey}|${s.id}`}>{cat.icon} {s.label} — {s.ratePerWatt ? `$${s.ratePerWatt}/W` : `$${s.perFixture}/fixture`}</option>))}</select></div>}

                  {program === 'sbs' && <div style={{ marginBottom: '10px' }}><label style={S.label}>Controls Upgrade</label><select value={r.controlsType} onChange={e => updateLine(r.id, 'controlsType', e.target.value)} style={S.select}>{Object.entries(SBS_RATES.controls).map(([k, v]) => <option key={k} value={k}>{v.label}{v.rate > 0 ? ` — $${v.rate}/W` : ''}</option>)}</select></div>}

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
          {/* Watts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center', marginBottom: '8px' }}>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>EXISTING</div><div style={{ fontSize: '14px', fontWeight: '600' }}>{totals.existWatts.toLocaleString()}W</div></div>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>NEW LED</div><div style={{ fontSize: '14px', fontWeight: '600' }}>{totals.newWatts.toLocaleString()}W</div></div>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>REDUCED</div><div style={{ fontSize: '14px', fontWeight: '600', color: T.green }}>{reductionPct}%</div></div>
          </div>
          {/* Energy savings row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'center', marginBottom: '8px', paddingTop: '8px', borderTop: `1px solid ${T.border}` }}>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>ANNUAL kWh SAVED</div><div style={{ fontSize: '14px', fontWeight: '600' }}>{Math.round(financials.annualKwhSaved).toLocaleString()}</div></div>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>ANNUAL $ SAVED</div><div style={{ fontSize: '14px', fontWeight: '600', color: T.green }}>${Math.round(financials.annualEnergySavings).toLocaleString()}</div></div>
          </div>
          {/* Cost row */}
          {financials.projectCost > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center', marginBottom: '8px', paddingTop: '8px', borderTop: `1px solid ${T.border}` }}>
              <div><div style={{ fontSize: '11px', color: T.textMuted }}>PROJECT COST</div><div style={{ fontSize: '13px', fontWeight: '600' }}>${financials.projectCost.toLocaleString()}</div></div>
              <div><div style={{ fontSize: '11px', color: T.textMuted }}>INCENTIVE</div><div style={{ fontSize: '13px', fontWeight: '600', color: T.green }}>${totals.totalIncentive.toLocaleString()}</div></div>
              <div><div style={{ fontSize: '11px', color: T.textMuted }}>NET COST</div><div style={{ fontSize: '13px', fontWeight: '600' }}>${Math.round(financials.netProjectCost).toLocaleString()}</div></div>
            </div>
          )}
          {/* Payback row */}
          {financials.projectCost > 0 && financials.annualEnergySavings > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'center', marginBottom: '8px', paddingTop: '8px', borderTop: `1px solid ${T.border}` }}>
              <div><div style={{ fontSize: '11px', color: T.textMuted }}>SIMPLE PAYBACK</div><div style={{ fontSize: '14px', fontWeight: '600' }}>{financials.simplePayback.toFixed(1)} yrs</div></div>
              <div><div style={{ fontSize: '11px', color: T.textMuted }}>10-YEAR ROI</div><div style={{ fontSize: '14px', fontWeight: '600', color: T.green }}>{Math.round(financials.roi)}%</div></div>
            </div>
          )}
          {/* Incentive total + actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: `1px solid ${T.border}` }}>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>TOTAL ESTIMATED INCENTIVE</div><div style={{ ...S.money, fontSize: '22px' }}>${totals.totalIncentive.toLocaleString()}</div></div>
            <button onClick={() => setShowSummary(true)} style={{ ...S.btn, fontSize: '12px', padding: '8px 14px' }}>{'\uD83D\uDCCB'} Summary</button>
          </div>
        </div>
      )}

      {/* ===== QUICK ADD MODAL (with category tabs inside) ===== */}
      {showQuickAdd && (<>
        <div onClick={() => setShowQuickAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', background: T.bgCard, borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '75vh', overflow: 'auto', zIndex: 51, padding: '20px 16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700' }}>{'\u26A1'} Quick Add Preset</div>
            <button onClick={() => setShowQuickAdd(false)} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: '20px', cursor: 'pointer' }}>{'\u2715'}</button>
          </div>
          {/* Category tabs inside the modal */}
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto' }}>
            {Object.entries(PRESETS).map(([key, group]) => (
              <button key={key} onClick={() => setQuickAddTab(key)} style={{
                flexShrink: 0, padding: '8px 12px',
                background: quickAddTab === key ? T.accentDim : T.bgInput,
                color: quickAddTab === key ? T.accent : T.textSec,
                border: `1px solid ${quickAddTab === key ? T.accent : T.border}`,
                borderRadius: '10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap',
              }}>{group.label}</button>
            ))}
          </div>
          {/* Show items for selected tab */}
          {PRESETS[quickAddTab] && (
            <div>
              {PRESETS[quickAddTab].items.map((item, i) => (
                <button key={i} onClick={() => { addLine(item); showToast(`Added ${item.name}`, '\u2713'); setShowQuickAdd(false); }} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text, cursor: 'pointer', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><div style={{ fontSize: '13px', fontWeight: '500' }}>{item.name}</div><div style={{ fontSize: '11px', color: T.textMuted }}>{item.existW}W {'\u2192'} {item.newW}W \u2022 {item.height}ft</div></div>
                  <div style={{ fontSize: '12px', color: T.accent }}>{'\uFF0B'}</div>
                </button>
              ))}
            </div>
          )}
        </div>
      </>)}

      {/* ===== SUMMARY MODAL ===== */}
      {showSummary && (<>
        <div onClick={() => setShowSummary(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '90%', maxWidth: '440px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '16px', maxHeight: '85vh', overflow: 'auto', zIndex: 51, padding: '24px' }}>
          <div style={{ fontSize: '18px', fontWeight: '700', marginBottom: '4px' }}>{program === 'sbs' ? '\uD83C\uDFE2' : '\u26A1'} Project Summary</div>
          <div style={{ fontSize: '12px', color: T.textMuted, marginBottom: '16px' }}>{program === 'sbs' ? 'SRP Standard Business Solutions' : 'SRP Small Business Commercial'}{projectName ? ` \u2014 ${projectName}` : ''}</div>
          {results.map(r => (
            <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: `1px solid ${T.border}`, fontSize: '13px' }}>
              <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.qty}\u00D7 {r.name || (program === 'sbs' ? r.fixtureType : r.subtype)} \u2022 {r.height}ft</div>
              <div style={S.money}>${r.calc.totalIncentive.toLocaleString()}</div>
            </div>
          ))}
          <div style={{ marginTop: '16px', padding: '12px', background: T.bgInput, borderRadius: '10px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: T.textSec }}><span>Fixture Rebate</span><span>${totals.fixtureRebate.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: T.textSec }}><span>Controls Rebate</span><span>${totals.controlsRebate.toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: T.textSec }}><span>Watts Reduced</span><span>{totals.wattsReduced.toLocaleString()}W ({reductionPct}%)</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: T.textSec }}><span>Annual kWh Saved</span><span>{Math.round(financials.annualKwhSaved).toLocaleString()}</span></div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px', color: T.textSec }}><span>Annual $ Saved</span><span style={{ color: T.green }}>${Math.round(financials.annualEnergySavings).toLocaleString()}</span></div>
            {financials.projectCost > 0 && (<>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: T.textSec, paddingTop: '6px', borderTop: `1px solid ${T.border}` }}><span>Project Cost</span><span>${financials.projectCost.toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: T.textSec }}><span>Net Cost</span><span>${Math.round(financials.netProjectCost).toLocaleString()}</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '6px', color: T.textSec }}><span>Simple Payback</span><span>{financials.simplePayback.toFixed(1)} yrs</span></div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '8px', color: T.textSec }}><span>10-Year Net Savings</span><span style={{ color: T.green }}>${Math.round(financials.tenYearSavings).toLocaleString()}</span></div>
            </>)}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '18px', fontWeight: '700', paddingTop: '8px', borderTop: `1px solid ${T.border}` }}><span>Total Incentive</span><span style={S.money}>${totals.totalIncentive.toLocaleString()}</span></div>
          </div>
          <div style={{ fontSize: '11px', color: T.textMuted, marginTop: '12px', textAlign: 'center' }}>{'\u26A0\uFE0F'} Estimate only \u2014 subject to SRP review and approval</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={generatePDF} style={{ ...S.btn, flex: 1, fontSize: '13px' }}>{'\uD83D\uDCC4'} Share PDF</button>
              <button onClick={copySummary} style={{ ...S.btnGhost, flex: 1, fontSize: '13px' }}>{'\uD83D\uDCCB'} Copy</button>
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button onClick={() => { setShowSummary(false); setShowSaveModal(true); }} disabled={!!savedLeadId} style={{ ...S.btn, flex: 1, fontSize: '13px', background: savedLeadId ? T.bgInput : T.blue, color: savedLeadId ? T.textMuted : '#fff' }}>{savedLeadId ? '\u2713 Saved' : '\uD83D\uDCBE Save Project'}</button>
              <button onClick={() => setShowSummary(false)} style={{ ...S.btnGhost, flex: 1, fontSize: '13px' }}>Close</button>
            </div>
          </div>
        </div>
      </>)}

      {/* ===== SAVE MODAL ===== */}
      {showSaveModal && (<>
        <div onClick={() => setShowSaveModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
        <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '90%', maxWidth: '400px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '16px', zIndex: 51, padding: '24px' }}>
          <div style={{ fontSize: '16px', fontWeight: '700', marginBottom: '4px' }}>{'\uD83D\uDCBE'} Save Project</div>
          <div style={{ fontSize: '12px', color: T.textMuted, marginBottom: '16px' }}>Creates a customer, lead + lighting audit in Job Scout</div>
          {/* Customer & Contact — matching audit step 1 basic info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <div><label style={S.label}>Customer Name *</label><input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Phone</label><input type="tel" inputMode="tel" value={savePhone} onChange={e => setSavePhone(e.target.value)} placeholder="Optional" style={S.input} /></div>
          </div>
          <div style={{ marginBottom: '10px' }}><label style={S.label}>Email</label><input type="email" inputMode="email" value={saveEmail} onChange={e => setSaveEmail(e.target.value)} placeholder="Optional" style={S.input} /></div>
          {/* Address — matching audit step 1 */}
          <div style={{ marginBottom: '10px' }}><label style={S.label}>Address</label><input type="text" value={saveAddress} onChange={e => setSaveAddress(e.target.value)} placeholder="Street address" style={S.input} /></div>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '8px', marginBottom: '16px' }}>
            <div><label style={S.label}>City</label><input type="text" value={saveCity} onChange={e => setSaveCity(e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>State</label><input type="text" value={saveState} onChange={e => setSaveState(e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>ZIP</label><input type="text" inputMode="numeric" value={saveZip} onChange={e => setSaveZip(e.target.value)} style={S.input} /></div>
          </div>
          {capturedPhotos.length > 0 && <div style={{ fontSize: '12px', color: T.textSec, marginBottom: '12px' }}>{'\uD83D\uDCF7'} {capturedPhotos.length} photo{capturedPhotos.length > 1 ? 's' : ''} will be saved to the audit</div>}
          <div style={{ display: 'flex', gap: '8px' }}>
            <button onClick={saveProject} disabled={saving} style={{ ...S.btn, flex: 1, opacity: saving ? 0.6 : 1 }}>{saving ? 'Saving...' : 'Save'}</button>
            <button onClick={() => setShowSaveModal(false)} style={{ ...S.btnGhost, flex: 1 }}>Cancel</button>
          </div>
        </div>
      </>)}

      {/* ===== PROJECTS LIST MODAL ===== */}
      {showProjects && (<>
        <div onClick={() => setShowProjects(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', background: T.bgCard, borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '70vh', overflow: 'auto', zIndex: 51, padding: '20px 16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700' }}>{'\uD83D\uDCC1'} Saved Projects</div>
            <button onClick={() => setShowProjects(false)} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: '20px', cursor: 'pointer' }}>{'\u2715'}</button>
          </div>
          {loadingProjects && <div style={{ textAlign: 'center', padding: '20px', color: T.textMuted }}>Loading...</div>}
          {!loadingProjects && projects.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: T.textMuted }}>No saved projects yet</div>}
          {projects.map(p => (
            <button key={p.id} onClick={() => loadProject(p)} style={{ width: '100%', textAlign: 'left', padding: '12px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '10px', color: T.text, cursor: 'pointer', marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{p.customerName}</div>
                  <div style={{ fontSize: '11px', color: T.textMuted }}>{new Date(p.createdAt).toLocaleDateString()} \u2022 {p.status}{p.audit ? ` \u2022 Audit ${p.audit.status}` : ''}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ ...S.money, fontSize: '15px' }}>${parseFloat(p.estimatedValue || 0).toLocaleString()}</div>
                  {p.audit && <div style={{ fontSize: '10px', color: T.textSec }}>{p.audit.watts_reduction}W saved</div>}
                </div>
              </div>
            </button>
          ))}
        </div>
      </>)}

      <div style={{ textAlign: 'center', padding: '20px 16px 0', fontSize: '11px', color: T.textMuted }}>Powered by <span style={{ color: T.accent }}>Job Scout</span> {'\u2022'} HHH Building Services</div>
    </div>
  );
}
