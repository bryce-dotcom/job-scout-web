require('dotenv').config()
const KEY = '44aecf944c03403fb58ee457ec657d0c'
const BASE = 'https://api.housecallpro.com'
async function hcp(p) {
  const r = await fetch(BASE+p, { headers: { Authorization: 'Token '+KEY, Accept: 'application/json' } })
  if (!r.ok) { console.log('  ',r.status,p); return null }
  return r.json()
}
;(async () => {
  for (const q of ['Juan Diego', 'Juan', 'Diego']) {
    console.log('\n=== HCP search:', q)
    const r = await hcp('/customers?q=' + encodeURIComponent(q) + '&page_size=20')
    const list = (r?.customers || [])
    console.log('matches:', list.length)
    for (const c of list.slice(0, 15)) console.log('  ', c.id, c.first_name, c.last_name, '|', c.company || '', '|', c.email || '')
  }
})()
