import { describe, it, expect } from 'vitest'
import { rankCameras, isVirtualCamera, pickWorkingCamera } from './cameraPicker.js'

// Bryce's actual laptop, which is what this exists for.
const BRYCE = [
  { kind: 'videoinput', deviceId: 'int', label: 'Integrated Camera (04f2:b7c1)' },
  { kind: 'videoinput', deviceId: 'nv', label: 'Camera (NVIDIA Broadcast)' },
  { kind: 'audioinput', deviceId: 'mic', label: 'Microphone Array' },
]

const timeout = () => { const e = new Error('Timeout starting video source'); e.name = 'AbortError'; throw e }
const opens = () => ({ getTracks: () => [{ stop() {} }] })

describe('spotting a virtual camera', () => {
  it('knows the ones people actually have installed', () => {
    expect(isVirtualCamera('Camera (NVIDIA Broadcast)')).toBe(true)
    expect(isVirtualCamera('OBS Virtual Camera')).toBe(true)
    expect(isVirtualCamera('Streamlabs Desktop Virtual Webcam')).toBe(true)
    expect(isVirtualCamera('Integrated Camera (04f2:b7c1)')).toBe(false)
    expect(isVirtualCamera('Logitech BRIO')).toBe(false)
    expect(isVirtualCamera(undefined)).toBe(false)
  })
})

describe('what order to try cameras in', () => {
  it('puts real hardware before a virtual camera', () => {
    expect(rankCameras(BRYCE).map(d => d.deviceId)).toEqual(['int', 'nv'])
  })

  it('drops anything that is not a camera', () => {
    expect(rankCameras(BRYCE).some(d => d.deviceId === 'mic')).toBe(false)
  })

  it('tries what worked last time first, even when it is the virtual one', () => {
    // Somebody running OBS deliberately WANTS their virtual camera.
    expect(rankCameras(BRYCE, 'nv').map(d => d.deviceId)).toEqual(['nv', 'int'])
  })

  it('survives an empty or junk list', () => {
    expect(rankCameras([])).toEqual([])
    expect(rankCameras(null)).toEqual([])
    expect(rankCameras([{ kind: 'videoinput' }])).toEqual([])   // no deviceId
  })
})

describe('opening the first camera that actually starts', () => {
  it('falls past a jammed virtual camera onto the real one', async () => {
    // The exact failure on Bryce's machine: the virtual camera is FIRST in
    // Windows' own order, and times out.
    const reversed = [BRYCE[1], BRYCE[0]]
    const tried = []
    const got = await pickWorkingCamera({
      enumerateDevices: async () => reversed,
      getUserMedia: async (c) => {
        const id = c.video.deviceId.exact
        tried.push(id)
        if (id === 'nv') timeout()
        return opens()
      },
    })
    expect(got.deviceId).toBe('int')
    expect(tried).toEqual(['int'])   // ranked first, so the broken one is never even asked
  })

  it('still finds the real camera when the broken one is the remembered one', async () => {
    const got = await pickWorkingCamera({
      preferredId: 'nv',
      enumerateDevices: async () => BRYCE,
      getUserMedia: async (c) => (c.video.deviceId.exact === 'nv' ? timeout() : opens()),
    })
    expect(got.deviceId).toBe('int')
  })

  it('reports every failure when nothing opens, so the dock can say why', async () => {
    const got = await pickWorkingCamera({
      enumerateDevices: async () => BRYCE,
      getUserMedia: async () => timeout(),
    })
    expect(got.deviceId).toBe(null)
    expect(got.errors.map(e => e.name)).toEqual(['AbortError', 'AbortError'])
  })

  it('says NotFound rather than throwing when there is no camera at all', async () => {
    const got = await pickWorkingCamera({
      enumerateDevices: async () => [BRYCE[2]],
      getUserMedia: async () => opens(),
    })
    expect(got.deviceId).toBe(null)
    expect(got.errors[0].name).toBe('NotFound')
  })

  it('does not throw when enumerating itself fails', async () => {
    const got = await pickWorkingCamera({
      enumerateDevices: async () => { throw Object.assign(new Error('nope'), { name: 'NotAllowedError' }) },
      getUserMedia: async () => opens(),
    })
    expect(got.deviceId).toBe(null)
    expect(got.errors[0].name).toBe('NotAllowedError')
  })
})
