// Free county/state parcel services, one entry each. `read` maps the
// service's own field names onto the one parcel shape the app uses
// (see normalizeParcel in parcels.js). Adding coverage = adding a row here;
// nothing else changes. Every service listed answers without a token and
// sends a CORS header that admits jobscout.appsannex.com (probed before it
// was added — re-probe if a county's GIS moves).
//
// Matching: `state` is the 2-digit FIPS code from TIGER; `county` is a
// regex on the TIGER county name, or absent for a statewide service.
// Utah is not here: UGRC is matched by code in parcels.js because its
// layer name changes per county and the owner names come from a second
// service.

const num = v => { if (v == null || v === '') return null; const n = Number(String(v).replace(/[^0-9.-]/g, '')); return Number.isFinite(n) ? n : null }
const clean = s => (s == null ? '' : String(s)).replace(/\s+/g, ' ').trim()
const dateStr = v => {
  if (!v) return null
  const d = typeof v === 'number' ? new Date(v) : new Date(String(v))
  // Epoch 0 / 1900-01-01 are the usual 'no sale' placeholders.
  return Number.isNaN(d.getTime()) || d.getFullYear() <= 1901 ? null : d.toISOString().slice(0, 10)
}

// '20150717' -> '2015-07-17'
const ymd = v => { const t = clean(v); return /^\d{8}$/.test(t) ? `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}` : dateStr(t) }
const join = (...parts) => parts.filter(x => x != null && String(x).trim() !== '').map(x => String(x).trim()).join(', ')
const words = (...parts) => parts.filter(x => x != null && String(x).trim() !== '').map(x => String(x).trim()).join(' ')

