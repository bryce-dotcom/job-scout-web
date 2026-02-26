import { useState, useCallback, useRef, useEffect, useMemo } from "react";
import { jsPDF } from "jspdf";
import SignaturePad from "signature_pad";
import * as XLSX from "xlsx";
import { PDFDocument, rgb, StandardFonts } from "pdf-lib";

// ============================================================
// LENARD UT RMP â€” Rocky Mountain Power Lighting Rebate Calculator
// Three programs: SMBE (Small/Med Business), Express, Large
// Camera: Lenard AI fixture identification
// Offline: PWA with service worker
// ============================================================

// ==================== RATE TABLES ====================

const SMBE = {
  interior: { none: 1.50, plug_play: 2.00, networked: 2.50, lllc: 3.50 },
  exterior: { none: 2.40, maxWattsPerFixture: 285 },
  cap: 0.75,
  desc: 'Small/Medium Business Express \u2022 $/new watt',
};

const EXPRESS = {
  interior: { none: 0.75, plug_play: 1.00, networked: 1.25, lllc: 1.75 },
  exterior: { none: 1.20, maxWattsPerFixture: 285 },
  cap: 0.70,
  desc: 'Standard Express \u2022 $/new watt',
};

const LARGE = {
  interior_fixtures: { none: 0.60, plug_play: 0.80, networked: 1.00, lllc: 1.20 },
  interior_controls: { basic: 0.45, networked: 0.60, lllc: 0.75, recommission: 0.15 },
  exterior_fixtures: { none: 0.35, basic_dim: 0.50, adv_dim: 0.70 },
  exterior_controls: { basic_dim: 0.35, adv_dim: 0.60 },
  cap: 0.70,
  desc: 'Large Non-Prescriptive \u2022 $/watt reduced',
};

// Controls options by program + location
function getControlsOptions(program, location) {
  if (program === 'large') {
    return location === 'exterior'
      ? [{ id: 'none', label: 'None' }, { id: 'basic_dim', label: 'Basic Dimming' }, { id: 'adv_dim', label: 'Adv Networked' }]
      : [{ id: 'none', label: 'None / Basic' }, { id: 'plug_play', label: 'Plug & Play' }, { id: 'networked', label: 'Networked' }, { id: 'lllc', label: 'LLLC' }];
  }
  if (location === 'exterior') return [{ id: 'none', label: 'None (\u2264285W)' }];
  return [{ id: 'none', label: 'No Controls' }, { id: 'plug_play', label: 'Plug & Play Ready' }, { id: 'networked', label: 'Networked' }, { id: 'lllc', label: 'LLLC' }];
}

function getControlsOnlyOptions(location) {
  return location === 'exterior'
    ? [{ id: 'basic_dim', label: 'Basic Dimming' }, { id: 'adv_dim', label: 'Adv Dimming' }]
    : [{ id: 'basic', label: 'Basic' }, { id: 'networked', label: 'Networked' }, { id: 'lllc', label: 'LLLC' }, { id: 'recommission', label: 'Recommission' }];
}

function getRate(program, line) {
  if (program === 'large') {
    if (line.location === 'exterior') return LARGE.exterior_fixtures[line.controlsType] || LARGE.exterior_fixtures.none;
    return LARGE.interior_fixtures[line.controlsType] || LARGE.interior_fixtures.none;
  }
  const rates = program === 'smbe' ? SMBE : EXPRESS;
  if (line.location === 'exterior') return rates.exterior.none;
  return rates.interior[line.controlsType] || rates.interior.none;
}

// ==================== FIXTURE PRESETS ====================

const PRESETS = {
  highbays: {
    label: 'High Bays',
    items: [
      { name: '400W MH High Bay', existW: 458, newW: 80, location: 'interior', height: 20 },
      { name: '250W MH High Bay', existW: 288, newW: 60, location: 'interior', height: 20 },
      { name: '1000W MH High Bay', existW: 1080, newW: 240, location: 'interior', height: 25 },
    ],
  },
  troffers: {
    label: 'Troffers / Linear',
    items: [
      { name: 'T12 4ft 2-Lamp (88W)', existW: 88, newW: 15, location: 'interior', height: 9 },
      { name: 'T8 4ft 4-Lamp Troffer', existW: 112, newW: 32, location: 'interior', height: 9 },
      { name: 'T8 4ft 2-Lamp Strip', existW: 56, newW: 22, location: 'interior', height: 10 },
      { name: 'T12 4ft 4-Lamp Troffer', existW: 172, newW: 32, location: 'interior', height: 9 },
    ],
  },
  exterior: {
    label: 'Exterior',
    items: [
      { name: '250W MH Shoebox', existW: 295, newW: 70, location: 'exterior', height: 25 },
      { name: '150W HPS Wallpack', existW: 188, newW: 45, location: 'exterior', height: 12 },
      { name: '400W MH Pole Light', existW: 458, newW: 150, location: 'exterior', height: 25 },
      { name: '1000W MH Sports', existW: 1080, newW: 320, location: 'exterior', height: 30 },
    ],
  },
};

const DEFAULT_HEIGHTS = { interior: 9, exterior: 25 };

// Effective unit price: override > product price, minus discount %
function getEffectivePrice(line) {
  const base = line.priceOverride != null ? line.priceOverride : (line.productPrice || 0);
  const disc = line.discount || 0;
  return disc > 0 ? base * (1 - disc / 100) : base;
}

// Infer lamp type from fixture name
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

// ==================== MAINTENANCE SAVINGS CONSTANTS ====================
const LAMP_LIFE = { T12: 20000, T8: 24000, T5: 25000, T5HO: 25000, 'Metal Halide': 10000, HPS: 24000, 'Mercury Vapor': 16000, Halogen: 3000, Incandescent: 1000, CFL: 10000, LED: 50000, Other: 20000 };
const LAMP_COST_EXISTING = 4;
const LAMP_COST_LED = 0;
const relampLabor = (height) => height > 15 ? 75 : height > 10 ? 45 : 25;

const FIXTURE_CATEGORIES = ['Linear', 'High Bay', 'Low Bay', 'Surface Mount', 'Outdoor', 'Recessed', 'Track', 'Wall Pack', 'Flood', 'Area Light', 'Canopy', 'Other'];
const LAMP_TYPES = ['T12', 'T8', 'T5', 'T5HO', 'Metal Halide', 'HPS', 'Mercury Vapor', 'Halogen', 'Incandescent', 'CFL', 'LED', 'Other'];

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

// Product matching
const PRODUCT_CATEGORY_KEYWORDS = {
  'Recessed': ['troffer', 'panel', 'recessed', '2x4', '2x2', '1x4', 'flat panel', 'lay-in'],
  'Linear': ['strip', 'linear', 'wrap', 'shop light', 'vapor', 'channel'],
  'High Bay': ['high bay', 'highbay', 'high-bay', 'ufo', 'warehouse'],
  'Outdoor': ['flood', 'wall pack', 'exterior', 'outdoor', 'area light', 'pole', 'parking', 'canopy', 'shoe box', 'shoebox'],
  'Surface Mount': ['surface', 'flush', 'ceiling mount', 'drum', 'round'],
};

function scoreProductMatch(product, fixtureCategory, targetWatts) {
  const searchText = `${(product.name || '')} ${(product.type || '')} ${(product.description || '')}`.toLowerCase();
  let score = 0;
  const keywords = PRODUCT_CATEGORY_KEYWORDS[fixtureCategory] || [];
  for (const kw of keywords) { if (searchText.includes(kw)) { score += 100; break; } }
  if (targetWatts > 0) {
    const wm = (product.name || '').match(/(\d+)\s*[wW]/);
    if (wm) score += Math.max(0, 50 - Math.abs(parseInt(wm[1]) - targetWatts));
  }
  return score;
}

function getMatchedProducts(allProducts, fixtureCategory, targetWatts) {
  if (!allProducts.length) return [];
  return [...allProducts].map(p => ({ ...p, _score: scoreProductMatch(p, fixtureCategory, targetWatts) })).sort((a, b) => b._score - a._score);
}

function findBestProduct(allProducts, fixtureCategory, targetWatts) {
  const ranked = getMatchedProducts(allProducts, fixtureCategory, targetWatts);
  return ranked.length > 0 && ranked[0]._score >= 100 ? ranked[0] : null;
}

// ==================== INCENTIVE CALCULATION ENGINES ====================

function calcSMBE(line) {
  const q = line.qty || 0, nW = line.newW || 0, eW = line.existW || 0;
  const newTotal = nW * q, existTotal = eW * q, wattsReduced = Math.max(0, existTotal - newTotal);
  if (line.location === 'exterior') {
    const cappedW = Math.min(nW, SMBE.exterior.maxWattsPerFixture);
    const incentive = +(q * cappedW * SMBE.exterior.none).toFixed(2);
    return { newTotal, existTotal, wattsReduced, fixtureIncentive: incentive, controlsIncentive: 0, totalIncentive: incentive };
  }
  const rate = SMBE.interior[line.controlsType] || SMBE.interior.none;
  const incentive = +(q * nW * rate).toFixed(2);
  return { newTotal, existTotal, wattsReduced, fixtureIncentive: incentive, controlsIncentive: 0, totalIncentive: incentive };
}

function calcExpress(line) {
  const q = line.qty || 0, nW = line.newW || 0, eW = line.existW || 0;
  const newTotal = nW * q, existTotal = eW * q, wattsReduced = Math.max(0, existTotal - newTotal);
  if (line.location === 'exterior') {
    const cappedW = Math.min(nW, EXPRESS.exterior.maxWattsPerFixture);
    const incentive = +(q * cappedW * EXPRESS.exterior.none).toFixed(2);
    return { newTotal, existTotal, wattsReduced, fixtureIncentive: incentive, controlsIncentive: 0, totalIncentive: incentive };
  }
  const rate = EXPRESS.interior[line.controlsType] || EXPRESS.interior.none;
  const incentive = +(q * nW * rate).toFixed(2);
  return { newTotal, existTotal, wattsReduced, fixtureIncentive: incentive, controlsIncentive: 0, totalIncentive: incentive };
}

function calcLarge(line) {
  const q = line.qty || 0, eW = line.existW || 0, nW = line.newW || 0;
  const existTotal = eW * q, newTotal = nW * q, wattsReduced = Math.max(0, existTotal - newTotal);
  let fixtureIncentive = 0, controlsIncentive = 0;
  if (line.location === 'exterior') {
    fixtureIncentive = +(wattsReduced * (LARGE.exterior_fixtures[line.controlsType] || LARGE.exterior_fixtures.none)).toFixed(2);
    if (line.controlsOnly && line.controlsOnlyType) controlsIncentive = +(wattsReduced * (LARGE.exterior_controls[line.controlsOnlyType] || 0)).toFixed(2);
  } else {
    fixtureIncentive = +(wattsReduced * (LARGE.interior_fixtures[line.controlsType] || LARGE.interior_fixtures.none)).toFixed(2);
    if (line.controlsOnly && line.controlsOnlyType) controlsIncentive = +(wattsReduced * (LARGE.interior_controls[line.controlsOnlyType] || 0)).toFixed(2);
  }
  return { newTotal, existTotal, wattsReduced, fixtureIncentive, controlsIncentive, totalIncentive: +(fixtureIncentive + controlsIncentive).toFixed(2) };
}

// ==================== THEME ====================

const T = {
  bg: '#0a0a0b', bgCard: '#141416', bgInput: '#1a1a1e', border: '#2a2a30',
  text: '#f0f0f2', textSec: '#a0a0a8', textMuted: '#606068',
  accent: '#f97316', accentDim: 'rgba(249,115,22,0.12)',
  green: '#22c55e', red: '#ef4444', blue: '#3b82f6', blueDim: 'rgba(59,130,246,0.12)',
};
// ==================== MAIN COMPONENT ====================

