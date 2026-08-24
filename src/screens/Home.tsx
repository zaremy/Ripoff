import { useMemo, useRef } from 'react'
import { CaptureCard } from '../components/CaptureCard'
import { Masonry } from '../components/Masonry'
import { TopOfMind } from '../components/TopOfMind'
import { incomingFromFiles } from '../lib/share'
import { selectCaptures } from '../lib/tags'
import { displayAspect } from '../lib/layout'
import type { Capture } from '../lib/types'
import { useStore } from '../state/store'

// Hoisted so the masonry layout memo is not invalidated every render.
const captureKey = (capture: Capture) => capture.id
const captureAspect = displayAspect

/**
 * Everything, newest first. No dashboard, no metrics, no prompt box.
 */
export function Home() {
  const { captures, query, setQuery, push, enqueue } = useStore()
  const fileInput = useRef<HTMLInputElement>(null)

  const visible = useMemo(() => selectCaptures(captures, null, query), [captures, query])

  return (
    <div className="screen">
      <div className="topbar">
        <input
          className="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search references"
          type="search"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button type="button" className="add" onClick={() => fileInput.current?.click()} aria-label="Add references">
          +
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/*,.html"
          multiple
          hidden
          onChange={(event) => {
            void incomingFromFiles(event.target.files).then(enqueue)
            event.target.value = ''
          }}
        />
      </div>

      <TopOfMind />

      {visible.length === 0 ? (
        <EmptyState hasCaptures={captures.length > 0} query={query} />
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

function EmptyState({ hasCaptures, query }: { hasCaptures: boolean; query: string }) {
  if (hasCaptures) {
    return (
      <p className="empty">
        Nothing tagged <strong>{query}</strong> yet.
      </p>
    )
  }
  return (
    <div className="empty">
      <p>No references yet.</p>
      <p className="empty-hint">
        Share a screenshot to Inspo, or use + to add one. Tag it with the product it came from and
        the idea it might help.
      </p>
    </div>
  )
}
