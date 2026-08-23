/**
 * Turning a live web page into a snapshot worth keeping.
 *
 * A screenshot of a web page throws away everything that made it a web page.
 * When the reference happens to be a site rather than a native app, the markup
 * behind it is worth keeping too: it is what makes the capture answer "how did
 * they build this?" rather than only "what did it look like?".
 *
 * The snapshot is the original markup plus the page's own stylesheets, not a
 * pile of inlined computed styles. That keeps it readable enough to hand to
 * Claude Code, and it still re-renders through a real layout engine later,
 * which is what the Figma export needs to get geometry right.
 *
 * This file is the single source of truth for the serializer. The iOS share
 * extension runs the very same code, bundled to a standalone script by
 * `npm run build:preprocess`.
 */

export interface DomSnapshot {
  /** Page the markup came from. */
  url: string
  title: string
  captured_at: number
  /** Size the page was laid out at, so an export re-renders it the same way. */
  viewport: { width: number; height: number }
  /** A self-contained HTML document: scripts stripped, CSS folded in. */
  html: string
  /**
   * Stylesheets a cross-origin rule blocked us from reading. Recorded rather
   * than hidden, because they are exactly what a missing style later means.
   */
  blocked_stylesheets: string[]
}

/** Elements that carry no visual meaning once the page has stopped running. */
const STRIP_SELECTOR =
  'script, noscript, template, link[rel~="stylesheet"], style, iframe, object, embed, frame, frameset, meta[http-equiv="refresh" i]'

/** Schemes a stored snapshot is allowed to still point at once re-rendered. */
const SAFE_SCHEME = /^(?:https?:|mailto:|tel:|data:|blob:|#)/i

/** Attributes that can navigate or fetch, and so can carry a script URL. */
const URL_BEARING = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'data'])

const URL_ATTRIBUTES: ReadonlyArray<[string, string]> = [
  ['img', 'src'],
  ['img', 'srcset'],
  ['source', 'src'],
  ['source', 'srcset'],
  ['video', 'poster'],
  ['a', 'href'],
  ['use', 'href'],
]

export function snapshotDocument(doc: Document = document): DomSnapshot {
  const blocked: string[] = []
  const css = collectStyleSheets(doc, blocked)

  const root = doc.documentElement.cloneNode(true) as HTMLElement
  carryFormState(doc.documentElement, root)

  for (const node of Array.from(root.querySelectorAll(STRIP_SELECTOR))) {
    node.remove()
  }
  absolutizeUrls(root, doc.baseURI)
  stripActiveContent(root)

  const head = root.querySelector('head') ?? root.insertBefore(doc.createElement('head'), root.firstChild)
  if (css) {
    const style = doc.createElement('style')
    style.setAttribute('data-inspo', 'captured-styles')
    style.textContent = css
    head.appendChild(style)
  }

  return {
    url: doc.location?.href ?? doc.baseURI,
    title: doc.title,
    captured_at: Date.now(),
    viewport: {
      width: doc.documentElement.clientWidth || 390,
      height: doc.documentElement.clientHeight || 844,
    },
    html: `<!doctype html>\n${root.outerHTML}`,
    blocked_stylesheets: blocked,
  }
}

/**
 * Fold every readable stylesheet into one block. Cross-origin sheets throw on
 * `cssRules`; their URLs are collected instead so the gap is visible rather
 * than silent.
 */
function collectStyleSheets(doc: Document, blocked: string[]): string {
  const chunks: string[] = []

  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList | null = null
    try {
      rules = sheet.cssRules
    } catch {
      if (sheet.href) blocked.push(sheet.href)
      continue
    }
    if (!rules) continue

    const media = sheet.media?.mediaText
    const body = Array.from(rules)
      .map((rule) => rule.cssText)
      .join('\n')
    if (!body) continue
    chunks.push(media ? `@media ${media} {\n${body}\n}` : body)
  }

  return chunks.join('\n\n')
}

