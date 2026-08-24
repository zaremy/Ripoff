import { useMemo, useState } from 'react'
import { Handoff } from '../components/Handoff'
import { Shot } from '../components/Shot'
import { TagPicker } from '../components/TagPicker'
import { hasMarkup } from '../lib/tags'
import type { Capture } from '../lib/types'
import { useStore } from '../state/store'

/**
 * One asset.
 *
 * The subject of this screen is what you are building with it, so that is the
 * biggest thing on it. Where it came from is provenance and sits a step down;
 * the header carries position only, so the name is never said twice.
 */
export function Detail({ capture }: { capture: Capture }) {
  const { captures, defaults, knownSources, knownRelevantTo, push, pop, retag, remove } = useStore()

  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [source, setSource] = useState<string[]>([capture.source])
  const [relevantTo, setRelevantTo] = useState<string[]>(capture.relevant_to)

  const chosenSource = source[0] ?? ''
  const canSave = chosenSource.length > 0 && relevantTo.length > 0
  const marked = hasMarkup(capture)

  // Where this sits in its own target's haul - the header's whole job.
  const position = useMemo(() => {
    const siblings = captures.filter(
      (c) => c.source.trim().toLowerCase() === capture.source.trim().toLowerCase(),
    )
    const index = siblings.findIndex((c) => c.id === capture.id)
    return { index: index < 0 ? 0 : index + 1, total: siblings.length }
  }, [captures, capture.id, capture.source])

  function startEditing() {
    setSource([capture.source])
    setRelevantTo(capture.relevant_to)
    setEditing(true)
  }

  async function commit() {
    if (!canSave) return
    await retag(capture.id, chosenSource, relevantTo)
    setEditing(false)
  }

  async function confirmDelete() {
    await remove(capture.id)
    pop()
  }

  return (
    <div className="screen detail">
      <div className="topbar">
        <button type="button" className="back" onClick={pop} aria-label="Back">
          &larr;
        </button>
        <span className="position">
          {position.index} / {position.total}
        </span>
        {editing ? (
          <button type="button" className="primary" onClick={() => void commit()} disabled={!canSave}>
            Done
          </button>
        ) : (
          <button type="button" className="ghost hl" onClick={startEditing}>
            Edit tags
          </button>
        )}
      </div>

      <Shot
        capture={capture}
        full
        size="hero"
        alt={`Reference from ${capture.source}`}
      />

      {editing ? (
        <div className="detail-edit">
          <TagPicker
            label="From"
            hint="Which product is this?"
            placeholder="Pixel Wild"
            known={knownSources}
            recents={defaults.recent_sources}
            selected={source}
            onChange={setSource}
            multiple={false}
          />
          <TagPicker
            label="For"
            hint="Which idea could this help?"
            placeholder="Four Crowns / Avatars"
            known={knownRelevantTo}
            recents={defaults.recent_relevant_to}
            selected={relevantTo}
            onChange={setRelevantTo}
            multiple
          />
          <button type="button" className="ghost" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="detail-meta">
          {marked && capture.snapshot && (
            <p className="source-badge hl">
              &#9700; Source &middot; {kb(capture.snapshot.bytes)}
            </p>
          )}

          <div className="subject">
            <p className="field-label">Building</p>
            <p className="subject-value">
              {capture.relevant_to.map((tag) => (
                <button
                  type="button"
                  className="hl"
                  key={tag}
                  onClick={() => push({ name: 'tag', filter: { kind: 'relevant_to', value: tag } })}
                >
                  {tag}
                </button>
              ))}
            </p>
          </div>

          <dl className="facts">
            <div className="fact">
              <dt className="field-label">Found in</dt>
              <dd>
                <button
                  type="button"
                  className="fact-value"
                  onClick={() => push({ name: 'tag', filter: { kind: 'source', value: capture.source } })}
                >
                  {capture.source}
                </button>
              </dd>
            </div>
            <div className="fact">
              <dt className="field-label">Taken</dt>
              <dd className="fact-meta">{taken(capture.created_at)}</dd>
            </div>
          </dl>

          <Handoff capture={capture} />

          {/* The delete control keeps `danger-text` as well as `drop`:
              scripts/mirror-test.mjs selects on `.detail .danger-text`, and it
              does not run under `npm test`, so removing the class as redundant
              breaks that harness silently. */}
          {confirmingDelete ? (
            <div className="confirm">
              <span>Delete this reference?</span>
              <button type="button" className="danger" onClick={() => void confirmDelete()}>
                Delete
              </button>
              <button type="button" className="ghost" onClick={() => setConfirmingDelete(false)}>
                Keep
              </button>
            </div>
          ) : (
            <button type="button" className="drop danger-text" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function kb(bytes: number): string {
  return bytes >= 1024 * 1024
    ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function taken(at: number): string {
  return new Date(at).toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}
