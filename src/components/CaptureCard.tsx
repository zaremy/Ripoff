import { useImageUrl } from '../hooks/useImageUrl'
import { displayAspect } from '../lib/layout'
import type { Capture } from '../lib/types'

interface CaptureCardProps {
  capture: Capture
  onOpen: (capture: Capture) => void
  onSource: (source: string) => void
  onRelevantTo: (tag: string) => void
}

/**
 * The screenshot is the artifact; the two lines under it are the whole point
 * of the product. FROM on top, FOR underneath, both tappable.
 */
export function CaptureCard({ capture, onOpen, onSource, onRelevantTo }: CaptureCardProps) {
  const url = useImageUrl(capture.thumb_uri)
  const shown = displayAspect(capture)

  return (
    <figure className="card">
      <button
        type="button"
        className="card-image"
        style={{ aspectRatio: String(shown) }}
        onClick={() => onOpen(capture)}
        aria-label={`Open capture from ${capture.source}`}
      >
        {url ? <img src={url} alt="" loading="lazy" decoding="async" /> : <span className="card-placeholder" />}
      </button>

      <figcaption className="card-meta">
        <button type="button" className="tag tag-source" onClick={() => onSource(capture.source)}>
          {capture.source}
        </button>
        <div className="card-relevant">
          {capture.relevant_to.map((tag) => (
            <button type="button" className="tag tag-relevant" key={tag} onClick={() => onRelevantTo(tag)}>
              {tag}
            </button>
          ))}
        </div>
      </figcaption>
    </figure>
  )
}
