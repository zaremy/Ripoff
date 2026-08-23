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
import type { DomSnapshot } from './domSnapshot'

/** An image on its way to the capture sheet, with the page behind it if any. */
export interface IncomingCapture {
  blob: Blob
  snapshot?: DomSnapshot
  /** Set when this came off the iOS queue, so it can be released after saving. */
  queueId?: string
  /** Present when the share sheet already asked for the tags. */
  tags?: { source: string; relevant_to: string[] }
}

interface PendingShare {
  id: string
  /** Raw image bytes, base64, no data: prefix. Absent for a page-only share. */
  data?: string
  mime?: string
  /** A serialized DomSnapshot, when the share came from Safari. */
  snapshot?: string
  /** Tags chosen in the share sheet, when the extension did the tagging. */
  tags?: string
}

interface ShareIntakePlugin {
  getPendingShares(): Promise<{ items: PendingShare[] }>
  clearPendingShares(options: { ids: string[] }): Promise<void>
  putVocabulary(options: { json: string }): Promise<void>
}

const ShareIntake = registerPlugin<ShareIntakePlugin>('ShareIntake')

/** Set while a drain is in flight, so overlapping resume signals cannot
 *  each claim the same queued screenshot. */
let draining = false

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
export async function drainPendingShares(): Promise<IncomingCapture[]> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ShareIntake')) return []

  // Foregrounding fires more than one resume signal - visibilitychange and
  // focus both land, and the launch pull can still be in flight behind them.
  // Without this guard each of those reads the same queue before any of them
  // clears it, and one shared screenshot arrives at the sheet three times.
  // Concurrent callers get nothing rather than a copy: whoever is already
  // draining owns these bytes and is about to enqueue them.
  if (draining) return []
  draining = true

  try {
    const { items } = await ShareIntake.getPendingShares()
    if (items.length === 0) return []

    const incoming: IncomingCapture[] = []
    for (const item of items) {
      const { snapshot } = parseSnapshot(item.snapshot)
      const blob = await imageForShare(item, snapshot)
      // A share we could not turn into an image stays queued. Clearing it here
      // would delete the only copy of something the user explicitly shared.
      if (!blob) continue
      const tags = parseTags(item.tags)
      incoming.push({
        blob,
        queueId: item.id,
        ...(snapshot ? { snapshot } : {}),
        ...(tags ? { tags } : {}),
      })
    }

    // Deliberately not cleared here. JS memory is not durable: iOS kills
    // backgrounded webviews, and it does so most eagerly right after a share
    // extension has launched the app. The queue is the only copy until the
    // capture is committed, so releasing it is `save`'s job.
    return incoming
  } catch {
    return []
  } finally {
    draining = false
  }
}

/**
 * Release shares the app has finished with: committed to the library, or
 * discarded on purpose. Anything not released stays queued and comes back on
 * the next drain, which is what makes a mid-tagging app kill survivable.
 */
export async function clearQueued(ids: string[]): Promise<void> {
  const wanted = ids.filter((id) => id.length > 0)
  if (wanted.length === 0) return
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ShareIntake')) return
  try {
    await ShareIntake.clearPendingShares({ ids: wanted })
  } catch {
    // Left queued rather than lost; the next drain picks it up again.
  }
}

/**
 * Mirror the tag vocabulary into the App Group, so the share sheet can offer
 * the same pickers the app does. The library lives in IndexedDB, which the
 * extension is a separate process from and cannot read.
 */
export async function publishVocabulary(vocabulary: {
  sources: string[]
  relevantTo: string[]
  lastSource: string
  lastRelevantTo: string[]
}): Promise<void> {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('ShareIntake')) return
  try {
    await ShareIntake.putVocabulary({ json: JSON.stringify(vocabulary) })
  } catch {
    // The sheet falls back to empty pickers; typing still works.
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

/**
 * Sharing a screenshot gives pixels; sharing from Safari's address bar gives a
 * page. A capture needs an image either way, so a page-only share gets one
 * drawn for it.
 */
async function imageForShare(
  item: PendingShare,
  snapshot: DomSnapshot | undefined,
): Promise<Blob | null> {
  if (item.data) return base64ToBlob(item.data, item.mime ?? 'image/png')
  if (!snapshot) return null
  try {
    const { coverForSnapshot } = await import('./snapshotCover')
    return await coverForSnapshot(snapshot)
  } catch {
    return null
  }
}

/**
 * Tags the share sheet collected. Malformed tags cost the capture nothing: it
 * simply arrives untagged and the app asks, exactly as it used to.
 */
function parseTags(raw: string | undefined): { source: string; relevant_to: string[] } | undefined {
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as { source?: unknown; relevant_to?: unknown }
    const source = typeof parsed.source === 'string' ? parsed.source.trim() : ''
    const relevantTo = Array.isArray(parsed.relevant_to)
      ? parsed.relevant_to.filter((tag): tag is string => typeof tag === 'string' && tag.trim() !== '')
      : []
    if (!source && relevantTo.length === 0) return undefined
    return { source, relevant_to: relevantTo }
  } catch {
    return undefined
  }
}

/** A malformed snapshot must never cost the user the screenshot itself. */
function parseSnapshot(raw: string | undefined): { snapshot?: DomSnapshot } {
  if (!raw) return {}
  try {
    const parsed = JSON.parse(raw) as DomSnapshot
    return parsed?.html ? { snapshot: parsed } : {}
  } catch {
    return {}
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

/**
 * Desktop has no share sheet to run the page serializer in, so a saved
 * snapshot can be dropped or picked alongside its screenshot: any `.html`
 * file in the same batch is attached to the images it arrived with.
 */
export async function incomingFromFiles(
  files: FileList | File[] | null | undefined,
): Promise<IncomingCapture[]> {
  const all = files ? Array.from(files) : []
  const images = all.filter((file) => IMAGE_TYPE.test(file.type))
  if (images.length === 0) return []

  const markup = all.find((file) => /\.html?$/i.test(file.name) || file.type === 'text/html')
  if (!markup) return images.map((blob) => ({ blob }))

  const snapshot = await snapshotFromHtmlFile(markup)
  return images.map((blob) => (snapshot ? { blob, snapshot } : { blob }))
}

async function snapshotFromHtmlFile(file: File): Promise<DomSnapshot | undefined> {
  try {
    const html = await file.text()
    if (!html.trim()) return undefined
    return {
      url: file.name,
      title: /<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? file.name,
      captured_at: file.lastModified || Date.now(),
      viewport: { width: 1280, height: 900 },
      html,
      blocked_stylesheets: [],
    }
  } catch {
    return undefined
  }
}
