import { beforeEach, describe, expect, it } from 'vitest'
import { snapshotDocument } from './domSnapshot'

function pageWith(bodyHtml: string, headHtml = ''): Document {
  const doc = document.implementation.createHTMLDocument('Pixel Wild')
  doc.head.innerHTML = headHtml
  doc.body.innerHTML = bodyHtml
  return doc
}

beforeEach(() => {
  document.head.innerHTML = ''
  document.body.innerHTML = ''
})

describe('snapshotting a page', () => {
  it('keeps the markup and drops what cannot run again', () => {
    const doc = pageWith(
      '<main><h1>Avatars</h1><script>track()</script><noscript>no js</noscript></main>',
    )

    const snapshot = snapshotDocument(doc)

    expect(snapshot.html).toContain('<h1>Avatars</h1>')
    expect(snapshot.html).not.toContain('track()')
    expect(snapshot.html).not.toContain('no js')
  })

  it('starts with a doctype so it renders in standards mode', () => {
    expect(snapshotDocument(pageWith('<p>hi</p>')).html.startsWith('<!doctype html>')).toBe(true)
  })

  it('folds the page stylesheets into the snapshot', () => {
    // jsdom only exposes cssRules for sheets in the live document.
    document.head.innerHTML = '<style>.tag { color: rgb(38, 64, 110); }</style>'
    document.body.innerHTML = '<span class="tag">Four Crowns</span>'

    const snapshot = snapshotDocument(document)

    expect(snapshot.html).toContain('data-inspo="captured-styles"')
    expect(snapshot.html).toContain('color: rgb(38, 64, 110)')
    // The original <style> is replaced, not duplicated.
    expect(snapshot.html.match(/<style/g)).toHaveLength(1)
    expect(snapshot.blocked_stylesheets).toEqual([])
  })

  it('records the title, url and viewport it was captured at', () => {
    const snapshot = snapshotDocument(document)

    expect(snapshot.url).toBeTruthy()
    expect(snapshot.viewport.width).toBeGreaterThan(0)
    expect(snapshot.viewport.height).toBeGreaterThan(0)
    expect(snapshot.captured_at).toBeGreaterThan(0)
  })

  it('carries what the user typed, which a clone would lose', () => {
    document.body.innerHTML =
      '<input id="q" /><textarea id="t"></textarea><input type="checkbox" id="c" />'
    const input = document.getElementById('q') as HTMLInputElement
    const textarea = document.getElementById('t') as HTMLTextAreaElement
    const checkbox = document.getElementById('c') as HTMLInputElement
    input.value = 'avatars'
    textarea.value = 'teardown notes'
    checkbox.checked = true

    const html = snapshotDocument(document).html

    expect(html).toContain('value="avatars"')
    expect(html).toContain('teardown notes')
    expect(html).toContain('checked')
  })
})

describe('urls in a snapshot', () => {
  it('resolves relative urls against the page they came from', () => {
    document.body.innerHTML = '<img src="/img/hero.png" /><a href="about">About</a>'

    const html = snapshotDocument(document).html

    expect(html).toContain(`${location.origin}/img/hero.png`)
    expect(html).toContain(new URL('about', document.baseURI).href)
  })

  it('leaves data, blob and in-page urls alone', () => {
    document.body.innerHTML =
      '<img src="data:image/png;base64,AAA" /><a href="#top">Top</a>'

    const html = snapshotDocument(document).html

    expect(html).toContain('src="data:image/png;base64,AAA"')
    expect(html).toContain('href="#top"')
  })

  it('resolves every candidate in a srcset', () => {
    document.body.innerHTML = '<img srcset="a.png 1x, b.png 2x" />'

    const html = snapshotDocument(document).html

    expect(html).toContain(`${new URL('a.png', document.baseURI).href} 1x`)
    expect(html).toContain(`${new URL('b.png', document.baseURI).href} 2x`)
  })
})
