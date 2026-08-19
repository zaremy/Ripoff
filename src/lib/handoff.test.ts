import { describe, expect, it } from 'vitest'
import { claudeCodeHandoff, figmaFileName } from './handoff'
import type { Capture } from './types'

function capture(overrides: Partial<Capture> = {}): Capture {
  return {
    id: 'c1',
    created_at: 1,
    source: 'Pixel Wild',
    relevant_to: ['Four Crowns / Avatars', 'AI Native UI'],
    local_image_uri: 'idb:c1',
    thumb_uri: 'idb:c1',
    width: 390,
    height: 844,
    mime: 'image/png',
    bytes: 10,
    ...overrides,
  }
}

const withPage = capture({
  snapshot_uri: 'idb:c1-dom',
  snapshot: {
    url: 'https://pixelwild.example/discover',
    title: 'Discover',
    viewport: { width: 390, height: 844 },
    bytes: 2048,
    blocked_stylesheets: [],
  },
})

describe('handing a capture to Claude Code', () => {
  it('leads with the context a model cannot infer from the markup', () => {
    const out = claudeCodeHandoff(withPage, '<main>hi</main>')

    expect(out).toContain('**From:** Pixel Wild')
    expect(out).toContain('**For:** Four Crowns / Avatars, AI Native UI')
    expect(out).toContain('https://pixelwild.example/discover')
  })

  it('includes the markup in a fenced block', () => {
    const out = claudeCodeHandoff(withPage, '<main>hi</main>')

    expect(out).toContain('```html\n<main>hi</main>\n```')
  })

  it('says so plainly when there was never any markup', () => {
    const out = claudeCodeHandoff(capture(), null)

    expect(out).toContain('No markup was captured')
    expect(out).not.toContain('```')
  })

  it('warns when stylesheets could not be read from the page', () => {
    const blocked = capture({
      snapshot_uri: 'idb:c1-dom',
      snapshot: {
        url: 'https://pixelwild.example/',
        title: 'Home',
        viewport: { width: 390, height: 844 },
        bytes: 10,
        blocked_stylesheets: ['https://cdn.example/app.css'],
      },
    })

    expect(claudeCodeHandoff(blocked, '<b>x</b>')).toContain('1 cross-origin stylesheet')
  })
})

describe('figma file names', () => {
  it('slugs the source', () => {
    expect(figmaFileName(capture())).toBe('pixel-wild-figma-layers.json')
  })

  it('survives a source with no usable characters', () => {
    expect(figmaFileName(capture({ source: '///' }))).toBe('reference-figma-layers.json')
  })
})
