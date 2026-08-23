import type { Capture } from './types'

/**
 * A full-length phone screenshot is close to three times taller than it is
 * wide. Shown at that ratio one capture owns an entire column and the wall
 * stops being scannable, so tall ones are cropped to a readable window.
 *
 * The grid and the card must agree on this number: the masonry balances its
 * columns using the height it expects each card to take, so measuring the raw
 * ratio here and rendering a clamped one there leaves the columns lopsided.
 */
export const MAX_CARD_TALLNESS = 0.72

export function displayAspect(capture: Capture): number {
  const intrinsic =
    capture.width > 0 && capture.height > 0 ? capture.width / capture.height : 0.75
  return Math.max(intrinsic, MAX_CARD_TALLNESS)
}
