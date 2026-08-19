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
}
