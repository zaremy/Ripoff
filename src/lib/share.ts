/**
 * Getting an image into the app.
 *
 * On iOS the Share Extension drops the shared image into the App Group
 * container and opens Inspo; this module drains that queue on launch and on
 * every resume, so a share always lands on the capture sheet. In a browser
 * there is no share sheet, so the same queue is fed by the file picker,
 * drag-and-drop and paste.
 *
 * The native half lives in ios/native (see ios/SETUP.md). When that plugin is
 * not installed the calls below no-op rather than throw, which keeps the app
 * fully usable on the web.
 */

import { Capacitor, registerPlugin } from '@capacitor/core'

interface PendingShare {
  id: string
  /** Raw image bytes, base64, no data: prefix. */
  data: string
  mime: string
}

interface ShareIntakePlugin {
  getPendingShares(): Promise<{ items: PendingShare[] }>
  clearPendingShares(options: { ids: string[] }): Promise<void>
}

const ShareIntake = registerPlugin<ShareIntakePlugin>('ShareIntake')

function base64ToBlob(base64: string, mime: string): Blob {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new Blob([bytes], { type: mime || 'image/png' })
}

/**
 * Pull everything the Share Extension has queued up and clear it. Returns an
 * empty list on the web, or when the native plugin is not present.
 */
export async function drainPendingShares(): Promise<Blob[]> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ShareIntake')) return []

  try {
    const { items } = await ShareIntake.getPendingShares()
    if (items.length === 0) return []
    const blobs = items.map((item) => base64ToBlob(item.data, item.mime))
    // Only clear once the bytes are safely in JS memory and about to be saved.
    await ShareIntake.clearPendingShares({ ids: items.map((i) => i.id) })
    return blobs
  } catch {
    return []
  }
}

/**
 * Call the handler whenever the app is brought back to the foreground, which
 * on iOS is the moment a freshly shared screenshot becomes available.
 */
export function onAppResume(handler: () => void): () => void {
  const onVisibility = () => {
    if (document.visibilityState === 'visible') handler()
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('focus', handler)
  return () => {
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('focus', handler)
  }
}

const IMAGE_TYPE = /^image\//

export function imagesFromFileList(files: FileList | File[] | null | undefined): File[] {
  if (!files) return []
  return Array.from(files).filter((file) => IMAGE_TYPE.test(file.type))
}

export function imagesFromDataTransfer(data: DataTransfer | null): File[] {
  if (!data) return []
  return imagesFromFileList(data.files)
}
