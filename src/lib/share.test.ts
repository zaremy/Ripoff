import { beforeEach, describe, expect, it, vi } from 'vitest'

// The native half of the share path. These stand in for the Capacitor bridge
// so the drain logic can be driven without a device.
// vi.mock is hoisted above this file's own declarations, so the fakes it
// closes over have to be hoisted with it.
const { getPendingShares, clearPendingShares } = vi.hoisted(() => ({
  getPendingShares: vi.fn(),
  clearPendingShares: vi.fn(async () => {}),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => true,
    isPluginAvailable: () => true,
  },
  registerPlugin: () => ({ getPendingShares, clearPendingShares }),
}))

// jsdom cannot decode an image, and a page-only share is not under test here.
vi.mock('./image', () => ({
  decodeDimensions: vi.fn(async () => ({ width: 100, height: 200 })),
  makeThumbnail: vi.fn(async (blob: Blob) => blob),
}))

import { drainPendingShares } from './share'

/** One screenshot sitting in the App Group queue. */
function queueOneScreenshot() {
  getPendingShares.mockResolvedValue({
    items: [{ id: 'shot.png', data: btoa('pixels'), mime: 'image/png' }],
  })
}

describe('drainPendingShares', () => {
  beforeEach(() => {
    getPendingShares.mockReset()
    clearPendingShares.mockClear()
  })

  it('hands back the queued screenshot', async () => {
    queueOneScreenshot()
    const incoming = await drainPendingShares()
    expect(incoming).toHaveLength(1)
    expect(clearPendingShares).toHaveBeenCalledWith({ ids: ['shot.png'] })
  })

  // Foregrounding fires visibilitychange and focus, and the launch pull can
  // still be running behind them. Each of those calls this function. Before
  // the in-flight guard they all read the queue before any of them cleared it,
  // so a single share reached the capture sheet three times over.
  it('gives one screenshot to exactly one caller when resume signals overlap', async () => {
    queueOneScreenshot()

    const results = await Promise.all([
      drainPendingShares(),
      drainPendingShares(),
      drainPendingShares(),
    ])

    const delivered = results.flat()
    expect(delivered).toHaveLength(1)
    expect(clearPendingShares).toHaveBeenCalledTimes(1)
  })

  it('drains again once the previous drain has finished', async () => {
    queueOneScreenshot()
    await drainPendingShares()

    queueOneScreenshot()
    const second = await drainPendingShares()

    expect(second).toHaveLength(1)
    expect(clearPendingShares).toHaveBeenCalledTimes(2)
  })
})
