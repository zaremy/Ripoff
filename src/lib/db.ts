/**
 * The capture repository. Everything the app persists goes through here.
 *
 * No network, no auth, no sync. Saving a capture must work in airplane mode
 * with the device in a lift, which is why every call below touches only
 * IndexedDB and the local filesystem.
 */

import { deleteImage, putImage, putText, readText } from './blobStore'
import { newId } from './id'
import { idbDelete, idbGet, idbGetAll, idbPut, STORE_CAPTURES, STORE_PREFS } from './idb'
import { decodeDimensions, makeThumbnail } from './image'
import type { DomSnapshot } from './domSnapshot'
import { normalizeTag, uniqueTags } from './tags'
import { EMPTY_DEFAULTS, type Capture, type CaptureDefaults, type SnapshotMeta } from './types'

const PREFS_DEFAULTS_KEY = 'capture_defaults'
const MAX_RECENTS = 24

export async function loadCaptures(): Promise<Capture[]> {
  const all = await idbGetAll<Capture>(STORE_CAPTURES)
  return all.sort(byNewestFirst)
}

export function byNewestFirst(a: Capture, b: Capture): number {
  // Ties are possible when a burst of screenshots is saved in one session;
  // fall back to id so the order is at least stable between renders.
  if (b.created_at !== a.created_at) return b.created_at - a.created_at
  return a.id < b.id ? 1 : a.id > b.id ? -1 : 0
}

export interface NewCaptureInput {
  blob: Blob
  source: string
  relevant_to: string[]
  /** Overridable so tests do not depend on the clock. */
  created_at?: number
  /** Present only when the reference was a web page rather than an app. */
  snapshot?: DomSnapshot
}

export async function createCapture(input: NewCaptureInput): Promise<Capture> {
  const source = normalizeTag(input.source)
  const relevant_to = uniqueTags(input.relevant_to)
  if (!source) throw new Error('A capture needs a Source')
  if (relevant_to.length === 0) throw new Error('A capture needs at least one Relevant To tag')

  const id = newId()
  const dimensions = await decodeDimensions(input.blob)
  const thumb = await makeThumbnail(input.blob, dimensions)

  // Bytes first: a metadata row pointing at a missing image is the one
  // inconsistency the library cannot recover from.
  const local_image_uri = await putImage(id, input.blob)
  const thumb_uri = thumb === input.blob ? local_image_uri : await putImage(`${id}-thumb`, thumb)

  const snapshotRefs = input.snapshot ? await storeSnapshot(id, input.snapshot) : null

  const capture: Capture = {
    id,
    created_at: input.created_at ?? Date.now(),
    source,
    relevant_to,
    local_image_uri,
    thumb_uri,
    width: dimensions.width,
    height: dimensions.height,
    mime: input.blob.type || 'image/png',
    bytes: input.blob.size,
    ...(snapshotRefs ?? {}),
  }

  await idbPut(STORE_CAPTURES, capture)
  await rememberTags(source, relevant_to)
  return capture
}

export async function updateCaptureTags(
  id: string,
  source: string,
  relevant_to: string[],
): Promise<Capture> {
  const existing = await idbGet<Capture>(STORE_CAPTURES, id)
  if (!existing) throw new Error(`No capture ${id}`)

  const nextSource = normalizeTag(source)
  const nextRelevantTo = uniqueTags(relevant_to)
  if (!nextSource) throw new Error('A capture needs a Source')
  if (nextRelevantTo.length === 0) throw new Error('A capture needs at least one Relevant To tag')

  const updated: Capture = { ...existing, source: nextSource, relevant_to: nextRelevantTo }
  await idbPut(STORE_CAPTURES, updated)
  await rememberTags(nextSource, nextRelevantTo)
  return updated
}

export async function deleteCapture(id: string): Promise<void> {
  const existing = await idbGet<Capture>(STORE_CAPTURES, id)
  if (!existing) return
  await idbDelete(STORE_CAPTURES, id)
  await deleteImage(existing.local_image_uri)
  if (existing.thumb_uri !== existing.local_image_uri) await deleteImage(existing.thumb_uri)
  if (existing.snapshot_uri) await deleteImage(existing.snapshot_uri)
}

/** The markup behind a capture, or null when there never was any. */
export async function loadSnapshotHtml(capture: Capture): Promise<string | null> {
  if (!capture.snapshot_uri) return null
  return readText(capture.snapshot_uri)
}

async function storeSnapshot(
  id: string,
  snapshot: DomSnapshot,
): Promise<{ snapshot_uri: string; snapshot: SnapshotMeta }> {
  return {
    snapshot_uri: await putText(`${id}-dom`, snapshot.html),
    snapshot: {
      url: snapshot.url,
      title: snapshot.title,
      viewport: snapshot.viewport,
      bytes: new Blob([snapshot.html]).size,
      blocked_stylesheets: snapshot.blocked_stylesheets,
    },
  }
}

export async function loadDefaults(): Promise<CaptureDefaults> {
  const stored = await idbGet<Partial<CaptureDefaults>>(STORE_PREFS, PREFS_DEFAULTS_KEY)
  if (!stored) return EMPTY_DEFAULTS
  return {
    source: stored.source ?? null,
    relevant_to: stored.relevant_to ?? [],
    recent_sources: stored.recent_sources ?? [],
    recent_relevant_to: stored.recent_relevant_to ?? [],
  }
}

export async function saveDefaults(defaults: CaptureDefaults): Promise<void> {
  await idbPut(STORE_PREFS, defaults, PREFS_DEFAULTS_KEY)
}

/**
 * The behaviour that makes capturing fifteen screenshots from one product
 * faster than saving them by hand: whatever was used last is what the next
 * capture opens with.
 */
export function applyTagMemory(
  defaults: CaptureDefaults,
  source: string,
  relevant_to: string[],
): CaptureDefaults {
  return {
    source,
    relevant_to,
    recent_sources: promote(defaults.recent_sources, [source]),
    recent_relevant_to: promote(defaults.recent_relevant_to, relevant_to),
  }
}

function promote(list: string[], used: string[]): string[] {
  const next = [...used]
  for (const item of list) {
    if (!next.includes(item)) next.push(item)
  }
  return next.slice(0, MAX_RECENTS)
}

async function rememberTags(source: string, relevant_to: string[]): Promise<void> {
  const defaults = await loadDefaults()
  await saveDefaults(applyTagMemory(defaults, source, relevant_to))
}
