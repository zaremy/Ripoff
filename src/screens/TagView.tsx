import { useMemo } from 'react'
import { CaptureCard } from '../components/CaptureCard'
import { Masonry } from '../components/Masonry'
import { selectCaptures, summaryFor, type TagFilter } from '../lib/tags'
import { displayAspect } from '../lib/layout'
import type { Capture } from '../lib/types'
import { useStore } from '../state/store'

// Hoisted so the masonry layout memo is not invalidated every render.
const captureKey = (capture: Capture) => capture.id
const captureAspect = displayAspect

/**
 * A board is just a tag. Two boards exist, and they answer opposite questions.
 *
 * A Source board answers "what did I find interesting about Pixel Wild?".
 * A Relevant To board answers "what have I collected from anywhere that could
 * help Four Crowns avatars?" - which is the more valuable one.
 */
export function TagView({ filter }: { filter: TagFilter }) {
  const { captures, query, push, pop, goHome } = useStore()

  const visible = useMemo(
    () => selectCaptures(captures, filter, query),
    [captures, filter, query],
  )
  const summary = useMemo(() => summaryFor(captures, filter), [captures, filter])

  const subtitle =
    filter.kind === 'relevant_to'
      ? `${plural(summary.count, 'reference')} from ${plural(summary.sourceCount, 'product')}`
      : plural(summary.count, 'reference')

  return (
    <div className="screen">
      <div className="topbar">
        <button type="button" className="back" onClick={pop} aria-label="Back">
          &larr;
        </button>
        <div className="board-title">
          <h1>{filter.value}</h1>
          <p>{subtitle}</p>
        </div>
        <button type="button" className="ghost" onClick={goHome}>
          Everything
        </button>
      </div>

      {visible.length === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <Masonry
          items={visible}
          keyOf={captureKey}
          aspectOf={captureAspect}
        >
          {(capture) => (
            <CaptureCard
              capture={capture}
              onOpen={(c) => push({ name: 'detail', id: c.id })}
              onSource={(source) => push({ name: 'tag', filter: { kind: 'source', value: source } })}
              onRelevantTo={(tag) => push({ name: 'tag', filter: { kind: 'relevant_to', value: tag } })}
            />
          )}
        </Masonry>
      )}
    </div>
  )
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`
}
