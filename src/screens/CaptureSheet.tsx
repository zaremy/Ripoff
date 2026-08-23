import { useState } from 'react'
import { TagPicker } from '../components/TagPicker'
import type { CaptureDefaults, PendingCapture } from '../lib/types'

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}

interface CaptureSheetProps {
  draft: PendingCapture
  defaults: CaptureDefaults
  knownSources: string[]
  knownRelevantTo: string[]
  queued: number
  onSave: (source: string, relevantTo: string[]) => Promise<void>
  onDiscard: () => void
}

/**
 * The one screen that has to be fast.
 *
 * It opens with the last used context already filled in, so the tenth
 * screenshot of a teardown session costs exactly one tap: Save.
 */
export function CaptureSheet({
  draft,
  defaults,
  knownSources,
  knownRelevantTo,
  queued,
  onSave,
  onDiscard,
}: CaptureSheetProps) {
  const [source, setSource] = useState<string[]>(defaults.source ? [defaults.source] : [])
  const [relevantTo, setRelevantTo] = useState<string[]>(defaults.relevant_to)
  const [saving, setSaving] = useState(false)

  const chosenSource = source[0] ?? ''
  const canSave = chosenSource.length > 0 && relevantTo.length > 0 && !saving

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      await onSave(chosenSource, relevantTo)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="sheet">
      <header className="sheet-head">
        <button type="button" className="ghost" onClick={onDiscard}>
          Discard
        </button>
        <span className="sheet-title">
          New reference{queued > 1 ? ` (1 of ${queued})` : ''}
        </span>
        <button type="button" className="primary" onClick={() => void save()} disabled={!canSave}>
          {saving ? 'Saving' : 'Save'}
        </button>
      </header>

      <div className="sheet-body">
        <div className="sheet-preview">
          <img src={draft.previewUrl} alt="Screenshot being saved" />
        </div>

        {draft.snapshot && (
          <p className="sheet-note">
            Page markup captured from {hostOf(draft.snapshot.url)}
          </p>
        )}

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
      </div>
    </div>
  )
}