export default function LenardUTRMP() {
  const [program, setProgram] = useState('smbe');
  const [projectName, setProjectName] = useState('');
  const [projectCost, setProjectCost] = useState(0);
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
  const keepLinesOnSwitch = useRef(false);

  const [employees, setEmployees] = useState([]);
  const [leadOwnerId, setLeadOwnerId] = useState(() => { try { return localStorage.getItem('lenard_lead_owner_id') || null; } catch { return null; } });
  const [leadOwnerName, setLeadOwnerName] = useState(() => { try { return localStorage.getItem('lenard_lead_owner_name') || ''; } catch { return ''; } });

  const [sbeProducts, setSbeProducts] = useState([]);
  const [productSearch, setProductSearch] = useState('');

  const [showFinancials, setShowFinancials] = useState(false);
  const [operatingHours, setOperatingHours] = useState(10);
  const [daysPerYear, setDaysPerYear] = useState(260);
  const [energyRate, setEnergyRate] = useState(0.08);

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [savePhone, setSavePhone] = useState('');
  const [saveEmail, setSaveEmail] = useState('');
  const [saveAddress, setSaveAddress] = useState('');
  const [saveCity, setSaveCity] = useState('');
  const [saveState, setSaveState] = useState('UT');
  const [saveZip, setSaveZip] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedLeadId, setSavedLeadId] = useState(null);
  const [savedAuditId, setSavedAuditId] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  const [showProjects, setShowProjects] = useState(false);
  const [projects, setProjects] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [capturedPhotos, setCapturedPhotos] = useState([]);

  // Contract flow state
  const [expandedSection, setExpandedSection] = useState(null);
  const [waiveDeposit, setWaiveDeposit] = useState(false);
  const [signatureData, setSignatureData] = useState(null);
  const [contractAccepted, setContractAccepted] = useState(false);
  const sigCanvasRef = useRef(null);
  const sigPadRef = useRef(null);
  const [contractTerms, setContractTerms] = useState('');
  const [appFields, setAppFields] = useState({
    businessName: '', contactName: '', contactEmail: '', contactPhone: '',
    businessType: 'Commercial', rateSchedule: 'Small General Service',
    smbeEligible: 'No', materialCost: 0, laborCost: 0, otherCost: 0,
    vendorName: 'HHH Building Services', vendorAddress: '1234 Main St, Salt Lake City, UT 84101', vendorContact: '', vendorPhone: '',
    payeeName: '', payeeAddress: '', payeeCity: '', payeeState: '', payeeZip: '',
    participantIs: 'Building Owner', buildingType: 'Commercial',
  });
  const [w9Fields, setW9Fields] = useState({
    name: '', businessName: '', taxClass: '', llcClass: '',
    exemptPayee: '', exemptFatca: '', address: '', cityStateZip: '',
    accountNumbers: '', ssn: '', ein: '',
  });
  const [attachingFiles, setAttachingFiles] = useState(false);

  const showToast = useCallback((message, icon = '\u2713') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, icon });
    toastTimer.current = setTimeout(() => setToast(null), 2500);
  }, []);

  useEffect(() => { if (keepLinesOnSwitch.current) { keepLinesOnSwitch.current = false; return; } setLines([]); setExpandedLine(null); setNewlyAdded(new Set()); setSavedLeadId(null); setSavedAuditId(null); setIsDirty(false); setCapturedPhotos([]); setSaveCity(''); setSaveState('UT'); setSaveZip(''); }, [program]);

  useEffect(() => { if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw-lenard.js').catch(() => {}); } }, []);

  useEffect(() => {
    (async () => {
      try {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-products`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` }, body: '{}' });
        const data = await resp.json();
        if (data.products) setSbeProducts(data.products);
      } catch (_) {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
        const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
        const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-employees`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` }, body: '{}' });
        const data = await resp.json();
        if (data.employees) setEmployees(data.employees);
      } catch (_) {}
    })();
  }, []);

  const selectLeadOwner = useCallback((empId, empName) => {
    setLeadOwnerId(empId); setLeadOwnerName(empName);
    try { localStorage.setItem('lenard_lead_owner_id', empId); localStorage.setItem('lenard_lead_owner_name', empName); } catch (_) {}
  }, []);

  const ownerLoadedRef = useRef(false);
  useEffect(() => {
    if (leadOwnerId && !ownerLoadedRef.current) {
      ownerLoadedRef.current = true;
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      (async () => { try { const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` }, body: JSON.stringify({ leadOwnerId, leadSource: 'Lenard UT RMP' }) }); const data = await resp.json(); if (data.projects) setProjects(data.projects); } catch (_) {} })();
    }
  }, [leadOwnerId]);

  // ---- LINE MANAGEMENT ----
  const addLine = useCallback((preset = null) => {
    const id = ++lineIdRef.current;
    const loc = preset?.location || 'interior';
    const fixCat = loc === 'exterior' ? 'Outdoor' : (preset?.fixtureCategory || 'Linear');
    const targetNewW = preset?.newW || 0;
    let autoProductId = null, autoProductName = '', autoProductPrice = 0, autoNewW = targetNewW;
    if (sbeProducts.length > 0) {
      const best = findBestProduct(sbeProducts, fixCat, targetNewW);
      if (best) { autoProductId = best.id; autoProductName = best.name; autoProductPrice = best.unit_price || 0; if (!autoNewW) { const wm = (best.description || best.name || '').match(/(\d+)\s*[wW]/); if (wm) autoNewW = parseInt(wm[1]); } }
    }
    const base = {
      id, qty: preset?.qty || 1, existW: preset?.existW || 0, newW: autoNewW,
      name: preset?.name || '', height: preset?.height || DEFAULT_HEIGHTS[loc] || 9,
      location: loc, controlsType: preset?.controlsType || 'none',
      controlsOnly: false, controlsOnlyType: 'basic',
      productId: autoProductId, productName: autoProductName, productPrice: autoProductPrice,
      priceOverride: null, discount: 0,
      fixtureCategory: fixCat, lightingType: inferLampType(preset?.name || ''),
      confirmed: false, overrideNotes: '',
    };
    setLines(prev => [...prev, base]);
    setNewlyAdded(prev => new Set(prev).add(id));
    setTimeout(() => setNewlyAdded(prev => { const next = new Set(prev); next.delete(id); return next; }), 2000);
    setIsDirty(true);
  }, [sbeProducts]);

  const markDirty = useCallback(() => setIsDirty(true), []);

  const updateLine = useCallback((id, field, value) => {
    setLines(prev => prev.map(l => l.id !== id ? l : { ...l, [field]: value }));
    markDirty();
  }, [markDirty]);

  const removeLine = useCallback((id) => {
    setLines(prev => prev.filter(l => l.id !== id));
    if (expandedLine === id) setExpandedLine(null);
    showToast('Line removed', '\uD83D\uDDD1');
    markDirty();
  }, [expandedLine, showToast, markDirty]);

  const selectProduct = useCallback((lineId, product) => {
    setLines(prev => prev.map(l => {
      if (l.id !== lineId) return l;
      const updates = { productId: product.id, productName: product.name, productPrice: product.unit_price || 0 };
      const wm = (product.description || product.name || '').match(/(\d+)\s*[wW]/);
      if (wm) updates.newW = parseInt(wm[1]);
      return { ...l, ...updates };
    }));
    markDirty();
  }, [markDirty]);

  // ---- LENARD AI CAMERA ----
  const analyzePhoto = async (file) => {
    if (!navigator.onLine) { alert('\uD83D\uDCF7 Lenard needs internet to identify fixtures'); return; }
    setCameraLoading(true);
    try {
      const base64 = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result.split(',')[1]); r.onerror = () => rej(new Error('Read failed')); r.readAsDataURL(file); });
      setCapturedPhotos(prev => [...prev, base64]);
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-analyze`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` }, body: JSON.stringify({ imageBase64: base64, mediaType: 'image/jpeg' }) });
      const data = await resp.json();
      if (data.fixtures && Array.isArray(data.fixtures)) {
        if (data.fixtures.length === 0) { showToast("Couldn't identify fixtures \u2014 try a clearer photo", '\uD83D\uDCF7'); }
        else {
          data.fixtures.forEach(f => addLine({ name: f.name, existW: f.existW, newW: f.newW, qty: f.count || 1, location: f.category === 'exterior' ? 'exterior' : 'interior', height: f.height || 9, fixtureCategory: f.category === 'exterior' ? 'Outdoor' : 'Linear', lightingType: inferLampType(f.name) }));
          showToast(`Lenard found ${data.fixtures.length} fixture${data.fixtures.length > 1 ? 's' : ''}`, '\uD83D\uDCF7');
        }
      } else { showToast("Couldn't identify fixtures \u2014 try a clearer photo", '\uD83D\uDCF7'); }
    } catch (err) { console.error('Lenard error:', err); showToast("Couldn't analyze that photo", '\uD83D\uDCF7'); }
    setCameraLoading(false);
  };

  const openCamera = () => {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*'; input.capture = 'environment';
    input.onchange = (e) => { const f = e.target.files?.[0]; if (f) analyzePhoto(f); };
    input.click();
  };

  // ---- INCENTIVE CALCULATIONS + CAP ----
  const calcFn = program === 'smbe' ? calcSMBE : program === 'express' ? calcExpress : calcLarge;
  const results = lines.map(l => ({ ...l, calc: calcFn(l) }));
  const totals = results.reduce((a, r) => ({
    existWatts: a.existWatts + r.calc.existTotal, newWatts: a.newWatts + r.calc.newTotal,
    wattsReduced: a.wattsReduced + r.calc.wattsReduced, fixtureIncentive: a.fixtureIncentive + r.calc.fixtureIncentive,
    controlsIncentive: a.controlsIncentive + r.calc.controlsIncentive, totalIncentive: a.totalIncentive + r.calc.totalIncentive,
  }), { existWatts: 0, newWatts: 0, wattsReduced: 0, fixtureIncentive: 0, controlsIncentive: 0, totalIncentive: 0 });

  const rawIncentive = totals.totalIncentive;
  const capPct = program === 'smbe' ? SMBE.cap : program === 'express' ? EXPRESS.cap : LARGE.cap;
  const linesCost = lines.reduce((s, l) => s + (getEffectivePrice(l) * (l.qty || 0)), 0);
  const effectiveProjectCost = projectCost > 0 ? projectCost : linesCost;
  const capAmount = effectiveProjectCost > 0 ? +(effectiveProjectCost * capPct).toFixed(2) : Infinity;
  const estimatedRebate = +Math.min(rawIncentive, capAmount).toFixed(2);
  const capApplied = effectiveProjectCost > 0 && rawIncentive > capAmount;
  const reductionPct = totals.existWatts > 0 ? ((totals.wattsReduced / totals.existWatts) * 100).toFixed(0) : 0;

  // Cross-program comparison (SMBE vs Express only)
  const altComparison = useMemo(() => {
    if (program === 'large' || lines.length === 0) return null;
    const altCalcFn = program === 'smbe' ? calcExpress : calcSMBE;
    const altResults = lines.map(l => altCalcFn(l));
    const altRawTotal = altResults.reduce((s, r) => s + r.totalIncentive, 0);
    const altCapPct = program === 'smbe' ? EXPRESS.cap : SMBE.cap;
    const altCapAmount = effectiveProjectCost > 0 ? +(effectiveProjectCost * altCapPct).toFixed(2) : Infinity;
    const altEstimated = +Math.min(altRawTotal, altCapAmount).toFixed(2);
    const altName = program === 'smbe' ? 'Express' : 'SMBE';
    const diff = estimatedRebate - altEstimated;
    return { altName, altEstimated, altRawTotal, diff, currentIsBetter: diff >= 0 };
  }, [program, lines, effectiveProjectCost, estimatedRebate]);

  // ---- FINANCIAL ANALYSIS ----
  const financials = useMemo(() => {
    const annualHours = operatingHours * daysPerYear;
    const existKwh = (totals.existWatts * annualHours) / 1000;
    const proposedKwh = (totals.newWatts * annualHours) / 1000;
    const annualKwhSaved = existKwh - proposedKwh;
    const annualEnergySavings = annualKwhSaved * energyRate;
    const existAnnualCost = existKwh * energyRate;
    const proposedAnnualCost = proposedKwh * energyRate;
    const pCost = effectiveProjectCost;
    const netCost = Math.max(0, pCost - estimatedRebate);
    const simplePayback = annualEnergySavings > 0 ? netCost / annualEnergySavings : 0;
    const roi = netCost > 0 ? (annualEnergySavings / netCost) * 100 : 0;
    const cashFlow = [];
    for (let yr = 0; yr <= 10; yr++) {
      const savings = yr === 0 ? 0 : annualEnergySavings;
      const rebate = yr === 0 ? estimatedRebate : 0;
      const investment = yr === 0 ? -pCost : 0;
      const netCF = investment + rebate + savings;
      const cumulative = yr === 0 ? netCF : (cashFlow[yr - 1]?.cumulative || 0) + netCF;
      cashFlow.push({ year: yr, savings, rebate, investment, netCashFlow: netCF, cumulative });
    }
    let npv = -netCost;
    for (let yr = 1; yr <= 10; yr++) npv += annualEnergySavings / Math.pow(1.05, yr);
    let irr = 0;
    if (netCost > 0 && annualEnergySavings > 0) {
      let lo = -0.5, hi = 5.0;
      for (let iter = 0; iter < 50; iter++) { const mid = (lo + hi) / 2; let tn = -netCost; for (let yr = 1; yr <= 10; yr++) tn += annualEnergySavings / Math.pow(1 + mid, yr); if (tn > 0) lo = mid; else hi = mid; }
      irr = (lo + hi) / 2;
    }
    return {
      annualHours, existKwh, proposedKwh, annualKwhSaved, annualEnergySavings,
      existAnnualCost, proposedAnnualCost, monthlyEnergySavings: annualEnergySavings / 12,
      projectCost: pCost, netProjectCost: netCost, simplePayback, roi,
      cashFlow, npv, irr,
      tenYearSavings: (annualEnergySavings * 10) - netCost,
      fiveYearSavings: (annualEnergySavings * 5) - netCost,
      lifetimeSavings: (annualEnergySavings * 15) - netCost,
      co2Saved: annualKwhSaved * 0.000417,
    };
  }, [operatingHours, daysPerYear, energyRate, totals, effectiveProjectCost, estimatedRebate]);

  // ---- MAINTENANCE SAVINGS ----
  const maintenanceSavings = useMemo(() => {
    const annualHours = operatingHours * daysPerYear;
    let existingMaintCost = 0;
    let proposedMaintCost = 0;
    const lineDetails = lines.map(l => {
      const lampType = l.lightingType || inferLampType(l.name) || 'Other';
      const existLife = LAMP_LIFE[lampType] || 20000;
      const ledLife = LAMP_LIFE.LED;
      const qty = l.qty || 0;
      const height = l.height || 9;
      const labor = relampLabor(height);
      const existRelampsPerYear = annualHours > 0 ? qty * (annualHours / existLife) : 0;
      const proposedRelampsPerYear = annualHours > 0 ? qty * (annualHours / ledLife) : 0;
      const existCost = existRelampsPerYear * (labor + LAMP_COST_EXISTING);
      const proposedCost = proposedRelampsPerYear * (labor + LAMP_COST_LED);
      existingMaintCost += existCost;
      proposedMaintCost += proposedCost;
      return { name: l.name, qty, lampType, existLife, existCost, proposedCost, savings: existCost - proposedCost };
    });
    const annualSavings = existingMaintCost - proposedMaintCost;
    return { existingMaintCost, proposedMaintCost, annualSavings, lineDetails };
  }, [lines, operatingHours, daysPerYear]);

  // ---- AUTO-POPULATE APP & W9 FIELDS ----
  useEffect(() => {
    setAppFields(prev => ({
      ...prev,
      businessName: prev.businessName || projectName,
      contactEmail: prev.contactEmail || saveEmail,
      contactPhone: prev.contactPhone || savePhone,
      materialCost: effectiveProjectCost > 0 ? Math.round(effectiveProjectCost * 0.6) : prev.materialCost,
      laborCost: effectiveProjectCost > 0 ? Math.round(effectiveProjectCost * 0.4) : prev.laborCost,
    }));
    setW9Fields(prev => ({
      ...prev,
      name: prev.name || projectName,
      address: prev.address || saveAddress,
      cityStateZip: prev.cityStateZip || [saveCity, saveState, saveZip].filter(Boolean).join(', '),
    }));
  }, [projectName, saveEmail, savePhone, saveAddress, saveCity, saveState, saveZip, effectiveProjectCost]);

  // ---- SAVE PROJECT ----
  const saveProject = async () => {
    if (!projectName.trim()) { showToast('Enter a customer name first', '\u26A0\uFE0F'); return; }
    setSaving(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const projectData = {
        lines: lines.map(l => ({ name: l.name, qty: l.qty, existW: l.existW, newW: l.newW, height: l.height, location: l.location, controlsType: l.controlsType, controlsOnly: l.controlsOnly, controlsOnlyType: l.controlsOnlyType, productId: l.productId, productName: l.productName, productPrice: l.productPrice, fixtureCategory: l.fixtureCategory, lightingType: l.lightingType, confirmed: l.confirmed, overrideNotes: l.overrideNotes })),
        totals, financials, totalIncentive: estimatedRebate, projectCost: effectiveProjectCost,
        operatingHours, daysPerYear, energyRate, city: saveCity, state: saveState, zip: saveZip, photos: capturedPhotos,
      };
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-save`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` }, body: JSON.stringify({ customerName: projectName, phone: savePhone, email: saveEmail, address: saveAddress, city: saveCity, state: saveState, zip: saveZip, projectData, programType: 'ut-rmp', leadOwnerId: leadOwnerId || null, existingLeadId: savedLeadId || null, existingAuditId: savedAuditId || null }) });
      const data = await resp.json();
      if (data.success) { setSavedLeadId(data.leadId); setSavedAuditId(data.auditId); setIsDirty(false); setShowSaveModal(false); showToast(savedLeadId ? 'Project updated' : 'Project saved as lead + audit', '\u2713'); }
      else { showToast(data.error || 'Save failed', '\u26A0\uFE0F'); }
    } catch (err) { console.error('Save error:', err); showToast('Could not save project', '\u26A0\uFE0F'); }
    setSaving(false);
  };

  const loadProjects = async (ownerId = leadOwnerId) => {
    setLoadingProjects(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const resp = await fetch(`${SUPABASE_URL}/functions/v1/lenard-projects`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON}` }, body: JSON.stringify({ leadOwnerId: ownerId || null, leadSource: 'Lenard UT RMP' }) });
      const data = await resp.json();
      if (data.projects) setProjects(data.projects);
    } catch (_) { showToast('Could not load projects', '\u26A0\uFE0F'); }
    setLoadingProjects(false);
  };

  const loadProject = (project) => {
    try {
      const rawNotes = project.audit?.notes || project.notes;
      const pd = JSON.parse(rawNotes);
      setProjectName(project.customerName || '');
      setSavePhone(project.phone || ''); setSaveEmail(project.email || ''); setSaveAddress(project.address || '');
      setSaveCity(pd.city || ''); setSaveState(pd.state || 'UT'); setSaveZip(pd.zip || '');
      if (pd.operatingHours) setOperatingHours(pd.operatingHours);
      if (pd.daysPerYear) setDaysPerYear(pd.daysPerYear);
      if (pd.energyRate) setEnergyRate(pd.energyRate);
      if (pd.projectCost) setProjectCost(pd.projectCost);
      setSavedLeadId(project.id); setSavedAuditId(project.audit?.id || null); setIsDirty(false);
      if (pd.lines) { lineIdRef.current = 0; setLines(pd.lines.map(l => ({ ...l, id: ++lineIdRef.current }))); }
      setShowProjects(false);
      showToast('Project loaded', '\uD83D\uDCC2');
    } catch (_) { showToast('Could not parse project data', '\u26A0\uFE0F'); }
  };

  // ---- COPY SUMMARY ----
  const copySummary = () => {
    const pName = program === 'smbe' ? 'RMP Small/Medium Business Express' : program === 'express' ? 'RMP Standard Express' : 'RMP Large Non-Prescriptive';
    let t = `${pName} Quick Quote${projectName ? ` \u2014 ${projectName}` : ''}\n${'='.repeat(50)}\n\n`;
    results.forEach(r => { t += `${r.name || r.location}: ${r.qty}\u00D7 | ${r.location === 'interior' ? 'Int' : 'Ext'} | ${r.existW > 0 ? `${r.existW}W \u2192 ` : ''}${r.newW}W | $${r.calc.totalIncentive.toLocaleString()}\n`; });
    t += `\n${'\u2014'.repeat(50)}\nRaw Incentive Total: $${rawIncentive.toLocaleString()}\n`;
    if (capApplied) t += `Project Cost Cap (${Math.round(capPct * 100)}%): $${capAmount.toLocaleString()} \u2014 CAP APPLIED\n`;
    t += `ESTIMATED REBATE: $${estimatedRebate.toLocaleString()}\n\n`;
    if (financials.projectCost > 0) t += `Project Cost: $${financials.projectCost.toLocaleString()} | Net: $${financials.netProjectCost.toLocaleString()}\nPayback: ${financials.simplePayback.toFixed(1)} yrs | 10-Year Savings: $${Math.round(financials.tenYearSavings).toLocaleString()}\n\n`;
    t += `\u26A0\uFE0F Estimate only \u2014 subject to Rocky Mountain Power review`;
    navigator.clipboard?.writeText(t); setShowSummary(false); showToast('Copied to clipboard', '\uD83D\uDCCB');
  };

  // ---- PDF GENERATION ----
  const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName; a.click();
    URL.revokeObjectURL(url);
  };

  const generatePDF = () => {
    const doc = new jsPDF({ unit: 'mm', format: 'letter' });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 16;
    const LW = W - M * 2;
    const R = W - M;
    const orange = [249, 115, 22];
    const dark = [30, 30, 34];
    const green = [22, 163, 74];
    const red = [220, 38, 38];
    const gray = [120, 120, 120];
    const ltGray = [230, 230, 230];
    const white = [255, 255, 255];
    const blue = [59, 130, 246];
    const brandGreen = [75, 100, 82];
    let y = 0;
    let pg = 1;

    const $ = (v) => `$${Math.round(v).toLocaleString()}`;
    const $c = (v) => `$${(+v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const $k = (v) => Math.abs(v) >= 1000 ? `$${(v / 1000).toFixed(1)}k` : $(v);
    const checkPage = (need = 20) => { if (y > H - need) { addFooter(); doc.addPage(); pg++; y = 20; } };

    const addFooter = () => {
      doc.setDrawColor(...ltGray);
      doc.setLineWidth(0.3);
      doc.line(M, H - 14, R, H - 14);
      doc.setFontSize(7);
      doc.setTextColor(...gray);
      doc.text('Energy Scout by HHH Building Services', M, H - 10);
      doc.setTextColor(...brandGreen);
      doc.setFont(undefined, 'bold');
      doc.text('ENERGY SCOUT', M, H - 6.5);
      const esFooterW = doc.getTextWidth('ENERGY SCOUT');
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...gray);
      doc.text('  |  Commercial Energy Solutions  |  Powered by Job Scout', M + esFooterW + 2, H - 6.5);
      doc.text(`Page ${pg}`, R, H - 6.5, { align: 'right' });
    };

    const sectionTitle = (title) => {
      checkPage(30);
      y += 4;
      doc.setFillColor(...orange);
      doc.rect(M, y - 4.5, LW, 8, 'F');
      doc.setFontSize(11);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...white);
      doc.text(title.toUpperCase(), M + 3, y);
      y += 8;
    };

    const tableHeader = (cols) => {
      checkPage(14);
      doc.setFillColor(...dark);
      doc.rect(M, y - 4, LW, 7, 'F');
      doc.setFontSize(7.5);
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...white);
      cols.forEach(c => doc.text(c.label, c.x, y, c.align ? { align: c.align } : {}));
      y += 5.5;
      doc.setTextColor(...dark);
      doc.setFont(undefined, 'normal');
    };

    const dataRow = (cols, stripe = false) => {
      checkPage(8);
      if (stripe) { doc.setFillColor(248, 248, 250); doc.rect(M, y - 3.5, LW, 5, 'F'); }
      doc.setFontSize(7.5);
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

    const row = (label, value, opts = {}) => {
      checkPage(7);
      if (opts.topLine) { doc.setDrawColor(...(opts.lineColor || ltGray)); doc.setLineWidth(0.3); doc.line(M, y - 2, R, y - 2); y += 1; }
      const fs = opts.big ? 11 : opts.med ? 10 : 9;
      doc.setFontSize(fs);
      doc.setFont(undefined, opts.bold ? 'bold' : 'normal');
      doc.setTextColor(...(opts.labelColor || dark));
      doc.text(label, M + (opts.indent || 0), y);
      doc.setTextColor(...(opts.color || dark));
      doc.text(value, R, y, { align: 'right' });
      doc.setTextColor(...dark);
      y += opts.big ? 7 : opts.med ? 6 : 5;
    };

    const f = financials;
    const projCost = f.projectCost;
    const netCost = f.netProjectCost;
    const annSav = f.annualEnergySavings;
    const maintSav = maintenanceSavings.annualSavings || 0;
    const totalAnnSav = annSav + maintSav;
    const adjPayback = totalAnnSav > 0 ? netCost / totalAnnSav : f.simplePayback;
    const payback = adjPayback;

    // ===== HEADER =====
    y = 16;
    doc.setFillColor(...orange);
    doc.rect(0, 0, W, 4, 'F');

    const logoB64 = 'iVBORw0KGgoAAAANSUhEUgAAACwAAABDCAYAAADnJueOAAAACXBIWXMAAA7DAAAOwwHHb6hkAAAPPUlEQVRogWJkoBEIDXXgERRkV/v7l/ktI9tfOaa/DHdmzdr5nCLrGBgYAAAAAP//oomDExIcONg4uSYzMjAkMTAw/GZgYGBnYGA4/+vHH//583c9JttgBgYGAAAAAP//YqKeMxGAjYMrjeE/QxwDAwPIfJBjQcCQlYOlNzbWjZtsgxkYGAAAAAD//2KmojvBIDXT3YWJgWkKIyMDD7ocIwODBgsrwx8lxTtHrl1j+E+y4QwMDAAAAAD//6JqCCcne8kz/WeezMDIIIRDCTMjI1Mxv7CHLVkWMDAwAAAAAP//oqqDmZn/qzMwMqgRUMbLxMCkTpYFDAwMAAAAAP//YiFVQ2ioNhsHhzQriP3mDfOf7du3gzLVPxD/P9N/RkZQxBME/zECysHBgUVWlo198eJd32HmYQAGBgYAAAAA//8iqZQAGaquyTmZgYHR7j/D//+MDIxf/jMwPGFg+Dv/7y/mKyxs/3P+/2coZmRkxGvufwaGtQx/GRq/M/15ycHAZM3EyOjG8J9B4z8jgygjA8PRd28+FKxefRzkcFTAwMAAAAAA//8iKYQ5OTlBmVSJgYFBg5GBERxKjAwM5gwMTH4sbAzfGRgYeYgK4v//gxiZGVy4GFi+MDAwiDMwMLCAdEE0/pfn4xNsY2BgeIihj4GBAQAAAP//IqmUuHPnzl9dHZk9LKwsIMeJMjAwCEJkGEEeBxVfRMUYJAYYORgYGPigRR8I/GT4///If0bGSUwML4+ePfsclNRQAQMDAwAAAP//IrviSEhwEGDh4DBg/s/A9Z+JSZvxP0MFntIBC/j/m+E/41IGxv+P/jMwvP/P8O/KhzefjuJKCmDAwMAAAAAA//+iSk0HroZFuK4wMjDIk6Dt+2+GXzrzpu+5R7QOBgYGAAAAAP//okqx9uUL529GBoZH1DALL2BgYAAAAAD//yLKwaGhDMxpacZcIBqb/Pbt238y/GNYi684Qgf/GRhe/fv+5xtJrmVgYAAAAAD//yLo4JRMd1shYa8NjEziB4WEPRcmZHgoYFP3/fvPJQwMDEeJt/r/tgULDrwgybUMDAwAAAAA///C6+C0NBd+5v9MnQyMDD4MjAwmDIyM0eyMjMtTUtwU0dUuWrT37b8/DCkMDAz7CYb0f4aLv/7/7yLVsQwMDAwAAAAA///CH8JMrFEMjIxmqIKMFkysLJNBGQ1d+ezZ2279+fU35D8DwzwcJv5h+M+w+/+/PxELZux4QLJrGRgYAAAAAP//wllxJCa6yTIwMhSBmgjocowMDB5CQlwxDAwMM0B8UA0opfmHl4uBS4mJgTmcgYHBH0n5XwYGhkugUP3H8H8P479X62fNOkdy2gUDBgYGAAAAAP//wuVgJjYOlgIGBgYVHPLMDIz/U+PinFdzcrKY/mdiSmdkYNT/z8AgyMjAIABT9P8/wy9GRobeL5/+dyxduv0TsY4CtZmZuZlEMWKBgYEBAAAA///CmiTS0z3M/0N6C7gBI+MfTm62bAYm5rWMDIwBDAwMisiOhSj5z8jwn0GZm5uRlPKZgZObqYSdkelIcoanNYoEAwMDAAAA///CcHBSkjUvAyNTI7rlaOAfw///x/8zMOYwMDBw4fEVKwMjQxgjM8O+tEyvUmJ7G4yMjBIMDAzSzIyM+UhVNwMDAwMDAAAA///CcDArK38SAyODI34j/z/9D85A/0WIcQADA4MIIwNDOxc3y7y0NHdJIvWA7NFKS3NAVPcMDAwAAAAA//9CcXBKppsxAyNDJbj1hM8YBoZ9jAwMBoSakWiAGRLazEvS0lzkiNHAyMCgxsDMmQbq1IIFGBgYAAAAAP//gjs4Ls5ZmJmBpZ+BEdzcwwd+MjIwHPvPyKhHgmORgRMjE+u8lBRnrPaAatP//xnYoE5mZWRgaGDj4CwG17IMDAwAAAAA//8ChySoF8HJxd70//9/G0KB9p/h/02QCkYGBmEyHQyKISdmVrau0FDLDFDrLC3NmPXfP0EVJlbWQMb/oAqKwQ6hmpGVkfF/Ci+v63wGht3PAAAAAP//AjtYSEQ2DNSHZGQgIor/M+yAViZkN5ygSSlKSFjgfXq6x2UGRqYAJmYGG3BGx+4CCWY2Zl0GBoZnAAAAAP//YklM9BT9z8BYxYgYP8AHfjIw/jvEwMBMVrWKBlj+MzDkgcIIgnCD/wyMN35++3WGgYGBAQAAAP//YmLh+G/JyMBAXC/2P8P9f/8Zv/5nYJCigoPBIU044/4/wfD3bzKorcLAwMAAAAAA//9iYvxPfPT+Z2A4zQjqFv3/z0+a0/5//M/w/xlpeqDgH8PaWbN2ngPzGBgYAAAAAP//YmL4/x9fBYGwEgQY/h9mZGS0I7E4+/P/P0MN4z9G//8MDBcI2PLq////vf///+/6z8DwFepCE7g0AwMDAAAA//9iYmRm2gKq8wlay8j4jeHvH1AIK5PgWFC0XPj6mWHRzJnbzvz+8cfvPwPDamiDCAZATdF7DAz/O////Ws/a8b2kq+fGVoZGf6/g+oXgXccGBgYAAAAAP//Yvn57dsBdk6uxaAGGr6kwcjw/8nvP4xv2VgYtYl26///oJGVRbCGD2jkMjbWLZGTm/kkON8wMn7+z/DvxK/vPw4jN+Z//fr+j4GBC3PsjYGBAQAAAP//Ylmw4MCP6GjPIh5ehn8MjAwJ4Pofa0AxPmbmYBJkYAClX+JSBCMj4+d/fxh2IostXrwLFNW9+HX+/MvAwHWXgYFBjoERNBygzczAcPUvAwMDAwAAAP//AocoKAR+/fie9////3IGhv/g3IjVAQyMggxgTCz4f+3Dh/ckjweDKpP////fh3KVeXmlIG0WBgYGAAAAAP//gicBUEjPmrGjn+Hff18GBoZ9mN2c/1cY/jOogWKZePcyPCc0zoALMDIywpIENysrA6SVx8DAAAAAAP//wkizM2fuOP7l0/9ABob/BQz//59j+M/w7j8Dw57fP/72MTIyaJFSQvxnZDhEjmOhup9iCDEwMAAAAAD//8KayUBJZOb07ZP//3tl++c3gxHD35fgoX7G/4zQRgmxdjL8JNO1DP/+M56GxjLz//+skNYaAwMDAAAA///C24yE9r3Ag3LgJh7jfyNiMxylgPHf/18MzIygkoaTgZkR1I64zMDAwAAAAAD//yK6AcPE9Jv1PwMDsQ12yh3MyPiDgeH/X0gS/C8GFmRgYAAAAAD//yLawT9/8oG6aCQFLyMjoyyu0SLC9n279Z+B4TWKIAMDAwAAAP//ItrB7Hy/QaFLQpEGAv9zhUQ8IknTAwG/f3N+Y2QAhTK4OOUEizIwMAAAAAD//yLawSx/meUZGBlIbPQw8jD8Z5qYnu7uQZo+BgZ29k+gtgusaAW1J5gYGBgYAAAAAP//ItrB/5nBUUt6jgONGTMxTU/OcNMhRdu9e6zfGf8z3IJyId0pBgYGAAAAAP//osJw6/+3DP//HwA37nECRgUWRpaJoEFwYk09cODAHwZGRlhtBwEMDAwAAAAA//8ivpT4xyiKtZb7z3ju54/vnv///29Fa4WhAwd2Ts48UrpW4BYtpB/JFh3tycPAwMAAAAAA//8iXjMjI/ZuPeP//wsWHPj1/evfPob/4DFiXABkV15amrsBsXYyMjI8Abf4GBjkWXn/CzEwMDAAAAAA//8i2sGMjHhHgsCtsF8//5SABv3wmCLMyMRcDuolE2Xpv//gfhwo87L8+cfIwMDAAAAAAP//osaUAbzdCqq+///7l4Ot/IQDxv/uf5hFQVNnhN3LxPgH1gj6x/qPkYGBgQEAAAD//yLWwUz/QUUUdteiZLZZs3YcYWT4X4MrE/5nYGRhQqq58Dr4/z9QS+8raOaU6T+LHAMDAwMAAAD//yLKwamp7pqMDAxu2OQYGRjOojdF3715tICBgWEOLNOgqv/PzPyPkZcYe39/+wNqxL///5+BHTw/zcDAAAAAAP//IuhgUNXKyMycCxrQQ5cD9QX/Mfw7hi6+evXVX9+//qxnZGA4gcWLoAYXURXQ///MP/6D8zsj4////5gZGBgYAAAAAP//IuhgQUF3fUZGBtDIEBa7/z9i/PsTa08YPI7AyAjvniMBpn+M2JMXOuDkfAuKofdgqxgZmRgYGBgAAAAA///C62DQVAAjM3MhrjYEIwPDvlmzDrzBpf//f4bL6MkC0i+FWE4IzJp1FtRiA5c6jKDZAAYGBgAAAAD//8KrUVWVDTTIgjxfgeyYX3//Ma7Bp/8fw//bGJ4kbUwDVDTAMq8OAwMDAwAAAP//wulg0IgmEyR0sWYQRkaGy/9+f8SSRhGA6d8/UPrDmAIDpUiinfwftEoADJgZGBgYAAAAAP//wulgISFZWwZGRi8c0v8YGP4vnDfv6Gf8tjGDkgs4DaK4gYR29T+G/yfAo06MDIyhoaHMAAAAAP//wupgUHfoPxNTMa75i/8M/+/9/P4dNIKDF3z9+v8hA8N/jF4zKSHM9J/hNaiQYGRgkJCQ+MICAAAA///C6mA2TnZnRgYGJ9ye/j+NmGlX0AjOfwbMJEEK+Aup6f4zMDBKff36iQ0AAAD//8JwMGimh5GBGRS62MeL/zOc+/v7/0LiLP35lxE8bkY++P/7H2iVwKf/oLlDNm5OAAAAAP//wnAwJw+TFwPDfxvsbmX4yvD/X/3cuTshA3UEAHQQhTIH///y8j90NOr3bxZOAAAAAP//QunmR0d78jEygKZrMcfXoOXpjJs3f+wiyULweArlgJHhPxsr619eAAAAAP//QglhHr7/fgwMjCjjsTDAyMC45wvj51ZwT4A0F2MdwSEWPH/O94uRgeENKBD//WPhBgAAAP//QnHw//+MoMY1xuDKf4b/l/7/+5+5bPoRjCKKEGD8/+8UeuPo/3/iu/6gxSP/GRjOg81i/CcMAAAA//9CcTDj//+gQUCUbs5/hv9X//7/Gz1r1nZQy4lk8JeBCWN1FON/xOAecZ6GDrgzMPICAAAA//9CCc3PTF+O8zDwJDMwMEqDyj3wyPy/v3Pmztp1gxzHggATuIeDkor//GcClc+kuJgRvFzhPxOjCAAAAP//QnEwNMqJLLKItQu0chA0EskoCxmRZzz06/uP3aSY8Y/h3wkmUCOP4T8PAAAA//+iyfphZDBz5vZrvxmYHBj+/Y//z8jg+O3LH78FCw58IMnB///dY/z/P+MfE+N6AAAAAP//AwA5wSxP6xEIVAAAAABJRU5ErkJggg==';
    const logoW = 10;
    const logoH = 14;
    try { doc.addImage(logoB64, 'PNG', M, y - 10, logoW, logoH); } catch (_) { /* skip logo */ }

    // Row 1: Logo + ENERGY SCOUT (green-grey 20pt bold)
    const logoOffset = logoW + 3;
    doc.setFontSize(20);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...brandGreen);
    doc.text('ENERGY SCOUT', M + logoOffset, y);

    // Row 2: "by HHH Building Services" left, "Financial Audit Report" right
    y += 6;
    doc.setFontSize(9);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...gray);
    doc.text('by HHH Building Services', M + logoOffset, y);
    doc.setFontSize(11);
    doc.setFont(undefined, 'bold');
    doc.setTextColor(...dark);
    doc.text('Financial Audit Report', R, y, { align: 'right' });

    // Row 3: "COMMERCIAL LIGHTING RETROFIT" right
    y += 5;
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...gray);
    doc.text('COMMERCIAL LIGHTING RETROFIT', R, y, { align: 'right' });

    // Orange divider
    y += 3;
    doc.setDrawColor(...orange);
    doc.setLineWidth(1);
    doc.line(M, y, R, y);
    y += 6;

    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...gray);
    const dateStr = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const reportId = `ES-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    doc.text(`Date: ${dateStr}   |   Report: ${reportId}`, M, y);
    doc.text(`Program: ${programLabel}`, R, y, { align: 'right' });
    y += 6;

    // Customer + Operating Parameters
    const boxW = (LW - 4) / 2;
    doc.setFillColor(248, 248, 250);
    doc.setDrawColor(...ltGray);
    doc.roundedRect(M, y - 3, boxW, 24, 2, 2, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(...orange);
    doc.setFont(undefined, 'bold');
    doc.text('CUSTOMER', M + 3, y);
    doc.setFontSize(10);
    doc.setTextColor(...dark);
    doc.text(projectName || 'N/A', M + 3, y + 5);
    doc.setFontSize(8);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...gray);
    const fullAddr = [saveAddress, saveCity, saveState, saveZip].filter(Boolean).join(', ');
    if (fullAddr) doc.text(fullAddr, M + 3, y + 10, { maxWidth: boxW - 6 });
    const contact = [savePhone, saveEmail].filter(Boolean).join('  |  ');
    if (contact) doc.text(contact, M + 3, y + 15, { maxWidth: boxW - 6 });

    const pBoxX = M + boxW + 4;
    doc.setFillColor(248, 248, 250);
    doc.roundedRect(pBoxX, y - 3, boxW, 24, 2, 2, 'FD');
    doc.setFontSize(7);
    doc.setTextColor(...orange);
    doc.setFont(undefined, 'bold');
    doc.text('OPERATING PARAMETERS', pBoxX + 3, y);
    doc.setFontSize(9);
    doc.setTextColor(...dark);
    doc.setFont(undefined, 'normal');
    doc.text(`${operatingHours} hrs/day  x  ${daysPerYear} days/yr`, pBoxX + 3, y + 5);
    doc.text(`${f.annualHours.toLocaleString()} annual operating hours`, pBoxX + 3, y + 10);
    doc.text(`Electric rate: ${$c(energyRate)}/kWh`, pBoxX + 3, y + 15);
    y += 26;

    // ===== FIXTURE SCHEDULE =====
    sectionTitle('Fixture Schedule');
    const c0 = M + 1, c1 = M + 10, c2 = M + 58, c3 = M + 72, c4 = M + 86, c5 = M + 132, c6 = M + 149, c7 = R;
    tableHeader([
      { label: 'Qty', x: c0 }, { label: 'Area / Existing Fixture', x: c1 }, { label: 'Ht', x: c2 },
      { label: 'Exist W', x: c3 }, { label: 'LED Replacement', x: c4 }, { label: 'New W', x: c5 },
      { label: 'Saved', x: c6 }, { label: 'Rebate', x: c7, align: 'right' },
    ]);
    results.forEach((r, i) => {
      dataRow([
        { val: r.qty, x: c0 }, { val: (r.name || r.fixtureCategory || 'Fixture').substring(0, 26), x: c1 },
        { val: r.height ? `${r.height}'` : '-', x: c2 }, { val: `${r.existW}W`, x: c3 },
        { val: (r.productName || '-').substring(0, 24), x: c4 }, { val: `${r.newW}W`, x: c5 },
        { val: `${r.calc.wattsReduced}W`, x: c6 }, { val: $(r.calc.totalIncentive), x: c7, align: 'right' },
      ], i % 2 === 0);
    });
    y += 1;
    doc.setDrawColor(...orange); doc.setLineWidth(0.5); doc.line(M, y - 2, R, y - 2);
    dataRow([
      { val: `${results.reduce((s, r) => s + r.qty, 0)} fixtures`, x: c0, bold: true }, { val: '', x: c1 }, { val: '', x: c2 },
      { val: `${totals.existWatts.toLocaleString()}W`, x: c3, bold: true }, { val: '', x: c4 },
      { val: `${totals.newWatts.toLocaleString()}W`, x: c5, bold: true },
      { val: `${totals.wattsReduced.toLocaleString()}W`, x: c6, bold: true },
      { val: $(totals.totalIncentive), x: c7, align: 'right', bold: true, color: orange },
    ]);
    y += 3;

    // ===== ENERGY ANALYSIS =====
    sectionTitle('Energy Analysis');
    row('Current Annual Consumption', `${Math.round(f.existKwh).toLocaleString()} kWh`);
    row('Proposed Annual Consumption', `${Math.round(f.proposedKwh).toLocaleString()} kWh`);
    row('Annual Energy Reduction', `${Math.round(f.annualKwhSaved).toLocaleString()} kWh  (${reductionPct}%)`, { bold: true, color: green, topLine: true });
    y += 2;
    row('Current Annual Energy Cost', $c(f.existAnnualCost));
    row('Proposed Annual Energy Cost', $c(f.proposedAnnualCost));
    row('Annual Cost Savings', $c(annSav), { bold: true, med: true, color: green, topLine: true });
    row('Monthly Cost Savings', $c(f.monthlyEnergySavings), { indent: 4, color: green });
    if (f.co2Saved > 0) row('Annual CO2 Reduction', `${f.co2Saved.toFixed(1)} metric tons`, { color: green });
    y += 2;

    // ===== MAINTENANCE ANALYSIS =====
    if (maintenanceSavings.annualSavings > 0) {
      sectionTitle('Maintenance Analysis');
      row('Annual Existing Maintenance Cost', $c(maintenanceSavings.existingMaintCost));
      row('Annual LED Maintenance Cost', $c(maintenanceSavings.proposedMaintCost));
      row('Annual Maintenance Savings', $c(maintenanceSavings.annualSavings), { bold: true, med: true, color: green, topLine: true });
      y += 2;
      doc.setFontSize(7);
      doc.setTextColor(...gray);
      doc.setFont(undefined, 'italic');
      const doeText = 'According to the U.S. Department of Energy, LED lighting reduces maintenance costs by 50-80% compared to conventional lighting due to 3-5x longer rated life and improved lumen maintenance. (Source: DOE Solid-State Lighting Program, energy.gov)';
      doc.text(doeText, M, y, { maxWidth: LW });
      doc.setFont(undefined, 'normal');
      y += 10;
    }

    // ===== RMP INCENTIVE BREAKDOWN =====
    sectionTitle('Rocky Mountain Power Incentive');
    row('Fixture Incentive', $(totals.fixtureIncentive));
    if (totals.controlsIncentive > 0) row('Controls Incentive', $(totals.controlsIncentive));
    row('Raw Incentive Total', $(rawIncentive), { bold: true, topLine: true });
    if (capApplied) {
      row(`Project Cost Cap (${Math.round(capPct * 100)}%)`, $(capAmount), { color: orange });
      row('CAP APPLIED', '', { color: orange, indent: 4 });
    }
    row('Total Estimated RMP Incentive', $(estimatedRebate), { bold: true, big: true, color: orange, topLine: true, lineColor: orange });
    y += 2;

    // ===== INVESTMENT ANALYSIS =====
    sectionTitle('Investment Analysis');

    if (projCost > 0) {
      row('Gross Project Cost', $c(projCost));
      row('Less: RMP Incentive', `(${$c(estimatedRebate)})`, { color: green });
      row('Net Capital Investment', $c(netCost), { bold: true, med: true, topLine: true });
      y += 2;
      row('Annual Energy Savings', $c(annSav), { color: green });
      if (maintSav > 0) row('Annual Maintenance Savings', $c(maintSav), { color: green });
      if (maintSav > 0) row('Total Annual Savings', $c(totalAnnSav), { bold: true, color: green, topLine: true });
      row('Monthly Total Savings', $c(totalAnnSav / 12), { indent: 4, color: green });
      y += 3;

      // Key Metrics box
      checkPage(44);
      doc.setDrawColor(...orange);
      doc.setLineWidth(0.6);
      doc.setFillColor(255, 251, 245);
      doc.roundedRect(M, y - 3, LW, 40, 2, 2, 'FD');

      const drawMetric = (x, yy, label, value, unit, clr) => {
        doc.setFontSize(7); doc.setTextColor(...gray); doc.setFont(undefined, 'normal'); doc.text(label, x, yy);
        doc.setFontSize(18); doc.setFont(undefined, 'bold'); doc.setTextColor(...(clr || dark)); doc.text(value, x, yy + 7.5);
        if (unit) { doc.setFontSize(8); doc.setFont(undefined, 'normal'); doc.text(unit, x, yy + 12); }
        doc.setFont(undefined, 'normal');
      };
      const mx1 = M + 5, mx2 = M + LW / 3 + 3, mx3 = M + (LW * 2) / 3 + 3;
      const my1 = y, my2 = y + 20;
      const paybackMo = Math.round(payback * 12);
      const paybackLabel = payback < 1 ? `${paybackMo}` : payback.toFixed(1);
      const paybackUnit = payback < 1 ? 'months' : 'years';

      drawMetric(mx1, my1, 'SIMPLE PAYBACK', paybackLabel, paybackUnit, orange);
      drawMetric(mx2, my1, 'ANNUAL ROI', `${Math.round(f.roi)}%`, 'return on investment', green);
      drawMetric(mx3, my1, 'NPV (5% DISCOUNT)', $(f.npv), 'net present value', f.npv >= 0 ? green : red);
      drawMetric(mx1, my2, 'IRR', `${(f.irr * 100).toFixed(1)}%`, 'internal rate of return', green);
      drawMetric(mx2, my2, '5-YEAR NET SAVINGS', $(f.fiveYearSavings), null, f.fiveYearSavings >= 0 ? green : red);
      drawMetric(mx3, my2, '10-YEAR NET SAVINGS', $(f.tenYearSavings), null, f.tenYearSavings >= 0 ? green : red);

      y += 44;
    } else {
      row('Project Cost', 'Not specified', { color: gray, labelColor: gray });
      row('Annual Energy Savings', $c(annSav), { bold: true, color: green });
      doc.setFontSize(8); doc.setTextColor(...gray);
      doc.text('Enter product prices for full investment analysis with payback, ROI, NPV, and IRR.', M, y); y += 6;
    }

    // ===== 10-YEAR CASH FLOW =====
    if (projCost > 0 && annSav > 0) {
      checkPage(85);
      sectionTitle('10-Year Cash Flow Projection');

      const t0 = M + 1, t1 = M + 16, t2 = M + 42, t3 = M + 68, t4 = M + 96, t5 = M + 128, t6 = R;
      tableHeader([
        { label: 'Year', x: t0 }, { label: 'Savings', x: t1 }, { label: 'Rebate', x: t2 },
        { label: 'Investment', x: t3 }, { label: 'Net Cash Flow', x: t4 },
        { label: 'Cumulative', x: t5 }, { label: 'Net Position', x: t6, align: 'right' },
      ]);

      f.cashFlow.forEach((cf, i) => {
        const isPayback = cf.year > 0 && cf.year === Math.ceil(payback);
        dataRow([
          { val: cf.year === 0 ? 'Yr 0' : `Yr ${cf.year}`, x: t0, bold: isPayback },
          { val: cf.savings > 0 ? $(cf.savings) : '-', x: t1 },
          { val: cf.rebate > 0 ? $(cf.rebate) : '-', x: t2, color: cf.rebate > 0 ? green : dark },
          { val: cf.investment < 0 ? `(${$(Math.abs(cf.investment))})` : '-', x: t3, color: cf.investment < 0 ? red : dark },
          { val: cf.netCashFlow >= 0 ? $(cf.netCashFlow) : `(${$(Math.abs(cf.netCashFlow))})`, x: t4, color: cf.netCashFlow >= 0 ? green : red },
          { val: cf.cumulative >= 0 ? $(cf.cumulative) : `(${$(Math.abs(cf.cumulative))})`, x: t5, color: cf.cumulative >= 0 ? green : red },
          { val: cf.cumulative >= 0 ? $(cf.cumulative) : `(${$(Math.abs(cf.cumulative))})`, x: t6, align: 'right', bold: true, color: cf.cumulative >= 0 ? green : red },
        ], i % 2 === 0);
        if (isPayback) {
          doc.setFontSize(6.5); doc.setTextColor(...orange);
          doc.text('PAYBACK', t6 - 34, y - 4.5);
          doc.setTextColor(...dark);
        }
      });
      y += 3;

      // ===== CASH FLOW BAR GRAPH =====
      checkPage(75);
      sectionTitle('Cumulative Cash Flow Analysis');

      const graphX = M + 8;
      const graphW = LW - 16;
      const graphH = 55;
      const graphY = y;
      const baselineY = graphY + graphH;
      const barW = graphW / 11 - 2;

      const allCum = f.cashFlow.map(c => c.cumulative);
      const maxVal = Math.max(...allCum, 0);
      const minVal = Math.min(...allCum, 0);
      const range = (maxVal - minVal) || 1;
      const zeroY = graphY + (maxVal / range) * graphH;

      doc.setFontSize(7);
      doc.setTextColor(...gray);
      doc.setFont(undefined, 'normal');
      doc.text($k(maxVal), M, graphY + 2);
      doc.text('$0', M, zeroY + 1);
      if (minVal < 0) doc.text($k(minVal), M, baselineY);

      doc.setDrawColor(...ltGray);
      doc.setLineWidth(0.3);
      doc.line(graphX, zeroY, graphX + graphW, zeroY);

      doc.setDrawColor(245, 245, 245);
      for (let g = 0.25; g <= 0.75; g += 0.25) {
        const gy = graphY + g * graphH;
        doc.line(graphX, gy, graphX + graphW, gy);
      }

      f.cashFlow.forEach((cf, i) => {
        const bx = graphX + i * (graphW / 11) + 1;
        const val = cf.cumulative;
        const barHeight = Math.abs(val / range) * graphH;
        const isPos = val >= 0;

        if (isPos) {
          doc.setFillColor(...green);
          doc.rect(bx, zeroY - barHeight, barW, barHeight, 'F');
        } else {
          doc.setFillColor(...red);
          doc.rect(bx, zeroY, barW, barHeight, 'F');
        }

        doc.setFontSize(6);
        doc.setTextColor(...(isPos ? green : red));
        doc.setFont(undefined, 'bold');
        const labelY = isPos ? zeroY - barHeight - 2 : zeroY + barHeight + 3;
        doc.text($k(val), bx + barW / 2, labelY, { align: 'center' });

        doc.setFontSize(6.5);
        doc.setTextColor(...dark);
        doc.setFont(undefined, 'normal');
        doc.text(cf.year === 0 ? 'Yr 0' : `Yr ${cf.year}`, bx + barW / 2, baselineY + 5, { align: 'center' });

        if (cf.year > 0 && cf.year === Math.ceil(payback)) {
          doc.setDrawColor(...orange);
          doc.setLineWidth(0.8);
          doc.line(bx + barW / 2, graphY, bx + barW / 2, baselineY);
          doc.setFontSize(7);
          doc.setTextColor(...orange);
          doc.setFont(undefined, 'bold');
          doc.text('PAYBACK', bx + barW / 2, graphY - 2, { align: 'center' });
        }
      });

      y = baselineY + 10;

      // Summary narrative
      checkPage(18);
      doc.setFontSize(9);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...dark);
      const paybackMonths = Math.round(payback * 12);
      const paybackYears = Math.floor(paybackMonths / 12);
      const paybackRem = paybackMonths % 12;
      const paybackStr = paybackYears > 0
        ? `${paybackYears} year${paybackYears > 1 ? 's' : ''}${paybackRem > 0 ? ` ${paybackRem} month${paybackRem > 1 ? 's' : ''}` : ''}`
        : `${paybackMonths} months`;
      doc.text(`This investment reaches break-even in ${paybackStr}. After payback, the project generates`, M, y);
      y += 4;
      doc.setFont(undefined, 'bold');
      doc.setTextColor(...green);
      doc.text(`${$c(annSav)} per year in pure energy savings.`, M, y);
      y += 5;
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...dark);
      const returnMultiple = netCost > 0 ? ((annSav * 10) / netCost).toFixed(1) : '0';
      doc.text(`Over 10 years, every $1.00 invested returns $${returnMultiple} in energy savings (${$k(f.tenYearSavings)} net).`, M, y);
      y += 5;
      doc.text(`Net Present Value at 5% discount rate: ${$(f.npv)}  |  Internal Rate of Return: ${(f.irr * 100).toFixed(1)}%`, M, y);
      y += 8;
    }

    // ===== ASSUMPTIONS & DISCLAIMERS =====
    checkPage(30);
    sectionTitle('Assumptions & Disclaimers');
    doc.setFontSize(7);
    doc.setTextColor(...gray);
    doc.setFont(undefined, 'normal');
    const disclaimers = [
      `OPERATING ASSUMPTIONS: ${operatingHours} hours/day, ${daysPerYear} days/year (${f.annualHours.toLocaleString()} hrs/yr). Electric rate: ${$c(energyRate)}/kWh. Actual savings vary with usage and rate changes.`,
      `RMP INCENTIVES: Estimated rebate amounts subject to Rocky Mountain Power program review, approval, and available funding. Project cost cap: ${Math.round(capPct * 100)}% of total project cost. Pre-approval recommended before project start.`,
      'LED LIFETIME: Products typically rated 50,000-100,000 hours (10-20+ years at stated hours). Analysis excludes lamp replacement cost savings from LED longevity.',
      `NPV/IRR: Net Present Value calculated at 5% discount rate over 10 years. IRR calculated over 10-year project horizon. Both assume constant annual savings of ${$c(annSav)}.`,
      'This document is a preliminary estimate for planning purposes only and does not constitute a binding offer, contract, or guarantee of savings or rebate amounts.',
    ];
    disclaimers.forEach(d => { doc.text(d, M, y, { maxWidth: LW }); y += 7; });

    // Prepared by
    y += 2;
    doc.setDrawColor(...orange);
    doc.setLineWidth(0.4);
    doc.line(M, y, R, y);
    y += 5;
    doc.setFontSize(9);
    doc.setTextColor(...brandGreen);
    doc.setFont(undefined, 'bold');
    doc.text('Prepared by Energy Scout', M, y);
    doc.setFont(undefined, 'normal');
    doc.setTextColor(...gray);
    doc.text('A division of HHH Building Services  |  Commercial Energy Solutions', M, y + 4);
    const preparedLine = leadOwnerName ? `Auditor: ${leadOwnerName}  |  ` : '';
    doc.text(`${preparedLine}Report generated ${dateStr}  |  Ref: ${reportId}`, M, y + 8);

    // Customer Signature (if signed)
    if (signatureData) {
      y += 16;
      checkPage(30);
      doc.setDrawColor(...orange);
      doc.setLineWidth(0.4);
      doc.line(M, y, R, y);
      y += 5;
      doc.setFontSize(9);
      doc.setTextColor(...dark);
      doc.setFont(undefined, 'bold');
      doc.text('Customer Acceptance', M, y);
      y += 5;
      try {
        doc.addImage(signatureData, 'PNG', M, y, 60, 20);
        y += 22;
      } catch (_) { y += 2; }
      doc.setDrawColor(...gray);
      doc.setLineWidth(0.3);
      doc.line(M, y, M + 80, y);
      y += 4;
      doc.setFontSize(8);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(...gray);
      doc.text(`Signed: ${new Date().toLocaleDateString('en-US')}`, M, y);
      doc.text(projectName || '', M + 60, y);
    }

    addFooter();

    // ===== OUTPUT =====
    const blob = doc.output('blob');
    const fileName = `Energy_Scout_Audit_${(projectName || 'Project').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    const file = new File([blob], fileName, { type: 'application/pdf' });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      navigator.share({ files: [file], title: `Energy Scout Audit - ${projectName}` }).catch(() => downloadBlob(blob, fileName));
    } else {
      downloadBlob(blob, fileName);
    }
    showToast('PDF generated', '\uD83D\uDCC4');
  };

  // ---- GENERATE XLS (RMP Application) ----
  const generateXLS = () => {
    const wb = XLSX.utils.book_new();
    const isLarge = program === 'large';
    const dateStr = new Date().toLocaleDateString('en-US');

    if (isLarge) {
      // Sheet 1: Customer Information
      const custData = [
        ['Rocky Mountain Power - Large Non-Prescriptive Lighting Application'],
        [],
        ['PARTICIPANT INFORMATION'],
        ['Business Name:', appFields.businessName || projectName],
        ['Address:', saveAddress],
        ['City/State/ZIP:', [saveCity, saveState, saveZip].filter(Boolean).join(', ')],
        ['Contact Name:', appFields.contactName],
        ['Phone:', appFields.contactPhone || savePhone],
        ['Email:', appFields.contactEmail || saveEmail],
        ['Building Type:', appFields.buildingType],
        ['Participant is:', appFields.participantIs],
        [],
        ['VENDOR INFORMATION'],
        ['Vendor Name:', appFields.vendorName],
        ['Address:', appFields.vendorAddress],
        ['Contact:', appFields.vendorContact],
        ['Phone:', appFields.vendorPhone],
        [],
        ['PAYEE INFORMATION'],
        ['Payee Name:', appFields.payeeName || appFields.vendorName],
        ['Address:', appFields.payeeAddress],
        ['City/State/ZIP:', [appFields.payeeCity, appFields.payeeState, appFields.payeeZip].filter(Boolean).join(', ')],
        [],
        ['OPERATING SCHEDULE'],
        ['Hours per day:', operatingHours],
        ['Days per year:', daysPerYear],
        ['Annual Operating Hours:', operatingHours * daysPerYear],
        [],
        ['Date of Application:', dateStr],
      ];
      const custSheet = XLSX.utils.aoa_to_sheet(custData);
      custSheet['!cols'] = [{ wch: 22 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, custSheet, 'Customer Information');

      // Sheet 2: Project Information
      const projHeader = ['Item #', 'Location Description', 'Existing Fixture Type', 'Existing Wattage', 'Qty', 'Proposed Fixture', 'Proposed Wattage', 'Watts Reduced', 'Controls', 'kWh Savings', 'Fixture Incentive', 'Controls Incentive', 'Total Incentive'];
      const projRows = results.map((r, i) => {
        const annualHrs = operatingHours * daysPerYear;
        const kwhSaved = ((r.existW - r.newW) * r.qty * annualHrs) / 1000;
        return [i + 1, r.name || r.fixtureCategory || 'Fixture', r.lightingType || 'Conventional', r.existW, r.qty, r.productName || 'LED', r.newW, r.calc.wattsReduced, r.controlsType, Math.round(kwhSaved), r.calc.fixtureIncentive, r.calc.controlsIncentive, r.calc.totalIncentive];
      });
      const projTotals = ['', 'TOTALS', '', totals.existWatts, results.reduce((s, r) => s + r.qty, 0), '', totals.newWatts, totals.wattsReduced, '', Math.round(financials.annualKwhSaved), totals.fixtureIncentive, totals.controlsIncentive, totals.totalIncentive];
      const projData = [projHeader, ...projRows, [], projTotals];
      const projSheet = XLSX.utils.aoa_to_sheet(projData);
      projSheet['!cols'] = [{ wch: 6 }, { wch: 28 }, { wch: 18 }, { wch: 12 }, { wch: 6 }, { wch: 24 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 14 }, { wch: 14 }, { wch: 14 }];
      XLSX.utils.book_append_sheet(wb, projSheet, 'Project Information');

      // Sheet 3: Processing summary
      const procData = [
        ['MEASURE SUMMARY'],
        [],
        ['Measure', 'Quantity', 'Total Watts Reduced', 'Total kWh Saved', 'Total Incentive'],
        ['Interior Lighting Fixtures', results.filter(r => r.location === 'interior').reduce((s, r) => s + r.qty, 0), results.filter(r => r.location === 'interior').reduce((s, r) => s + r.calc.wattsReduced, 0), '', results.filter(r => r.location === 'interior').reduce((s, r) => s + r.calc.totalIncentive, 0)],
        ['Exterior Lighting Fixtures', results.filter(r => r.location === 'exterior').reduce((s, r) => s + r.qty, 0), results.filter(r => r.location === 'exterior').reduce((s, r) => s + r.calc.wattsReduced, 0), '', results.filter(r => r.location === 'exterior').reduce((s, r) => s + r.calc.totalIncentive, 0)],
        [],
        ['COST SUMMARY'],
        ['Material Cost:', appFields.materialCost],
        ['Labor Cost:', appFields.laborCost],
        ['Other Cost:', appFields.otherCost],
        ['Total Project Cost:', effectiveProjectCost],
        ['Estimated Incentive:', estimatedRebate],
        ['Net Customer Cost:', financials.netProjectCost],
      ];
      const procSheet = XLSX.utils.aoa_to_sheet(procData);
      procSheet['!cols'] = [{ wch: 28 }, { wch: 12 }, { wch: 18 }, { wch: 16 }, { wch: 16 }];
      XLSX.utils.book_append_sheet(wb, procSheet, 'Processing');
    } else {
      // Express / SMBE format
      const custData = [
        [`Rocky Mountain Power - ${program === 'smbe' ? 'Small/Medium Business' : 'Standard'} Express Application`],
        [],
        ['CUSTOMER / SITE INFORMATION'],
        ['Business Name:', appFields.businessName || projectName],
        ['Contact Name:', appFields.contactName],
        ['Contact Email:', appFields.contactEmail || saveEmail],
        ['Business Type:', appFields.businessType],
        ['Rate Schedule:', appFields.rateSchedule],
        ['State:', saveState],
        ['SMBE Eligible:', appFields.smbeEligible],
        ['Date of Application:', dateStr],
        [],
        ['COST INFORMATION'],
        ['Material Cost:', appFields.materialCost],
        ['Labor Cost:', appFields.laborCost],
        ['Other Cost:', appFields.otherCost],
        ['Total Project Cost:', effectiveProjectCost],
        ['Estimated Incentive:', estimatedRebate],
        ['Net Customer Cost:', financials.netProjectCost],
      ];
      const custSheet = XLSX.utils.aoa_to_sheet(custData);
      custSheet['!cols'] = [{ wch: 22 }, { wch: 40 }];
      XLSX.utils.book_append_sheet(wb, custSheet, 'Customer-Site Info');

      // Line items
      const header = ['Item #', 'Business Type', 'SMBE Eligible', 'Location Description', 'Existing Fixture Type', 'Fixture Category', 'Fixture Wattage (Existing)', 'Qty', 'New Wattage', 'Watts Reduced', 'Controls', 'kWh Savings', 'Incentive'];
      const rows = results.map((r, i) => {
        const annualHrs = operatingHours * daysPerYear;
        const kwhSaved = ((r.existW - r.newW) * r.qty * annualHrs) / 1000;
        return [i + 1, appFields.businessType, appFields.smbeEligible, r.name || r.fixtureCategory || 'Fixture', r.lightingType || 'Conventional', r.fixtureCategory, r.existW, r.qty, r.newW, r.calc.wattsReduced, r.controlsType, Math.round(kwhSaved), r.calc.totalIncentive];
      });
      const totalsRow = ['', '', '', 'TOTALS', '', '', totals.existWatts, results.reduce((s, r) => s + r.qty, 0), totals.newWatts, totals.wattsReduced, '', Math.round(financials.annualKwhSaved), estimatedRebate];
      const lineData = [header, ...rows, [], totalsRow];
      const lineSheet = XLSX.utils.aoa_to_sheet(lineData);
      lineSheet['!cols'] = [{ wch: 6 }, { wch: 14 }, { wch: 10 }, { wch: 28 }, { wch: 18 }, { wch: 16 }, { wch: 16 }, { wch: 6 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, lineSheet, 'Line Items');
    }

    const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const fileName = `RMP_Application_${(projectName || 'Project').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    downloadBlob(blob, fileName);
    showToast('XLS generated', '\uD83D\uDCCA');
  };

  // ---- GENERATE W9 PDF ----
  const generateW9PDF = async () => {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([612, 792]);
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const black = rgb(0, 0, 0);
    const gray = rgb(0.4, 0.4, 0.4);
    let y = 750;
    const lm = 50;

    const drawText = (text, x, yy, size = 10, f = font, color = black) => {
      page.drawText(text, { x, y: yy, size, font: f, color });
    };

    // Header
    drawText('Form W-9', lm, y, 18, fontBold);
    drawText('Request for Taxpayer Identification Number and Certification', lm + 100, y, 10, font, gray);
    y -= 20;
    drawText('(Rev. October 2018) Department of the Treasury - Internal Revenue Service', lm, y, 7, font, gray);
    y -= 20;

    page.drawLine({ start: { x: lm, y }, end: { x: 562, y }, thickness: 1, color: black });
    y -= 15;

    // Line 1: Name
    drawText('1  Name (as shown on your income tax return)', lm, y, 8, font, gray);
    y -= 14;
    drawText(w9Fields.name || '', lm + 5, y, 11, fontBold);
    y -= 5;
    page.drawLine({ start: { x: lm, y }, end: { x: 562, y }, thickness: 0.5, color: gray });
    y -= 15;

    // Line 2: Business name
    drawText('2  Business name/disregarded entity name, if different from above', lm, y, 8, font, gray);
    y -= 14;
    drawText(w9Fields.businessName || '', lm + 5, y, 11, font);
    y -= 5;
    page.drawLine({ start: { x: lm, y }, end: { x: 562, y }, thickness: 0.5, color: gray });
    y -= 15;

    // Line 3: Tax classification
    drawText('3  Check appropriate box for federal tax classification:', lm, y, 8, font, gray);
    y -= 14;
    const taxOpts = ['Individual/Sole Proprietor', 'C Corporation', 'S Corporation', 'Partnership', 'Trust/Estate', 'LLC', 'Other'];
    let tx = lm + 5;
    taxOpts.forEach(opt => {
      const isChecked = w9Fields.taxClass === opt;
      page.drawRectangle({ x: tx, y: y - 2, width: 8, height: 8, borderColor: black, borderWidth: 0.5, color: isChecked ? rgb(0, 0, 0) : rgb(1, 1, 1) });
      drawText(opt, tx + 11, y, 7, font);
      tx += font.widthOfTextAtSize(opt, 7) + 20;
      if (tx > 480) { tx = lm + 5; y -= 14; }
    });
    y -= 20;

    // Line 5: Address
    drawText('5  Address (number, street, and apt. or suite no.)', lm, y, 8, font, gray);
    y -= 14;
    drawText(w9Fields.address || '', lm + 5, y, 11, font);
    y -= 5;
    page.drawLine({ start: { x: lm, y }, end: { x: 562, y }, thickness: 0.5, color: gray });
    y -= 15;

    // Line 6: City, state, ZIP
    drawText('6  City, state, and ZIP code', lm, y, 8, font, gray);
    y -= 14;
    drawText(w9Fields.cityStateZip || '', lm + 5, y, 11, font);
    y -= 5;
    page.drawLine({ start: { x: lm, y }, end: { x: 562, y }, thickness: 0.5, color: gray });
    y -= 25;

    // Part I: TIN
    drawText('Part I', lm, y, 12, fontBold);
    drawText('Taxpayer Identification Number (TIN)', lm + 50, y, 10, fontBold);
    y -= 16;
    drawText('Social security number:', lm, y, 9, font, gray);
    drawText(w9Fields.ssn || '___-__-____', lm + 130, y, 11, fontBold);
    y -= 14;
    drawText('or Employer identification number:', lm, y, 9, font, gray);
    drawText(w9Fields.ein || '__-_______', lm + 180, y, 11, fontBold);
    y -= 25;

    // Part II: Certification
    drawText('Part II', lm, y, 12, fontBold);
    drawText('Certification', lm + 55, y, 10, fontBold);
    y -= 14;
    const certText = 'Under penalties of perjury, I certify that: (1) The number shown on this form is my correct taxpayer identification number, (2) I am not subject to backup withholding, (3) I am a U.S. citizen or other U.S. person, and (4) The FATCA code(s) entered on this form (if any) indicating that I am exempt from FATCA reporting is correct.';
    const certLines = [];
    let currentLine = '';
    certText.split(' ').forEach(word => {
      const test = currentLine ? `${currentLine} ${word}` : word;
      if (font.widthOfTextAtSize(test, 8) < 500) currentLine = test;
      else { certLines.push(currentLine); currentLine = word; }
    });
    if (currentLine) certLines.push(currentLine);
    certLines.forEach(cl => { drawText(cl, lm, y, 8, font, gray); y -= 11; });
    y -= 10;

    // Signature
    drawText('Signature:', lm, y, 10, fontBold);
    if (signatureData) {
      try {
        const sigBytes = Uint8Array.from(atob(signatureData.split(',')[1]), c => c.charCodeAt(0));
        const sigImg = await pdfDoc.embedPng(sigBytes);
        const sigDims = sigImg.scale(0.3);
        page.drawImage(sigImg, { x: lm + 70, y: y - 15, width: Math.min(sigDims.width, 200), height: Math.min(sigDims.height, 40) });
      } catch (_) {}
    }
    drawText(`Date: ${new Date().toLocaleDateString('en-US')}`, 400, y, 10, font);

    const pdfBytes = await pdfDoc.save();
    const blob = new Blob([pdfBytes], { type: 'application/pdf' });
    const fileName = `W9_${(projectName || 'Form').replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().slice(0, 10)}.pdf`;
    downloadBlob(blob, fileName);
    showToast('W9 PDF generated', '\uD83D\uDCC4');
  };

  // ---- ATTACH ALL TO LEAD ----
  const attachToLead = async () => {
    if (!savedLeadId) { showToast('Save the project first', '\u26A0\uFE0F'); return; }
    setAttachingFiles(true);
    try {
      const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
      const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const files = [];

      // Generate PDF blob
      // We reuse generatePDF logic but capture the blob
      const pdfBlob = generatePDFBlob();
      if (pdfBlob) files.push({ blob: pdfBlob, name: `Energy_Scout_Audit_${(projectName || 'Project').replace(/[^a-zA-Z0-9]/g, '_')}.pdf`, type: 'application/pdf' });

      // Generate XLS blob
      const wb = generateXLSWorkbook();
      if (wb) {
        const buf = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
        const xlsBlob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        files.push({ blob: xlsBlob, name: `RMP_Application_${(projectName || 'Project').replace(/[^a-zA-Z0-9]/g, '_')}.xlsx`, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      }

      // Upload each file
      for (let fi = 0; fi < files.length; fi++) {
        const f = files[fi];
        const formData = new FormData();
        formData.append('file', f.blob, f.name);
        formData.append('leadId', savedLeadId);
        formData.append('fileName', f.name);
        formData.append('fileType', f.type);
        formData.append('bucket', 'project-documents');
        // On last file, also update lead status to Won
        if (fi === files.length - 1) formData.append('updateStatus', 'Won');
        await fetch(`${SUPABASE_URL}/functions/v1/lenard-attach-file`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${SUPABASE_ANON}` },
          body: formData,
        });
      }
      showToast(`${files.length} files attached \u2022 Lead marked Won`, '\u2713');
    } catch (err) {
      console.error('Attach error:', err);
      showToast('Could not attach files', '\u26A0\uFE0F');
    }
    setAttachingFiles(false);
  };

  // Helper: generate XLS workbook (reusable)
  const generateXLSWorkbook = () => {
    const wb = XLSX.utils.book_new();
    const isLarge = program === 'large';
    const dateStr = new Date().toLocaleDateString('en-US');

    if (isLarge) {
      const custData = [['Rocky Mountain Power - Large Non-Prescriptive Lighting Application'], [], ['PARTICIPANT INFORMATION'], ['Business Name:', appFields.businessName || projectName], ['Address:', saveAddress], ['City/State/ZIP:', [saveCity, saveState, saveZip].filter(Boolean).join(', ')], ['Contact Name:', appFields.contactName], ['Phone:', appFields.contactPhone || savePhone], ['Email:', appFields.contactEmail || saveEmail], [], ['VENDOR INFORMATION'], ['Vendor Name:', appFields.vendorName], [], ['OPERATING SCHEDULE'], ['Hours per day:', operatingHours], ['Days per year:', daysPerYear], ['Date:', dateStr]];
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(custData), 'Customer Information');

      const projHeader = ['Item #', 'Location', 'Existing Type', 'Exist W', 'Qty', 'Proposed', 'New W', 'W Reduced', 'Controls', 'kWh Saved', 'Incentive'];
      const projRows = results.map((r, i) => [i + 1, r.name || 'Fixture', r.lightingType || '', r.existW, r.qty, r.productName || 'LED', r.newW, r.calc.wattsReduced, r.controlsType, Math.round(((r.existW - r.newW) * r.qty * operatingHours * daysPerYear) / 1000), r.calc.totalIncentive]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([projHeader, ...projRows]), 'Project Information');
    } else {
      const header = ['Item #', 'Location', 'Existing Type', 'Exist W', 'Qty', 'New W', 'W Reduced', 'Controls', 'kWh Saved', 'Incentive'];
      const rows = results.map((r, i) => [i + 1, r.name || 'Fixture', r.lightingType || '', r.existW, r.qty, r.newW, r.calc.wattsReduced, r.controlsType, Math.round(((r.existW - r.newW) * r.qty * operatingHours * daysPerYear) / 1000), r.calc.totalIncentive]);
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Customer:', appFields.businessName || projectName], ['Date:', dateStr], ['Program:', programLabel], [], header, ...rows]), 'Application');
    }
    return wb;
  };

  // Helper: generate PDF blob (for attaching)
  const generatePDFBlob = () => {
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'letter' });
      // simplified version - just has title + line items for attachment
      doc.setFontSize(16);
      doc.text('Energy Scout Financial Audit', 16, 20);
      doc.setFontSize(10);
      doc.text(`Customer: ${projectName || 'N/A'}`, 16, 30);
      doc.text(`Program: ${programLabel}`, 16, 36);
      doc.text(`Estimated Rebate: $${estimatedRebate.toLocaleString()}`, 16, 42);
      doc.text(`Date: ${new Date().toLocaleDateString('en-US')}`, 16, 48);
      return doc.output('blob');
    } catch (_) { return null; }
  };

  // Audible click + haptic
  const playClick = useCallback(() => {
    try { const ctx = new (window.AudioContext || window.webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.connect(gain); gain.connect(ctx.destination); osc.frequency.value = 1200; gain.gain.value = 0.08; osc.start(); osc.stop(ctx.currentTime + 0.04); } catch (_) {}
    try { navigator.vibrate?.(50); } catch (_) {}
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

  const programLabel = program === 'smbe' ? 'RMP Small/Medium Business Express' : program === 'express' ? 'RMP Standard Express' : 'RMP Large Non-Prescriptive';
  const programDesc = program === 'smbe' ? SMBE.desc : program === 'express' ? EXPRESS.desc : LARGE.desc;

  // ==================== RENDER ====================
  // ==================== RENDER ====================
  return (
    <div style={{ maxWidth: '480px', margin: '0 auto', background: T.bg, minHeight: '100vh', fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif", color: T.text, paddingBottom: '20px' }}>

      {/* ===== TOAST ===== */}
      {toast && (
        <div style={{ position: 'fixed', top: '12px', left: '50%', transform: 'translateX(-50%)', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '12px', padding: '10px 18px', zIndex: 100, display: 'flex', alignItems: 'center', gap: '8px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)', animation: 'toastSlide 0.25s ease-out', fontSize: '14px', fontWeight: '500', color: T.text, maxWidth: '90%' }}>
          <span>{toast.icon}</span><span>{toast.message}</span>
        </div>
      )}
      <style>{`@keyframes toastSlide { from { opacity: 0; transform: translateX(-50%) translateY(-16px); } to { opacity: 1; transform: translateX(-50%) translateY(0); } }`}</style>

      {/* ===== STICKY HEADER ===== */}
      <div style={{ position: 'sticky', top: 0, zIndex: 40, background: T.bg, borderBottom: `1px solid ${T.border}`, padding: '12px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
          <div>
            <div style={{ fontSize: '18px', fontWeight: '700', letterSpacing: '-0.5px' }}>
              <span style={{ color: T.accent }}>Lenard</span> UT RMP
            </div>
            <div style={{ fontSize: '11px', color: T.textMuted }}>{programDesc}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            {estimatedRebate > 0 && <div style={{ ...S.money, fontSize: '20px' }}>${estimatedRebate.toLocaleString()}</div>}
            <button onClick={() => { setShowProjects(true); loadProjects(leadOwnerId); }} style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: '8px', padding: '6px 10px', color: T.textSec, cursor: 'pointer', fontSize: '13px' }}>{'\uD83D\uDCC1'}</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', background: T.bgInput, borderRadius: '10px', padding: '3px' }}>
          {[{ id: 'smbe', label: '\u26A1 SMBE' }, { id: 'express', label: '\uD83C\uDFE2 Express' }, { id: 'large', label: '\uD83C\uDFED Large' }].map(p => (
            <button key={p.id} onClick={() => setProgram(p.id)} style={{
              flex: 1, padding: '8px', background: program === p.id ? T.accent : 'transparent',
              color: program === p.id ? '#fff' : T.textSec, border: 'none', borderRadius: '8px',
              fontSize: '12px', fontWeight: '600', cursor: 'pointer', transition: 'all 0.2s',
            }}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* ===== LEAD OWNER SELECTOR ===== */}
      <div style={{ padding: '12px 16px 0' }}>
        {!leadOwnerId ? (
          <div style={{ background: T.accentDim, border: `1px solid ${T.accent}`, borderRadius: '12px', padding: '14px' }}>
            <div style={{ fontSize: '14px', fontWeight: '700', color: T.accent, marginBottom: '8px' }}>Who are you?</div>
            <div style={{ fontSize: '12px', color: T.textSec, marginBottom: '10px' }}>Select your name to see your audits and save new ones under your account</div>
            {employees.length === 0 && <div style={{ fontSize: '12px', color: T.textMuted, textAlign: 'center', padding: '8px' }}>Loading team members...</div>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              {employees.map(emp => (
                <button key={emp.id} onClick={() => { selectLeadOwner(String(emp.id), emp.name); loadProjects(String(emp.id)); }}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '8px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: '600', color: T.text }}>{emp.name}</div>
                    {emp.role && <div style={{ fontSize: '11px', color: T.textMuted }}>{emp.role}{emp.business_unit ? ` \u2022 ${emp.business_unit}` : ''}</div>}
                  </div>
                  <div style={{ fontSize: '14px', color: T.accent }}>{'\u25B8'}</div>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '14px', fontWeight: '700', color: '#fff' }}>
                {leadOwnerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: T.text }}>{leadOwnerName}</div>
                <div style={{ fontSize: '10px', color: T.textMuted }}>Lead Owner</div>
              </div>
            </div>
            <button onClick={() => { setLeadOwnerId(null); setLeadOwnerName(''); try { localStorage.removeItem('lenard_lead_owner_id'); localStorage.removeItem('lenard_lead_owner_name'); } catch (_) {} }}
              style={{ background: 'none', border: `1px solid ${T.border}`, borderRadius: '6px', padding: '4px 10px', color: T.textMuted, cursor: 'pointer', fontSize: '11px' }}>Switch</button>
          </div>
        )}
      </div>

      {/* ===== MY RECENT AUDITS ===== */}
      {leadOwnerId && lines.length === 0 && projects.length > 0 && !cameraLoading && (
        <div style={{ padding: '8px 16px' }}>
          <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>My Recent Audits</div>
          {projects.slice(0, 5).map(p => (
            <button key={p.id} onClick={() => loadProject(p)} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '10px', color: T.text, cursor: 'pointer', marginBottom: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>{p.customerName}</div>
                  <div style={{ fontSize: '10px', color: T.textMuted }}>{new Date(p.createdAt).toLocaleDateString()} {'\u2022'} {p.status}</div>
                </div>
                {p.audit?.estimated_rebate > 0 && <div style={{ ...S.money, fontSize: '14px' }}>${Math.round(p.audit.estimated_rebate).toLocaleString()}</div>}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* ===== PROJECT NAME ===== */}
      <div style={{ padding: '12px 16px 4px' }}>
        <input type="text" value={projectName} onChange={e => { setProjectName(e.target.value); markDirty(); }} placeholder="Project / Customer Name"
          style={{ ...S.input, background: 'transparent', border: 'none', borderBottom: `1px solid ${T.border}`, borderRadius: 0, padding: '8px 0', fontSize: '15px', fontWeight: '500' }} />
      </div>

      {/* ===== ACTION BUTTONS ===== */}
      <div style={{ padding: '10px 16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <button onClick={openCamera} disabled={cameraLoading} style={{ width: '100%', padding: '14px 16px', background: cameraLoading ? T.bgInput : T.blue, color: cameraLoading ? T.textMuted : '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', boxShadow: cameraLoading ? 'none' : '0 2px 8px rgba(59,130,246,0.35)' }}>
          {cameraLoading ? '\u23F3 Analyzing...' : '\uD83D\uDCF7 Scan Fixtures with Camera'}
        </button>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button onClick={() => setShowQuickAdd(true)} style={{ ...S.btnGhost, flex: 1, fontSize: '13px' }}>{'\u26A1'} Quick Add</button>
          <button onClick={() => addLine()} style={{ ...S.btnGhost, flex: 1, fontSize: '13px' }}>{'\uFF0B'} Add Line</button>
        </div>
      </div>

      {/* ===== FINANCIAL SETTINGS + PROJECT COST ===== */}
      <div style={{ padding: '0 16px', marginBottom: '4px' }}>
        <button onClick={() => setShowFinancials(!showFinancials)} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: T.bgCard, border: `1px solid ${T.border}`, borderRadius: '10px', color: T.textSec, cursor: 'pointer', fontSize: '12px', fontWeight: '500' }}>
          <span>{'\u2699\uFE0F'} Financial Settings</span>
          <span style={{ fontSize: '11px', color: T.textMuted }}>{operatingHours}h/day {'\u2022'} {daysPerYear}d/yr {'\u2022'} ${energyRate}/kWh {showFinancials ? '\u25B4' : '\u25BE'}</span>
        </button>
        {showFinancials && (
          <div style={{ ...S.card, marginTop: '6px', marginBottom: 0 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginBottom: '10px' }}>
              <div><label style={S.label}>Hours/Day</label><input type="number" inputMode="decimal" value={operatingHours || ''} onChange={e => { setOperatingHours(e.target.value === '' ? 0 : parseFloat(e.target.value)); markDirty(); }} style={S.input} /></div>
              <div><label style={S.label}>Days/Year</label><input type="number" inputMode="numeric" value={daysPerYear || ''} onChange={e => { setDaysPerYear(e.target.value === '' ? 0 : parseInt(e.target.value)); markDirty(); }} style={S.input} /></div>
              <div><label style={S.label}>$/kWh</label><input type="number" inputMode="decimal" step="0.01" value={energyRate || ''} onChange={e => { setEnergyRate(e.target.value === '' ? 0 : parseFloat(e.target.value)); markDirty(); }} style={S.input} /></div>
            </div>
            <div>
              <label style={S.label}>Project Cost $ (for cap calculation)</label>
              <input type="number" inputMode="decimal" step="0.01" value={projectCost || ''} onChange={e => { setProjectCost(e.target.value === '' ? 0 : parseFloat(e.target.value)); markDirty(); }} placeholder="Total project cost" style={S.input} />
              {projectCost > 0 && <div style={{ fontSize: '11px', color: T.textMuted, marginTop: '4px' }}>Cap: {Math.round(capPct * 100)}% = ${capAmount.toLocaleString()}</div>}
            </div>
          </div>
        )}
      </div>

      {/* ===== RATE INFO (when no lines) ===== */}
      {results.length === 0 && !cameraLoading && (
        <div style={{ margin: '8px 16px', padding: '12px', background: T.blueDim, border: `1px solid ${T.blue}`, borderRadius: '10px' }}>
          <div style={{ fontSize: '13px', fontWeight: '600', color: T.blue, marginBottom: '6px' }}>{programLabel} Rates</div>
          {program === 'large' ? (
            <div style={{ fontSize: '12px', color: T.textSec, lineHeight: '1.6' }}>
              Interior Fixture: <span style={{ color: T.text }}>$0.60-$1.20/W reduced</span><br/>
              Interior Controls: <span style={{ color: T.text }}>$0.15-$0.75/W reduced</span><br/>
              Exterior Fixture: <span style={{ color: T.text }}>$0.35-$0.70/W reduced</span><br/>
              Cap: <span style={{ color: T.accent }}>70% of project cost</span>
            </div>
          ) : (
            <div style={{ fontSize: '12px', color: T.textSec, lineHeight: '1.6' }}>
              Interior (no controls): <span style={{ color: T.text }}>${program === 'smbe' ? '1.50' : '0.75'}/new watt</span><br/>
              Interior (Plug & Play): <span style={{ color: T.text }}>${program === 'smbe' ? '2.00' : '1.00'}/new watt</span><br/>
              Interior (Networked): <span style={{ color: T.text }}>${program === 'smbe' ? '2.50' : '1.25'}/new watt</span><br/>
              Interior (LLLC): <span style={{ color: T.text }}>${program === 'smbe' ? '3.50' : '1.75'}/new watt</span><br/>
              Exterior: <span style={{ color: T.text }}>${program === 'smbe' ? '2.40' : '1.20'}/new watt (\u2264285W)</span><br/>
              Cap: <span style={{ color: T.accent }}>{program === 'smbe' ? '75' : '70'}% of project cost</span>
            </div>
          )}
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

      {/* ===== LINE ITEMS ===== */}
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
          const rate = getRate(program, r);
          const ctrlOpts = getControlsOptions(program, r.location);
          const ctrlLabel = ctrlOpts.find(o => o.id === r.controlsType)?.label || r.controlsType;
          return (
            <div key={r.id} style={{ ...S.card, borderColor: isExp ? T.accent : isNew ? T.green : T.border, borderLeft: `3px solid ${isExp ? T.accent : hasRebate ? T.green : T.border}`, transition: 'border-color 0.3s ease' }}>
              <div onClick={() => setExpandedLine(isExp ? null : r.id)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: '600', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.name || `${r.location === 'interior' ? 'Interior' : 'Exterior'} Fixture`}
                  </div>
                  <div style={{ fontSize: '11px', color: T.textSec, marginTop: '2px' }}>{r.location === 'interior' ? 'Int' : 'Ext'} {'\u2022'} {ctrlLabel} {'\u2022'} ${rate}/W {r.height ? `\u2022 ${r.height}ft` : ''}{r.confirmed ? ' \u2713' : ''}</div>
                  <div style={{ fontSize: '12px', color: T.textMuted, marginTop: '2px' }}>{r.qty}{'\u00D7'} | {r.existW > 0 ? `${r.existW}W \u2192 ` : ''}{r.newW}W{r.existW > 0 ? ` | \u2212${r.calc.wattsReduced}W` : ''}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0, marginLeft: '12px' }}>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ ...S.money, fontSize: '16px' }}>${r.calc.totalIncentive.toLocaleString()}</div>
                    {r.calc.controlsIncentive > 0 && <div style={{ fontSize: '10px', color: T.blue }}>+${r.calc.controlsIncentive} ctrl</div>}
                  </div>
                  <div style={{ fontSize: '14px', color: T.textMuted, transition: 'transform 0.2s', transform: isExp ? 'rotate(90deg)' : 'none' }}>{'\u25B8'}</div>
                </div>
              </div>

              {isExp && (
                <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: `1px solid ${T.border}` }}>
                  {/* Location toggle */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Location</label>
                    <div style={{ display: 'flex', gap: '4px', background: T.bgInput, borderRadius: '8px', padding: '3px' }}>
                      {['interior', 'exterior'].map(loc => (
                        <button key={loc} onClick={() => { updateLine(r.id, 'location', loc); updateLine(r.id, 'controlsType', 'none'); }} style={{ flex: 1, padding: '6px', background: r.location === loc ? T.accent : 'transparent', color: r.location === loc ? '#fff' : T.textSec, border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>
                          {loc === 'interior' ? 'Interior' : 'Exterior'}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Controls dropdown */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Controls Level</label>
                    <select value={r.controlsType} onChange={e => updateLine(r.id, 'controlsType', e.target.value)} style={S.select}>
                      {ctrlOpts.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                    </select>
                  </div>

                  {/* Large: Controls Only toggle */}
                  {program === 'large' && (
                    <div style={{ marginBottom: '12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <button onClick={() => updateLine(r.id, 'controlsOnly', !r.controlsOnly)} style={{ width: '44px', height: '24px', borderRadius: '12px', background: r.controlsOnly ? T.accent : T.bgInput, border: `1px solid ${r.controlsOnly ? T.accent : T.border}`, cursor: 'pointer', position: 'relative', transition: 'all 0.2s', flexShrink: 0, padding: 0 }}>
                          <div style={{ width: '18px', height: '18px', borderRadius: '9px', background: '#fff', position: 'absolute', top: '2px', left: r.controlsOnly ? '22px' : '2px', transition: 'left 0.2s' }} />
                        </button>
                        <span style={{ fontSize: '13px', color: T.textSec }}>Add Controls-Only Incentive</span>
                      </div>
                      {r.controlsOnly && (
                        <select value={r.controlsOnlyType} onChange={e => updateLine(r.id, 'controlsOnlyType', e.target.value)} style={{ ...S.select, marginTop: '6px' }}>
                          {getControlsOnlyOptions(r.location).map(o => <option key={o.id} value={o.id}>{o.label} â€” ${o.rate}/W</option>)}
                        </select>
                      )}
                    </div>
                  )}

                  {/* Area Name */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Area Name *</label>
                    <input type="text" value={r.name} onChange={e => updateLine(r.id, 'name', e.target.value)} placeholder="e.g., Warehouse Bay 1, Office, Parking Lot" style={S.input} />
                  </div>

                  {/* Fixture Category, Lighting Type, Height */}
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
                      <input type="number" inputMode="numeric" value={r.height || ''} onChange={e => updateLine(r.id, 'height', parseInt(e.target.value) || 0)} style={S.input} />
                    </div>
                  </div>

                  {/* Fixture Count */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Fixture Count *</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0', maxWidth: '240px' }}>
                      <button type="button" onClick={() => { playClick(); updateLine(r.id, 'qty', Math.max(1, (r.qty || 1) - 1)); }} style={{ width: '52px', height: '48px', borderRadius: '10px 0 0 10px', border: `2px solid ${T.accent}`, borderRight: 'none', background: T.accentDim, color: T.accent, fontSize: '24px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', padding: 0 }}>{'\u2212'}</button>
                      <input type="number" min="1" inputMode="numeric" value={r.qty || ''} onChange={e => updateLine(r.id, 'qty', e.target.value === '' ? 1 : (parseInt(e.target.value) || 1))} style={{ flex: 1, minWidth: 0, height: '48px', border: `2px solid ${T.border}`, borderLeft: 'none', borderRight: 'none', background: T.bgInput, color: T.text, fontSize: '22px', fontWeight: '700', textAlign: 'center', MozAppearance: 'textfield', WebkitAppearance: 'none', outline: 'none', boxSizing: 'border-box' }} />
                      <button type="button" onClick={() => { playClick(); updateLine(r.id, 'qty', (r.qty || 0) + 1); }} style={{ width: '52px', height: '48px', borderRadius: '0 10px 10px 0', border: `2px solid ${T.accent}`, borderLeft: 'none', background: T.accent, color: '#fff', fontSize: '24px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', userSelect: 'none', padding: 0 }}>{'\uFF0B'}</button>
                    </div>
                  </div>

                  {/* 2-column: Existing Watts / New Watts — matches AZ audit UI */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                    <div>
                      <label style={S.label}>Existing Watts</label>
                      <input type="number" min="0" inputMode="numeric" value={r.existW || ''} onChange={e => updateLine(r.id, 'existW', e.target.value === '' ? 0 : (parseInt(e.target.value) || 0))} style={S.input} />
                    </div>
                    <div>
                      <label style={S.label}>New LED Watts</label>
                      <input type="number" min="0" inputMode="numeric" value={r.newW || ''} onChange={e => updateLine(r.id, 'newW', e.target.value === '' ? 0 : (parseInt(e.target.value) || 0))} style={S.input} />
                    </div>
                  </div>

                  {/* Quick-select wattage buttons (tap to fill) — matches AZ audit UI */}
                  {r.lightingType && COMMON_WATTAGES[r.lightingType]?.length > 0 && (
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', color: T.textMuted, marginBottom: '6px', display: 'block' }}>Common {r.lightingType} wattages (tap to fill):</label>
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

                  {/* SMBE Product picker */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>SMBE Replacement Product</label>
                    {r.productId ? (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: T.bgInput, border: `1px solid ${T.accent}`, borderRadius: '8px' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: '13px', fontWeight: '600', color: T.text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.productName}</div>
                          <div style={{ fontSize: '11px', color: T.accent }}>Catalog: ${r.productPrice}/unit</div>
                        </div>
                        <button onClick={() => setLines(prev => prev.map(l => l.id === r.id ? { ...l, productId: null, productName: '', productPrice: 0, priceOverride: null } : l))}
                          style={{ background: 'none', border: 'none', color: T.textMuted, cursor: 'pointer', fontSize: '16px', padding: '4px' }}>{'\u2715'}</button>
                      </div>
                    ) : (
                      <div>
                        <input type="text" placeholder={sbeProducts.length > 0 ? 'Search SMBE products...' : 'No SMBE products loaded'} value={expandedLine === r.id ? productSearch : ''} onChange={e => setProductSearch(e.target.value)} onFocus={() => setProductSearch('')} style={S.input} />
                        {expandedLine === r.id && (
                          <div style={{ maxHeight: '200px', overflow: 'auto', border: `1px solid ${T.border}`, borderRadius: '0 0 8px 8px', marginTop: '-1px' }}>
                            {(() => {
                              const q = productSearch.toLowerCase();
                              const ranked = getMatchedProducts(sbeProducts, r.fixtureCategory, r.newW || r.existW);
                              const filtered = q ? ranked.filter(p => (p.name || '').toLowerCase().includes(q) || (p.description || '').toLowerCase().includes(q)) : ranked;
                              const matched = filtered.filter(p => p._score >= 100).slice(0, 8);
                              const other = filtered.filter(p => p._score < 100).slice(0, 8);
                              if (filtered.length === 0) return <div style={{ padding: '10px', fontSize: '12px', color: T.textMuted, textAlign: 'center' }}>No products found</div>;
                              const PRow = ({ p, hl }) => (
                                <button key={p.id} onClick={() => { selectProduct(r.id, p); setProductSearch(''); }}
                                  style={{ width: '100%', textAlign: 'left', padding: '8px 10px', background: T.bgCard, border: 'none', borderBottom: `1px solid ${T.border}`, cursor: 'pointer' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '6px' }}>
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                      <div style={{ fontSize: '12px', fontWeight: '600', color: hl ? T.text : T.textSec }}>{p.name}</div>
                                      {p.description && <div style={{ fontSize: '10px', color: T.textMuted, marginTop: '1px' }}>{p.description}</div>}
                                    </div>
                                    <div style={{ fontSize: '12px', fontWeight: '700', color: hl ? T.accent : T.textMuted, whiteSpace: 'nowrap', flexShrink: 0 }}>{p.unit_price ? `${p.unit_price}` : ''}</div>
                                  </div>
                                </button>
                              );
                              return (<>
                                {matched.length > 0 && <div style={{ padding: '3px 10px', fontSize: '10px', fontWeight: '700', color: T.accent, background: T.accentDim, textTransform: 'uppercase' }}>Recommended for {r.fixtureCategory}</div>}
                                {matched.map(p => <PRow key={p.id} p={p} hl={true} />)}
                                {other.length > 0 && <div style={{ padding: '3px 10px', fontSize: '10px', fontWeight: '700', color: T.textMuted, background: T.bgInput, textTransform: 'uppercase' }}>Other Products</div>}
                                {other.map(p => <PRow key={p.id} p={p} hl={false} />)}
                              </>);
                            })()}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Pricing */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Pricing</label>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '10px', color: T.textMuted, marginBottom: '2px' }}>Unit Price {r.priceOverride != null ? '(override)' : ''}</div>
                        <input type="number" inputMode="decimal" step="0.01" placeholder={r.productPrice ? `${r.productPrice} catalog` : 'Unit price'} value={r.priceOverride != null ? r.priceOverride : ''} onChange={e => updateLine(r.id, 'priceOverride', e.target.value === '' ? null : parseFloat(e.target.value) || 0)} style={{ ...S.input, borderColor: r.priceOverride != null ? T.accent : T.border }} />
                      </div>
                      <div>
                        <div style={{ fontSize: '10px', color: T.textMuted, marginBottom: '2px' }}>Discount %</div>
                        <input type="number" inputMode="numeric" min="0" max="100" placeholder="0" value={r.discount || ''} onChange={e => updateLine(r.id, 'discount', Math.min(100, Math.max(0, parseInt(e.target.value) || 0)))} style={{ ...S.input, borderColor: r.discount > 0 ? T.green : T.border }} />
                      </div>
                    </div>
                    {(() => {
                      const eff = getEffectivePrice(r);
                      const lineTotal = eff * (r.qty || 0);
                      if (eff <= 0) return null;
                      return (
                        <div style={{ fontSize: '11px', marginTop: '4px', color: T.textSec }}>
                          {r.discount > 0 && <span style={{ color: T.green }}>{r.discount}% off: </span>}
                          <span style={{ color: T.accent, fontWeight: '600' }}>${eff.toFixed(2)}/unit</span>
                          <span> {'\u00D7'} {r.qty} = </span>
                          <span style={{ fontWeight: '700', color: T.accent }}>${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                        </div>
                      );
                    })()}
                  </div>

                  {/* Notes + Confirmed */}
                  <div style={{ marginBottom: '12px' }}>
                    <label style={S.label}>Notes</label>
                    <textarea value={r.overrideNotes || ''} onChange={e => updateLine(r.id, 'overrideNotes', e.target.value)} rows={2} placeholder="Optional notes..." style={{ ...S.input, resize: 'vertical' }} />
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '12px' }}>
                    <input type="checkbox" checked={!!r.confirmed} onChange={e => updateLine(r.id, 'confirmed', e.target.checked)} style={{ width: '18px', height: '18px', accentColor: T.green }} />
                    <span style={{ fontSize: '14px', color: T.text }}>Confirmed</span>
                  </label>

                  {/* Line breakdown */}
                  <div style={{ background: T.bgInput, borderRadius: '8px', padding: '10px', fontSize: '12px', color: T.textSec }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Fixture Incentive</span><span style={S.money}>${r.calc.fixtureIncentive.toLocaleString()}</span></div>
                    {r.calc.controlsIncentive > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}><span>Controls Incentive</span><span style={{ color: T.blue, fontWeight: '600' }}>${r.calc.controlsIncentive}</span></div>}
                    <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: '4px', borderTop: `1px solid ${T.border}` }}><span style={{ fontWeight: '600', color: T.text }}>Line Total</span><span style={{ ...S.money, fontSize: '14px' }}>${r.calc.totalIncentive.toLocaleString()}</span></div>
                  </div>
                  <div style={{ display: 'flex', gap: '8px', marginTop: '10px' }}>
                    <button onClick={() => setExpandedLine(null)} style={{ ...S.btn, flex: 1, fontSize: '13px' }}>Done</button>
                    <button onClick={() => { setExpandedLine(null); setShowSaveModal(true); }} style={{ ...S.btn, flex: 1, fontSize: '13px', background: (savedLeadId && !isDirty) ? T.bgInput : T.blue, color: (savedLeadId && !isDirty) ? T.textMuted : '#fff' }}>{(savedLeadId && !isDirty) ? '\u2713 Saved' : '\uD83D\uDCBE Save'}</button>
                    <button onClick={() => removeLine(r.id)} style={{ ...S.btnGhost, color: T.red, borderColor: T.red, fontSize: '12px', padding: '10px 14px' }}>{'\uD83D\uDDD1'} Remove</button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ===== 30% MINIMUM SAVINGS WARNING ===== */}
      {results.length > 0 && totals.existWatts > 0 && reductionPct < 30 && (
        <div style={{ margin: '8px 16px 0', padding: '10px 14px', background: 'rgba(239,68,68,0.12)', border: '1px solid #ef4444', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '16px' }}>{'\u26A0\uFE0F'}</span>
          <span style={{ fontSize: '12px', color: '#ef4444', fontWeight: '600' }}>Energy savings is only {reductionPct}% {'\u2014'} RMP requires {'\u2265'}30% reduction to qualify</span>
        </div>
      )}

      {/* ===== PROJECT TOTALS ===== */}
      {results.length > 0 && (
        <div style={{ ...S.card, margin: '8px 16px', background: T.accentDim, borderColor: T.accent }}>
          {/* Watts row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', textAlign: 'center', marginBottom: '8px' }}>
            {totals.existWatts > 0 && <div><div style={{ fontSize: '11px', color: T.textMuted }}>EXISTING</div><div style={{ fontSize: '14px', fontWeight: '600' }}>{totals.existWatts.toLocaleString()}W</div></div>}
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>NEW LED</div><div style={{ fontSize: '14px', fontWeight: '600' }}>{totals.newWatts.toLocaleString()}W</div></div>
            {totals.wattsReduced > 0 && <div><div style={{ fontSize: '11px', color: T.textMuted }}>REDUCED</div><div style={{ fontSize: '14px', fontWeight: '600', color: T.green }}>{reductionPct}%</div></div>}
          </div>
          {/* Energy savings */}
          {totals.existWatts > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', textAlign: 'center', marginBottom: '8px', paddingTop: '8px', borderTop: `1px solid ${T.border}` }}>
              <div><div style={{ fontSize: '11px', color: T.textMuted }}>ANNUAL kWh SAVED</div><div style={{ fontSize: '14px', fontWeight: '600' }}>{Math.round(financials.annualKwhSaved).toLocaleString()}</div></div>
              <div><div style={{ fontSize: '11px', color: T.textMuted }}>ANNUAL $ SAVED</div><div style={{ fontSize: '14px', fontWeight: '600', color: T.green }}>${Math.round(financials.annualEnergySavings).toLocaleString()}</div></div>
            </div>
          )}
          {/* Cap info */}
          <div style={{ paddingTop: '8px', borderTop: `1px solid ${T.border}`, marginBottom: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: T.textSec, marginBottom: '4px' }}><span>Raw Incentive Total</span><span>${rawIncentive.toLocaleString()}</span></div>
            {effectiveProjectCost > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: capApplied ? T.accent : T.textSec, marginBottom: '4px' }}><span>Cost Cap ({Math.round(capPct * 100)}%)</span><span>${capAmount.toLocaleString()}{capApplied ? ' \u2022 CAP APPLIED' : ''}</span></div>}
          </div>
          {/* Incentive total + actions */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: '8px', borderTop: `1px solid ${T.border}` }}>
            <div><div style={{ fontSize: '11px', color: T.textMuted }}>ESTIMATED REBATE</div><div style={{ ...S.money, fontSize: '22px' }}>${estimatedRebate.toLocaleString()}</div></div>
            <div style={{ display: 'flex', gap: '6px' }}>
              <button onClick={() => setShowSaveModal(true)} style={{ ...S.btn, fontSize: '12px', padding: '8px 14px', background: (savedLeadId && !isDirty) ? T.bgInput : T.blue, color: (savedLeadId && !isDirty) ? T.textMuted : '#fff' }}>{(savedLeadId && !isDirty) ? '\u2713 Saved' : '\uD83D\uDCBE Save'}</button>
              <button onClick={() => setShowSummary(true)} style={{ ...S.btn, fontSize: '12px', padding: '8px 14px' }}>{'\uD83D\uDCCB'} Summary</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== PROGRAM COMPARISON (SMBE vs Express) ===== */}
      {altComparison && altComparison.diff !== 0 && (
        altComparison.currentIsBetter ? (
          <div style={{ margin: '0 16px 8px', padding: '10px 14px', background: 'rgba(34,197,94,0.10)', border: '1px solid rgba(34,197,94,0.3)', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px' }}>{'\u2705'}</span>
            <span style={{ fontSize: '12px', color: T.green, fontWeight: '600' }}>
              You're on the best program {'\u2014'} {program === 'smbe' ? 'SMBE' : 'Express'} saves you ${Math.abs(altComparison.diff).toLocaleString()} more than {altComparison.altName}
            </span>
          </div>
        ) : (
          <div style={{ margin: '0 16px 8px', padding: '12px 14px', background: T.blueDim, border: `1px solid ${T.blue}`, borderRadius: '10px', animation: 'pulse 2s infinite' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
              <span style={{ fontSize: '14px' }}>{'\uD83D\uDCA1'}</span>
              <span style={{ fontSize: '12px', color: T.blue, fontWeight: '600' }}>
                Switch to {altComparison.altName} for ${Math.abs(altComparison.diff).toLocaleString()} more incentive (${altComparison.altEstimated.toLocaleString()} vs ${estimatedRebate.toLocaleString()})
              </span>
            </div>
            <button
              onClick={() => { keepLinesOnSwitch.current = true; setProgram(altComparison.altName === 'Express' ? 'express' : 'smbe'); }}
              style={{ ...S.btn, width: '100%', fontSize: '12px', padding: '8px', background: T.blue, color: '#fff' }}
            >
              Switch to {altComparison.altName}
            </button>
          </div>
        )
      )}

      {/* ===== QUICK ADD MODAL ===== */}
      {showQuickAdd && (<>
        <div onClick={() => setShowQuickAdd(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', zIndex: 50 }} />
        <div style={{ position: 'fixed', bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '100%', maxWidth: '480px', background: T.bgCard, borderTopLeftRadius: '20px', borderTopRightRadius: '20px', maxHeight: '75vh', overflow: 'auto', zIndex: 51, padding: '20px 16px', boxSizing: 'border-box' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
            <div style={{ fontSize: '16px', fontWeight: '700' }}>{'\u26A1'} Quick Add Preset</div>
            <button onClick={() => setShowQuickAdd(false)} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: '20px', cursor: 'pointer' }}>{'\u2715'}</button>
          </div>
          <div style={{ display: 'flex', gap: '6px', marginBottom: '14px', overflowX: 'auto' }}>
            {Object.entries(PRESETS).map(([key, group]) => (
              <button key={key} onClick={() => setQuickAddTab(key)} style={{ flexShrink: 0, padding: '8px 12px', background: quickAddTab === key ? T.accentDim : T.bgInput, color: quickAddTab === key ? T.accent : T.textSec, border: `1px solid ${quickAddTab === key ? T.accent : T.border}`, borderRadius: '10px', fontSize: '12px', fontWeight: '600', cursor: 'pointer', whiteSpace: 'nowrap' }}>{group.label}</button>
            ))}
          </div>
          {PRESETS[quickAddTab] && PRESETS[quickAddTab].items.map((item, i) => (
            <button key={i} onClick={() => { addLine(item); showToast(`Added ${item.name}`, '\u2713'); setShowQuickAdd(false); }} style={{ width: '100%', textAlign: 'left', padding: '10px 12px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '8px', color: T.text, cursor: 'pointer', marginBottom: '4px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div><div style={{ fontSize: '13px', fontWeight: '500' }}>{item.name}</div><div style={{ fontSize: '11px', color: T.textMuted }}>{item.existW}W {'\u2192'} {item.newW}W {'\u2022'} {item.height}ft</div></div>
              <div style={{ fontSize: '12px', color: T.accent }}>{'\uFF0B'}</div>
            </button>
          ))}
        </div>
      </>)}

      {/* ===== CONTRACT / SUMMARY MODAL ===== */}
      {showSummary && (<>
        <div onClick={() => setShowSummary(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 50 }} />
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, overflow: 'auto', zIndex: 51, padding: '0' }}>
          <div style={{ maxWidth: '520px', margin: '0 auto', background: '#fff', minHeight: '100vh' }}>

            {/* PDF-style Header */}
            <div style={{ background: 'linear-gradient(135deg, #4b6452 0%, #3d5244 100%)', padding: '20px 20px 16px', color: '#fff', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: T.accent }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '22px', fontWeight: '800', letterSpacing: '1px' }}>ENERGY SCOUT</div>
                  <div style={{ fontSize: '11px', opacity: 0.8 }}>by HHH Building Services</div>
                </div>
                <button onClick={() => setShowSummary(false)} style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '50%', width: '32px', height: '32px', color: '#fff', fontSize: '16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{'\u2715'}</button>
              </div>
              <div style={{ marginTop: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                <div>
                  <div style={{ fontSize: '13px', fontWeight: '600' }}>Financial Audit Report</div>
                  <div style={{ fontSize: '11px', opacity: 0.7 }}>{programLabel}{projectName ? ` \u2014 ${projectName}` : ''}</div>
                </div>
                {contractAccepted && <div style={{ background: T.green, borderRadius: '6px', padding: '3px 10px', fontSize: '11px', fontWeight: '700' }}>{'\u2713'} SIGNED</div>}
              </div>
            </div>

            <div style={{ padding: '16px 20px', color: '#1e1e22' }}>

              {/* ===== SECTION 1: Financial Audit Summary ===== */}
              <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent, marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Fixture Schedule</div>
              {results.map(r => (
                <div key={r.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid #eee', fontSize: '12px' }}>
                  <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: '#666' }}>{r.qty}x {r.name || `${r.location} fixture`} {r.height ? `\u2022 ${r.height}ft` : ''}</div>
                  <div style={{ fontWeight: '600', whiteSpace: 'nowrap', marginLeft: '8px', color: '#1e1e22' }}>{r.existW > 0 ? `${r.existW}W \u2192 ` : ''}{r.newW}W <span style={{ color: T.accent, marginLeft: '4px' }}>${r.calc.totalIncentive.toLocaleString()}</span></div>
                </div>
              ))}

              {/* RMP Incentive */}
              <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent, marginTop: '16px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>RMP Incentive</div>
              <div style={{ background: '#f8f8fa', borderRadius: '10px', padding: '12px', border: '1px solid #eee' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginBottom: '4px' }}><span>Fixture Incentive</span><span>${totals.fixtureIncentive.toLocaleString()}</span></div>
                {totals.controlsIncentive > 0 && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginBottom: '4px' }}><span>Controls Incentive</span><span>${totals.controlsIncentive.toLocaleString()}</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginBottom: '4px', paddingTop: '4px', borderTop: '1px solid #eee' }}><span>Raw Total</span><span>${rawIncentive.toLocaleString()}</span></div>
                {capApplied && <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: T.accent, marginBottom: '4px' }}><span>Cost Cap ({Math.round(capPct * 100)}%)</span><span>${capAmount.toLocaleString()} CAP APPLIED</span></div>}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: '800', paddingTop: '8px', borderTop: '1px solid #ddd', color: T.accent }}><span>Estimated Rebate</span><span>${estimatedRebate.toLocaleString()}</span></div>
              </div>

              {/* Energy Analysis */}
              {totals.existWatts > 0 && (<>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent, marginTop: '16px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Energy Analysis</div>
                <div style={{ background: '#f8f8fa', borderRadius: '10px', padding: '12px', border: '1px solid #eee' }}>
                  {[['Current Consumption', `${Math.round(financials.existKwh).toLocaleString()} kWh/yr`], ['Proposed Consumption', `${Math.round(financials.proposedKwh).toLocaleString()} kWh/yr`]].map(([l, v]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginBottom: '4px' }}><span>{l}</span><span>{v}</span></div>)}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', paddingTop: '6px', borderTop: '1px solid #eee' }}><span>Annual kWh Saved</span><span style={{ color: T.green }}>{Math.round(financials.annualKwhSaved).toLocaleString()} kWh ({reductionPct}%)</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', marginTop: '4px' }}><span>Annual Cost Savings</span><span style={{ color: T.green }}>${Math.round(financials.annualEnergySavings).toLocaleString()}/yr</span></div>
                </div>
              </>)}

              {/* Maintenance Analysis */}
              {maintenanceSavings.annualSavings > 0 && (<>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent, marginTop: '16px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Maintenance Analysis</div>
                <div style={{ background: '#f8f8fa', borderRadius: '10px', padding: '12px', border: '1px solid #eee' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginBottom: '4px' }}><span>Annual Existing Maintenance</span><span>${Math.round(maintenanceSavings.existingMaintCost).toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#888', marginBottom: '4px' }}><span>Annual LED Maintenance</span><span>${Math.round(maintenanceSavings.proposedMaintCost).toLocaleString()}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: '700', paddingTop: '6px', borderTop: '1px solid #eee' }}><span>Annual Maintenance Savings</span><span style={{ color: T.green }}>${Math.round(maintenanceSavings.annualSavings).toLocaleString()}/yr</span></div>
                </div>
                <div style={{ fontSize: '10px', color: '#999', marginTop: '6px', lineHeight: '1.4', fontStyle: 'italic' }}>
                  According to the U.S. Department of Energy, LED lighting reduces maintenance costs by 50-80% compared to conventional lighting due to 3-5x longer rated life and improved lumen maintenance. (Source: DOE Solid-State Lighting Program, energy.gov)
                </div>
              </>)}

              {/* Investment Analysis */}
              {financials.projectCost > 0 && (<>
                <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent, marginTop: '16px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Investment Analysis</div>
                <div style={{ background: '#f8f8fa', borderRadius: '10px', padding: '12px', border: '1px solid #eee' }}>
                  {[['Gross Project Cost', `$${financials.projectCost.toLocaleString()}`], ['Less: RMP Incentive', `-$${estimatedRebate.toLocaleString()}`, T.green]].map(([l, v, c]) => <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: c || '#888', marginBottom: '4px' }}><span>{l}</span><span>{v}</span></div>)}
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '14px', fontWeight: '700', paddingTop: '6px', borderTop: '1px solid #eee', marginBottom: '4px' }}><span>Net Investment</span><span>${Math.round(financials.netProjectCost).toLocaleString()}</span></div>
                  {maintenanceSavings.annualSavings > 0 && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: T.green, marginBottom: '4px' }}><span>Total Annual Savings (Energy + Maint.)</span><span>${Math.round(financials.annualEnergySavings + maintenanceSavings.annualSavings).toLocaleString()}</span></div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px', marginTop: '8px' }}>
                    {[
                      ['Payback', financials.simplePayback < 1 ? `${Math.round(financials.simplePayback * 12)}mo` : `${financials.simplePayback.toFixed(1)}yr`, T.accent],
                      ['Annual ROI', `${Math.round(financials.roi)}%`, T.green],
                      ['NPV', `$${Math.round(financials.npv).toLocaleString()}`, financials.npv >= 0 ? T.green : T.red],
                      ['IRR', `${(financials.irr * 100).toFixed(1)}%`, T.green],
                      ['5yr Net', `$${Math.round(financials.fiveYearSavings).toLocaleString()}`, financials.fiveYearSavings >= 0 ? T.green : T.red],
                      ['10yr Net', `$${Math.round(financials.tenYearSavings).toLocaleString()}`, financials.tenYearSavings >= 0 ? T.green : T.red],
                    ].map(([label, val, clr]) => (
                      <div key={label} style={{ background: '#fff', border: '1px solid #eee', borderRadius: '8px', padding: '8px', textAlign: 'center' }}>
                        <div style={{ fontSize: '10px', color: '#999', marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontSize: '16px', fontWeight: '800', color: clr }}>{val}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 10-Year Cash Flow Projection */}
                {financials.annualEnergySavings > 0 && (<>
                  <div style={{ fontSize: '11px', fontWeight: '700', color: T.accent, marginTop: '16px', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>10-Year Cash Flow Projection</div>
                  <div style={{ overflowX: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', minWidth: '420px' }}>
                      <thead>
                        <tr style={{ background: '#1e1e22', color: '#fff' }}>
                          <th style={{ padding: '5px 6px', textAlign: 'left', fontWeight: '600' }}>Year</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600' }}>Savings</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600' }}>Rebate</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600' }}>Investment</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600' }}>Net CF</th>
                          <th style={{ padding: '5px 6px', textAlign: 'right', fontWeight: '600' }}>Cumulative</th>
                        </tr>
                      </thead>
                      <tbody>
                        {financials.cashFlow.map((cf, i) => {
                          const isPaybackYr = cf.year > 0 && cf.year === Math.ceil(financials.simplePayback);
                          return (
                            <tr key={cf.year} style={{ background: isPaybackYr ? '#fff5eb' : i % 2 === 0 ? '#f8f8fa' : '#fff', borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '4px 6px', fontWeight: isPaybackYr ? '700' : '400' }}>Yr {cf.year}{isPaybackYr ? ' *' : ''}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right' }}>{cf.savings > 0 ? `$${Math.round(cf.savings).toLocaleString()}` : '-'}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', color: cf.rebate > 0 ? T.green : '#888' }}>{cf.rebate > 0 ? `$${Math.round(cf.rebate).toLocaleString()}` : '-'}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', color: cf.investment < 0 ? T.red : '#888' }}>{cf.investment < 0 ? `($${Math.round(Math.abs(cf.investment)).toLocaleString()})` : '-'}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', color: cf.netCashFlow >= 0 ? T.green : T.red, fontWeight: '600' }}>{cf.netCashFlow >= 0 ? `$${Math.round(cf.netCashFlow).toLocaleString()}` : `($${Math.round(Math.abs(cf.netCashFlow)).toLocaleString()})`}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', color: cf.cumulative >= 0 ? T.green : T.red, fontWeight: '700' }}>{cf.cumulative >= 0 ? `$${Math.round(cf.cumulative).toLocaleString()}` : `($${Math.round(Math.abs(cf.cumulative)).toLocaleString()})`}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {financials.simplePayback > 0 && (
                    <div style={{ fontSize: '10px', color: T.accent, marginTop: '4px' }}>* Payback year</div>
                  )}

                  {/* Cumulative Cash Flow Bar Chart */}
                  <div style={{ marginTop: '12px', background: '#f8f8fa', borderRadius: '8px', padding: '12px', border: '1px solid #eee' }}>
                    <div style={{ fontSize: '10px', fontWeight: '700', color: '#666', marginBottom: '8px', textTransform: 'uppercase' }}>Cumulative Cash Flow</div>
                    <div style={{ display: 'flex', alignItems: 'flex-end', gap: '2px', height: '80px' }}>
                      {financials.cashFlow.map(cf => {
                        const allCum = financials.cashFlow.map(c => c.cumulative);
                        const maxAbs = Math.max(Math.abs(Math.max(...allCum)), Math.abs(Math.min(...allCum))) || 1;
                        const pct = (cf.cumulative / maxAbs) * 100;
                        const isPos = cf.cumulative >= 0;
                        return (
                          <div key={cf.year} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                            {isPos && <div style={{ width: '100%', background: T.green, borderRadius: '2px 2px 0 0', height: `${Math.abs(pct) * 0.7}%`, minHeight: cf.cumulative !== 0 ? '2px' : 0 }} />}
                            {!isPos && <div style={{ width: '100%', background: T.red, borderRadius: '0 0 2px 2px', height: `${Math.abs(pct) * 0.7}%`, minHeight: '2px', marginTop: 'auto' }} />}
                          </div>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: '2px', marginTop: '2px' }}>
                      {financials.cashFlow.map(cf => (
                        <div key={cf.year} style={{ flex: 1, textAlign: 'center', fontSize: '7px', color: '#999' }}>{cf.year}</div>
                      ))}
                    </div>
                  </div>

                  {/* Summary Narrative */}
                  <div style={{ marginTop: '12px', padding: '12px', background: '#f0faf0', borderRadius: '8px', border: '1px solid rgba(34,197,94,0.2)', fontSize: '11px', color: '#333', lineHeight: '1.6' }}>
                    {(() => {
                      const paybackMonths = Math.round(financials.simplePayback * 12);
                      const paybackYears = Math.floor(paybackMonths / 12);
                      const paybackRem = paybackMonths % 12;
                      const paybackStr = paybackYears > 0
                        ? `${paybackYears} year${paybackYears > 1 ? 's' : ''}${paybackRem > 0 ? ` ${paybackRem} month${paybackRem > 1 ? 's' : ''}` : ''}`
                        : `${paybackMonths} months`;
                      const returnMultiple = financials.netProjectCost > 0 ? ((financials.annualEnergySavings * 10) / financials.netProjectCost).toFixed(1) : '0';
                      return (<>
                        <div>This investment reaches <strong>break-even in {paybackStr}</strong>. After payback, the project generates <strong style={{ color: T.green }}>${Math.round(financials.annualEnergySavings).toLocaleString()}/yr</strong> in pure energy savings.</div>
                        <div style={{ marginTop: '6px' }}>Over 10 years, every <strong>$1.00 invested returns ${returnMultiple}</strong> in energy savings (${Math.round(financials.tenYearSavings).toLocaleString()} net).</div>
                        <div style={{ marginTop: '6px' }}>NPV at 5% discount: <strong>${Math.round(financials.npv).toLocaleString()}</strong> | IRR: <strong>{(financials.irr * 100).toFixed(1)}%</strong></div>
                      </>);
                    })()}
                  </div>
                </>)}

                {/* Assumptions */}
                <div style={{ marginTop: '12px', padding: '10px', background: '#fafafa', borderRadius: '8px', border: '1px solid #eee', fontSize: '9px', color: '#999', lineHeight: '1.5' }}>
                  <div style={{ fontWeight: '700', color: '#666', marginBottom: '4px', textTransform: 'uppercase', fontSize: '8px' }}>Assumptions & Disclaimers</div>
                  <div>Operating: {operatingHours} hrs/day, {daysPerYear} days/yr ({(operatingHours * daysPerYear).toLocaleString()} hrs/yr). Rate: ${energyRate}/kWh.</div>
                  <div>RMP incentives subject to program review, approval, and available funding. Cap: {Math.round(capPct * 100)}% of project cost.</div>
                  <div>NPV at 5% discount over 10 years. IRR over 10-year horizon. LED rated 50,000-100,000 hrs.</div>
                  <div style={{ marginTop: '4px', fontStyle: 'italic' }}>This document is a preliminary estimate for planning purposes and does not constitute a binding offer or guarantee.</div>
                </div>
              </>)}

              <div style={{ fontSize: '10px', color: '#999', marginTop: '12px', textAlign: 'center' }}>Estimate only {'\u2014'} subject to Rocky Mountain Power review and approval</div>

              {/* ===== SECTION 2: Contract & Terms (Accordion) ===== */}
              <div style={{ marginTop: '16px', border: '1px solid #ddd', borderRadius: '12px', overflow: 'hidden' }}>
                <button onClick={() => setExpandedSection(expandedSection === 'contract' ? null : 'contract')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: expandedSection === 'contract' ? '#f8f4ef' : '#fafafa', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '700', color: '#1e1e22' }}>
                  <span>{'\uD83D\uDCDD'} Contract & Terms</span>
                  <span style={{ color: '#999', fontSize: '12px' }}>{expandedSection === 'contract' ? '\u25B2' : '\u25BC'}</span>
                </button>
                {expandedSection === 'contract' && (
                  <div style={{ padding: '16px', borderTop: '1px solid #eee' }}>
                    {/* Scope of Work */}
                    <div style={{ fontSize: '12px', fontWeight: '700', color: T.accent, marginBottom: '8px', textTransform: 'uppercase' }}>Scope of Work</div>
                    <div style={{ fontSize: '12px', color: '#555', lineHeight: '1.6', marginBottom: '12px' }}>
                      {results.map((r, i) => (
                        <div key={r.id} style={{ marginBottom: '4px' }}>{i + 1}. Supply and install {r.qty}x {r.productName || 'LED fixture'} ({r.newW}W) replacing existing {r.name || 'fixture'} ({r.existW}W){r.name ? ` at ${r.name}` : ''}</div>
                      ))}
                    </div>

                    {/* Terms */}
                    <div style={{ fontSize: '12px', fontWeight: '700', color: T.accent, marginBottom: '8px', textTransform: 'uppercase' }}>Terms & Conditions</div>
                    <textarea
                      value={contractTerms || `1. Work will commence within a reasonable timeframe upon execution of this agreement.\n2. All materials and labor are included as specified in the scope of work above.\n3. Warranty: LED products carry manufacturer warranty (typically 5-10 years). Labor warranty: 1 year from installation.\n4. RMP Incentive Assignment: Customer assigns the Rocky Mountain Power rebate incentive of $${estimatedRebate.toLocaleString()} to HHH Building Services.\n5. HHH Building Services shall not be liable for indirect, incidental, or consequential damages.\n6. Cancellation: Either party may cancel this agreement with written notice within 3 business days of execution. After 3 days, a restocking fee of 15% may apply.`}
                      onChange={e => setContractTerms(e.target.value)}
                      rows={10}
                      style={{ width: '100%', padding: '10px', border: '1px solid #ddd', borderRadius: '8px', fontSize: '11px', color: '#333', lineHeight: '1.6', resize: 'vertical', fontFamily: 'inherit', boxSizing: 'border-box' }}
                    />

                    {/* Payment Terms */}
                    <div style={{ fontSize: '12px', fontWeight: '700', color: T.accent, marginTop: '14px', marginBottom: '8px', textTransform: 'uppercase' }}>Payment Terms</div>
                    <div style={{ background: '#f8f8fa', borderRadius: '8px', padding: '12px', border: '1px solid #eee' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                        <span style={{ fontSize: '13px', fontWeight: '600' }}>{waiveDeposit ? 'No deposit required' : `50% Deposit: $${Math.round(effectiveProjectCost * 0.5).toLocaleString()}`}</span>
                        <button onClick={() => setWaiveDeposit(!waiveDeposit)} style={{ padding: '4px 12px', fontSize: '11px', background: waiveDeposit ? T.green : '#eee', color: waiveDeposit ? '#fff' : '#666', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>{waiveDeposit ? 'Deposit Waived' : 'Waive Deposit'}</button>
                      </div>
                      <div style={{ fontSize: '12px', color: '#666' }}>Balance of ${waiveDeposit ? Math.round(effectiveProjectCost).toLocaleString() : Math.round(effectiveProjectCost * 0.5).toLocaleString()} due upon completion.</div>
                      <div style={{ fontSize: '12px', color: T.green, fontWeight: '600', marginTop: '4px' }}>RMP rebate of ${estimatedRebate.toLocaleString()} applied after utility approval.</div>
                    </div>
                  </div>
                )}
              </div>

              {/* ===== SECTION 3: RMP General Application (Accordion) ===== */}
              <div style={{ marginTop: '8px', border: '1px solid #ddd', borderRadius: '12px', overflow: 'hidden' }}>
                <button onClick={() => setExpandedSection(expandedSection === 'application' ? null : 'application')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: expandedSection === 'application' ? '#f8f4ef' : '#fafafa', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '700', color: '#1e1e22' }}>
                  <span>{'\uD83D\uDCCB'} RMP General Application {program === 'large' ? '(Large)' : '(Express)'}</span>
                  <span style={{ color: '#999', fontSize: '12px' }}>{expandedSection === 'application' ? '\u25B2' : '\u25BC'}</span>
                </button>
                {expandedSection === 'application' && (
                  <div style={{ padding: '16px', borderTop: '1px solid #eee' }}>
                    <div style={{ fontSize: '12px', fontWeight: '700', color: T.accent, marginBottom: '8px', textTransform: 'uppercase' }}>Customer / Site Information</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Business Name</label>
                        <input type="text" value={appFields.businessName} onChange={e => setAppFields(p => ({ ...p, businessName: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Contact Name</label>
                        <input type="text" value={appFields.contactName} onChange={e => setAppFields(p => ({ ...p, contactName: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Email</label>
                        <input type="email" value={appFields.contactEmail} onChange={e => setAppFields(p => ({ ...p, contactEmail: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Phone</label>
                        <input type="tel" value={appFields.contactPhone} onChange={e => setAppFields(p => ({ ...p, contactPhone: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Business Type</label>
                        <select value={appFields.businessType} onChange={e => setAppFields(p => ({ ...p, businessType: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }}>
                          {['Commercial', 'Industrial', 'Retail', 'Office', 'Warehouse', 'Restaurant', 'Hotel', 'Healthcare', 'Education', 'Government', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Rate Schedule</label>
                        <input type="text" value={appFields.rateSchedule} onChange={e => setAppFields(p => ({ ...p, rateSchedule: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                    </div>

                    {/* Large-only: Vendor + Payee */}
                    {program === 'large' && (<>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: T.accent, marginBottom: '8px', marginTop: '12px', textTransform: 'uppercase' }}>Vendor Information</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Vendor Name</label>
                          <input type="text" value={appFields.vendorName} onChange={e => setAppFields(p => ({ ...p, vendorName: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Vendor Contact</label>
                          <input type="text" value={appFields.vendorContact} onChange={e => setAppFields(p => ({ ...p, vendorContact: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: '700', color: T.accent, marginBottom: '8px', marginTop: '12px', textTransform: 'uppercase' }}>Payee Information</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                        <div>
                          <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Payee Name</label>
                          <input type="text" value={appFields.payeeName} onChange={e => setAppFields(p => ({ ...p, payeeName: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                        <div>
                          <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Payee City/State/ZIP</label>
                          <input type="text" value={[appFields.payeeCity, appFields.payeeState, appFields.payeeZip].filter(Boolean).join(', ')} onChange={e => setAppFields(p => ({ ...p, payeeCity: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                        </div>
                      </div>
                    </>)}

                    {/* Operating Schedule */}
                    <div style={{ fontSize: '12px', fontWeight: '700', color: T.accent, marginBottom: '8px', marginTop: '12px', textTransform: 'uppercase' }}>Operating Schedule</div>
                    <div style={{ fontSize: '12px', color: '#555', background: '#f8f8fa', borderRadius: '8px', padding: '10px', border: '1px solid #eee' }}>
                      {operatingHours} hrs/day x {daysPerYear} days/yr = {(operatingHours * daysPerYear).toLocaleString()} annual hours
                    </div>

                    {/* Cost Summary */}
                    <div style={{ fontSize: '12px', fontWeight: '700', color: T.accent, marginBottom: '8px', marginTop: '12px', textTransform: 'uppercase' }}>Cost Information</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Material $</label>
                        <input type="number" value={appFields.materialCost || ''} onChange={e => setAppFields(p => ({ ...p, materialCost: parseFloat(e.target.value) || 0 }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Labor $</label>
                        <input type="number" value={appFields.laborCost || ''} onChange={e => setAppFields(p => ({ ...p, laborCost: parseFloat(e.target.value) || 0 }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Other $</label>
                        <input type="number" value={appFields.otherCost || ''} onChange={e => setAppFields(p => ({ ...p, otherCost: parseFloat(e.target.value) || 0 }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                    </div>

                    {/* Line items preview */}
                    <div style={{ fontSize: '12px', fontWeight: '700', color: T.accent, marginBottom: '8px', marginTop: '12px', textTransform: 'uppercase' }}>Application Line Items ({results.length})</div>
                    <div style={{ fontSize: '11px', color: '#888', maxHeight: '200px', overflowY: 'auto', border: '1px solid #eee', borderRadius: '8px' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead>
                          <tr style={{ background: '#f0f0f0' }}>
                            <th style={{ padding: '4px 6px', textAlign: 'left', fontSize: '10px' }}>#</th>
                            <th style={{ padding: '4px 6px', textAlign: 'left', fontSize: '10px' }}>Location</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>Qty</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>Exist W</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>New W</th>
                            <th style={{ padding: '4px 6px', textAlign: 'right', fontSize: '10px' }}>Incentive</th>
                          </tr>
                        </thead>
                        <tbody>
                          {results.map((r, i) => (
                            <tr key={r.id} style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <td style={{ padding: '4px 6px' }}>{i + 1}</td>
                              <td style={{ padding: '4px 6px', maxWidth: '100px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name || r.fixtureCategory}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.qty}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.existW}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right' }}>{r.newW}</td>
                              <td style={{ padding: '4px 6px', textAlign: 'right', color: T.accent, fontWeight: '600' }}>${r.calc.totalIncentive.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>

              {/* ===== SECTION 4: W9 (Accordion) ===== */}
              <div style={{ marginTop: '8px', border: '1px solid #ddd', borderRadius: '12px', overflow: 'hidden' }}>
                <button onClick={() => setExpandedSection(expandedSection === 'w9' ? null : 'w9')} style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', background: expandedSection === 'w9' ? '#f8f4ef' : '#fafafa', border: 'none', cursor: 'pointer', fontSize: '14px', fontWeight: '700', color: '#1e1e22' }}>
                  <span>{'\uD83C\uDFE6'} W-9 Tax Information</span>
                  <span style={{ color: '#999', fontSize: '12px' }}>{expandedSection === 'w9' ? '\u25B2' : '\u25BC'}</span>
                </button>
                {expandedSection === 'w9' && (
                  <div style={{ padding: '16px', borderTop: '1px solid #eee' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '12px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Name (as on tax return)</label>
                        <input type="text" value={w9Fields.name} onChange={e => setW9Fields(p => ({ ...p, name: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Business Name (if different)</label>
                        <input type="text" value={w9Fields.businessName} onChange={e => setW9Fields(p => ({ ...p, businessName: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Federal Tax Classification</label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {['Individual/Sole Proprietor', 'C Corporation', 'S Corporation', 'Partnership', 'Trust/Estate', 'LLC', 'Other'].map(opt => (
                          <button key={opt} onClick={() => setW9Fields(p => ({ ...p, taxClass: opt }))} style={{ padding: '5px 10px', fontSize: '11px', border: `1px solid ${w9Fields.taxClass === opt ? T.accent : '#ddd'}`, borderRadius: '6px', background: w9Fields.taxClass === opt ? '#fff5eb' : '#fff', color: w9Fields.taxClass === opt ? T.accent : '#555', cursor: 'pointer', fontWeight: w9Fields.taxClass === opt ? '600' : '400' }}>{opt}</button>
                        ))}
                      </div>
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>Address</label>
                      <input type="text" value={w9Fields.address} onChange={e => setW9Fields(p => ({ ...p, address: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>City, State, ZIP</label>
                      <input type="text" value={w9Fields.cityStateZip} onChange={e => setW9Fields(p => ({ ...p, cityStateZip: e.target.value }))} style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>SSN</label>
                        <input type="text" value={w9Fields.ssn} onChange={e => setW9Fields(p => ({ ...p, ssn: e.target.value }))} placeholder="___-__-____" style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                      <div>
                        <label style={{ fontSize: '11px', color: '#888', display: 'block', marginBottom: '3px' }}>EIN</label>
                        <input type="text" value={w9Fields.ein} onChange={e => setW9Fields(p => ({ ...p, ein: e.target.value }))} placeholder="__-_______" style={{ width: '100%', padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '12px', boxSizing: 'border-box' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* ===== SECTION 5: Signature & Acceptance ===== */}
              <div style={{ marginTop: '16px', border: `2px solid ${contractAccepted ? T.green : T.accent}`, borderRadius: '12px', padding: '16px', background: contractAccepted ? 'rgba(34,197,94,0.05)' : '#fff' }}>
                <div style={{ fontSize: '13px', fontWeight: '700', color: '#1e1e22', marginBottom: '8px' }}>{contractAccepted ? '\u2713 Contract Accepted' : 'Customer Signature'}</div>

                {!contractAccepted ? (
                  <>
                    <div style={{ fontSize: '11px', color: '#666', marginBottom: '10px', lineHeight: '1.5' }}>
                      By signing below, I authorize the scope of work described above, agree to the terms and conditions, certify the information in the RMP General Application, and certify the W9 information provided.
                    </div>
                    <div style={{ border: '1px solid #ddd', borderRadius: '8px', overflow: 'hidden', background: '#fff', marginBottom: '8px' }}>
                      <canvas
                        ref={el => {
                          sigCanvasRef.current = el;
                          if (el && !sigPadRef.current) {
                            sigPadRef.current = new SignaturePad(el, { backgroundColor: 'rgb(255,255,255)', penColor: 'rgb(0,0,0)' });
                            const ratio = Math.max(window.devicePixelRatio || 1, 1);
                            el.width = el.offsetWidth * ratio;
                            el.height = 120 * ratio;
                            el.getContext('2d').scale(ratio, ratio);
                            el.style.height = '120px';
                          }
                        }}
                        style={{ width: '100%', height: '120px', touchAction: 'none' }}
                      />
                    </div>
                    <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
                      <button onClick={() => { if (sigPadRef.current) sigPadRef.current.clear(); setSignatureData(null); }} style={{ padding: '6px 14px', fontSize: '12px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', color: '#555' }}>Clear</button>
                    </div>
                    <button
                      onClick={() => {
                        if (sigPadRef.current && !sigPadRef.current.isEmpty()) {
                          const data = sigPadRef.current.toDataURL('image/png');
                          setSignatureData(data);
                          setContractAccepted(true);
                          showToast('Contract accepted', '\u2713');
                        } else {
                          showToast('Please sign above first', '\u26A0\uFE0F');
                        }
                      }}
                      style={{ width: '100%', padding: '14px', background: T.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: '700', cursor: 'pointer' }}
                    >
                      Accept & Sign
                    </button>
                  </>
                ) : (
                  <>
                    {signatureData && <img src={signatureData} alt="Signature" style={{ maxWidth: '200px', height: '60px', objectFit: 'contain', border: '1px solid #eee', borderRadius: '6px', marginBottom: '8px' }} />}
                    <div style={{ fontSize: '11px', color: '#888' }}>Signed on {new Date().toLocaleDateString('en-US')}</div>
                    <button onClick={() => { setContractAccepted(false); setSignatureData(null); if (sigPadRef.current) { sigPadRef.current.clear(); } }} style={{ marginTop: '8px', padding: '6px 14px', fontSize: '11px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '6px', cursor: 'pointer', color: '#666' }}>Redo Signature</button>
                  </>
                )}
              </div>

              {/* ===== SECTION 6: Generate & Attach (after signing) ===== */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '16px' }}>
                <button onClick={generatePDF} style={{ width: '100%', padding: '12px', background: T.accent, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>{'\uD83D\uDCC4'} Download Financial Audit PDF{signatureData ? ' (Signed)' : ''}</button>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={generateXLS} style={{ flex: 1, padding: '10px', background: '#1a5c1a', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{'\uD83D\uDCCA'} RMP Application (XLS)</button>
                  <button onClick={generateW9PDF} style={{ flex: 1, padding: '10px', background: '#1a3c6e', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{'\uD83C\uDFE6'} W9 (PDF)</button>
                </div>
                {savedLeadId && (
                  <button onClick={attachToLead} disabled={attachingFiles} style={{ width: '100%', padding: '12px', background: attachingFiles ? '#ccc' : T.blue, color: '#fff', border: 'none', borderRadius: '10px', fontSize: '13px', fontWeight: '600', cursor: 'pointer' }}>{attachingFiles ? 'Attaching...' : '\uD83D\uDCCE Attach All to Lead'}</button>
                )}
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => { setShowSummary(false); setShowSaveModal(true); }} style={{ flex: 1, padding: '10px', background: (savedLeadId && !isDirty) ? '#eee' : T.blue, color: (savedLeadId && !isDirty) ? '#999' : '#fff', border: 'none', borderRadius: '8px', fontSize: '12px', fontWeight: '600', cursor: 'pointer' }}>{(savedLeadId && !isDirty) ? '\u2713 Saved' : '\uD83D\uDCBE Save'}</button>
                  <button onClick={copySummary} style={{ flex: 1, padding: '10px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: '#555' }}>{'\uD83D\uDCCB'} Copy</button>
                  <button onClick={() => setShowSummary(false)} style={{ flex: 1, padding: '10px', background: '#f0f0f0', border: '1px solid #ddd', borderRadius: '8px', fontSize: '12px', cursor: 'pointer', color: '#555' }}>Close</button>
                </div>
              </div>
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
          {leadOwnerName && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', background: T.accentDim, border: `1px solid ${T.accent}`, borderRadius: '8px', marginBottom: '12px' }}>
              <div style={{ width: '24px', height: '24px', borderRadius: '50%', background: T.accent, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '10px', fontWeight: '700', color: '#fff' }}>
                {leadOwnerName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
              </div>
              <div style={{ fontSize: '12px', color: T.text }}>Lead Owner: <span style={{ fontWeight: '600' }}>{leadOwnerName}</span></div>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '10px' }}>
            <div><label style={S.label}>Customer Name *</label><input type="text" value={projectName} onChange={e => setProjectName(e.target.value)} style={S.input} /></div>
            <div><label style={S.label}>Phone</label><input type="tel" inputMode="tel" value={savePhone} onChange={e => setSavePhone(e.target.value)} placeholder="Optional" style={S.input} /></div>
          </div>
          <div style={{ marginBottom: '10px' }}><label style={S.label}>Email</label><input type="email" inputMode="email" value={saveEmail} onChange={e => setSaveEmail(e.target.value)} placeholder="Optional" style={S.input} /></div>
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
            <div style={{ fontSize: '16px', fontWeight: '700' }}>{'\uD83D\uDCC1'} {leadOwnerName ? `${leadOwnerName}'s Projects` : 'Saved Projects'}</div>
            <button onClick={() => setShowProjects(false)} style={{ background: 'none', border: 'none', color: T.textMuted, fontSize: '20px', cursor: 'pointer' }}>{'\u2715'}</button>
          </div>
          {leadOwnerId && (
            <div style={{ display: 'flex', gap: '8px', marginBottom: '12px' }}>
              <button onClick={() => loadProjects(leadOwnerId)} style={{ ...S.btnGhost, flex: 1, fontSize: '12px', background: T.accentDim, color: T.accent, borderColor: T.accent }}>My Projects</button>
              <button onClick={() => loadProjects(null)} style={{ ...S.btnGhost, flex: 1, fontSize: '12px' }}>All Projects</button>
            </div>
          )}
          {loadingProjects && <div style={{ textAlign: 'center', padding: '20px', color: T.textMuted }}>Loading...</div>}
          {!loadingProjects && projects.length === 0 && <div style={{ textAlign: 'center', padding: '20px', color: T.textMuted }}>No saved projects yet</div>}
          {projects.map(p => (
            <button key={p.id} onClick={() => loadProject(p)} style={{ width: '100%', textAlign: 'left', padding: '12px', background: T.bgInput, border: `1px solid ${T.border}`, borderRadius: '10px', color: T.text, cursor: 'pointer', marginBottom: '6px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: '600' }}>{p.customerName}</div>
                  <div style={{ fontSize: '11px', color: T.textMuted }}>{new Date(p.createdAt).toLocaleDateString()} {'\u2022'} {p.status}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  {p.audit?.estimated_rebate > 0 && <div style={{ ...S.money, fontSize: '15px' }}>${Math.round(p.audit.estimated_rebate).toLocaleString()}</div>}
                  {p.audit?.watts_reduced > 0 && <div style={{ fontSize: '10px', color: T.textSec }}>{p.audit.watts_reduced.toLocaleString()}W saved</div>}
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
