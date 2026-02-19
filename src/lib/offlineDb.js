import { openDB } from 'idb'

const DB_NAME = 'jobscout-offline'
const DB_VERSION = 2

// All entity stores (matching Zustand state keys)
const ENTITY_STORES = [
  'employees', 'customers', 'leads', 'salesPipeline', 'appointments',
  'products', 'quotes', 'quoteLines',
  'jobs', 'jobLines', 'jobSections',
  'timeLogs', 'expenses',
  'invoices', 'payments',
  'fleet', 'fleetMaintenance', 'fleetRentals',
  'inventory',
  'lightingAudits', 'auditAreas', 'fixtureTypes',
  'utilityProviders', 'utilityPrograms', 'rebateRates', 'prescriptiveMeasures',
  'communications', 'settings',
  'routes', 'bookings', 'leadPayments', 'utilityInvoices', 'incentives',
  'agents', 'companyAgents', 'laborRates', 'aiModules',
  'pipelineStages',
  'ccIntegration', 'emailTemplates', 'emailCampaigns', 'ccContactMap', 'emailAutomations'
]

// System stores
const SYSTEM_STORES = ['_syncQueue', '_idMap', '_meta', '_photoQueue']

let dbPromise = null

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        // Create all entity stores with 'id' as keyPath
        for (const name of ENTITY_STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' })
          }
        }
        // System stores also use 'id' as keyPath
        for (const name of SYSTEM_STORES) {
          if (!db.objectStoreNames.contains(name)) {
            db.createObjectStore(name, { keyPath: 'id' })
          }
        }
      }
    })
  }
  return dbPromise
}

// Get all records from a store
async function getAll(storeName) {
  try {
    const db = await getDb()
    return await db.getAll(storeName)
  } catch (e) {
    console.warn(`[offlineDb] getAll(${storeName}) failed:`, e)
    return []
  }
}

// Replace all records in a store (clear + put)
async function putAll(storeName, records) {
  try {
    const db = await getDb()
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)
    await store.clear()
    for (const record of records) {
      if (record && record.id != null) {
        await store.put(record)
      }
    }
    await tx.done
  } catch (e) {
    console.warn(`[offlineDb] putAll(${storeName}) failed:`, e)
  }
}

// Upsert a single record
async function put(storeName, record) {
  try {
    if (!record || record.id == null) return
    const db = await getDb()
    await db.put(storeName, record)
  } catch (e) {
    console.warn(`[offlineDb] put(${storeName}) failed:`, e)
  }
}

// Get a single record by ID
async function get(storeName, id) {
  try {
    const db = await getDb()
    return await db.get(storeName, id)
  } catch (e) {
    console.warn(`[offlineDb] get(${storeName}, ${id}) failed:`, e)
    return null
  }
}

// Delete a single record
async function remove(storeName, id) {
  try {
    const db = await getDb()
    await db.delete(storeName, id)
  } catch (e) {
    console.warn(`[offlineDb] remove(${storeName}, ${id}) failed:`, e)
  }
}

// Clear a single store
async function clearStore(storeName) {
  try {
    const db = await getDb()
    await db.clear(storeName)
  } catch (e) {
    console.warn(`[offlineDb] clearStore(${storeName}) failed:`, e)
  }
}

// Clear all stores (for logout)
async function clearAll() {
  try {
    const db = await getDb()
    const allStores = [...ENTITY_STORES, ...SYSTEM_STORES]
    for (const name of allStores) {
      try {
        await db.clear(name)
      } catch (e) {
        // Store might not exist yet
      }
    }
  } catch (e) {
    console.warn('[offlineDb] clearAll failed:', e)
  }
}

// Get count of records in a store
async function count(storeName) {
  try {
    const db = await getDb()
    return await db.count(storeName)
  } catch (e) {
    return 0
  }
}

export const offlineDb = {
  getAll,
  putAll,
  put,
  get,
  remove,
  clearStore,
  clearAll,
  count,
  ENTITY_STORES,
  SYSTEM_STORES
}
