import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useStore } from '../lib/store'
import { useTheme } from '../components/Layout'
import { supabase } from '../lib/supabase'
import { LAMP_TYPES, FIXTURE_CATEGORIES, COMMON_WATTAGES, AI_CATEGORY_MAP, PRODUCT_CATEGORY_KEYWORDS } from '../lib/lightingConstants'
import { ArrowLeft, ArrowRight, Check, Plus, Trash2, Zap, Info, Building, Building2, Factory, Warehouse, Sparkles } from 'lucide-react'

const buildingSizes = [
  { value: 'small', label: 'Small', description: '<10,000 sq ft, <50kW demand' },
  { value: 'medium', label: 'Medium', description: '10,000-50,000 sq ft, 50-200kW demand' },
  { value: 'large', label: 'Large/Industrial', description: '>50,000 sq ft, >200kW demand' }
]

// ZIP code prefix → state mapping (first 3 digits)
const ZIP_TO_STATE = {
  '005':'NY','006':'PR','007':'PR','008':'PR','009':'PR','010':'MA','011':'MA','012':'MA','013':'MA','014':'MA','015':'MA','016':'MA','017':'MA','018':'MA','019':'MA','020':'MA','021':'MA','022':'MA','023':'MA','024':'MA','025':'MA','026':'MA','027':'MA',
  '028':'RI','029':'RI','030':'NH','031':'NH','032':'NH','033':'NH','034':'NH','035':'NH','036':'NH','037':'NH','038':'NH','039':'ME','040':'ME','041':'ME','042':'ME','043':'ME','044':'ME','045':'ME','046':'ME','047':'ME','048':'ME','049':'ME',
  '050':'VT','051':'VT','052':'VT','053':'VT','054':'VT','055':'VT','056':'VT','057':'VT','058':'VT','059':'VT','060':'CT','061':'CT','062':'CT','063':'CT','064':'CT','065':'CT','066':'CT','067':'CT','068':'CT','069':'CT',
  '070':'NJ','071':'NJ','072':'NJ','073':'NJ','074':'NJ','075':'NJ','076':'NJ','077':'NJ','078':'NJ','079':'NJ','080':'NJ','081':'NJ','082':'NJ','083':'NJ','084':'NJ','085':'NJ','086':'NJ','087':'NJ','088':'NJ','089':'NJ',
  '100':'NY','101':'NY','102':'NY','103':'NY','104':'NY','105':'NY','106':'NY','107':'NY','108':'NY','109':'NY','110':'NY','111':'NY','112':'NY','113':'NY','114':'NY','115':'NY','116':'NY','117':'NY','118':'NY','119':'NY',
  '120':'NY','121':'NY','122':'NY','123':'NY','124':'NY','125':'NY','126':'NY','127':'NY','128':'NY','129':'NY','130':'NY','131':'NY','132':'NY','133':'NY','134':'NY','135':'NY','136':'NY','137':'NY','138':'NY','139':'NY','140':'NY','141':'NY','142':'NY','143':'NY','144':'NY','145':'NY','146':'NY','147':'NY','148':'NY','149':'NY',
  '150':'PA','151':'PA','152':'PA','153':'PA','154':'PA','155':'PA','156':'PA','157':'PA','158':'PA','159':'PA','160':'PA','161':'PA','162':'PA','163':'PA','164':'PA','165':'PA','166':'PA','167':'PA','168':'PA','169':'PA',
  '170':'PA','171':'PA','172':'PA','173':'PA','174':'PA','175':'PA','176':'PA','177':'PA','178':'PA','179':'PA','180':'PA','181':'PA','182':'PA','183':'PA','184':'PA','185':'PA','186':'PA','187':'PA','188':'PA','189':'PA','190':'PA','191':'PA','192':'PA','193':'PA','194':'PA','195':'PA','196':'PA',
  '197':'DE','198':'DE','199':'DE','200':'DC','201':'VA','202':'DC','203':'DC','204':'MD','205':'MD','206':'MD','207':'MD','208':'MD','209':'MD','210':'MD','211':'MD','212':'MD','214':'MD','215':'MD','216':'MD','217':'MD','218':'MD','219':'MD',
  '220':'VA','221':'VA','222':'VA','223':'VA','224':'VA','225':'VA','226':'VA','227':'VA','228':'VA','229':'VA','230':'VA','231':'VA','232':'VA','233':'VA','234':'VA','235':'VA','236':'VA','237':'VA','238':'VA','239':'VA','240':'VA','241':'VA','242':'VA','243':'VA','244':'VA','245':'VA','246':'WV',
  '247':'WV','248':'WV','249':'WV','250':'WV','251':'WV','252':'WV','253':'WV','254':'WV','255':'WV','256':'WV','257':'WV','258':'WV','259':'WV','260':'WV','261':'WV','262':'WV','263':'WV','264':'WV','265':'WV','266':'WV','267':'WV','268':'WV',
  '270':'NC','271':'NC','272':'NC','273':'NC','274':'NC','275':'NC','276':'NC','277':'NC','278':'NC','279':'NC','280':'NC','281':'NC','282':'NC','283':'NC','284':'NC','285':'NC','286':'NC','287':'NC','288':'NC','289':'NC',
  '290':'SC','291':'SC','292':'SC','293':'SC','294':'SC','295':'SC','296':'SC','297':'SC','298':'SC','299':'SC',
  '300':'GA','301':'GA','302':'GA','303':'GA','304':'GA','305':'GA','306':'GA','307':'GA','308':'GA','309':'GA','310':'GA','311':'GA','312':'GA','313':'GA','314':'GA','315':'GA','316':'GA','317':'GA','318':'GA','319':'GA',
  '320':'FL','321':'FL','322':'FL','323':'FL','324':'FL','325':'FL','326':'FL','327':'FL','328':'FL','329':'FL','330':'FL','331':'FL','332':'FL','333':'FL','334':'FL','335':'FL','336':'FL','337':'FL','338':'FL','339':'FL',
  '340':'FL','341':'FL','342':'FL','344':'FL','346':'FL','347':'FL','349':'FL',
  '350':'AL','351':'AL','352':'AL','354':'AL','355':'AL','356':'AL','357':'AL','358':'AL','359':'AL','360':'AL','361':'AL','362':'AL','363':'AL','364':'AL','365':'AL','366':'AL','367':'AL','368':'AL','369':'AL',
  '370':'TN','371':'TN','372':'TN','373':'TN','374':'TN','375':'TN','376':'TN','377':'TN','378':'TN','379':'TN','380':'TN','381':'TN','382':'TN','383':'TN','384':'TN','385':'TN',
  '386':'MS','387':'MS','388':'MS','389':'MS','390':'MS','391':'MS','392':'MS','393':'MS','394':'MS','395':'MS','396':'MS','397':'MS',
  '398':'GA','399':'GA',
  '400':'KY','401':'KY','402':'KY','403':'KY','404':'KY','405':'KY','406':'KY','407':'KY','408':'KY','409':'KY','410':'KY','411':'KY','412':'KY','413':'KY','414':'KY','415':'KY','416':'KY','417':'KY','418':'KY',
  '420':'KY','421':'KY','422':'KY','423':'KY','424':'KY','425':'KY','426':'KY','427':'KY',
  '430':'OH','431':'OH','432':'OH','433':'OH','434':'OH','435':'OH','436':'OH','437':'OH','438':'OH','439':'OH','440':'OH','441':'OH','442':'OH','443':'OH','444':'OH','445':'OH','446':'OH','447':'OH','448':'OH','449':'OH',
  '450':'OH','451':'OH','452':'OH','453':'OH','454':'OH','455':'OH','456':'OH','457':'OH','458':'OH',
  '460':'IN','461':'IN','462':'IN','463':'IN','464':'IN','465':'IN','466':'IN','467':'IN','468':'IN','469':'IN','470':'IN','471':'IN','472':'IN','473':'IN','474':'IN','475':'IN','476':'IN','477':'IN','478':'IN','479':'IN',
  '480':'MI','481':'MI','482':'MI','483':'MI','484':'MI','485':'MI','486':'MI','487':'MI','488':'MI','489':'MI','490':'MI','491':'MI','492':'MI','493':'MI','494':'MI','495':'MI','496':'MI','497':'MI','498':'MI','499':'MI',
  '500':'IA','501':'IA','502':'IA','503':'IA','504':'IA','505':'IA','506':'IA','507':'IA','508':'IA','509':'IA','510':'IA','511':'IA','512':'IA','513':'IA','514':'IA','515':'IA','516':'IA','520':'IA','521':'IA','522':'IA','523':'IA','524':'IA','525':'IA','526':'IA','527':'IA','528':'IA',
  '530':'WI','531':'WI','532':'WI','534':'WI','535':'WI','537':'WI','538':'WI','539':'WI','540':'WI','541':'WI','542':'WI','543':'WI','544':'WI','545':'WI','546':'WI','547':'WI','548':'WI','549':'WI',
  '550':'MN','551':'MN','553':'MN','554':'MN','555':'MN','556':'MN','557':'MN','558':'MN','559':'MN','560':'MN','561':'MN','562':'MN','563':'MN','564':'MN','565':'MN','566':'MN','567':'MN',
  '570':'SD','571':'SD','572':'SD','573':'SD','574':'SD','575':'SD','576':'SD','577':'SD',
  '580':'ND','581':'ND','582':'ND','583':'ND','584':'ND','585':'ND','586':'ND','587':'ND','588':'ND',
  '590':'MT','591':'MT','592':'MT','593':'MT','594':'MT','595':'MT','596':'MT','597':'MT','598':'MT','599':'MT',
  '600':'IL','601':'IL','602':'IL','603':'IL','604':'IL','605':'IL','606':'IL','607':'IL','608':'IL','609':'IL','610':'IL','611':'IL','612':'IL','613':'IL','614':'IL','615':'IL','616':'IL','617':'IL','618':'IL','619':'IL','620':'IL','622':'IL','623':'IL','624':'IL','625':'IL','626':'IL','627':'IL','628':'IL','629':'IL',
  '630':'MO','631':'MO','633':'MO','634':'MO','635':'MO','636':'MO','637':'MO','638':'MO','639':'MO','640':'MO','641':'MO','644':'MO','645':'MO','646':'MO','647':'MO','648':'MO','649':'MO','650':'MO','651':'MO','652':'MO','653':'MO','654':'MO','655':'MO','656':'MO','657':'MO','658':'MO','659':'MO',
  '660':'KS','661':'KS','662':'KS','664':'KS','665':'KS','666':'KS','667':'KS','668':'KS','669':'KS','670':'KS','671':'KS','672':'KS','673':'KS','674':'KS','675':'KS','676':'KS','677':'KS','678':'KS','679':'KS',
  '680':'NE','681':'NE','683':'NE','684':'NE','685':'NE','686':'NE','687':'NE','688':'NE','689':'NE','690':'NE','691':'NE','692':'NE','693':'NE',
  '700':'LA','701':'LA','703':'LA','704':'LA','705':'LA','706':'LA','707':'LA','708':'LA','710':'LA','711':'LA','712':'LA','713':'LA','714':'LA',
  '716':'AR','717':'AR','718':'AR','719':'AR','720':'AR','721':'AR','722':'AR','723':'AR','724':'AR','725':'AR','726':'AR','727':'AR','728':'AR','729':'AR',
  '730':'OK','731':'OK','733':'OK','734':'OK','735':'OK','736':'OK','737':'OK','738':'OK','739':'OK','740':'OK','741':'OK','743':'OK','744':'OK','745':'OK','746':'OK','747':'OK','748':'OK','749':'OK',
  '750':'TX','751':'TX','752':'TX','753':'TX','754':'TX','755':'TX','756':'TX','757':'TX','758':'TX','759':'TX','760':'TX','761':'TX','762':'TX','763':'TX','764':'TX','765':'TX','766':'TX','767':'TX','768':'TX','769':'TX',
  '770':'TX','771':'TX','772':'TX','773':'TX','774':'TX','775':'TX','776':'TX','777':'TX','778':'TX','779':'TX','780':'TX','781':'TX','782':'TX','783':'TX','784':'TX','785':'TX','786':'TX','787':'TX','788':'TX','789':'TX','790':'TX','791':'TX','792':'TX','793':'TX','794':'TX','795':'TX','796':'TX','797':'TX','798':'TX','799':'TX',
  '800':'CO','801':'CO','802':'CO','803':'CO','804':'CO','805':'CO','806':'CO','807':'CO','808':'CO','809':'CO','810':'CO','811':'CO','812':'CO','813':'CO','814':'CO','815':'CO','816':'CO',
  '820':'WY','821':'WY','822':'WY','823':'WY','824':'WY','825':'WY','826':'WY','827':'WY','828':'WY','829':'WY','830':'WY','831':'WY',
  '832':'ID','833':'ID','834':'ID','835':'ID','836':'ID','837':'ID','838':'ID',
  '840':'UT','841':'UT','842':'UT','843':'UT','844':'UT','845':'UT','846':'UT','847':'UT',
  '850':'AZ','851':'AZ','852':'AZ','853':'AZ','855':'AZ','856':'AZ','857':'AZ','859':'AZ','860':'AZ',
  '865':'AZ',
  '870':'NM','871':'NM','872':'NM','873':'NM','874':'NM','875':'NM','877':'NM','878':'NM','879':'NM','880':'NM','881':'NM','882':'NM','883':'NM','884':'NM',
  '889':'NV','890':'NV','891':'NV','893':'NV','894':'NV','895':'NV','897':'NV','898':'NV',
  '900':'CA','901':'CA','902':'CA','903':'CA','904':'CA','905':'CA','906':'CA','907':'CA','908':'CA','910':'CA','911':'CA','912':'CA','913':'CA','914':'CA','915':'CA','916':'CA','917':'CA','918':'CA','919':'CA',
  '920':'CA','921':'CA','922':'CA','923':'CA','924':'CA','925':'CA','926':'CA','927':'CA','928':'CA','930':'CA','931':'CA','932':'CA','933':'CA','934':'CA','935':'CA','936':'CA','937':'CA','938':'CA','939':'CA','940':'CA','941':'CA','942':'CA','943':'CA','944':'CA','945':'CA','946':'CA','947':'CA','948':'CA','949':'CA',
  '950':'CA','951':'CA','952':'CA','953':'CA','954':'CA','955':'CA','956':'CA','957':'CA','958':'CA','959':'CA','960':'CA','961':'CA',
  '967':'HI','968':'HI',
  '970':'OR','971':'OR','972':'OR','973':'OR','974':'OR','975':'OR','976':'OR','977':'OR','978':'OR','979':'OR',
  '980':'WA','981':'WA','982':'WA','983':'WA','984':'WA','985':'WA','986':'WA','988':'WA','989':'WA','990':'WA','991':'WA','992':'WA','993':'WA','994':'WA',
  '995':'AK','996':'AK','997':'AK','998':'AK','999':'AK'
}

