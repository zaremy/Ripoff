import { beforeEach, describe, expect, it, vi } from 'vitest'

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

import { clearQueued, drainPendingShares } from './share'

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

  it('hands back the queued screenshot, tagged with the file it came from', async () => {
    queueOneScreenshot()

    const incoming = await drainPendingShares()

    expect(incoming).toHaveLength(1)
    expect(incoming[0]?.queueId).toBe('shot.png')
  })

  // The queue file is the only durable copy until the capture is committed.
  // iOS kills backgrounded webviews, and does it most eagerly right after a
  // share extension launched the app — so reading must not delete.
  it('leaves the share on disk, because JS memory is not storage', async () => {
    queueOneScreenshot()

    await drainPendingShares()

    expect(clearPendingShares).not.toHaveBeenCalled()
  })

  it('releases a share only when it is explicitly cleared', async () => {
    await clearQueued(['shot.png'])

    expect(clearPendingShares).toHaveBeenCalledWith({ ids: ['shot.png'] })
  })

  it('ignores an empty release rather than calling across the bridge', async () => {
    await clearQueued([])
    await clearQueued([''])

    expect(clearPendingShares).not.toHaveBeenCalled()
  })

  // A share that cannot be turned into an image must stay queued: clearing it
  // would delete the only copy of something the user deliberately shared.
  it('keeps a share it could not convert', async () => {
    getPendingShares.mockResolvedValue({ items: [{ id: 'broken.png' }] })

    const incoming = await drainPendingShares()

    expect(incoming).toHaveLength(0)
    expect(clearPendingShares).not.toHaveBeenCalled()
  })

  // Foregrounding fires visibilitychange and focus, and the launch pull can
  // still be running behind them. Each of those calls this function. Before
  // the in-flight guard they all read the queue at once, and one share
  // arrived at the capture sheet three times over.
  it('gives one screenshot to exactly one caller when resume signals overlap', async () => {
    queueOneScreenshot()

    const results = await Promise.all([
      drainPendingShares(),
      drainPendingShares(),
      drainPendingShares(),
    ])

    expect(results.flat()).toHaveLength(1)
  })

  it('carries tags the share sheet already collected', async () => {
    getPendingShares.mockResolvedValue({
      items: [
        {
          id: 'shot.png',
          data: btoa('pixels'),
          mime: 'image/png',
          tags: JSON.stringify({ source: 'Clash of Clans', relevant_to: ['Inspo / Onboarding'] }),
        },
      ],
    })

    const [incoming] = await drainPendingShares()

    expect(incoming?.tags).toEqual({
      source: 'Clash of Clans',
      relevant_to: ['Inspo / Onboarding'],
    })
  })

  // Bad tags must cost the capture nothing: it arrives untagged and the app
  // asks, exactly as it did before the sheet existed.
  it('keeps the screenshot when the tags are unusable', async () => {
    for (const tags of ['not json', '{}', JSON.stringify({ source: '  ', relevant_to: [] })]) {
      getPendingShares.mockResolvedValue({
        items: [{ id: 'shot.png', data: btoa('pixels'), mime: 'image/png', tags }],
      })

      const [incoming] = await drainPendingShares()

      expect(incoming?.blob).toBeTruthy()
      expect(incoming?.tags).toBeUndefined()
    }
  })

  it('drains again once the previous drain has finished', async () => {
    queueOneScreenshot()
    await drainPendingShares()

    queueOneScreenshot()
    const second = await drainPendingShares()

    expect(second).toHaveLength(1)
    expect(second[0]?.queueId).toBe('shot.png')
  })
})
