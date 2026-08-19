/**
 * Turning a stored snapshot into Figma layers.
 *
 * html-figma reads geometry from `getBoundingClientRect`, so it needs a page
 * that has actually been laid out - a string of HTML is not enough. The
 * snapshot is therefore re-rendered into an offscreen iframe at the viewport
 * it was captured at, and converted from there. Letting a real layout engine
 * do the work is what keeps positions honest.
 *
 * The library is loaded on demand: nobody should pay for the Figma exporter
 * while scrolling their wall of screenshots.
 */

import type { DomSnapshot } from './domSnapshot'

/** Figma's own layer shape, which we pass through without interpreting. */
export type FigmaLayers = unknown

export interface FigmaExportOptions {
  /** How long to let images and fonts settle before measuring. */
  settleMs?: number
}

export async function snapshotToFigmaLayers(
  snapshot: Pick<DomSnapshot, 'html' | 'viewport'>,
  options: FigmaExportOptions = {},
): Promise<FigmaLayers> {
  const settleMs = options.settleMs ?? 400

  const iframe = document.createElement('iframe')
  // Offscreen rather than hidden: `display: none` gives every element a zero
  // rect, which would flatten the entire export.
  iframe.setAttribute('aria-hidden', 'true')
  iframe.style.cssText = [
    'position: fixed',
    'left: -100000px',
    'top: 0',
    `width: ${snapshot.viewport.width}px`,
    `height: ${snapshot.viewport.height}px`,
    'border: 0',
    'visibility: hidden',
  ].join(';')

  document.body.appendChild(iframe)

  try {
    const doc = iframe.contentDocument
    const view = iframe.contentWindow
    if (!doc || !view) throw new Error('Could not open a frame to render the snapshot')

    doc.open()
    doc.write(snapshot.html)
    doc.close()

    await settle(doc, settleMs)

    const { htmlToFigma, setContext } = await import('html-figma/browser')
    setContext(view as unknown as Window)
    try {
      const body = doc.body
      if (!body) throw new Error('The snapshot has no body to convert')
      return htmlToFigma(body)
    } finally {
      // Always hand the library back the real window, or every later export
      // would measure against a frame that no longer exists.
      setContext(window)
    }
  } finally {
    iframe.remove()
  }
}

/** Wait for load, then for fonts and images, but never longer than the budget. */
async function settle(doc: Document, budgetMs: number): Promise<void> {
  const deadline = new Promise<void>((resolve) => setTimeout(resolve, budgetMs))

  const ready = (async () => {
    if (doc.readyState !== 'complete') {
      await new Promise<void>((resolve) => {
        doc.addEventListener('DOMContentLoaded', () => resolve(), { once: true })
      })
    }
    await doc.fonts?.ready?.catch?.(() => undefined)
    await Promise.all(
      Array.from(doc.images)
        .filter((image) => !image.complete)
        .map(
          (image) =>
            new Promise<void>((resolve) => {
              image.addEventListener('load', () => resolve(), { once: true })
              image.addEventListener('error', () => resolve(), { once: true })
            }),
        ),
    )
  })()

  // Images on a page we no longer have credentials for may simply never load.
  await Promise.race([ready, deadline])
}
