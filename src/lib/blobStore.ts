/**
 * Where image bytes actually live.
 *
 * On iOS the bytes go to the app's own Data directory, exactly as the PRD
 * asks — image binaries must never become giant browser storage values. In a
 * browser (dev, and the desktop preview) there is no filesystem, so blobs go
 * into their own IndexedDB store, which is still a binary store rather than
 * stringified localStorage.
 *
 * Everything above this file deals in opaque refs — `file:...` or `idb:...` —
 * and never has to know which platform it is on.
 */

import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { idbDelete, idbGet, idbPut, STORE_BLOBS } from './idb'

const IMAGE_DIR = 'captures'

export function isNative(): boolean {
  return Capacitor.isNativePlatform()
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'))
    reader.onload = () => {
      const result = String(reader.result)
      // Strip the `data:<mime>;base64,` prefix Filesystem does not want.
      const comma = result.indexOf(',')
      resolve(comma === -1 ? result : result.slice(comma + 1))
    }
    reader.readAsDataURL(blob)
  })
}

function extensionFor(mime: string): string {
  if (mime === 'image/jpeg') return 'jpg'
  if (mime === 'image/webp') return 'webp'
  if (mime === 'image/heic') return 'heic'
  if (mime === 'image/gif') return 'gif'
  return 'png'
}

/** Persist image bytes and return the ref to store on the capture. */
export async function putImage(key: string, blob: Blob): Promise<string> {
  if (isNative()) {
    const path = `${IMAGE_DIR}/${key}.${extensionFor(blob.type)}`
    await Filesystem.writeFile({
      path,
      data: await blobToBase64(blob),
      directory: Directory.Data,
      recursive: true,
    })
    return `file:${path}`
  }

  // Stored as a plain buffer rather than as a Blob: WebKit has a long history
  // of losing Blobs held in IndexedDB, and the bytes are the one thing this
  // app cannot regenerate.
  const record: StoredImage = { mime: blob.type || 'image/png', bytes: await blob.arrayBuffer() }
  await idbPut(STORE_BLOBS, record, key)
  return `idb:${key}`
}

interface StoredImage {
  mime: string
  bytes: ArrayBuffer
}

/**
 * A URL an <img> can display, plus a `release` that must be called when the
 * image is no longer on screen. Object URLs leak until revoked, and this app
 * shows a lot of images.
 */
export interface ResolvedImage {
  url: string
  release: () => void
}

const noop = () => {}

export async function resolveImage(ref: string): Promise<ResolvedImage> {
  if (ref.startsWith('file:')) {
    const path = ref.slice('file:'.length)
    const { uri } = await Filesystem.getUri({ path, directory: Directory.Data })
    // A native file URL the webview is allowed to load — nothing to revoke.
    return { url: Capacitor.convertFileSrc(uri), release: noop }
  }

  const key = ref.slice('idb:'.length)
  const record = await idbGet<StoredImage>(STORE_BLOBS, key)
  if (!record) throw new Error(`Missing image for ${ref}`)
  const url = URL.createObjectURL(new Blob([record.bytes], { type: record.mime }))
  return { url, release: () => URL.revokeObjectURL(url) }
}

export async function deleteImage(ref: string): Promise<void> {
  try {
    if (ref.startsWith('file:')) {
      await Filesystem.deleteFile({ path: ref.slice('file:'.length), directory: Directory.Data })
      return
    }
    await idbDelete(STORE_BLOBS, ref.slice('idb:'.length))
  } catch {
    // A capture whose bytes are already gone should still delete cleanly;
    // an orphaned record is worse than an orphaned file.
  }
}
