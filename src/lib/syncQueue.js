import { offlineDb } from './offlineDb'
import { supabase } from './supabase'

// Map Zustand store keys to Supabase table names
const STORE_TO_TABLE = {
  lightingAudits: 'lighting_audits',
  auditAreas: 'audit_areas',
  leads: 'leads',
  salesPipeline: 'sales_pipeline',
  quotes: 'quotes',
  quoteLines: 'quote_lines',
  appointments: 'appointments',
  customers: 'customers',
  jobs: 'jobs',
  jobSections: 'job_sections'
}

// Fields to strip before sending to Supabase (temp metadata)
const STRIP_FIELDS = ['_tempId', '_pending']

function cleanRecord(data) {
  const clean = { ...data }
  for (const f of STRIP_FIELDS) delete clean[f]
  // Remove temp_ id — Supabase will auto-generate
  if (typeof clean.id === 'string' && clean.id.startsWith('temp_')) delete clean.id
  return clean
}

// Replace any temp_ foreign keys with real IDs from the map
async function resolveTempIds(data) {
  const resolved = { ...data }
  for (const [key, val] of Object.entries(resolved)) {
    if (typeof val === 'string' && val.startsWith('temp_')) {
      const mapping = await offlineDb.get('_idMap', val)
      if (mapping?.realId) {
        resolved[key] = mapping.realId
      }
    }
  }
  return resolved
}

let _processing = false
let _onSyncUpdate = null // callback for UI updates

// Set callback for sync status changes (used by OfflineBanner)
export function onSyncUpdate(callback) {
  _onSyncUpdate = callback
}

function notifyUpdate() {
  if (_onSyncUpdate) _onSyncUpdate()
}

// Add an operation to the sync queue
async function enqueue(entry) {
  const queueEntry = {
    id: crypto.randomUUID(),
    table: entry.table,           // Zustand store key (e.g., 'lightingAudits')
    operation: entry.operation,   // 'insert' | 'update' | 'delete'
    data: entry.data,             // Record data
    tempId: entry.tempId || null, // For inserts: the temp_ ID assigned locally
    parentTempId: entry.parentTempId || null,
    parentFkField: entry.parentFkField || null,
    status: 'pending',
    retries: 0,
    createdAt: Date.now(),
    error: null
  }
  await offlineDb.put('_syncQueue', queueEntry)
  notifyUpdate()
}

// Get count of pending/failed items
async function getPendingCount() {
  const all = await offlineDb.getAll('_syncQueue')
  return all.filter(e => e.status === 'pending' || e.status === 'failed').length
}

// Get count of items that exhausted all retries
async function getStuckCount() {
  const all = await offlineDb.getAll('_syncQueue')
  return all.filter(e => e.status === 'failed' && e.retries >= 10).length
}

// Get all queue entries (for debugging / UI)
async function getQueue() {
  return await offlineDb.getAll('_syncQueue')
}

// Process the sync queue — call when online
async function processQueue() {
  if (_processing) return
  if (!navigator.onLine) return

  _processing = true
  notifyUpdate()

  try {
    const queue = await offlineDb.getAll('_syncQueue')
    const pending = queue
      .filter(e => e.status === 'pending' || (e.status === 'failed' && e.retries < 10))
      .sort((a, b) => a.createdAt - b.createdAt)

    if (pending.length === 0) {
      _processing = false
      notifyUpdate()
      return
    }

    // Process inserts first (parents before children — items without parentTempId first)
    const inserts = pending.filter(e => e.operation === 'insert')
    const parents = inserts.filter(e => !e.parentTempId)
    const children = inserts.filter(e => e.parentTempId)
    const updates = pending.filter(e => e.operation === 'update')
    const deletes = pending.filter(e => e.operation === 'delete')

    // Process in order: parent inserts → child inserts → updates → deletes
    const ordered = [...parents, ...children, ...updates, ...deletes]

    for (const entry of ordered) {
      if (!navigator.onLine) break

      try {
        entry.status = 'syncing'
        await offlineDb.put('_syncQueue', entry)

        const tableName = STORE_TO_TABLE[entry.table] || entry.table
        let resolved = await resolveTempIds(entry.data)
        resolved = cleanRecord(resolved)

        if (entry.operation === 'insert') {
          const { data, error } = await supabase
            .from(tableName)
            .insert(resolved)
            .select()
            .single()

          if (error) throw error

          // Map temp ID to real ID
          if (entry.tempId && data?.id) {
            await offlineDb.put('_idMap', { id: entry.tempId, realId: data.id })

            // Update local IndexedDB record: remove temp, add real
            await offlineDb.remove(entry.table, entry.tempId)
            await offlineDb.put(entry.table, data)
          }

          entry.status = 'synced'
        } else if (entry.operation === 'update') {
          const id = resolved.id
          delete resolved.id
          // Remove fields that shouldn't be in the update
          delete resolved.created_at

          const { error } = await supabase
            .from(tableName)
            .update(resolved)
            .eq('id', id)

          if (error) throw error
          entry.status = 'synced'
        } else if (entry.operation === 'delete') {
          const { error } = await supabase
            .from(tableName)
            .delete()
            .eq('id', resolved.id)

          if (error) throw error
          entry.status = 'synced'
        }

        await offlineDb.put('_syncQueue', entry)
        notifyUpdate()
      } catch (err) {
        console.error(`[syncQueue] Failed ${entry.operation} on ${entry.table}:`, err)
        entry.status = 'failed'
        entry.retries = (entry.retries || 0) + 1
        entry.error = err?.message || String(err)
        await offlineDb.put('_syncQueue', entry)
        notifyUpdate()
      }
    }

    // Clean up synced entries
    await clearSynced()
  } finally {
    _processing = false
    notifyUpdate()
  }
}

// Remove completed entries from the queue
async function clearSynced() {
  const queue = await offlineDb.getAll('_syncQueue')
  for (const entry of queue) {
    if (entry.status === 'synced') {
      await offlineDb.remove('_syncQueue', entry.id)
    }
  }
}

// Check if currently processing
function isProcessing() {
  return _processing
}

export const syncQueue = {
  enqueue,
  processQueue,
  getPendingCount,
  getStuckCount,
  getQueue,
  clearSynced,
  isProcessing
}
