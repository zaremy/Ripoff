import { Shot } from './Shot'
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
 * of the product. FROM is weight, FOR is the brand mark - and FOR is the one
 * you came for, so it is the one that carries the highlight.
 */
export function CaptureCard({ capture, onOpen, onSource, onRelevantTo }: CaptureCardProps) {
  const shown = displayAspect(capture)

  return (
    <figure className="card">
      <button
        type="button"
        className="card-image"
        onClick={() => onOpen(capture)}
        aria-label={`Open capture from ${capture.source}`}
      >
        <Shot capture={capture} size="card" style={{ aspectRatio: String(shown) }} />
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