// County entries come before the statewide entry for the same state so the
// richer county record wins (Wake before NC OneMap, Denver before Colorado).
export const PARCEL_SOURCES = [
  {
    id: 'maricopa', label: 'Maricopa County Assessor', state: '04', county: /^Maricopa/i,
    url: 'https://gis.mcassessor.maricopa.gov/arcgis/rest/services/Parcels/MapServer/0',
    fields: 'APN,OWNER_NAME,PHYSICAL_ADDRESS,PHYSICAL_CITY,PHYSICAL_ZIP,MAIL_ADDRESS,SALE_DATE,SALE_PRICE,LAND_SIZE,CONST_YEAR,LIVING_SPACE,FCV_CUR,PUC,SUBNAME,LATITUDE,LONGITUDE',
    read: p => {
      // PHYSICAL_ADDRESS arrives as "100 N GILBERT RD   GILBERT  85234": keep the
      // street part only, city and ZIP have their own fields.
      let street = clean(p.PHYSICAL_ADDRESS)
      const cityZip = new RegExp(`\\s+${clean(p.PHYSICAL_CITY)}\\s*${clean(p.PHYSICAL_ZIP)}\\s*$`, 'i')
      if (p.PHYSICAL_CITY) street = street.replace(cityZip, '').trim()
      return {
        parcel_id: p.APN, address: street, city: p.PHYSICAL_CITY, zip: p.PHYSICAL_ZIP,
        owner_name: p.OWNER_NAME, mail_address: p.MAIL_ADDRESS,
        year_built: num(p.CONST_YEAR), sqft: num(p.LIVING_SPACE), lot_acres: p.LAND_SIZE ? +(num(p.LAND_SIZE) / 43560).toFixed(2) : null,
        market_value: num(p.FCV_CUR), last_sale_date: dateStr(p.SALE_DATE), last_sale_price: num(p.SALE_PRICE),
        subdivision: p.SUBNAME, source_url: `https://mcassessor.maricopa.gov/mcs/?q=${encodeURIComponent(p.APN || '')}`,
        lat: p.LATITUDE ?? null, lng: p.LONGITUDE ?? null
      }
    }
  },
  {
    id: 'pima', label: 'Pima County Assessor', state: '04', county: /^Pima/i,
    url: 'https://gisdata.pima.gov/arcgis1/rest/services/GISOpenData/LandRecords/MapServer/12', fields: '*',
    read: p => ({
      parcel_id: p.PARCEL, address: p.ADDRESS_OL, city: p.JURIS_OL, zip: p.ZIP,
      owner_name: p.MAIL1, mail_address: join(p.MAIL2, p.MAIL3),
      lot_acres: num(p.GISACRES), market_value: num(p.FCV), last_sale_date: ymd(p.RECORDDATE), source_url: p.LINK
    })
  },
  {
    id: 'arkansas', label: 'Arkansas GIS Office parcels', state: '05',
    url: 'https://gis.arkansas.gov/arcgis/rest/services/FEATURESERVICES/Planning_Cadastre/FeatureServer/6', fields: '*',
    read: p => ({
      parcel_id: p.parcelid, address: p.adrlabel || words(p.adrnum, p.predir, p.pstrnam, p.pstrtype), city: p.adrcity, zip: p.adrzip5,
      owner_name: p.ownername, market_value: num(p.totalvalue), land_value: num(p.landvalue)
    })
  },
  {
    id: 'denver', label: 'Denver Assessor', state: '08', county: /^Denver/i,
    url: 'https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_PROP_PARCELS_A/FeatureServer/245', fields: '*',
    read: p => ({
      parcel_id: p.SCHEDNUM, address: p.SITUS_ADDRESS_LINE1, city: p.SITUS_CITY, zip: p.SITUS_ZIP,
      owner_name: p.OWNER_NAME, mail_address: join(p.OWNER_ADDRESS_LINE1, p.OWNER_ADDRESS_LINE2, p.OWNER_CITY, p.OWNER_STATE, p.OWNER_ZIP),
      year_built: num(p.RES_ORIG_YEAR_BUILT) || num(p.COM_ORIG_YEAR_BUILT), sqft: num(p.RES_ABOVE_GRADE_AREA) || num(p.COM_GROSS_AREA), lot_sqft: num(p.LAND_AREA),
      market_value: num(p.APPRAISED_TOTAL_VALUE), last_sale_date: dateStr(p.SALE_DATE), last_sale_price: num(p.SALE_PRICE)
    })
  },
  {
    id: 'colorado', label: 'Colorado statewide parcels', state: '08',
    url: 'https://gis.colorado.gov/public/rest/services/Address_and_Parcel/Colorado_Public_Parcels/FeatureServer/0', fields: '*',
    // Road right-of-way polygons carry parcel_id 'ROW' and no owner: not a house.
    read: p => p.parcel_id === 'ROW' || !p.owner ? null : ({
      parcel_id: p.parcel_id || p.account, address: p.situsAdd, city: p.sitAddCty, zip: p.sitAddZip,
      owner_name: [p.owner, p.owner2].filter(Boolean).join('; '), mail_address: join(p.ownerAdd, p.ownAddCty, p.ownAddStt, p.ownAddZip),
      lot_acres: num(p.landAcres), market_value: num(p.apprValTot), last_sale_date: dateStr(p.saleDate), last_sale_price: num(p.salePrice),
      prop_class: p.landUseDsc, source_url: p.URL
    })
  },
  {
    id: 'florida', label: 'Florida DOR statewide cadastral', state: '12',
    url: 'https://services9.arcgis.com/Gh9awoU677aKree0/arcgis/rest/services/Florida_Statewide_Cadastral/FeatureServer/0',
    fields: 'PARCEL_ID,OWN_NAME,PHY_ADDR1,PHY_ADDR2,PHY_CITY,PHY_ZIPCD,OWN_ADDR1,OWN_ADDR2,OWN_CITY,OWN_STATE,OWN_ZIPCD,ACT_YR_BLT,TOT_LVG_AR,LND_SQFOOT,JV,SALE_YR1,SALE_MO1,SALE_PRC1',
    read: p => ({
      parcel_id: p.PARCEL_ID, address: words(p.PHY_ADDR1, p.PHY_ADDR2), city: p.PHY_CITY, zip: p.PHY_ZIPCD,
      owner_name: p.OWN_NAME, mail_address: join(p.OWN_ADDR1, p.OWN_ADDR2, p.OWN_CITY, p.OWN_STATE, p.OWN_ZIPCD),
      year_built: num(p.ACT_YR_BLT), sqft: num(p.TOT_LVG_AR), lot_sqft: num(p.LND_SQFOOT), market_value: num(p.JV),
      last_sale_date: num(p.SALE_YR1) ? `${p.SALE_YR1}-${String(p.SALE_MO1 || 1).padStart(2, '0')}` : null, last_sale_price: num(p.SALE_PRC1)
    })
  },
  {
    id: 'massgis', label: 'MassGIS parcels', state: '25',
    url: 'https://arcgisserver.digital.mass.gov/arcgisserver/rest/services/AGOL/L3Parcels_feature_service/FeatureServer/0',
    fields: 'MAP_PAR_ID,LOC_ID,PROP_ID,OWNER1,SITE_ADDR,CITY,ZIP,OWN_ADDR,OWN_CITY,OWN_STATE,OWN_ZIP,YEAR_BUILT,BLD_AREA,LOT_SIZE,TOTAL_VAL,LS_DATE,LS_PRICE',
    read: p => ({
      parcel_id: p.PROP_ID || p.LOC_ID || p.MAP_PAR_ID, address: p.SITE_ADDR, city: p.CITY, zip: p.ZIP,
      owner_name: p.OWNER1, mail_address: join(p.OWN_ADDR, p.OWN_CITY, p.OWN_STATE, p.OWN_ZIP),
      year_built: num(p.YEAR_BUILT), sqft: num(p.BLD_AREA), lot_acres: num(p.LOT_SIZE), market_value: num(p.TOTAL_VAL),
      last_sale_date: ymd(p.LS_DATE), last_sale_price: num(p.LS_PRICE)
    })
  },
  {
    id: 'montana', label: 'Montana Cadastral', state: '30',
    url: 'https://gis.dnrc.mt.gov/arcgis/rest/services/DNRALL/Cadastral/FeatureServer/0', fields: '*',
    read: p => ({
      parcel_id: p.PARCELID, address: words(p.AddressLine1, p.AddressLine2), city: clean(p.CityStateZip).split(/,| MT/)[0],
      owner_name: p.OwnerName, mail_address: join(p.OwnerAddress1, p.OwnerAddress2, p.OwnerCity, p.OwnerState, p.OwnerZipCode),
      lot_acres: num(p.GISAcres), market_value: num(p.TotalValue), land_value: num(p.TotalLandValue), source_url: p.PropertyCardLink
    })
  },
  {
    id: 'clark', label: 'Clark County GIS', state: '32', county: /^Clark/i,
    url: 'https://services2.arcgis.com/MLoS3Qx4BXmDoTIY/arcgis/rest/services/ParcelPoly_20231212/FeatureServer/6', fields: '*',
    read: p => ({
      parcel_id: p.APN, address: words(p.strno, p.strdir, p.strname, p.strtype, p.strunit),
      owner_name: p.owner, lot_acres: num(p.ASSR_ACRES), prop_class: p.STATELANDUSE
    })
  },
  {
    id: 'washoe', label: 'Washoe County Assessor', state: '32', county: /^Washoe/i,
    url: 'https://gisweb.washoecounty.gov/arcgis/rest/services/OpenData/OpenData/MapServer/0', fields: '*',
    read: p => ({
      parcel_id: p.APN || p.PIN, address: p.FullAddress || words(p.STREETNUM, p.STREETDIR, p.STREET), city: p.CITY, zip: p.SITUSZIP,
      owner_name: words(p.FIRSTNAME, p.LASTNAME), mail_address: join(p.MAILING1, p.MAILING2, p.MAILCITY, p.MAILSTATE, p.MAILZIP),
      year_built: num(p.YEARBLT), sqft: num(p.SQFEET), lot_acres: num(p.ACREAGE), market_value: num(p.TOTALAPR),
      last_sale_date: dateStr(p.SALEDATE), last_sale_price: num(p.SALEPRICE), subdivision: p.SUBNAME
    })
  },
  {
    id: 'nevada', label: 'Nevada statewide parcels (2018 snapshot)', state: '32',
    url: 'https://gis.dot.nv.gov/agsphs/rest/services/Reference/Statewide_Parcels/MapServer/0', fields: '*',
    read: p => ({ parcel_id: p.APN, address: p.SiteAddress, city: p.SiteCity, owner_name: p.OwnerName, lot_acres: num(p.Acres), source_url: p.Website })
  },
  {
    id: 'bernalillo', label: 'Bernalillo County Assessor', state: '35', county: /^Bernalillo/i,
    url: 'https://services.arcgis.com/CWv1abTnC3urn4bV/ArcGIS/rest/services/berncoparcels_forIDO/FeatureServer/0', fields: '*',
    read: p => ({
      // SITUSADD already carries "ALBUQUERQUE NM 87131" on the end; keep the street.
      parcel_id: p.UPC, address: (words(p.SITUSADD, p.SITUSADD2) || clean(p.CompleteSiteAddress)).replace(/\s+(Albuquerque|Los Ranchos|Corrales|Tijeras|Rio Rancho)\b.*$/i, ''),
      city: (clean(p.CompleteSiteAddress || p.SITUSADD).match(/(Albuquerque|Los Ranchos|Corrales|Tijeras|Rio Rancho)/i) || [])[0] || '',
      owner_name: p.OWNER, mail_address: p.CompleteOwnerAddress || join(p.OWNADD, p.OWNADD2), lot_acres: num(p.ACREAGE), prop_class: p.PROPCLASS
    })
  },
  {
    id: 'wake', label: 'Wake County Real Estate', state: '37', county: /^Wake/i,
    url: 'https://maps.wakegov.com/arcgis/rest/services/Property/Parcels/MapServer/0',
    fields: 'PIN_NUM,REID,OWNER,SITE_ADDRESS,CITY_DECODE,ZIPNUM,ADDR1,ADDR2,ADDR3,YEAR_BUILT,HEATEDAREA,DEED_ACRES,TOTAL_VALUE_ASSD,SALE_DATE,TOTSALPRICE',
    read: p => ({
      parcel_id: p.PIN_NUM || p.REID, address: p.SITE_ADDRESS, city: p.CITY_DECODE, zip: p.ZIPNUM,
      owner_name: p.OWNER, mail_address: join(p.ADDR1, p.ADDR2, p.ADDR3),
      year_built: num(p.YEAR_BUILT), sqft: num(p.HEATEDAREA), lot_acres: num(p.DEED_ACRES), market_value: num(p.TOTAL_VALUE_ASSD),
      last_sale_date: dateStr(p.SALE_DATE), last_sale_price: num(p.TOTSALPRICE)
    })
  },
  {
    id: 'nconemap', label: 'NC OneMap parcels', state: '37',
    url: 'https://services.nconemap.gov/secure/rest/services/NC1Map_Parcels/MapServer/1',
    fields: 'parno,altparno,ownname,ownname2,siteadd,scity,szip,mailadd,mcity,mstate,mzip,structyear,gisacres,parval,landval,saledate,cntyname',
    read: p => ({
      parcel_id: p.parno || p.altparno, address: clean(p.siteadd).replace(new RegExp(`\\s+${clean(p.scity)}\\s+NC$`, 'i'), ''), city: p.scity, zip: p.szip,
      owner_name: [p.ownname, p.ownname2].filter(Boolean).join('; '), mail_address: join(p.mailadd, p.mcity, p.mstate, p.mzip),
      year_built: num(p.structyear), lot_acres: num(p.gisacres), market_value: num(p.parval), land_value: num(p.landval), last_sale_date: dateStr(p.saledate)
    })
  },
  {
    id: 'franklin', label: 'Franklin County Auditor', state: '39', county: /^Franklin/i,
    url: 'https://gis.franklincountyohio.gov/hosting/rest/services/ParcelFeatures/Parcel_Features/MapServer/0',
    fields: 'PARCELID,OWNERNME1,OWNERNME2,SITEADDRESS,ZIPCD,PSTLADDRES,PSTLCITYSTZIP,RESYRBLT,RESFLRAREA,BLDGAREA,ACRES,TOTVALUEBASE,SALEDATE,SALEPRICE',
    read: p => ({
      parcel_id: p.PARCELID, address: p.SITEADDRESS, zip: p.ZIPCD,
      owner_name: [p.OWNERNME1, p.OWNERNME2].filter(Boolean).join('; '), mail_address: join(p.PSTLADDRES, p.PSTLCITYSTZIP),
      year_built: num(p.RESYRBLT), sqft: num(p.RESFLRAREA) || num(p.BLDGAREA), lot_acres: num(p.ACRES), market_value: num(p.TOTVALUEBASE),
      last_sale_date: dateStr(p.SALEDATE), last_sale_price: num(p.SALEPRICE)
    })
  },
  {
    id: 'cuyahoga', label: 'Cuyahoga County Fiscal Office', state: '39', county: /^Cuyahoga/i,
    url: 'https://gis.cuyahogacounty.gov/server/rest/services/CCFO/Parcel_Fabric_Taxparcels/FeatureServer/0',
    fields: 'parcel_id,parcel_owner,second_owner,par_addr_all,parcel_addr,parcel_city,parcel_zip,mail_addr_street,mail_city,mail_state,mail_zip,total_res_liv_area,total_com_use_area,parcel_acreage,tax_market_total,last_transfer_date,last_sales_amount',
    read: p => ({
      parcel_id: p.parcel_id, address: clean(p.par_addr_all).split(',')[0] || p.parcel_addr, city: p.parcel_city, zip: p.parcel_zip,
      owner_name: [p.parcel_owner, p.second_owner].filter(Boolean).join('; '), mail_address: join(p.mail_addr_street, p.mail_city, p.mail_state, p.mail_zip),
      sqft: num(p.total_res_liv_area) || num(p.total_com_use_area), lot_acres: num(p.parcel_acreage), market_value: num(p.tax_market_total),
      last_sale_date: dateStr(p.last_transfer_date), last_sale_price: num(p.last_sales_amount)
    })
  },
  {
    id: 'portland', label: 'Portland Maps taxlots (RLIS)', state: '41', county: /^(Multnomah|Washington|Clackamas)/i,
    url: 'https://www.portlandmaps.com/arcgis/rest/services/Public/Taxlots/MapServer/0',
    fields: 'RNO,STATE_ID,PROPERTYID,OWNER1,OWNER2,SITEADDR,SITECITY,SITEZIP,OWNERADDR,OWNERCITY,OWNERSTATE,OWNERZIP,YEARBUILT,BLDGSQFT,A_T_ACRES,TOTALVAL3,SALEDATE,SALEPRICE,COUNTY',
    read: p => ({
      parcel_id: p.RNO || p.STATE_ID || p.PROPERTYID, address: p.SITEADDR, city: p.SITECITY, zip: p.SITEZIP,
      owner_name: [p.OWNER1, p.OWNER2].filter(Boolean).join('; '), mail_address: join(p.OWNERADDR, p.OWNERCITY, p.OWNERSTATE, p.OWNERZIP),
      year_built: num(p.YEARBUILT), sqft: num(p.BLDGSQFT), lot_acres: num(p.A_T_ACRES), market_value: num(p.TOTALVAL3),
      last_sale_date: dateStr(p.SALEDATE), last_sale_price: num(p.SALEPRICE)
    })
  },
  {
    id: 'tennessee', label: 'Tennessee property boundaries', state: '47',
    url: 'https://services1.arcgis.com/YuVBSS7Y1of2Qud1/arcgis/rest/services/Tennessee_Property_Boundaries_Public_Use/FeatureServer/0', fields: '*',
    read: p => ({ parcel_id: p.PARCELID, address: p.ADDRESS, owner_name: [p.OWNER, p.OWNER2].filter(Boolean).join('; '), subdivision: p.SUBDIV, source_url: p.LINK_TPAD || p.LINK_TPV })
  },
  {
    id: 'harris', label: 'Harris County Appraisal District', state: '48', county: /^Harris/i,
    url: 'https://www.gis.hctx.net/arcgis/rest/services/HCAD/Parcels/MapServer/0', fields: '*',
    read: p => ({
      parcel_id: p.HCAD_NUM || p.acct_num, address: words(p.site_str_num, p.site_str_name, p.site_str_sfx), city: p.site_city, zip: p.site_zip,
      owner_name: [p.owner_name_1, p.owner_name_2].filter(Boolean).join('; '), mail_address: join(p.mail_addr_1, p.mail_addr_2, p.mail_city, p.mail_state, p.mail_zip),
      lot_sqft: num(p.land_sqft), market_value: num(p.total_market_val), land_value: num(p.land_value), last_sale_date: dateStr(p.new_owner_date)
    })
  },
  {
    id: 'travis', label: 'Travis Central Appraisal District', state: '48', county: /^Travis/i,
    url: 'https://taxmaps.traviscountytx.gov/arcgis/rest/services/Parcels/MapServer/0', fields: '*',
    read: p => ({
      parcel_id: p.PROP_ID || p.geo_id, address: clean(p.situs_address).replace(/\s+TX\s+\d{5}.*$/i, ''), zip: p.situs_zip,
      owner_name: p.py_owner_name, mail_address: p.py_address, lot_acres: num(p.tcad_acres), market_value: num(p.market_value),
      last_sale_date: dateStr(p.deed_date), source_url: p.hyperlink
    })
  },
  {
    id: 'snohomish', label: 'Snohomish County Assessor', state: '53', county: /^Snohomish/i,
    url: 'https://gis.snoco.org/host/rest/services/Hosted/CADASTRAL__parcels/FeatureServer/0', fields: '*',
    read: p => ({
      parcel_id: p.parcel_id, address: p.situsline1, city: p.situscity, zip: p.situszip,
      owner_name: p.ownername || p.taxprname, mail_address: join(p.taxprline1, p.taxprline2, p.taxprcity, p.taxprstate, p.taxprzip),
      lot_acres: num(p.gis_acres), market_value: num(p.mkttl), land_value: num(p.mklnd), prop_class: p.usecode
    })
  },
  {
    id: 'laramie', label: 'Laramie County GIS', state: '56', county: /^Laramie/i,
    url: 'https://maps.laramiecounty.com/arcgis/rest/services/features/CountyBaseMapFeatures/MapServer/2', fields: '*',
    read: p => ({ parcel_id: p.PIDN || p.pidn || p.OBJECTID, address: words(p.streetno, p.streetname, p.streettype), owner_name: p.name1 || p.primaryowner })
  }
]

export function sourceFor(county) {
  if (!county) return null
  return PARCEL_SOURCES.find(s => s.state === county.state && (!s.county || s.county.test(county.name))) || null
}

// "Utah, Maricopa County AZ" — for the messages that say where parcels are free.
export function coverageLabel() {
  const names = ['Utah', ...PARCEL_SOURCES.map(s => s.label.replace(/ (Assessor|Parcels|GIS).*$/i, ''))]
  return names.join(', ')
}

export { num, clean, dateStr }
