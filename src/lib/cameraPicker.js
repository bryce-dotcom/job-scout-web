// Finding a camera that actually starts.
//
// Bryce, 2026-10-23: "I'm not the only one going to be running NVIDIA — make
// JobScout work with everything, not just delete it from my computer."
//
// He is right, and uninstalling it was a bandaid. Virtual-camera apps are
// normal on a real laptop: NVIDIA Broadcast, OBS, Streamlabs, the thing that
// came with the webcam. They register a camera device that sits in front of
// the hardware, and when the app behind it is not running — or is wedged, as
// Broadcast was — that device enumerates perfectly and then times out on
// start with AbortError.
//
// The browser's idea of the "default" camera is whatever Windows says, which
// on that laptop was the broken virtual one. LiveKit asks for the default,
// gets a timeout, and reports no camera. Every other camera on the machine
// might be fine; nobody ever asks them.
//
// So: ask them. Try the one that worked last time, then real hardware, then
// the virtual ones, and keep the first that opens. A person with a jammed
// virtual camera gets their real webcam and never learns there was a problem.

/**
 * Apps that insert themselves between the hardware and the browser.
 * Matched against the device LABEL, which is only populated once camera
 * permission has been granted — before that every camera ranks the same,
 * which is fine, because we try them all anyway.
 */
export const VIRTUAL_CAMERA = /nvidia broadcast|obs virtual|streamlabs|snap camera|manycam|xsplit|camo|droidcam|epoccam|virtual camera|vcam|mmhmm|chromacam/i

export function isVirtualCamera(label) {
  return VIRTUAL_CAMERA.test(String(label || ''))
}

/**
 * The order to try cameras in.
 *
 * 1. Whatever worked for this person last time — if their setup is stable,
 *    this is the only one we ever open.
 * 2. Real hardware.
 * 3. Virtual cameras. Not excluded: somebody running OBS deliberately WANTS
 *    their virtual camera, and it works fine when the app behind it is up.
 *    It just must not be the first thing we stake the call on.
 */
export function rankCameras(devices = [], preferredId = null) {
  const cams = (devices || []).filter(d => d?.kind === 'videoinput' && d?.deviceId)
  const score = (d) => {
    if (preferredId && d.deviceId === preferredId) return 0
    return isVirtualCamera(d.label) ? 2 : 1
  }
  return [...cams].sort((a, b) => score(a) - score(b))
}

/**
 * Open the first camera that actually starts.
 *
 * Injectable so it can be tested without a browser. Returns the device that
 * worked, or every error we collected so the dock can say something true
 * about why none of them did.
 *
 * @returns {Promise<{deviceId: string, label: string} | {deviceId: null, errors: Array}>}
 */
export async function pickWorkingCamera({
  preferredId = null,
  enumerateDevices,
  getUserMedia,
} = {}) {
  const errors = []
  let devices = []
  try {
    devices = await enumerateDevices()
  } catch (err) {
    return { deviceId: null, errors: [{ label: null, name: err?.name || 'EnumerateFailed' }] }
  }

  const ordered = rankCameras(devices, preferredId)
  if (ordered.length === 0) return { deviceId: null, errors: [{ label: null, name: 'NotFound' }] }

  for (const device of ordered) {
    try {
      // No resolution constraint here on purpose: this asks "does this camera
      // open at all". Quality is LiveKit's business once we know which one.
      const stream = await getUserMedia({ video: { deviceId: { exact: device.deviceId } } })
      stream.getTracks().forEach(t => t.stop())
      return { deviceId: device.deviceId, label: device.label || '' }
    } catch (err) {
      errors.push({ label: device.label || '', name: err?.name || 'Unknown' })
    }
  }

  return { deviceId: null, errors }
}

/** Browser-backed wrapper, for callers that are not a test. */
export function pickCameraInBrowser(preferredId = null) {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices) {
    return Promise.resolve({ deviceId: null, errors: [{ label: null, name: 'InsecureContext' }] })
  }
  return pickWorkingCamera({
    preferredId,
    enumerateDevices: () => navigator.mediaDevices.enumerateDevices(),
    getUserMedia: (c) => navigator.mediaDevices.getUserMedia(c),
  })
}