/**
 * What the user typed is part of what the screenshot showed, but it lives in
 * DOM properties rather than attributes and would not survive a clone.
 */
function carryFormState(source: Element, clone: Element): void {
  const originals = source.querySelectorAll('input, textarea, select')
  const copies = clone.querySelectorAll('input, textarea, select')

  originals.forEach((original, index) => {
    const copy = copies[index]
    if (!copy) return

    if (original instanceof HTMLInputElement && copy instanceof HTMLInputElement) {
      // A password is dots on screen and plaintext in the DOM, and a hidden
      // field is usually a CSRF or session token. Neither is part of what the
      // screenshot showed, and this markup gets pasted into a chat later.
      if (original.type === 'password' || original.type === 'hidden') {
        copy.removeAttribute('value')
      } else if (original.type === 'checkbox' || original.type === 'radio') {
        if (original.checked) copy.setAttribute('checked', '')
        else copy.removeAttribute('checked')
      } else {
        copy.setAttribute('value', original.value)
      }
    } else if (original instanceof HTMLTextAreaElement && copy instanceof HTMLTextAreaElement) {
      copy.textContent = original.value
    } else if (original instanceof HTMLSelectElement && copy instanceof HTMLSelectElement) {
      const chosen = copy.options[original.selectedIndex]
      if (chosen) chosen.setAttribute('selected', '')
    }
  })
}

/**
 * Removing a page's ability to act.
 *
 * Dropping `<script>` elements is not the same as dropping script: an inline
 * `onerror` fires the moment a broken image is laid out, and `javascript:` in
 * an href survives any amount of element filtering. A stored snapshot is
 * third-party code that later gets re-rendered inside the app, so anything
 * executable has to come out here, at the point of capture.
 *
 * Runs after `absolutizeUrls`, so a relative href has already become http(s)
 * and whatever is left with an odd scheme really is odd.
 */
function stripActiveContent(root: HTMLElement): void {
  for (const element of Array.from(root.querySelectorAll('*'))) {
    for (const attribute of Array.from(element.attributes)) {
      const name = attribute.name.toLowerCase()
      if (name.startsWith('on')) {
        element.removeAttribute(attribute.name)
        continue
      }
      if (!URL_BEARING.has(name)) continue
      const value = attribute.value.trim()
      if (value && !SAFE_SCHEME.test(value)) element.removeAttribute(attribute.name)
    }
  }
}

/**
 * Relative URLs mean nothing once the markup is stored somewhere else, so they
 * are resolved against the page they came from.
 */
function absolutizeUrls(root: HTMLElement, baseUrl: string): void {
  for (const [tag, attribute] of URL_ATTRIBUTES) {
    for (const element of Array.from(root.querySelectorAll(tag))) {
      const value = element.getAttribute(attribute)
      if (!value) continue
      element.setAttribute(
        attribute,
        attribute === 'srcset' ? absolutizeSrcset(value, baseUrl) : absolutize(value, baseUrl),
      )
    }
  }
}

function absolutize(value: string, baseUrl: string): string {
  const trimmed = value.trim()
  // data:, blob: and in-page anchors are already self-contained.
  if (!trimmed || trimmed.startsWith('data:') || trimmed.startsWith('blob:') || trimmed.startsWith('#')) {
    return value
  }
  try {
    return new URL(trimmed, baseUrl).href
  } catch {
    return value
  }
}

function absolutizeSrcset(value: string, baseUrl: string): string {
  return value
    .split(',')
    .map((candidate) => {
      const parts = candidate.trim().split(/\s+/)
      const url = parts.shift()
      if (!url) return candidate.trim()
      return [absolutize(url, baseUrl), ...parts].join(' ')
    })
    .join(', ')
}

/** Rough byte size, for showing the user what a snapshot is costing them. */
export function snapshotSize(snapshot: DomSnapshot): number {
  return new Blob([snapshot.html]).size
}
