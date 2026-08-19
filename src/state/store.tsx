import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import {
  applyTagMemory,
  createCapture,
  deleteCapture as deleteCaptureRecord,
  loadCaptures,
  loadDefaults,
  saveDefaults,
  updateCaptureTags,
} from '../lib/db'
import { newId } from '../lib/id'
import { drainPendingShares, onAppResume } from '../lib/share'
import { relevantToSummaries, sourceSummaries, type TagFilter } from '../lib/tags'
import { EMPTY_DEFAULTS, type Capture, type CaptureDefaults, type PendingCapture } from '../lib/types'

export type View =
  | { name: 'home' }
  | { name: 'tag'; filter: TagFilter }
  | { name: 'detail'; id: string }

interface StoreValue {
  ready: boolean
  error: string | null
  captures: Capture[]
  defaults: CaptureDefaults
  /** Every Source ever used, for the FROM picker. */
  knownSources: string[]
  /** Every Relevant To tag ever used, for the FOR picker. */
  knownRelevantTo: string[]

  query: string
  setQuery: (query: string) => void

  view: View
  push: (view: View) => void
  pop: () => void
  goHome: () => void
  canGoBack: boolean

  /** Images waiting to be tagged. The first one owns the capture sheet. */
  pending: PendingCapture[]
  enqueue: (blobs: Blob[]) => void
  discardPending: (id: string) => void

  save: (pendingId: string, source: string, relevantTo: string[]) => Promise<void>
  retag: (id: string, source: string, relevantTo: string[]) => Promise<void>
  remove: (id: string) => Promise<void>
  dismissError: () => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [captures, setCaptures] = useState<Capture[]>([])
  const [defaults, setDefaults] = useState<CaptureDefaults>(EMPTY_DEFAULTS)
  const [query, setQuery] = useState('')
  const [stack, setStack] = useState<View[]>([{ name: 'home' }])
  const [pending, setPending] = useState<PendingCapture[]>([])

  // Object URLs for drafts are revoked by hand; React cannot see them.
  const pendingUrls = useRef(new Set<string>())

  const enqueue = useCallback((blobs: Blob[]) => {
    if (blobs.length === 0) return
    const drafts = blobs.map((blob) => {
      const previewUrl = URL.createObjectURL(blob)
      pendingUrls.current.add(previewUrl)
      return { id: newId(), blob, previewUrl }
    })
    setPending((current) => [...current, ...drafts])
  }, [])

  const releaseDraft = useCallback((draft: PendingCapture) => {
    URL.revokeObjectURL(draft.previewUrl)
    pendingUrls.current.delete(draft.previewUrl)
  }, [])

  const discardPending = useCallback(
    (id: string) => {
      setPending((current) => {
        const draft = current.find((p) => p.id === id)
        if (draft) releaseDraft(draft)
        return current.filter((p) => p.id !== id)
      })
    },
    [releaseDraft],
  )

  useEffect(() => {
    let cancelled = false
    void (async () => {
      try {
        const [storedCaptures, storedDefaults] = await Promise.all([loadCaptures(), loadDefaults()])
        if (cancelled) return
        setCaptures(storedCaptures)
        setDefaults(storedDefaults)
      } catch (e) {
        if (!cancelled) setError(messageFor(e))
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  // Anything the iOS Share Extension queued, on launch and on every resume.
  useEffect(() => {
    const pull = () => {
      void drainPendingShares().then((blobs) => enqueue(blobs))
    }
    pull()
    return onAppResume(pull)
  }, [enqueue])

  useEffect(() => {
    const urls = pendingUrls.current
    return () => {
      for (const url of urls) URL.revokeObjectURL(url)
      urls.clear()
    }
  }, [])

  const save = useCallback(
    async (pendingId: string, source: string, relevantTo: string[]) => {
      const draft = pending.find((p) => p.id === pendingId)
      if (!draft) return
      try {
        const capture = await createCapture({ blob: draft.blob, source, relevant_to: relevantTo })
        setCaptures((current) => [capture, ...current])
        setDefaults((current) => applyTagMemory(current, capture.source, capture.relevant_to))
        discardPending(pendingId)
      } catch (e) {
        setError(messageFor(e))
      }
    },
    [discardPending, pending],
  )

  const retag = useCallback(async (id: string, source: string, relevantTo: string[]) => {
    try {
      const updated = await updateCaptureTags(id, source, relevantTo)
      setCaptures((current) => current.map((c) => (c.id === id ? updated : c)))
      setDefaults((current) => applyTagMemory(current, updated.source, updated.relevant_to))
    } catch (e) {
      setError(messageFor(e))
    }
  }, [])

  const remove = useCallback(async (id: string) => {
    try {
      await deleteCaptureRecord(id)
      setCaptures((current) => current.filter((c) => c.id !== id))
    } catch (e) {
      setError(messageFor(e))
    }
  }, [])

  // Tag memory is state first so the capture sheet never waits on a write.
  // The first pass after load is skipped: if loading failed, the in-memory
  // defaults are empty and writing them would erase the stored context.
  const defaultsWritten = useRef(false)
  useEffect(() => {
    if (!ready) return
    if (!defaultsWritten.current) {
      defaultsWritten.current = true
      return
    }
    void saveDefaults(defaults).catch(() => {
      // Losing the sticky default is a small annoyance, not a failed capture.
    })
  }, [defaults, ready])

  const push = useCallback((next: View) => setStack((current) => [...current, next]), [])
  const pop = useCallback(
    () => setStack((current) => (current.length > 1 ? current.slice(0, -1) : current)),
    [],
  )
  const goHome = useCallback(() => setStack([{ name: 'home' }]), [])

  const knownSources = useMemo(
    () => sourceSummaries(captures).map((s) => s.value),
    [captures],
  )
  const knownRelevantTo = useMemo(
    () => relevantToSummaries(captures).map((s) => s.value),
    [captures],
  )

  const view = stack[stack.length - 1] ?? { name: 'home' }

  const value: StoreValue = {
    ready,
    error,
    captures,
    defaults,
    knownSources,
    knownRelevantTo,
    query,
    setQuery,
    view,
    push,
    pop,
    goHome,
    canGoBack: stack.length > 1,
    pending,
    enqueue,
    discardPending,
    save,
    retag,
    remove,
    dismissError: () => setError(null),
  }

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside StoreProvider')
  return value
}

function messageFor(e: unknown): string {
  return e instanceof Error ? e.message : 'Something went wrong'
}
