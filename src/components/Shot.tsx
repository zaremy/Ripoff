import { useImageUrl } from '../hooks/useImageUrl'
import { hasMarkup } from '../lib/tags'
import type { Capture } from '../lib/types'

type ShotSize = 'thumb' | 'card' | 'hero'

interface ShotProps {
  capture: Capture
  /** Thumbs use the stored downscale; the hero needs the full-resolution file. */
  full?: boolean
  size: ShotSize
  alt?: string
  /** Passed through so a card can keep its own aspect while the peel scales. */
  style?: React.CSSProperties
}

/**
 * A screenshot, and — when the page behind it came too — the peel.
 *
 * The corner lifts to show the code underneath, which is the app icon and is
 * also literally true: these are the captures that can be handed to Figma or
 * Claude Code. It is drawn from three layers so the fold reads as paper:
 *
 *   .shot-code  the substrate, clipped to the triangle the sheet gives up.
 *               Anything outside that triangle is still the screenshot, so a
 *               rounded flap tip reveals the image rather than a black hole.
 *   .shot-curl  the flap, folded back over the diagonal with a rounded tip.
 *   the image    clipped by the same triangle.
 *
 * The peel never carries the meaning alone: every screen that shows one also
 * says it in words.
 */
export function Shot({ capture, full = false, size, alt = '', style }: ShotProps) {
  const url = useImageUrl(full ? capture.local_image_uri : capture.thumb_uri)
  const marked = hasMarkup(capture)

  return (
    <div className={`shot shot-${size}${marked ? ' shot-dom' : ''}`} style={style}>
      {url ? (
        <img className="shot-image" src={url} alt={alt} loading="lazy" decoding="async" />
      ) : (
        <span className="shot-image shot-placeholder" />
      )}

      {marked && (
        <>
          <span className="shot-code" aria-hidden="true">
            <b>&lt;/&gt;</b>
            <i className="shot-bar shot-bar-1" />
            <i className="shot-bar shot-bar-2" />
          </span>
          <span className="shot-curl" aria-hidden="true" />
        </>
      )}
    </div>
  )
}
