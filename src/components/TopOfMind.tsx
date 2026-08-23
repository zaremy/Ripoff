import { useMemo } from 'react'
import { topOfMind } from '../lib/tags'
import { useStore } from '../state/store'

const SHOWN = 4

/**
 * The ideas you are building, above the wall.
 *
 * Not a second view of the library and not a filter bar — a shortcut to the
 * boards you are actually living in this week. The wall stays the wall.
 *
 * Nothing renders while a search is running: the wall is already answering a
 * question, and a row of competing shortcuts on top of the answer is noise.
 */
export function TopOfMind() {
  const { captures, defaults, query, push } = useStore()

  const ideas = useMemo(
    () => topOfMind(captures, defaults.recent_relevant_to, SHOWN),
    [captures, defaults.recent_relevant_to],
  )

  if (query.trim() || ideas.length === 0) return null

  return (
    <nav className="tom" aria-label="Ideas you are building">
      {ideas.map((idea) => (
        <button
          type="button"
          key={idea}
          className="tom-chip"
          onClick={() => push({ name: 'tag', filter: { kind: 'relevant_to', value: idea } })}
        >
          {idea}
        </button>
      ))}
    </nav>
  )
}