const getStateFromZip = (zip) => {
  if (!zip || zip.length < 3) return null
  return ZIP_TO_STATE[zip.substring(0, 3)] || null
}

// Building size icons by category
const BUILDING_ICONS = {
  'Residential': Building,
  'Small Commercial': Building,
  'Large Commercial': Building2,
  'Industrial': Factory,
  'Agricultural': Warehouse
}
const DEFAULT_BUILDING_ICON = Building2

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
}

// fixtureCategories and lampTypes now imported from lightingConstants.js

export default function NewLightingAudit() {
  const navigate = useNavigate()
  const companyId = useStore((state) => state.companyId)
  const user = useStore((state) => state.user)
  const customers = useStore((state) => state.customers)
  const employees = useStore((state) => state.employees)
  const products = useStore((state) => state.products)
  const fixtureTypes = useStore((state) => state.fixtureTypes)
  const fetchFixtureTypes = useStore((state) => state.fetchFixtureTypes)
  const utilityProviders = useStore((state) => state.utilityProviders)
  const utilityPrograms = useStore((state) => state.utilityPrograms)
  const rebateRates = useStore((state) => state.rebateRates)
  const prescriptiveMeasures = useStore((state) => state.prescriptiveMeasures)
  const fetchLightingAudits = useStore((state) => state.fetchLightingAudits)
  const fetchAuditAreas = useStore((state) => state.fetchAuditAreas)
  const fetchSalesPipeline = useStore((state) => state.fetchSalesPipeline)

  const [step, setStep] = useState(1)
  const [saving, setSaving] = useState(false)

  // Step 1 - Basic Info
  const [basicInfo, setBasicInfo] = useState({
    customer_id: '',
    salesperson_id: '',
    address: '',
    city: '',
    state: '',
    zip: '',
    building_size: 'medium',
    utility_provider_id: '',
    rate_schedule_id: '',
    rate_schedule: '',
    electric_rate: 0.12,
    operating_hours: 10,
    operating_days: 260
  })
  const [showBuildingSizeTooltip, setShowBuildingSizeTooltip] = useState(false)
  const [rateSchedules, setRateSchedules] = useState([])
  const [loadingSchedules, setLoadingSchedules] = useState(false)

  // Step 2 - Areas
  const [areas, setAreas] = useState([])
  const [showAreaModal, setShowAreaModal] = useState(false)
  const [editingAreaIndex, setEditingAreaIndex] = useState(null)

  // Lenard AI Photo Analysis state
  const [photoPreview, setPhotoPreview] = useState(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [aiResult, setAiResult] = useState(null)

  const [areaForm, setAreaForm] = useState({
    area_name: '',
    ceiling_height: '',
    fixture_category: 'Linear',
    lighting_type: '',
    fixture_count: 1,
    existing_wattage: '',
    led_replacement_id: '',
    led_wattage: '',
    confirmed: false,
    override_notes: ''
  })

  // Theme with fallback
  const themeContext = useTheme()
  const theme = themeContext?.theme || defaultTheme

  useEffect(() => {
    if (!companyId) {
      navigate('/')
      return
    }
    fetchFixtureTypes()
  }, [companyId, navigate, fetchFixtureTypes])

  // Set default salesperson to current user's employee record
  useEffect(() => {
    if (user?.id && employees.length > 0 && !basicInfo.salesperson_id) {
      const currentEmployee = employees.find(e => e.email === user.email)
      if (currentEmployee) {
        setBasicInfo(prev => ({ ...prev, salesperson_id: currentEmployee.id }))
      }
    }
  }, [user, employees, basicInfo.salesperson_id])

  // Auto-fill address from customer
  useEffect(() => {
    if (basicInfo.customer_id) {
      const customer = customers.find(c => c.id === basicInfo.customer_id)
      if (customer) {
        setBasicInfo(prev => ({
          ...prev,
          address: customer.address || prev.address
        }))
      }
    }
  }, [basicInfo.customer_id, customers])

  // Filter providers by detected state
  const filteredUtilityProviders = basicInfo.state
    ? utilityProviders.filter(p => p.state === basicInfo.state)
    : utilityProviders

  // Filter rate schedules based on utility provider and building size
  const selectedProvider = utilityProviders.find(prov => String(prov.id) === String(basicInfo.utility_provider_id))
  const filteredRateSchedules = utilityPrograms.filter(p => {
    if (!basicInfo.utility_provider_id) return false
    if (p.utility_name !== selectedProvider?.provider_name) return false
    if (p.business_size && p.business_size !== basicInfo.building_size) return false
    return true
  })

  // Update electric rate when rate schedule is selected from rate_schedules table
  useEffect(() => {
    if (basicInfo.rate_schedule_id) {
      const schedule = rateSchedules.find(s => s.id === parseInt(basicInfo.rate_schedule_id))
      if (schedule?.rate_per_kwh) {
        setBasicInfo(prev => ({
          ...prev,
          electric_rate: parseFloat(schedule.rate_per_kwh),
          rate_schedule: schedule.schedule_name
        }))
      }
    }
  }, [basicInfo.rate_schedule_id, rateSchedules])

  // Reset rate schedule when provider changes
  useEffect(() => {
    setBasicInfo(prev => ({ ...prev, rate_schedule_id: '' }))
  }, [basicInfo.utility_provider_id])

  // Auto-detect state from ZIP code
  useEffect(() => {
    const detectedState = getStateFromZip(basicInfo.zip)
    if (detectedState && detectedState !== basicInfo.state) {
      setBasicInfo(prev => ({ ...prev, state: detectedState }))
    }
  }, [basicInfo.zip])

  // Fetch rate schedules when provider changes
  useEffect(() => {
    if (!basicInfo.utility_provider_id) {
      setRateSchedules([])
      return
    }
    const fetchSchedules = async () => {
      setLoadingSchedules(true)
      const { data } = await supabase
        .from('utility_rate_schedules')
        .select('*')
        .eq('provider_id', basicInfo.utility_provider_id)
        .order('schedule_name')
      setRateSchedules(data || [])
      setLoadingSchedules(false)
    }
    fetchSchedules()
  }, [basicInfo.utility_provider_id])

  // Auto-suggest wattage from fixture_types when lighting_type + category match
  useEffect(() => {
    if (!areaForm.lighting_type || !areaForm.fixture_category) return
    // Don't override if user already has a value
    if (areaForm.existing_wattage && parseInt(areaForm.existing_wattage) > 0) return

    const match = (fixtureTypes || []).find(ft =>
      ft.lamp_type === areaForm.lighting_type &&
      ft.category === areaForm.fixture_category
    )

    if (match?.system_wattage) {
      setAreaForm(prev => ({
        ...prev,
        existing_wattage: match.system_wattage,
        led_wattage: match.led_replacement_watts || prev.led_wattage
      }))
    }
  }, [areaForm.lighting_type, areaForm.fixture_category])

  // Calculate totals
  const calculations = (() => {
    const total_fixtures = areas.reduce((sum, a) => sum + (a.fixture_count || 0), 0)
    const total_existing_watts = areas.reduce((sum, a) => sum + ((a.fixture_count || 0) * (a.existing_wattage || 0)), 0)
    const total_proposed_watts = areas.reduce((sum, a) => sum + ((a.fixture_count || 0) * (a.led_wattage || 0)), 0)
    const watts_reduced = total_existing_watts - total_proposed_watts

    const annual_hours = basicInfo.operating_hours * basicInfo.operating_days
    const annual_savings_kwh = (watts_reduced * annual_hours) / 1000
    const annual_savings_dollars = annual_savings_kwh * basicInfo.electric_rate

    // Calculate rebate — try PDF-verified prescriptive_measures first, fall back to incentive_measures
    let estimated_rebate = 0
    areas.forEach(area => {
      const areaWattsReduced = (area.fixture_count || 0) * ((area.existing_wattage || 0) - (area.led_wattage || 0))

      // 1. Try prescriptive_measures (PDF-verified, precise)
      const today = new Date().toISOString().slice(0, 10)
      const pmMatches = (prescriptiveMeasures || []).filter(pm => {
        if (pm.measure_category !== 'Lighting') return false
        // Require subcategory match
        if (pm.measure_subcategory?.toLowerCase() !== area.fixture_category?.toLowerCase()) return false
        // Skip expired measures
        if (pm.expiration_date && pm.expiration_date < today) return false
        // Match provider if audit has one selected
        const providerMatch = !basicInfo.utility_provider_id || pm.program?.provider_id === basicInfo.utility_provider_id
        return providerMatch
      })

      // Pick closest wattage match
      const pmMatch = pmMatches.length > 0
        ? pmMatches.reduce((best, pm) => {
            const diff = Math.abs((pm.baseline_wattage || 0) - (area.existing_wattage || 0))
            const bestDiff = Math.abs((best.baseline_wattage || 0) - (area.existing_wattage || 0))
            return diff < bestDiff ? pm : best
          })
        : null

      if (pmMatch) {
        const amount = pmMatch.incentive_amount || 0
        const unit = pmMatch.incentive_unit || 'per_fixture'
        let areaIncentive = 0
        if (unit === 'per_watt_reduced') {
          areaIncentive = areaWattsReduced * amount
        } else if (unit === 'per_fixture' || unit === 'per_lamp') {
          areaIncentive = (area.fixture_count || 0) * amount
        } else if (unit === 'per_kw') {
          areaIncentive = (areaWattsReduced / 1000) * amount
        } else {
          areaIncentive = amount
        }
        // Enforce max incentive cap
        if (pmMatch.max_incentive && areaIncentive > pmMatch.max_incentive) {
          areaIncentive = pmMatch.max_incentive
        }
        estimated_rebate += areaIncentive
        return
      }

      // 2. Fall back to incentive_measures (AI-estimated rates)
      const rate = rebateRates.find(r =>
        r.fixture_category === area.fixture_category
      )
      if (rate) {
        if (rate.calc_method === 'per_watt') {
          estimated_rebate += areaWattsReduced * (rate.rate || 0)
        } else if (rate.calc_method === 'per_fixture') {
          estimated_rebate += (area.fixture_count || 0) * (rate.rate || 0)
        }
      }
    })

    // Estimate project cost ($5 per watt reduced as baseline)
    const est_project_cost = watts_reduced * 5
    const net_cost = est_project_cost - estimated_rebate
    const payback_months = annual_savings_dollars > 0 ? (net_cost / (annual_savings_dollars / 12)) : 0

    return {
      total_fixtures,
      total_existing_watts,
      total_proposed_watts,
      watts_reduced,
      annual_savings_kwh,
      annual_savings_dollars,
      estimated_rebate,
      est_project_cost,
      net_cost,
      payback_months
    }
  })()

  const generateAuditId = () => {
    const timestamp = Date.now().toString(36).toUpperCase()
    return `AUD-${timestamp}`
  }

  const handleAddArea = () => {
    if (!areaForm.area_name) {
      alert('Please enter an area name')
      return
    }

    const qty = parseInt(areaForm.fixture_count) || 1
    const existW = parseInt(areaForm.existing_wattage) || 0
    const newW = parseInt(areaForm.led_wattage) || 0
    const newArea = {
      ...areaForm,
      fixture_count: qty,
      existing_wattage: existW,
      led_wattage: newW,
      total_existing_watts: qty * existW,
      total_led_watts: qty * newW,
      area_watts_reduced: qty * (existW - newW)
    }

    if (editingAreaIndex !== null) {
      const updatedAreas = [...areas]
      updatedAreas[editingAreaIndex] = newArea
      setAreas(updatedAreas)
      setEditingAreaIndex(null)
    } else {
      setAreas([...areas, newArea])
    }

    setShowAreaModal(false)
    setAreaForm({
      area_name: '',
      ceiling_height: '',
      fixture_category: 'Linear',
      lighting_type: '',
      fixture_count: 1,
      existing_wattage: '',
      led_replacement_id: '',
      led_wattage: '',
      confirmed: false,
      override_notes: ''
    })
    clearPhotoState()
  }

  const handleEditArea = (index) => {
    setAreaForm(areas[index])
    setEditingAreaIndex(index)
    setShowAreaModal(true)
  }

  const handleDeleteArea = (index) => {
    setAreas(areas.filter((_, i) => i !== index))
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      // Create audit record
      const auditData = {
        company_id: companyId,
        audit_id: generateAuditId(),
        customer_id: basicInfo.customer_id || null,
        address: basicInfo.address,
        city: basicInfo.city,
        state: basicInfo.state,
        zip: basicInfo.zip,
        utility_provider_id: basicInfo.utility_provider_id || null,
        rate_schedule: basicInfo.rate_schedule || null,
        electric_rate: basicInfo.electric_rate,
        operating_hours: basicInfo.operating_hours,
        operating_days: basicInfo.operating_days,
        status: 'Draft',
        total_fixtures: calculations.total_fixtures,
        total_existing_watts: calculations.total_existing_watts,
        total_proposed_watts: calculations.total_proposed_watts,
        watts_reduced: calculations.watts_reduced,
        annual_savings_kwh: calculations.annual_savings_kwh,
        annual_savings_dollars: calculations.annual_savings_dollars,
        estimated_rebate: calculations.estimated_rebate,
        est_project_cost: calculations.est_project_cost,
        net_cost: calculations.net_cost,
        payback_months: calculations.payback_months
      }

      const { data: audit, error: auditError } = await supabase
        .from('lighting_audits')
        .insert(auditData)
        .select()
        .single()

      if (auditError) throw auditError

      // Create area records
      if (areas.length > 0) {
        const areaRecords = areas.map(area => ({
          company_id: companyId,
          audit_id: audit.id,
          area_name: area.area_name,
          ceiling_height: area.ceiling_height || null,
          fixture_category: area.fixture_category,
          lighting_type: area.lighting_type || null,
          fixture_count: area.fixture_count,
          existing_wattage: area.existing_wattage,
          led_replacement_id: area.led_replacement_id || null,
          led_wattage: area.led_wattage,
          total_existing_watts: area.total_existing_watts,
          total_led_watts: area.total_led_watts,
          area_watts_reduced: area.area_watts_reduced,
          confirmed: area.confirmed,
          override_notes: area.override_notes || null
        }))

        const { error: areasError } = await supabase
          .from('audit_areas')
          .insert(areaRecords)

        if (areasError) throw areasError
      }

      // Create sales pipeline entry for tracking
      if (basicInfo.customer_id) {
        const customer = customers.find(c => c.id === basicInfo.customer_id)
        const pipelineData = {
          company_id: companyId,
          customer_id: basicInfo.customer_id,
          salesperson_id: basicInfo.salesperson_id || null,
          stage: 'Audit Created',
          quote_amount: calculations.est_project_cost,
          notes: `Auto-created from lighting audit ${audit.audit_id}`
        }

        await supabase.from('sales_pipeline').insert(pipelineData)
        fetchSalesPipeline?.()
      }

      // Refresh data before navigating so detail page has areas
      await Promise.all([fetchLightingAudits(), fetchAuditAreas()])

      // Navigate to detail
      navigate(`/lighting-audits/${audit.id}`)
    } catch (error) {
      alert('Error saving audit: ' + error.message)
    } finally {
      setSaving(false)
    }
  }

  const formatCurrency = (amount) => {
    return '$' + parseFloat(amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })
  }

  // Map AI category to our categories (now uses shared AI_CATEGORY_MAP)
  const mapCategory = (aiCategory) => AI_CATEGORY_MAP[aiCategory] || 'Linear'

  // Handle photo capture for Lenard AI analysis
  const handlePhotoCapture = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    // Create preview
    const reader = new FileReader()
    reader.onload = (ev) => setPhotoPreview(ev.target.result)
    reader.readAsDataURL(file)

    // Convert to base64 for API
    setAnalyzing(true)
    setAiResult(null)

    const base64Reader = new FileReader()
    base64Reader.onload = async (ev) => {
      const base64 = ev.target.result.split(',')[1]

      try {
        // Build product list for AI matching
        const productList = ledProducts.map(p => ({
          id: p.id,
          name: p.name,
          description: p.description || '',
          wattage: p.unit_price ? undefined : undefined // wattage not stored separately
        }))

        const response = await fetch(
          `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-fixture`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
            },
            body: JSON.stringify({
              imageBase64: base64,
              auditContext: {
                areaName: areaForm.area_name || 'Unknown Area',
                buildingType: 'Commercial'
              },
              availableProducts: productList,
              fixtureTypes: (fixtureTypes || []).map(ft => ({
                fixture_name: ft.fixture_name,
                category: ft.category,
                lamp_type: ft.lamp_type,
                system_wattage: ft.system_wattage,
                led_replacement_watts: ft.led_replacement_watts
              }))
            })
          }
        )

        const data = await response.json()

        if (data?.success && data?.analysis) {
          setAiResult(data.analysis)

          // Auto-fill ALL form fields
          const a = data.analysis
          setAreaForm(prev => ({
            ...prev,
            area_name: a.area_name || prev.area_name || a.fixture_type || '',
            fixture_category: mapCategory(a.fixture_category),
            lighting_type: a.lamp_type || prev.lighting_type,
            fixture_count: a.fixture_count || prev.fixture_count,
            existing_wattage: a.existing_wattage_per_fixture || prev.existing_wattage,
            ceiling_height: a.ceiling_height_estimate || prev.ceiling_height,
            led_wattage: a.led_replacement_wattage || prev.led_wattage,
            led_replacement_id: a.recommended_product_id || prev.led_replacement_id,
            override_notes: a.notes ? `AI Notes: ${a.notes}` : prev.override_notes
          }))
        } else {
          alert('Lenard had trouble analyzing this photo. Please try again or fill in manually.')
        }
      } catch (err) {
        console.error('Error calling analyze-fixture:', err)
        alert('Could not connect to Lenard. Please try again.')
      }

      setAnalyzing(false)
    }
    base64Reader.readAsDataURL(file)
  }

  // Clear photo state
  const clearPhotoState = () => {
    setPhotoPreview(null)
    setAiResult(null)
    setAnalyzing(false)
  }

  // Filter products by fixture category keywords when possible, fall back to all products
  const ledProducts = useMemo(() => {
    const allProducts = products.filter(p => p.type === 'Product')
    if (!areaForm.fixture_category || areaForm.fixture_category === 'Other') return allProducts
    const keywords = PRODUCT_CATEGORY_KEYWORDS[areaForm.fixture_category] || []
    if (keywords.length === 0) return allProducts
    const filtered = allProducts.filter(p => {
      const searchText = `${p.name} ${p.description || ''}`.toLowerCase()
      return keywords.some(kw => searchText.includes(kw))
    })
    return filtered.length > 0 ? filtered : allProducts
  }, [products, areaForm.fixture_category])

  return (
    <div className="audit-root page-padding" style={{ padding: '24px' }}>
      <style>{`
        @media (max-width: 768px) {
          .audit-root input, .audit-root select, .audit-root textarea { font-size: 16px !important; }
          .audit-area-modal input, .audit-area-modal select, .audit-area-modal textarea { font-size: 16px !important; }
          .audit-rate-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .audit-root .stat-grid > div { padding: 12px 10px !important; }
          .audit-root .stat-grid > div > div:last-of-type { font-size: 20px !important; }
          .audit-nav button { min-height: 48px !important; }
          .audit-area-actions button { min-width: 44px !important; min-height: 44px !important; padding: 10px 14px !important; }
        }
        @media (max-width: 480px) {
          .audit-root { padding: 12px !important; overflow-x: hidden !important; max-width: 100vw !important; box-sizing: border-box !important; }
          .audit-step-card { padding: 14px !important; overflow: hidden !important; }
          .audit-steps { gap: 4px !important; }
          .audit-step { padding: 10px 6px !important; font-size: 13px !important; min-height: 44px !important; display: flex !important; align-items: center !important; justify-content: center !important; }
          .audit-step-prefix { display: none !important; }
          .audit-header h1 { font-size: 20px !important; }
          .audit-form-grid-2, .audit-form-grid-3 { grid-template-columns: 1fr !important; }

          /* Rate schedule cards: horizontal scroll single row */
          .audit-rate-grid {
            display: flex !important;
            overflow-x: auto !important;
            -webkit-overflow-scrolling: touch !important;
            scroll-snap-type: x mandatory !important;
            padding-bottom: 6px !important;
            gap: 8px !important;
            max-width: 100% !important;
            width: 100% !important;
            box-sizing: border-box !important;
          }
          .audit-rate-grid > div {
            flex: 0 0 130px !important;
            scroll-snap-align: start !important;
            padding: 10px 8px !important;
          }
          .audit-rate-grid > div > svg { width: 22px !important; height: 22px !important; margin-bottom: 2px !important; }
          .audit-rate-grid::-webkit-scrollbar { height: 3px; }
          .audit-rate-grid::-webkit-scrollbar-thumb { background: rgba(90,99,73,0.3); border-radius: 2px; }

          /* Building size cards: compact */
          .audit-size-grid { gap: 8px !important; }
          .audit-size-grid > div { padding: 10px 6px !important; }
          .audit-size-grid > div > svg { width: 24px !important; height: 24px !important; margin-bottom: 2px !important; }

          .audit-area-stats { grid-template-columns: 1fr 1fr !important; }
          .audit-review-details { grid-template-columns: 1fr !important; }
          .audit-nav { gap: 8px !important; }
          .audit-nav button { flex: 1 !important; justify-content: center !important; padding: 14px 16px !important; font-size: 16px !important; min-height: 48px !important; border-radius: 10px !important; }
          .audit-root .stat-grid { grid-template-columns: repeat(2, 1fr) !important; gap: 8px !important; }
          .audit-root .stat-grid > div { padding: 10px !important; }
          .audit-root .stat-grid > div > div:first-of-type { font-size: 11px !important; }
          .audit-root .stat-grid > div > div:last-of-type { font-size: 18px !important; }

          /* Full-screen modal */
          .audit-area-modal { max-width: 100% !important; max-height: 100% !important; width: 100% !important; height: 100% !important; border-radius: 0 !important; padding: 16px !important; }
          .audit-modal-grid-2, .audit-modal-grid-3 { grid-template-columns: 1fr !important; }
          .audit-modal-footer { flex-direction: column !important; }
          .audit-modal-footer button { width: 100% !important; min-height: 48px !important; font-size: 16px !important; border-radius: 10px !important; }

          /* Lenard photo section compact */
          .lenard-photo { padding: 16px !important; border-width: 1px !important; }
          .lenard-photo-emoji { font-size: 28px !important; margin-bottom: 6px !important; }
          .lenard-photo-buttons { flex-direction: column !important; gap: 10px !important; }
          .lenard-photo-buttons > label { width: 100% !important; text-align: center !important; padding: 14px 20px !important; font-size: 16px !important; border-radius: 10px !important; box-sizing: border-box !important; }
        }
      `}</style>
      {/* Header */}
      <div className="audit-header" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <button
          onClick={() => navigate('/lighting-audits')}
          style={{
            padding: '10px',
            backgroundColor: theme.bgCard,
            border: `1px solid ${theme.border}`,
            borderRadius: '8px',
            cursor: 'pointer',
            color: theme.textSecondary
          }}
        >
          <ArrowLeft size={20} />
        </button>
        <h1 style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
          New Lighting Audit
        </h1>
      </div>

      {/* Steps Indicator */}
      <div className="audit-steps" style={{
        display: 'flex',
        gap: '8px',
        marginBottom: '24px'
      }}>
        {[1, 2, 3].map(s => (
          <div
            key={s}
            className="audit-step"
            onClick={() => s < step && setStep(s)}
            style={{
              flex: 1,
              padding: '12px',
              backgroundColor: step >= s ? theme.accent : theme.bgCard,
              color: step >= s ? '#ffffff' : theme.textMuted,
              borderRadius: '8px',
              textAlign: 'center',
              fontSize: '14px',
              fontWeight: '500',
              cursor: s < step ? 'pointer' : 'default',
              border: `1px solid ${step >= s ? theme.accent : theme.border}`
            }}
          >
            <span className="audit-step-prefix">Step {s}: </span>{s === 1 ? 'Basic Info' : s === 2 ? 'Audit Areas' : 'Review'}
          </div>
        ))}
      </div>

      {/* Step 1 - Basic Info */}
      {step === 1 && (
        <div className="audit-step-card" style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '24px'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: theme.text,
            marginBottom: '20px'
          }}>
            Basic Information
          </h2>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Customer and Salesperson */}
            <div className="audit-form-grid-2 form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Customer *
                </label>
                <select
                  value={basicInfo.customer_id}
                  onChange={(e) => setBasicInfo({ ...basicInfo, customer_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                >
                  <option value="">Select Customer</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Salesperson
                </label>
                <select
                  value={basicInfo.salesperson_id}
                  onChange={(e) => setBasicInfo({ ...basicInfo, salesperson_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                >
                  <option value="">Select Salesperson</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '500',
                color: theme.textSecondary,
                marginBottom: '6px'
              }}>
                Address
              </label>
              <input
                type="text"
                value={basicInfo.address}
                onChange={(e) => setBasicInfo({ ...basicInfo, address: e.target.value })}
                placeholder="Street address"
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.bg,
                  color: theme.text,
                  fontSize: '14px'
                }}
              />
            </div>

            <div className="audit-form-grid-3 form-grid" style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  City
                </label>
                <input
                  type="text"
                  value={basicInfo.city}
                  onChange={(e) => setBasicInfo({ ...basicInfo, city: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  State
                </label>
                <input
                  type="text"
                  value={basicInfo.state}
                  onChange={(e) => setBasicInfo({ ...basicInfo, state: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  ZIP
                </label>
                <input
                  type="text"
                  value={basicInfo.zip}
                  onChange={(e) => setBasicInfo({ ...basicInfo, zip: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>

            {/* Utility Provider */}
            <div>
              <label style={{
                display: 'block',
                fontSize: '13px',
                fontWeight: '500',
                color: theme.textSecondary,
                marginBottom: '6px'
              }}>
                Utility Provider {basicInfo.state && <span style={{ color: theme.textMuted, fontWeight: '400' }}>({basicInfo.state})</span>}
              </label>
              <select
                value={basicInfo.utility_provider_id}
                onChange={(e) => setBasicInfo({ ...basicInfo, utility_provider_id: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  borderRadius: '8px',
                  border: `1px solid ${theme.border}`,
                  backgroundColor: theme.bg,
                  color: theme.text,
                  fontSize: '14px'
                }}
              >
                <option value="">{basicInfo.state ? `Select Provider in ${basicInfo.state}` : 'Select Utility Provider'}</option>
                {filteredUtilityProviders.map(p => (
                  <option key={p.id} value={p.id}>{p.provider_name}</option>
                ))}
                {basicInfo.state && filteredUtilityProviders.length === 0 && (
                  <option disabled>No providers found for {basicInfo.state}</option>
                )}
              </select>
              {basicInfo.state && filteredUtilityProviders.length === 0 && utilityProviders.length > 0 && (
                <div style={{ fontSize: '11px', color: theme.textMuted, marginTop: '4px' }}>
                  No providers in {basicInfo.state}.{' '}
                  <span
                    style={{ color: theme.accent, cursor: 'pointer', textDecoration: 'underline' }}
                    onClick={() => setBasicInfo(prev => ({ ...prev, state: '' }))}
                  >
                    Show all providers
                  </span>
                </div>
              )}
            </div>

            {/* Building Size / Rate Schedule - Visual Cards */}
            <div>
              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                fontSize: '13px',
                fontWeight: '500',
                color: theme.textSecondary,
                marginBottom: '8px'
              }}>
                Building Size / Rate Schedule
                {!basicInfo.utility_provider_id && (
                  <span style={{ fontWeight: '400', color: theme.textMuted }}> — select a provider first</span>
                )}
              </label>

              {basicInfo.utility_provider_id && rateSchedules.length > 0 ? (
                <div className="audit-rate-grid" style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(rateSchedules.length, 4)}, 1fr)`, gap: '10px' }}>
                  {rateSchedules.map((sched, idx) => {
                    const isSelected = basicInfo.rate_schedule_id === String(sched.id)
                    const IconComponent = BUILDING_ICONS[sched.customer_category] || DEFAULT_BUILDING_ICON
                    const iconSizes = [28, 34, 40, 48, 52]
                    const iconSize = iconSizes[Math.min(idx, iconSizes.length - 1)]
                    return (
                      <div
                        key={sched.id}
                        onClick={() => setBasicInfo(prev => ({
                          ...prev,
                          rate_schedule_id: String(sched.id),
                          rate_schedule: sched.schedule_name,
                          electric_rate: parseFloat(sched.rate_per_kwh) || prev.electric_rate
                        }))}
                        style={{
                          padding: '14px 12px',
                          borderRadius: '10px',
                          border: `2px solid ${isSelected ? theme.accent : theme.border}`,
                          backgroundColor: isSelected ? (theme.accentBg || 'rgba(90,99,73,0.08)') : theme.bg,
                          cursor: 'pointer',
                          textAlign: 'center',
                          transition: 'all 0.15s ease',
                          position: 'relative'
                        }}
                      >
                        {isSelected && (
                          <div style={{
                            position: 'absolute',
                            top: '6px',
                            right: '6px',
                            width: '18px',
                            height: '18px',
                            borderRadius: '50%',
                            backgroundColor: theme.accent,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Check size={12} color="#fff" />
                          </div>
                        )}
                        <IconComponent
                          size={iconSize}
                          style={{ color: isSelected ? theme.accent : theme.textMuted, marginBottom: '6px' }}
                        />
                        <div style={{
                          fontSize: '13px',
                          fontWeight: '600',
                          color: theme.text,
                          marginBottom: '2px',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}>
                          {sched.customer_category || sched.schedule_name}
                        </div>
                        <div style={{ fontSize: '11px', color: theme.textMuted, marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {sched.schedule_name}
                        </div>
                        {sched.rate_per_kwh != null && (
                          <div style={{
                            fontSize: '15px',
                            fontWeight: '700',
                            color: isSelected ? theme.accent : theme.text,
                            marginTop: '4px'
                          }}>
                            ${Number(sched.rate_per_kwh).toFixed(4)}/kWh
                          </div>
                        )}
                        {sched.demand_charge && (
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>
                            + ${sched.demand_charge}/kW demand
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : basicInfo.utility_provider_id && loadingSchedules ? (
                <div style={{ padding: '16px', textAlign: 'center', color: theme.textMuted, fontSize: '13px' }}>
                  Loading rate schedules...
                </div>
              ) : basicInfo.utility_provider_id ? (
                <div>
                  <div style={{ padding: '12px', textAlign: 'center', color: theme.textMuted, fontSize: '13px', marginBottom: '8px' }}>
                    No rate schedules found for this provider. Select a building size manually:
                  </div>
                  <div className="audit-size-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                    {buildingSizes.map(size => {
                      const isSelected = basicInfo.building_size === size.value
                      const icons = { small: Building, medium: Building2, large: Factory }
                      const IconComp = icons[size.value]
                      const sizes = { small: 28, medium: 36, large: 44 }
                      return (
                        <div
                          key={size.value}
                          onClick={() => setBasicInfo(prev => ({ ...prev, building_size: size.value }))}
                          style={{
                            padding: '14px 12px',
                            borderRadius: '10px',
                            border: `2px solid ${isSelected ? theme.accent : theme.border}`,
                            backgroundColor: isSelected ? (theme.accentBg || 'rgba(90,99,73,0.08)') : theme.bg,
                            cursor: 'pointer',
                            textAlign: 'center'
                          }}
                        >
                          <IconComp size={sizes[size.value]} style={{ color: isSelected ? theme.accent : theme.textMuted, marginBottom: '6px' }} />
                          <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{size.label}</div>
                          <div style={{ fontSize: '11px', color: theme.textMuted }}>{size.description}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              ) : (
                <div className="audit-size-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  {buildingSizes.map(size => {
                    const isSelected = basicInfo.building_size === size.value
                    const icons = { small: Building, medium: Building2, large: Factory }
                    const IconComp = icons[size.value]
                    const sizes = { small: 28, medium: 36, large: 44 }
                    return (
                      <div
                        key={size.value}
                        onClick={() => setBasicInfo(prev => ({ ...prev, building_size: size.value }))}
                        style={{
                          padding: '14px 12px',
                          borderRadius: '10px',
                          border: `2px solid ${isSelected ? theme.accent : theme.border}`,
                          backgroundColor: isSelected ? (theme.accentBg || 'rgba(90,99,73,0.08)') : theme.bg,
                          cursor: 'pointer',
                          textAlign: 'center'
                        }}
                      >
                        <IconComp size={sizes[size.value]} style={{ color: isSelected ? theme.accent : theme.textMuted, marginBottom: '6px' }} />
                        <div style={{ fontSize: '13px', fontWeight: '600', color: theme.text }}>{size.label}</div>
                        <div style={{ fontSize: '11px', color: theme.textMuted }}>{size.description}</div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Electric Rate and Operating Schedule */}
            <div className="audit-form-grid-3 form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Electric Rate ($/kWh)
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="number"
                    step="0.0001"
                    min="0"
                    value={basicInfo.electric_rate}
                    onChange={(e) => setBasicInfo({ ...basicInfo, electric_rate: parseFloat(e.target.value) || 0 })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                  {basicInfo.rate_schedule && (
                    <div style={{
                      fontSize: '11px',
                      color: theme.accent,
                      marginTop: '4px'
                    }}>
                      From: {basicInfo.rate_schedule}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Operating Hours/Day
                </label>
                <input
                  type="number"
                  min="1"
                  max="24"
                  value={basicInfo.operating_hours}
                  onChange={(e) => setBasicInfo({ ...basicInfo, operating_hours: parseInt(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>
              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Operating Days/Year
                </label>
                <input
                  type="number"
                  min="1"
                  max="365"
                  value={basicInfo.operating_days}
                  onChange={(e) => setBasicInfo({ ...basicInfo, operating_days: parseInt(e.target.value) || 0 })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>
            </div>
          </div>

          <div className="audit-nav" style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setStep(2)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: theme.accent,
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Next
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 2 - Audit Areas */}
      {step === 2 && (
        <div className="audit-step-card" style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '24px'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: '20px'
          }}>
            <h2 style={{ fontSize: '18px', fontWeight: '600', color: theme.text }}>
              Audit Areas
            </h2>
            <button
              onClick={() => setShowAreaModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 16px',
                backgroundColor: theme.accent,
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              <Plus size={18} />
              Add Area
            </button>
          </div>

          {areas.length === 0 ? (
            <div style={{
              padding: '40px',
              textAlign: 'center',
              color: theme.textMuted,
              backgroundColor: theme.accentBg,
              borderRadius: '8px'
            }}>
              No areas added yet. Click "Add Area" to start.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {areas.map((area, index) => (
                <div
                  key={index}
                  style={{
                    padding: '16px',
                    backgroundColor: theme.bg,
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`
                  }}
                >
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '12px'
                  }}>
                    <div>
                      <div style={{ fontSize: '16px', fontWeight: '600', color: theme.text }}>
                        {area.area_name}
                      </div>
                      <div style={{ fontSize: '13px', color: theme.textMuted }}>
                        {area.fixture_category}{area.lighting_type ? ` (${area.lighting_type})` : ''} · {area.fixture_count} fixtures
                      </div>
                    </div>
                    <div className="audit-area-actions" style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={() => handleEditArea(index)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: theme.bgCard,
                          color: theme.textSecondary,
                          border: `1px solid ${theme.border}`,
                          borderRadius: '6px',
                          fontSize: '13px',
                          cursor: 'pointer'
                        }}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDeleteArea(index)}
                        style={{
                          padding: '6px 10px',
                          backgroundColor: 'rgba(194,90,90,0.1)',
                          color: '#c25a5a',
                          border: 'none',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  <div className="audit-area-stats" style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(4, 1fr)',
                    gap: '12px'
                  }}>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>Existing Watts</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                        {area.existing_wattage}W × {area.fixture_count}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>New Watts</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                        {area.led_wattage}W × {area.fixture_count}
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>Total Existing</div>
                      <div style={{ fontSize: '14px', fontWeight: '500', color: theme.text }}>
                        {(area.fixture_count * area.existing_wattage).toLocaleString()}W
                      </div>
                    </div>
                    <div>
                      <div style={{ fontSize: '11px', color: theme.textMuted }}>Watts Reduced</div>
                      <div style={{ fontSize: '14px', fontWeight: '600', color: '#4a7c59' }}>
                        {(area.fixture_count * (area.existing_wattage - area.led_wattage)).toLocaleString()}W
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="audit-nav" style={{
            marginTop: '24px',
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <button
              onClick={() => setStep(1)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: theme.bg,
                color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={18} />
              Back
            </button>
            <button
              onClick={() => setStep(3)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: theme.accent,
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Next
              <ArrowRight size={18} />
            </button>
          </div>
        </div>
      )}

      {/* Step 3 - Review */}
      {step === 3 && (
        <div className="audit-step-card" style={{
          backgroundColor: theme.bgCard,
          borderRadius: '12px',
          border: `1px solid ${theme.border}`,
          padding: '24px'
        }}>
          <h2 style={{
            fontSize: '18px',
            fontWeight: '600',
            color: theme.text,
            marginBottom: '20px'
          }}>
            Review & Calculate
          </h2>

          {/* Summary Stats */}
          <div className="stat-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: theme.accentBg,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Total Fixtures</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {calculations.total_fixtures}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: theme.accentBg,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Watts Reduced</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {calculations.watts_reduced.toLocaleString()}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(74,124,89,0.1)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Annual Savings (kWh)</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#4a7c59' }}>
                {Math.round(calculations.annual_savings_kwh).toLocaleString()}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(194,139,56,0.1)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Annual Savings ($)</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#c28b38' }}>
                {formatCurrency(calculations.annual_savings_dollars)}
              </div>
            </div>
          </div>

          <div className="stat-grid" style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
            gap: '16px',
            marginBottom: '24px'
          }}>
            <div style={{
              padding: '16px',
              backgroundColor: 'rgba(74,124,89,0.15)',
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Est. Rebate</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: '#4a7c59' }}>
                {formatCurrency(calculations.estimated_rebate)}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: theme.bg,
              borderRadius: '8px',
              textAlign: 'center',
              border: `1px solid ${theme.border}`
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Est. Project Cost</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {formatCurrency(calculations.est_project_cost)}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: theme.bg,
              borderRadius: '8px',
              textAlign: 'center',
              border: `1px solid ${theme.border}`
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Net Cost</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.text }}>
                {formatCurrency(calculations.net_cost)}
              </div>
            </div>
            <div style={{
              padding: '16px',
              backgroundColor: theme.accentBg,
              borderRadius: '8px',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '12px', color: theme.textMuted }}>Payback</div>
              <div style={{ fontSize: '24px', fontWeight: '700', color: theme.accent }}>
                {Math.round(calculations.payback_months)} mo
              </div>
            </div>
          </div>

          {/* Basic Info Summary */}
          <div style={{
            padding: '16px',
            backgroundColor: theme.bg,
            borderRadius: '8px',
            marginBottom: '16px'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
              Audit Details
            </h3>
            <div className="audit-review-details" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', fontSize: '13px' }}>
              <div><span style={{ color: theme.textMuted }}>Customer:</span> {customers.find(c => c.id === basicInfo.customer_id)?.name || 'None'}</div>
              <div><span style={{ color: theme.textMuted }}>Salesperson:</span> {employees.find(e => e.id === basicInfo.salesperson_id)?.name || 'None'}</div>
              <div><span style={{ color: theme.textMuted }}>Location:</span> {basicInfo.city}, {basicInfo.state}</div>
              <div><span style={{ color: theme.textMuted }}>Building Size:</span> {buildingSizes.find(s => s.value === basicInfo.building_size)?.label || basicInfo.building_size}</div>
              <div><span style={{ color: theme.textMuted }}>Electric Rate:</span> ${basicInfo.electric_rate}/kWh</div>
              <div><span style={{ color: theme.textMuted }}>Operating:</span> {basicInfo.operating_hours}h/day, {basicInfo.operating_days} days/yr</div>
            </div>
          </div>

          {/* Areas Summary */}
          <div style={{
            padding: '16px',
            backgroundColor: theme.bg,
            borderRadius: '8px',
            marginBottom: '24px'
          }}>
            <h3 style={{ fontSize: '14px', fontWeight: '600', color: theme.text, marginBottom: '12px' }}>
              Areas ({areas.length})
            </h3>
            {areas.map((area, i) => (
              <div key={i} style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: i < areas.length - 1 ? `1px solid ${theme.border}` : 'none',
                fontSize: '13px'
              }}>
                <span>{area.area_name} ({area.fixture_count} {area.fixture_category}{area.lighting_type ? ` - ${area.lighting_type}` : ''})</span>
                <span style={{ color: '#4a7c59', fontWeight: '500' }}>
                  -{(area.fixture_count * (area.existing_wattage - area.led_wattage)).toLocaleString()}W
                </span>
              </div>
            ))}
          </div>

          <div className="audit-nav" style={{
            display: 'flex',
            justifyContent: 'space-between'
          }}>
            <button
              onClick={() => setStep(2)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: theme.bg,
                color: theme.text,
                border: `1px solid ${theme.border}`,
                borderRadius: '8px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={18} />
              Back
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 24px',
                backgroundColor: saving ? theme.border : '#4a7c59',
                color: '#ffffff',
                border: 'none',
                borderRadius: '8px',
                fontSize: '14px',
                fontWeight: '500',
                cursor: saving ? 'not-allowed' : 'pointer'
              }}
            >
              <Check size={18} />
              {saving ? 'Saving...' : 'Save Audit'}
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit Area Modal */}
      {showAreaModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div className="audit-area-modal modal-content" style={{
            backgroundColor: theme.bgCard,
            borderRadius: '16px',
            padding: '24px',
            width: '100%',
            maxWidth: '500px',
            maxHeight: '90vh',
            overflow: 'auto'
          }}>
            <h2 style={{
              fontSize: '20px',
              fontWeight: '700',
              color: theme.text,
              marginBottom: '20px'
            }}>
              {editingAreaIndex !== null ? 'Edit Area' : 'Add Audit Area'}
            </h2>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Lenard AI Photo Analysis */}
              {editingAreaIndex === null && (
                <div className="lenard-photo" style={{
                  backgroundColor: 'rgba(90, 99, 73, 0.1)',
                  border: '2px dashed #5a6349',
                  borderRadius: '12px',
                  padding: '24px',
                  textAlign: 'center'
                }}>
                  {!photoPreview ? (
                    <>
                      <div className="lenard-photo-emoji" style={{ fontSize: '40px', marginBottom: '12px' }}>🔦</div>
                      <p style={{ color: '#5a6349', fontWeight: '600', marginBottom: '4px', margin: '0 0 4px' }}>
                        Let Lenard identify your fixtures
                      </p>
                      <p style={{ color: '#7d8a7f', fontSize: '14px', marginBottom: '20px', margin: '0 0 20px' }}>
                        Snap a photo and AI will auto-fill the form
                      </p>
                      <div className="lenard-photo-buttons" style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
                        <label style={{
                          padding: '12px 24px',
                          backgroundColor: '#5a6349',
                          color: '#fff',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          display: 'inline-block'
                        }}>
                          📷 Take Photo
                          <input
                            type="file"
                            accept="image/*"
                            capture="environment"
                            onChange={handlePhotoCapture}
                            style={{ display: 'none' }}
                          />
                        </label>
                        <label style={{
                          padding: '12px 24px',
                          backgroundColor: 'transparent',
                          color: '#5a6349',
                          border: '2px solid #5a6349',
                          borderRadius: '8px',
                          cursor: 'pointer',
                          fontWeight: '600',
                          display: 'inline-block'
                        }}>
                          📁 Upload
                          <input
                            type="file"
                            accept="image/*"
                            onChange={handlePhotoCapture}
                            style={{ display: 'none' }}
                          />
                        </label>
                      </div>
                    </>
                  ) : (
                    <>
                      <img
                        src={photoPreview}
                        alt="Fixture"
                        style={{
                          maxWidth: '100%',
                          maxHeight: '180px',
                          borderRadius: '8px',
                          marginBottom: '16px'
                        }}
                      />
                      {analyzing ? (
                        <div style={{ color: '#5a6349' }}>
                          <p style={{ fontWeight: '600', margin: '0 0 4px' }}>🔦 Lenard is analyzing...</p>
                          <p style={{ fontSize: '13px', color: '#7d8a7f', margin: 0 }}>Identifying fixtures, counting, estimating wattage</p>
                        </div>
                      ) : aiResult ? (
                        <div style={{
                          backgroundColor: '#fff',
                          padding: '16px',
                          borderRadius: '8px',
                          textAlign: 'left',
                          border: '1px solid #d6cdb8'
                        }}>
                          <div style={{ color: '#5a6349', fontWeight: '600', marginBottom: '8px' }}>✅ Lenard detected:</div>
                          <div style={{ color: '#2c3530', fontWeight: '600' }}>{aiResult.fixture_type}</div>
                          <div style={{ color: '#5a6349', fontSize: '14px' }}>
                            {aiResult.fixture_count} fixtures • ~{aiResult.existing_wattage_per_fixture}W each
                          </div>
                          <div style={{ color: '#7d8a7f', fontSize: '12px', marginTop: '8px' }}>
                            Confidence: {aiResult.confidence} • {aiResult.lamp_type} lamps
                          </div>
                        </div>
                      ) : null}
                      <button
                        type="button"
                        onClick={clearPhotoState}
                        style={{
                          marginTop: '16px',
                          padding: '8px 20px',
                          backgroundColor: 'transparent',
                          color: '#7d8a7f',
                          border: '1px solid #d6cdb8',
                          borderRadius: '6px',
                          cursor: 'pointer'
                        }}
                      >
                        ✕ Clear & Try Again
                      </button>
                    </>
                  )}
                </div>
              )}

              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Area Name *
                  {aiResult?.area_name && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                </label>
                <input
                  type="text"
                  value={areaForm.area_name}
                  onChange={(e) => setAreaForm({ ...areaForm, area_name: e.target.value })}
                  placeholder="e.g., Warehouse Bay 1, Office, Parking Lot"
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                />
              </div>

              <div className="audit-modal-grid-3 form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Fixture Category
                    {aiResult?.fixture_category && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                  </label>
                  <select
                    value={areaForm.fixture_category}
                    onChange={(e) => setAreaForm({ ...areaForm, fixture_category: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  >
                    {FIXTURE_CATEGORIES.map(cat => (
                      <option key={cat} value={cat}>{cat}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Lighting Type
                    {aiResult?.lamp_type && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                  </label>
                  <select
                    value={areaForm.lighting_type}
                    onChange={(e) => setAreaForm({ ...areaForm, lighting_type: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  >
                    <option value="">Select Type</option>
                    {LAMP_TYPES.map(lt => (
                      <option key={lt} value={lt}>{lt}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Ceiling Height (ft)
                    {aiResult?.ceiling_height_estimate && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                  </label>
                  <input
                    type="number"
                    value={areaForm.ceiling_height}
                    onChange={(e) => setAreaForm({ ...areaForm, ceiling_height: e.target.value })}
                    placeholder="Optional"
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              <div className="audit-modal-grid-3 form-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '12px' }}>
                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Fixture Count *
                    {aiResult?.fixture_count && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={areaForm.fixture_count || ''}
                    onChange={(e) => setAreaForm({ ...areaForm, fixture_count: e.target.value === '' ? '' : (parseInt(e.target.value) || 1) })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    Existing Watts
                    {aiResult?.existing_wattage_per_fixture && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={areaForm.existing_wattage || ''}
                    onChange={(e) => setAreaForm({ ...areaForm, existing_wattage: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>

                <div>
                  <label style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '13px',
                    fontWeight: '500',
                    color: theme.textSecondary,
                    marginBottom: '6px'
                  }}>
                    New Watts
                    {aiResult?.led_replacement_wattage && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={areaForm.led_wattage || ''}
                    onChange={(e) => setAreaForm({ ...areaForm, led_wattage: e.target.value === '' ? '' : (parseInt(e.target.value) || 0) })}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: '8px',
                      border: `1px solid ${theme.border}`,
                      backgroundColor: theme.bg,
                      color: theme.text,
                      fontSize: '14px'
                    }}
                  />
                </div>
              </div>

              {/* Quick-select wattage buttons */}
              {areaForm.lighting_type && COMMON_WATTAGES[areaForm.lighting_type]?.length > 0 && (
                <div>
                  <label style={{ fontSize: '12px', color: theme.textMuted, marginBottom: '6px', display: 'block' }}>
                    Common {areaForm.lighting_type} wattages:
                  </label>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                    {COMMON_WATTAGES[areaForm.lighting_type].map(w => (
                      <button
                        key={w}
                        type="button"
                        onClick={() => setAreaForm(prev => ({ ...prev, existing_wattage: w }))}
                        style={{
                          padding: '6px 12px',
                          borderRadius: '6px',
                          border: `1px solid ${parseInt(areaForm.existing_wattage) === w ? theme.accent : theme.border}`,
                          backgroundColor: parseInt(areaForm.existing_wattage) === w ? theme.accentBg : theme.bg,
                          color: parseInt(areaForm.existing_wattage) === w ? theme.accent : theme.textSecondary,
                          fontSize: '13px',
                          fontWeight: parseInt(areaForm.existing_wattage) === w ? '600' : '400',
                          cursor: 'pointer'
                        }}
                      >
                        {w}W
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Replacement Product
                  {aiResult?.recommended_product_id && <Sparkles size={12} style={{ color: '#d4a843' }} title="AI suggested" />}
                </label>
                <select
                  value={areaForm.led_replacement_id}
                  onChange={(e) => setAreaForm({ ...areaForm, led_replacement_id: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px'
                  }}
                >
                  <option value="">Select Product (Optional)</option>
                  {ledProducts.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{
                  display: 'block',
                  fontSize: '13px',
                  fontWeight: '500',
                  color: theme.textSecondary,
                  marginBottom: '6px'
                }}>
                  Notes
                </label>
                <textarea
                  value={areaForm.override_notes}
                  onChange={(e) => setAreaForm({ ...areaForm, override_notes: e.target.value })}
                  rows={2}
                  placeholder="Optional notes..."
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    borderRadius: '8px',
                    border: `1px solid ${theme.border}`,
                    backgroundColor: theme.bg,
                    color: theme.text,
                    fontSize: '14px',
                    resize: 'vertical'
                  }}
                />
              </div>

              <label style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}>
                <input
                  type="checkbox"
                  checked={areaForm.confirmed}
                  onChange={(e) => setAreaForm({ ...areaForm, confirmed: e.target.checked })}
                  style={{ width: '18px', height: '18px' }}
                />
                <span style={{ fontSize: '14px', color: theme.text }}>
                  Confirmed
                </span>
              </label>
            </div>

            <div className="audit-modal-footer" style={{
              display: 'flex',
              gap: '12px',
              marginTop: '24px',
              justifyContent: 'flex-end'
            }}>
              <button
                onClick={() => {
                  setShowAreaModal(false)
                  setEditingAreaIndex(null)
                  setAreaForm({
                    area_name: '',
                    ceiling_height: '',
                    fixture_category: 'Linear',
                    lighting_type: '',
                    fixture_count: 1,
                    existing_wattage: '',
                    led_replacement_id: '',
                    led_wattage: '',
                    confirmed: false,
                    override_notes: ''
                  })
                  clearPhotoState()
                }}
                style={{
                  padding: '10px 20px',
                  backgroundColor: theme.bg,
                  color: theme.text,
                  border: `1px solid ${theme.border}`,
                  borderRadius: '8px',
                  fontSize: '14px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleAddArea}
                style={{
                  padding: '10px 20px',
                  backgroundColor: theme.accent,
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '8px',
                  fontSize: '14px',
                  fontWeight: '500',
                  cursor: 'pointer'
                }}
              >
                {editingAreaIndex !== null ? 'Update' : 'Add'} Area
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
