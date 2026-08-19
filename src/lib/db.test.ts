import { beforeEach, describe, expect, it, vi } from 'vitest'

// jsdom cannot decode an image or run a canvas, so the two pixel-level
// helpers are stubbed. Everything else below is the real storage path.
vi.mock('./image', () => ({
  decodeDimensions: vi.fn(async () => ({ width: 1170, height: 2532 })),
  makeThumbnail: vi.fn(async (blob: Blob) => blob),
}))

import {
  applyTagMemory,
  createCapture,
  deleteCapture,
  loadCaptures,
  loadDefaults,
  updateCaptureTags,
} from './db'
import { idbGet, resetDbForTests, STORE_BLOBS } from './idb'
import { EMPTY_DEFAULTS } from './types'

function screenshot(marker = 'x'): Blob {
  return new Blob([marker], { type: 'image/png' })
}

/** Drop every handle and open the database again, as a cold launch would. */
async function relaunchApp() {
  resetDbForTests()
  return loadCaptures()
}

beforeEach(async () => {
  const { IDBFactory } = await import('fake-indexeddb')
  globalThis.indexedDB = new IDBFactory()
  resetDbForTests()
})

describe('saving a capture', () => {
  it('stores the tags, the image and a stable id', async () => {
    const capture = await createCapture({
      blob: screenshot(),
      source: 'Pixel Wild',
      relevant_to: ['Four Crowns / Avatars'],
    })

    expect(capture.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(capture.source).toBe('Pixel Wild')
    expect(capture.relevant_to).toEqual(['Four Crowns / Avatars'])
    expect(capture.width).toBe(1170)
    const stored = await idbGet<{ mime: string; bytes: ArrayBuffer }>(STORE_BLOBS, capture.id)
    expect(stored?.mime).toBe('image/png')
    expect(stored?.bytes.byteLength).toBeGreaterThan(0)
  })

  it('accepts several Relevant To tags but exactly one Source', async () => {
    const capture = await createCapture({
      blob: screenshot(),
      source: '  Pixel   Wild  ',
      relevant_to: ['Four Crowns / Avatars', 'four crowns / avatars', 'AI Native UI'],
    })

    expect(capture.source).toBe('Pixel Wild')
    expect(capture.relevant_to).toEqual(['Four Crowns / Avatars', 'AI Native UI'])
  })

  it('refuses a capture with no Source or no Relevant To tag', async () => {
    await expect(
      createCapture({ blob: screenshot(), source: '  ', relevant_to: ['Four Crowns'] }),
    ).rejects.toThrow(/Source/)
    await expect(
      createCapture({ blob: screenshot(), source: 'Pixel Wild', relevant_to: [] }),
    ).rejects.toThrow(/Relevant To/)
  })
})

describe('the library', () => {
  it('lists captures newest first', async () => {
    await createCapture({
      blob: screenshot('a'),
      source: 'Pixel Wild',
      relevant_to: ['Four Crowns / Avatars'],
      created_at: 1_000,
    })
    await createCapture({
      blob: screenshot('b'),
      source: 'Arc Browser',
      relevant_to: ['Teardown App / Navigation'],
      created_at: 3_000,
    })
    await createCapture({
      blob: screenshot('c'),
      source: 'Huckleberry',
      relevant_to: ['Baby Tracker / Logging'],
      created_at: 2_000,
    })

    expect((await loadCaptures()).map((c) => c.source)).toEqual([
      'Arc Browser',
      'Huckleberry',
      'Pixel Wild',
    ])
  })

  it('survives a restart, with the images still readable', async () => {
    const saved = await createCapture({
      blob: screenshot('keep me'),
      source: 'Disco Elysium',
      relevant_to: ['Four Crowns / Dialogue'],
    })

    const afterRestart = await relaunchApp()
    expect(afterRestart).toHaveLength(1)
    expect(afterRestart[0]?.id).toBe(saved.id)

    const stored = await idbGet<{ mime: string; bytes: ArrayBuffer }>(STORE_BLOBS, saved.id)
    expect(new TextDecoder().decode(stored?.bytes)).toBe('keep me')
  })
})

describe('editing and deleting', () => {
  it('replaces the tags on an existing capture', async () => {
    const capture = await createCapture({
      blob: screenshot(),
      source: 'Pixel Wild',
      relevant_to: ['Four Crowns / Avatars'],
    })

    const updated = await updateCaptureTags(capture.id, 'Pixel Wild', [
      'Four Crowns / Avatars',
      'Four Crowns / Generative Art',
    ])

    expect(updated.relevant_to).toHaveLength(2)
    expect((await loadCaptures())[0]?.relevant_to).toEqual(updated.relevant_to)
    // The image is untouched by a retag.
    expect(updated.local_image_uri).toBe(capture.local_image_uri)
  })

  it('deletes the record and the image bytes together', async () => {
    const capture = await createCapture({
      blob: screenshot(),
      source: 'Civ V',
      relevant_to: ['Four Crowns / Map VFX'],
    })

    await deleteCapture(capture.id)

    expect(await loadCaptures()).toHaveLength(0)
    expect(await idbGet(STORE_BLOBS, capture.id)).toBeUndefined()
  })

  it('ignores a delete for a capture that is already gone', async () => {
    await expect(deleteCapture('not-a-real-id')).resolves.toBeUndefined()
  })
})

describe('tag memory', () => {
  it('defaults the next capture to the context just used', async () => {
    await createCapture({
      blob: screenshot(),
      source: 'Pixel Wild',
      relevant_to: ['Four Crowns / Avatars'],
    })

    const defaults = await loadDefaults()
    expect(defaults.source).toBe('Pixel Wild')
    expect(defaults.relevant_to).toEqual(['Four Crowns / Avatars'])
  })

  it('keeps the sticky context across a restart, mid-teardown', async () => {
    await createCapture({
      blob: screenshot(),
      source: 'Pixel Wild',
      relevant_to: ['Four Crowns / Avatars'],
    })

    await relaunchApp()
    expect((await loadDefaults()).source).toBe('Pixel Wild')
  })

  it('promotes the tags just used to the front of the recents', () => {
    const first = applyTagMemory(EMPTY_DEFAULTS, 'Pixel Wild', ['Four Crowns / Avatars'])
    const second = applyTagMemory(first, 'Disco Elysium', ['Four Crowns / Dialogue'])

    expect(second.recent_sources).toEqual(['Disco Elysium', 'Pixel Wild'])
    expect(second.recent_relevant_to).toEqual([
      'Four Crowns / Dialogue',
      'Four Crowns / Avatars',
    ])
  })

  it('does not duplicate a tag that is reused', () => {
    const first = applyTagMemory(EMPTY_DEFAULTS, 'Pixel Wild', ['Four Crowns / Avatars'])
    const second = applyTagMemory(first, 'Arc Browser', ['Four Crowns / Avatars'])
    const third = applyTagMemory(second, 'Pixel Wild', ['Four Crowns / Avatars'])

    expect(third.recent_sources).toEqual(['Pixel Wild', 'Arc Browser'])
    expect(third.recent_relevant_to).toEqual(['Four Crowns / Avatars'])
  })

  it('caps the recents so the pickers stay short', () => {
    let defaults = EMPTY_DEFAULTS
    for (let i = 0; i < 40; i++) {
      defaults = applyTagMemory(defaults, `Product ${i}`, [`Idea ${i}`])
    }
    expect(defaults.recent_sources).toHaveLength(24)
    expect(defaults.recent_sources[0]).toBe('Product 39')
  })
})
