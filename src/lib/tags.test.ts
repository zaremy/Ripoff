import { describe, expect, it } from 'vitest'
import {
  hasMarkup,
  isNewTag,
  matchesQuery,
  relevantToSummaries,
  selectCaptures,
  sourceSummaries,
  suggestTags,
  summaryFor,
  uniqueTags,
} from './tags'
import type { Capture } from './types'

let seq = 0
function capture(source: string, relevant_to: string[]): Capture {
  seq += 1
  return {
    id: `c${seq}`,
    created_at: seq,
    source,
    relevant_to,
    local_image_uri: `idb:${seq}`,
    thumb_uri: `idb:${seq}`,
    width: 1170,
    height: 2532,
    mime: 'image/png',
    bytes: 100,
  }
}

const library = [
  capture('Pixel Wild', ['Four Crowns / Avatars']),
  capture('Pixel Wild', ['Four Crowns / AI Art', 'Four Crowns / Avatars']),
  capture('Disco Elysium', ['Four Crowns / Dialogue']),
  capture('Arc Browser', ['Teardown App / Navigation']),
  capture('Huckleberry', ['Baby Tracker / Logging']),
  capture('mymind', ['Teardown App / Capture Flow', 'Four Crowns / Avatars']),
]

describe('search', () => {
  it('finds a Source by a fragment of its name', () => {
    const found = selectCaptures(library, null, 'pixel')
    expect(found).toHaveLength(2)
    expect(found.every((c) => c.source === 'Pixel Wild')).toBe(true)
  })

  it('finds captures by a fragment of a Relevant To tag', () => {
    const found = selectCaptures(library, null, 'avatars')
    expect(found).toHaveLength(3)
    // The point of the product: avatar references pulled from more than one
    // product, surfaced by a tag rather than by where they were filed.
    expect(new Set(found.map((c) => c.source))).toEqual(new Set(['Pixel Wild', 'mymind']))
  })

  it('treats a multi-word query as narrowing, not widening', () => {
    const found = selectCaptures(library, null, 'four crowns')
    expect(found).toHaveLength(4)
    expect(found.some((c) => c.source === 'Arc Browser')).toBe(false)
  })

  it('matches across Source and Relevant To together', () => {
    const found = selectCaptures(library, null, 'pixel avatars')
    expect(found).toHaveLength(2)
  })

  it('is case-insensitive and returns everything for an empty query', () => {
    expect(selectCaptures(library, null, 'PIXEL WILD')).toHaveLength(2)
    expect(selectCaptures(library, null, '   ')).toHaveLength(library.length)
  })

  it('does not match text that appears nowhere in the tags', () => {
    const [first] = library
    expect(matchesQuery(first as Capture, 'paywall')).toBe(false)
  })
})

describe('filters', () => {
  it('filters to one Source', () => {
    expect(selectCaptures(library, { kind: 'source', value: 'Pixel Wild' }, '')).toHaveLength(2)
  })

  it('filters to one Relevant To tag across every Source', () => {
    const found = selectCaptures(library, { kind: 'relevant_to', value: 'Four Crowns / Avatars' }, '')
    expect(found.map((c) => c.source).sort()).toEqual(['Pixel Wild', 'Pixel Wild', 'mymind'])
  })

  it('combines a filter with a search', () => {
    const found = selectCaptures(library, { kind: 'source', value: 'Pixel Wild' }, 'ai art')
    expect(found).toHaveLength(1)
  })

  it('does not confuse a Source filter with a Relevant To filter', () => {
    expect(selectCaptures(library, { kind: 'relevant_to', value: 'Pixel Wild' }, '')).toHaveLength(0)
  })
})

describe('board headers', () => {
  it('counts references for a Source board', () => {
    const summary = summaryFor(library, { kind: 'source', value: 'Pixel Wild' })
    expect(summary.count).toBe(2)
  })

  it('counts references and distinct products for a Relevant To board', () => {
    const summary = summaryFor(library, { kind: 'relevant_to', value: 'Four Crowns / Avatars' })
    expect(summary.count).toBe(3)
    expect(summary.sourceCount).toBe(2)
  })

  it('lists Sources and Relevant To tags most-collected first', () => {
    expect(sourceSummaries(library)[0]?.value).toBe('Pixel Wild')
    expect(relevantToSummaries(library)[0]?.value).toBe('Four Crowns / Avatars')
  })
})

describe('tag hygiene', () => {
  it('de-duplicates case-insensitively and keeps the first spelling', () => {
    expect(uniqueTags(['Four Crowns', 'four crowns', '  Four Crowns  '])).toEqual(['Four Crowns'])
  })

  it('drops blank tags and collapses inner whitespace', () => {
    expect(uniqueTags(['  ', 'Four   Crowns / Map VFX'])).toEqual(['Four Crowns / Map VFX'])
  })

  it('offers recents before the alphabetical rest', () => {
    const suggestions = suggestTags(['Arc Browser', 'Pixel Wild'], ['Pixel Wild'], '')
    expect(suggestions).toEqual(['Pixel Wild', 'Arc Browser'])
  })

  it('narrows suggestions to what has been typed', () => {
    expect(suggestTags(['Arc Browser', 'Pixel Wild'], [], 'arc')).toEqual(['Arc Browser'])
  })

  it('only offers to create a tag that does not already exist', () => {
    expect(isNewTag(['Pixel Wild'], 'pixel wild')).toBe(false)
    expect(isNewTag(['Pixel Wild'], 'Civ V')).toBe(true)
    expect(isNewTag(['Pixel Wild'], '   ')).toBe(false)
  })
})

describe('markup', () => {
  const snapshot = {
    url: 'https://vercel.com',
    title: 'Vercel',
    viewport: { width: 390, height: 844 },
    bytes: 4200,
    blocked_stylesheets: [],
  }
  const withPage: Capture = {
    ...capture('Vercel', ['Docs']),
    snapshot_uri: 'idb:snap',
    snapshot,
  }

  it('is true only when the page came with the screenshot', () => {
    expect(hasMarkup(withPage)).toBe(true)
    expect(hasMarkup(capture('Vercel', ['Docs']))).toBe(false)
  })

  it('is false for a half-written record, either way round', () => {
    const uriOnly: Capture = { ...capture('Vercel', ['Docs']), snapshot_uri: 'idb:snap' }
    const metaOnly: Capture = { ...capture('Vercel', ['Docs']), snapshot }
    expect(hasMarkup(uriOnly)).toBe(false)
    expect(hasMarkup(metaOnly)).toBe(false)
  })
})
