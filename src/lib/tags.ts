/**
 * Tags, search and counting.
 *
 * MVP search reads tags only. No OCR, no embeddings. "pixel" finds Pixel
 * Wild, "avatars" finds Four Crowns / Avatars, and "four crowns" finds every
 * Four Crowns reference.
 */

import type { Capture } from './types'

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

export function summaryFor(captures: Capture[], filter: TagFilter): TagSummary {
  const matching = captures.filter((c) => matchesFilter(c, filter))
  const sources = new Set(matching.map((c) => c.source.toLowerCase()))
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
