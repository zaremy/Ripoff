import { useEffect } from 'react'
import { incomingFromFiles } from './lib/share'
import { Detail } from './screens/Detail'
import { Home } from './screens/Home'
import { CaptureSheet } from './screens/CaptureSheet'
import { TagView } from './screens/TagView'
import { useStore } from './state/store'

export function App() {
  const store = useStore()
  const { pending, enqueue, ready, error, dismissError, view, captures, pop } = store

  // Drag-and-drop and paste stand in for the iOS share sheet on the desktop.
  useEffect(() => {
    const onDrop = (event: DragEvent) => {
      const files = event.dataTransfer?.files
      if (!files || files.length === 0) return
      event.preventDefault()
      void incomingFromFiles(files).then(enqueue)
    }
    const onDragOver = (event: DragEvent) => event.preventDefault()
    const onPaste = (event: ClipboardEvent) => {
      void incomingFromFiles(event.clipboardData?.files).then(enqueue)
    }

    window.addEventListener('drop', onDrop)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('paste', onPaste)
    return () => {
      window.removeEventListener('drop', onDrop)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('paste', onPaste)
    }
  }, [enqueue])

  const draft = pending[0]

  // A capture can vanish from underneath the detail screen after a delete.
  const orphanedDetail = view.name === 'detail' && !captures.some((c) => c.id === view.id)
  useEffect(() => {
    if (orphanedDetail) pop()
  }, [orphanedDetail, pop])

  // A capture waiting to be tagged always wins: the user is mid-teardown and
  // wants to get back to the product they were looking at.
  if (draft) {
    return (
      <CaptureSheet
        draft={draft}
        defaults={store.defaults}
        knownSources={store.knownSources}
        knownRelevantTo={store.knownRelevantTo}
        queued={pending.length}
        onSave={(source, relevantTo) => store.save(draft.id, source, relevantTo)}
        onDiscard={() => store.discardPending(draft.id)}
      />
    )
  }

  if (!ready) return <div className="screen loading" />

  return (
    <>
      {error && (
        <div className="banner" role="alert">
          <span>{error}</span>
          <button type="button" onClick={dismissError}>
            Dismiss
          </button>
        </div>
      )}
      {renderView()}
    </>
  )

  function renderView() {
    if (view.name === 'tag') return <TagView filter={view.filter} />
    if (view.name === 'detail') {
      const capture = captures.find((c) => c.id === view.id)
      if (!capture) return null
      return <Detail capture={capture} />
    }
    return <Home />
  }
}
