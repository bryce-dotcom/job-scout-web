require('dotenv').config()
const KEY='44aecf944c03403fb58ee457ec657d0c', BASE='https://api.housecallpro.com'
async function hcp(p){const r=await fetch(BASE+p,{headers:{Authorization:'Token '+KEY,Accept:'application/json'}});console.log(' ',r.status,p);if(!r.ok)return null;return r.json()}
;(async()=>{
  const j='job_54e365c0db81423988ea846bc95ef732'
  const a=await hcp('/jobs/'+j+'/invoices'); console.log('  ->',JSON.stringify(a).slice(0,300))
  const b=await hcp('/invoices?job_id='+j); console.log('  ->',JSON.stringify(b).slice(0,300))
})()
