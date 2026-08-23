/**
 * Image decoding and thumbnail generation.
 *
 * The grid never loads full-resolution screenshots: a teardown session
 * produces dozens of 3x phone screenshots, and decoding all of them at full
 * size is what makes a wall of images feel slow. The full-resolution copy is
 * kept untouched for the fullscreen view.
 */

export const THUMB_MAX_EDGE = 900

export interface DecodedImage {
  width: number
  height: number
}

/** Read intrinsic dimensions without keeping the decoded image around. */
export function decodeDimensions(blob: Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      const size = { width: img.naturalWidth, height: img.naturalHeight }
      URL.revokeObjectURL(url)
      resolve(size)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image'))
    }
    img.src = url
  })
}

function loadImageElement(blob: Blob): Promise<{ img: HTMLImageElement; release: () => void }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => resolve({ img, release: () => URL.revokeObjectURL(url) })
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as an image'))
    }
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

/**
 * Downscale to fit within THUMB_MAX_EDGE. Returns the original blob when the
 * image is already small enough or when the canvas encode fails — a slightly
 * heavy thumbnail is much better than a capture that refuses to save.
 */
export async function makeThumbnail(blob: Blob, dimensions: DecodedImage): Promise<Blob> {
  const { width, height } = dimensions
  const longestEdge = Math.max(width, height)
  if (longestEdge <= THUMB_MAX_EDGE) return blob

  const scale = THUMB_MAX_EDGE / longestEdge
  const targetWidth = Math.max(1, Math.round(width * scale))
  const targetHeight = Math.max(1, Math.round(height * scale))

  let loaded: { img: HTMLImageElement; release: () => void } | null = null
  try {
    loaded = await loadImageElement(blob)
    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')
    if (!ctx) return blob
    ctx.drawImage(loaded.img, 0, 0, targetWidth, targetHeight)

    // WebP keeps UI text crisp at a fraction of the size; Safari has encoded
    // it since iOS 14, and the JPEG path covers anything older.
    const webp = await canvasToBlob(canvas, 'image/webp', 0.85)
    if (webp && webp.type === 'image/webp') return webp
    const jpeg = await canvasToBlob(canvas, 'image/jpeg', 0.85)
    return jpeg ?? blob
  } catch {
    return blob
  } finally {
    loaded?.release()
  }
}
