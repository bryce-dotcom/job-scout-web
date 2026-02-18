import { offlineDb } from './offlineDb'

const STORE = '_photoQueue'

let _onUpdate = null

function notify() {
  if (_onUpdate) _onUpdate()
}

/**
 * Queue a photo for AI analysis when back online.
 * @param {Object} entry
 * @param {string} entry.imageBase64 - Base64-encoded image data (no prefix)
 * @param {Object} entry.auditContext - Context for the analyze-fixture call
 * @param {Array}  entry.availableProducts - LED products list
 * @param {Array}  entry.fixtureTypes - Fixture type reference data
 * @param {Array}  entry.prescriptiveMeasures - Prescriptive measures data
 * @param {string|null} entry.areaId - ID of the saved audit area (temp or real)
 * @param {string|null} entry.auditId - ID of the parent audit
 */
async function enqueue(entry) {
  const record = {
    id: crypto.randomUUID(),
    ...entry,
    status: 'pending',
    result: null,
    error: null,
    createdAt: Date.now()
  }
  await offlineDb.put(STORE, record)
  notify()
  return record.id
}

/**
 * Process all pending photos in the queue.
 * Calls the analyze-fixture edge function for each, stores results,
 * and optionally updates the audit area with AI suggestions.
 */
async function processQueue() {
  const all = await offlineDb.getAll(STORE)
  const pending = all.filter(p => p.status === 'pending')
  if (pending.length === 0) return

  for (const photo of pending) {
    // Mark as processing
    photo.status = 'processing'
    await offlineDb.put(STORE, photo)
    notify()

    try {
      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/analyze-fixture`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`
          },
          body: JSON.stringify({
            imageBase64: photo.imageBase64,
            auditContext: photo.auditContext,
            availableProducts: photo.availableProducts || [],
            fixtureTypes: photo.fixtureTypes || [],
            prescriptiveMeasures: photo.prescriptiveMeasures || []
          })
        }
      )

      const data = await response.json()

      if (data?.success && data?.analysis) {
        photo.status = 'done'
        photo.result = data.analysis
        // Free the large base64 data now that analysis is done
        photo.imageBase64 = null
        await offlineDb.put(STORE, photo)

        // If we have an areaId, try to update the audit area with AI results
        if (photo.areaId) {
          await applyResultToArea(photo.areaId, data.analysis)
        }
      } else {
        photo.status = 'failed'
        photo.error = 'AI analysis returned no results'
        await offlineDb.put(STORE, photo)
      }
    } catch (err) {
      photo.status = 'failed'
      photo.error = err.message
      await offlineDb.put(STORE, photo)
    }

    notify()
  }
}

/**
 * Apply AI analysis results to a saved audit area via store mutations.
 */
async function applyResultToArea(areaId, analysis) {
  try {
    // Dynamically import store to avoid circular deps
    const { useStore } = await import('./store')
    const updateAuditArea = useStore.getState().updateAuditArea
    if (!updateAuditArea) return

    const a = analysis
    const updates = {}
    if (a.fixture_category) updates.fixture_category = a.fixture_category
    if (a.lamp_type) updates.lighting_type = a.lamp_type
    if (a.fixture_count) updates.fixture_count = a.fixture_count
    if (a.existing_wattage_per_fixture) updates.existing_wattage = a.existing_wattage_per_fixture
    if (a.led_replacement_wattage) updates.led_wattage = a.led_replacement_wattage
    if (a.ceiling_height_estimate) updates.ceiling_height = a.ceiling_height_estimate
    if (a.recommended_product_id) updates.led_replacement_id = a.recommended_product_id

    // Recalculate derived fields
    if (updates.fixture_count || updates.existing_wattage || updates.led_wattage) {
      const area = useStore.getState().auditAreas.find(ar => String(ar.id) === String(areaId))
      if (area) {
        const qty = updates.fixture_count || area.fixture_count || 1
        const existW = updates.existing_wattage || area.existing_wattage || 0
        const newW = updates.led_wattage || area.led_wattage || 0
        updates.total_existing_watts = qty * existW
        updates.total_led_watts = qty * newW
        updates.area_watts_reduced = updates.total_existing_watts - updates.total_led_watts
      }
    }

    const notes = [
      a.notes ? `AI: ${a.notes}` : '',
      a.rebate_eligible ? `Rebate eligible (~$${a.estimated_rebate_per_fixture}/fixture)` : ''
    ].filter(Boolean).join('. ')
    if (notes) updates.override_notes = notes

    if (Object.keys(updates).length > 0) {
      await updateAuditArea(areaId, updates)
    }
  } catch (e) {
    console.warn('[photoQueue] Failed to apply AI result to area:', e)
  }
}

/**
 * Get count of pending photos.
 */
async function getPendingCount() {
  const all = await offlineDb.getAll(STORE)
  return all.filter(p => p.status === 'pending' || p.status === 'processing').length
}

/**
 * Get all completed results (for display).
 */
async function getResults() {
  const all = await offlineDb.getAll(STORE)
  return all.filter(p => p.status === 'done')
}

/**
 * Clear completed entries.
 */
async function clearDone() {
  const all = await offlineDb.getAll(STORE)
  for (const p of all) {
    if (p.status === 'done') {
      await offlineDb.remove(STORE, p.id)
    }
  }
}

/**
 * Subscribe to queue updates.
 */
function onUpdate(callback) {
  _onUpdate = callback
}

export const photoQueue = {
  enqueue,
  processQueue,
  getPendingCount,
  getResults,
  clearDone,
  onUpdate
}
