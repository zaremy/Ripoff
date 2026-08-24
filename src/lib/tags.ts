/**
 * Tags, search and counting.
 *
 * MVP search reads tags only. No OCR, no embeddings. "pixel" finds Pixel
 * Wild, "avatars" finds Four Crowns / Avatars, and "four crowns" finds every
 * Four Crowns reference.
 */

import type { Capture, SnapshotMeta } from './types'

/** Trim and collapse whitespace, but preserve the user's own casing. */
export function normalizeTag(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ')
}

/** Normalize, drop blanks, and de-duplicate case-insensitively, keeping order. */
export function uniqueTags(raw: string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  for (const value of raw) {
    const tag = normalizeTag(value)
    if (!tag) continue
    const key = tag.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(tag)
  }
  return out
}

export function sameTag(a: string, b: string): boolean {
  return normalizeTag(a).toLowerCase() === normalizeTag(b).toLowerCase()
}

/**
 * Every whitespace-separated word in the query must appear somewhere in the
 * capture's tags. That makes "four crowns" narrow rather than widen, which is
 * what a two-word query is always meant to do.
 */
export function matchesQuery(capture: Capture, query: string): boolean {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const haystack = [capture.source, ...capture.relevant_to].join(' | ').toLowerCase()
  return terms.every((term) => haystack.includes(term))
}

export type FilterKind = 'source' | 'relevant_to'

export interface TagFilter {
  kind: FilterKind
  value: string
}

export function matchesFilter(capture: Capture, filter: TagFilter | null): boolean {
  if (!filter) return true
  if (filter.kind === 'source') return sameTag(capture.source, filter.value)
  return capture.relevant_to.some((tag) => sameTag(tag, filter.value))
}

export function selectCaptures(
  captures: Capture[],
  filter: TagFilter | null,
  query: string,
): Capture[] {
  return captures.filter((c) => matchesFilter(c, filter) && matchesQuery(c, query))
}

/**
 * True when the page behind the screenshot came with it. Only these can be
 * handed to Figma or Claude Code, so it is the one fact worth surfacing on
 * the wall rather than only on the detail screen.
 */
export function hasMarkup(
  capture: Capture,
): capture is Capture & { snapshot_uri: string; snapshot: SnapshotMeta } {
  return Boolean(capture.snapshot_uri && capture.snapshot)
}

/**
 * The ideas you are building right now, for the row above the wall.
 *
 * There is no pinning UI and there should not be one: the store already
 * records which FOR tags you reached for most recently, and that is a better
 * account of what you are working on than anything you would remember to
 * curate. An idea whose last capture was deleted or retagged drops out on its
 * own.
 */
export function topOfMind(captures: Capture[], recent: string[], limit = 4): string[] {
  // Keyed by the folded form, valued by the spelling a capture actually
  // carries. The recents list can hold an older casing than the library does
  // after a retag, and a chip that says something no capture says is a lie
  // even when the board it opens is correct.
  const live = new Map<string, string>()
  for (const capture of captures) {
    for (const tag of capture.relevant_to) {
      const key = normalizeTag(tag).toLowerCase()
      if (!live.has(key)) live.set(key, normalizeTag(tag))
    }
  }

  const out: string[] = []
  const seen = new Set<string>()
  for (const tag of recent) {
    const key = normalizeTag(tag).toLowerCase()
    if (!key || seen.has(key)) continue
    const canonical = live.get(key)
    if (!canonical) continue
    seen.add(key)
    out.push(canonical)
    if (out.length === limit) break
  }
  return out
}

export interface TagSummary {
  value: string
  count: number
  /** For a Relevant To tag: how many distinct products it draws from. */
  sourceCount: number
}

function summarize(captures: Capture[], tagsOf: (capture: Capture) => string[]): TagSummary[] {
  const byKey = new Map<string, { value: string; count: number; sources: Set<string> }>()
  for (const capture of captures) {
    for (const tag of tagsOf(capture)) {
      const key = tag.toLowerCase()
      let entry = byKey.get(key)
      if (!entry) {
        entry = { value: tag, count: 0, sources: new Set() }
        byKey.set(key, entry)
      }
      entry.count += 1
      entry.sources.add(capture.source.toLowerCase())
    }
  }
  return [...byKey.values()]
    .map((e) => ({ value: e.value, count: e.count, sourceCount: e.sources.size }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value))
}

/** Every Source in the library, most-collected first. */
export function sourceSummaries(captures: Capture[]): TagSummary[] {
  return summarize(captures, (c) => [c.source])
}

/** Every Relevant To tag in the library, most-collected first. */
export function relevantToSummaries(captures: Capture[]): TagSummary[] {
  return summarize(captures, (c) => c.relevant_to)
}

export function summaryFor(
  captures: Capture[],
  filter: TagFilter,
  query = '',
): TagSummary {
  // Counts the same set the board renders. It has to go through
  // selectCaptures rather than re-implementing the predicate: a header that
  // filters differently from the rows is a header that lies, and it lies
  // silently.
  const matching = selectCaptures(captures, filter, query)
  // normalizeTag, not a bare toLowerCase - "Pixel  Wild" and "Pixel Wild" are
  // one product everywhere else in this file, and counting them as two makes
  // the product tally disagree with the boards it links to.
  const sources = new Set(matching.map((c) => normalizeTag(c.source).toLowerCase()))
  return { value: filter.value, count: matching.length, sourceCount: sources.size }
}

/**
 * Suggestions for a tag field: everything already used, recents first, then
 * the rest alphabetically, narrowed by whatever has been typed so far.
 */
export function suggestTags(known: string[], recents: string[], input: string): string[] {
  const term = normalizeTag(input).toLowerCase()
  const ordered = uniqueTags([...recents, ...[...known].sort((a, b) => a.localeCompare(b))])
  if (!term) return ordered
  return ordered.filter((tag) => tag.toLowerCase().includes(term))
}

/** True when the typed text is a genuinely new tag worth offering to create. */
export function isNewTag(known: string[], input: string): boolean {
  const tag = normalizeTag(input)
  if (!tag) return false
  return !known.some((existing) => sameTag(existing, tag))
}
