import type { DomSnapshot } from './domSnapshot'

/**
 * The whole object model. Three things exist: a Capture, the Source it came
 * FROM, and the Relevant To tags it is FOR. Nothing else is MVP.
 */

export interface Capture {
  /** Stable UUID from day one, so a future sync layer has something to key on. */
  id: string
  created_at: number
  /** Exactly one Source — the product this screenshot came FROM. */
  source: string
  /** One or more freeform ideas this screenshot is FOR. */
  relevant_to: string[]
  /** Where the full-resolution image lives (see blobStore). */
  local_image_uri: string
  /** Downscaled copy used by the grid, so 500 captures still scroll. */
  thumb_uri: string
  width: number
  height: number
  mime: string
  bytes: number
  /**
   * Set only when the reference was a web page. Native apps have no DOM, so
   * most captures will never have one.
   */
  snapshot_uri?: string
  snapshot?: SnapshotMeta
}

/** The parts of a DOM snapshot worth keeping in the record itself. */
export interface SnapshotMeta {
  url: string
  title: string
  viewport: { width: number; height: number }
  bytes: number
  blocked_stylesheets: string[]
}

/** Sticky context for the next capture, plus recency for the tag pickers. */
export interface CaptureDefaults {
  source: string | null
  relevant_to: string[]
  /** Most-recently-used first. */
  recent_sources: string[]
  recent_relevant_to: string[]
}

export const EMPTY_DEFAULTS: CaptureDefaults = {
  source: null,
  relevant_to: [],
  recent_sources: [],
  recent_relevant_to: [],
}

/** A draft capture: an image is in hand, tags are not committed yet. */
export interface PendingCapture {
  id: string
  blob: Blob
  /** Object URL for previewing the draft before it is saved. */
  previewUrl: string
  /** Present when the share carried the page behind the screenshot. */
  snapshot?: DomSnapshot
  /**
   * Name of the file still sitting in the iOS share queue. Held until the
   * capture is committed, so killing the app loses nothing.
   */
  queueId?: string
}
