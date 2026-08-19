import { useState } from 'react'
import { TagPicker } from '../components/TagPicker'
import { useImageUrl } from '../hooks/useImageUrl'
import type { Capture } from '../lib/types'
import { useStore } from '../state/store'

/**
 * The screenshot, fullscreen, plus the four controls the PRD allows:
 * Source, Relevant To, edit tags, delete. No notes, no metadata panel.
 */
export function Detail({ capture }: { capture: Capture }) {
  const { defaults, knownSources, knownRelevantTo, push, pop, retag, remove } = useStore()
  const url = useImageUrl(capture.local_image_uri)

  const [editing, setEditing] = useState(false)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [source, setSource] = useState<string[]>([capture.source])
  const [relevantTo, setRelevantTo] = useState<string[]>(capture.relevant_to)

  const chosenSource = source[0] ?? ''
  const canSave = chosenSource.length > 0 && relevantTo.length > 0

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
        <span className="sheet-title">{capture.source}</span>
        {editing ? (
          <button type="button" className="primary" onClick={() => void commit()} disabled={!canSave}>
            Done
          </button>
        ) : (
          <button type="button" className="ghost" onClick={startEditing}>
            Edit tags
          </button>
        )}
      </div>

      <div className="detail-image">
        {url ? <img src={url} alt={`Reference from ${capture.source}`} /> : <span className="card-placeholder" />}
      </div>

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
          <button
            type="button"
            className="tag tag-source"
            onClick={() => push({ name: 'tag', filter: { kind: 'source', value: capture.source } })}
          >
            {capture.source}
          </button>
          <div className="card-relevant">
            {capture.relevant_to.map((tag) => (
              <button
                type="button"
                className="tag tag-relevant"
                key={tag}
                onClick={() => push({ name: 'tag', filter: { kind: 'relevant_to', value: tag } })}
              >
                {tag}
              </button>
            ))}
          </div>

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
            <button type="button" className="ghost danger-text" onClick={() => setConfirmingDelete(true)}>
              Delete
            </button>
          )}
        </div>
      )}
    </div>
  )
}
