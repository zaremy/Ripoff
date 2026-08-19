import { useMemo, useState } from 'react'
import { isNewTag, normalizeTag, sameTag, suggestTags } from '../lib/tags'

interface TagPickerProps {
  label: string
  hint: string
  placeholder: string
  /** Every tag of this kind already in the library. */
  known: string[]
  /** Most-recently-used first; these sort to the front of the suggestions. */
  recents: string[]
  selected: string[]
  onChange: (next: string[]) => void
  multiple: boolean
}

/**
 * Suggestions are laid out as a wrap of chips rather than a dropdown, because
 * the fastest possible capture is one tap on a tag that is already on screen.
 * Typing is the fallback, not the primary path.
 */
export function TagPicker({
  label,
  hint,
  placeholder,
  known,
  recents,
  selected,
  onChange,
  multiple,
}: TagPickerProps) {
  const [input, setInput] = useState('')

  const suggestions = useMemo(() => {
    const all = suggestTags(known, recents, input)
    return all.filter((tag) => !selected.some((s) => sameTag(s, tag))).slice(0, 12)
  }, [input, known, recents, selected])

  const typed = normalizeTag(input)
  const canCreate = typed.length > 0 && isNewTag([...known, ...selected], typed)

  function add(tag: string) {
    const value = normalizeTag(tag)
    if (!value) return
    if (selected.some((s) => sameTag(s, value))) return
    onChange(multiple ? [...selected, value] : [value])
    setInput('')
  }

  function removeAt(tag: string) {
    onChange(selected.filter((s) => !sameTag(s, tag)))
  }

  return (
    <section className="picker">
      <header className="picker-head">
        <h2>{label}</h2>
        <p>{hint}</p>
      </header>

      {selected.length > 0 && (
        <div className="picker-selected">
          {selected.map((tag) => (
            <span className={multiple ? 'tag tag-relevant selected' : 'tag tag-source selected'} key={tag}>
              {tag}
              <button type="button" onClick={() => removeAt(tag)} aria-label={`Remove ${tag}`}>
                &times;
              </button>
            </span>
          ))}
        </div>
      )}

      {(multiple || selected.length === 0) && (
        <form
          onSubmit={(event) => {
            event.preventDefault()
            add(input)
          }}
        >
          <input
            className="picker-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={selected.length > 0 ? 'Add another' : placeholder}
            autoCapitalize="words"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
          />
        </form>
      )}

      <div className="picker-suggestions">
        {canCreate && (
          <button type="button" className="tag tag-create" onClick={() => add(typed)}>
            + {typed}
          </button>
        )}
        {suggestions.map((tag) => (
          <button
            type="button"
            className={multiple ? 'tag tag-relevant' : 'tag tag-source'}
            key={tag}
            onClick={() => add(tag)}
          >
            {tag}
          </button>
        ))}
      </div>
    </section>
  )
}
