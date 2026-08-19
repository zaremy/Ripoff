/**
 * Giving a page-only share something to show on the wall.
 *
 * iOS hands a share either an image or a page, never both: sharing a
 * screenshot carries pixels but no DOM, and sharing from Safari's address bar
 * carries the DOM but no pixels. A capture always needs an image, so when only
 * markup arrives we draw one.
 *
 * First attempt is the page itself, rendered through an SVG foreignObject.
 * That is genuinely fragile - a single external image taints the canvas and
 * the export fails - so a plain typographic cover always stands behind it.
 * The wall must never show a broken tile.
 */

import type { DomSnapshot } from './domSnapshot'

const COVER_WIDTH = 780
const COVER_HEIGHT = 1200

export async function coverForSnapshot(snapshot: DomSnapshot): Promise<Blob> {
  return (await renderPage(snapshot)) ?? (await renderCard(snapshot))
}

/** Draw the actual page. Returns null whenever anything at all goes wrong. */
async function renderPage(snapshot: DomSnapshot): Promise<Blob | null> {
  try {
    const { width, height } = snapshot.viewport
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<foreignObject width="100%" height="100%">` +
      `<div xmlns="http://www.w3.org/1999/xhtml">${escapeForXml(snapshot.html)}</div>` +
      `</foreignObject></svg>`

    const image = await loadImage(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(image, 0, 0)

    // Throws on a tainted canvas, which is the common failure here.
    return await toBlob(canvas)
  } catch {
    return null
  }
}

/** The always-works fallback: host and title, set on a plain ground. */
async function renderCard(snapshot: DomSnapshot): Promise<Blob> {
  const canvas = document.createElement('canvas')
  canvas.width = COVER_WIDTH
  canvas.height = COVER_HEIGHT
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw a cover for this page')

  ctx.fillStyle = '#16150f'
  ctx.fillRect(0, 0, COVER_WIDTH, COVER_HEIGHT)

  ctx.fillStyle = '#6c675c'
  ctx.font = '600 34px -apple-system, Helvetica, Arial, sans-serif'
  ctx.fillText(hostOf(snapshot.url), 64, 140)

  ctx.fillStyle = '#f2f0ea'
  ctx.font = '700 58px -apple-system, Helvetica, Arial, sans-serif'
  wrapText(ctx, snapshot.title || snapshot.url, 64, 240, COVER_WIDTH - 128, 72)

  const blob = await toBlob(canvas)
  if (!blob) throw new Error('Could not draw a cover for this page')
  return blob
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not rasterize the page'))
    image.src = src
  })
}

/** foreignObject content has to parse as XML, so bare `&` and friends break it. */
function escapeForXml(html: string): string {
  return html
    .replace(/<!doctype[^>]*>/i, '')
    .replace(/&(?!(?:[a-z]+|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
    .replace(/<br(?!\s*\/)\s*>/gi, '<br />')
    .replace(/<(img|input|hr|meta|link|source|area|base|col|embed|track|wbr)([^>]*?)(?<!\/)>/gi, '<$1$2 />')
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): void {
  let line = ''
  let cursorY = y
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word
    if (ctx.measureText(candidate).width > maxWidth && line) {
      ctx.fillText(line, x, cursorY)
      line = word
      cursorY += lineHeight
      if (cursorY > COVER_HEIGHT - 120) return
    } else {
      line = candidate
    }
  }
  if (line) ctx.fillText(line, x, cursorY)
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
