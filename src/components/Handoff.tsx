import { useState } from 'react'
import { isNative } from '../lib/blobStore'
import { loadSnapshotHtml } from '../lib/db'
import { claudeCodeHandoff, copyText, downloadJson, figmaFileName } from '../lib/handoff'
import { hasMarkup } from '../lib/tags'
import type { Capture } from '../lib/types'

/**
 * Where a capture goes next.
 *
 * Only shown when the reference was a web page: a screenshot of a native app
 * has no markup behind it, and offering an export that cannot work would be
 * worse than offering nothing.
 */
export function Handoff({ capture }: { capture: Capture }) {
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState<'claude' | 'figma' | null>(null)

  if (!hasMarkup(capture)) return null

  async function forClaudeCode() {
    setBusy('claude')
    setStatus(null)
    try {
      const html = await loadSnapshotHtml(capture)
      const copied = await copyText(claudeCodeHandoff(capture, html))
      setStatus(copied ? 'Markup copied' : 'Could not reach the clipboard')
    } catch {
      setStatus('Could not read the saved markup')
    } finally {
      setBusy(null)
    }
  }

  async function forFigma() {
    setBusy('figma')
    setStatus(null)
    try {
      const html = await loadSnapshotHtml(capture)
      if (!html) throw new Error('missing')

      // Loaded on demand so the exporter never costs anything until it is used.
      const { snapshotToFigmaLayers } = await import('../lib/figmaExport')
      const layers = await snapshotToFigmaLayers({
        html,
        viewport: capture.snapshot?.viewport ?? { width: 390, height: 844 },
      })

      if (isNative()) {
        // No usable file save inside the app's webview; the clipboard is the
        // reliable way off the phone.
        const copied = await copyText(JSON.stringify(layers))
        setStatus(copied ? 'Figma layers copied' : 'Could not reach the clipboard')
      } else {
        downloadJson(figmaFileName(capture), layers)
        setStatus('Figma layers saved')
      }
    } catch {
      setStatus('Could not build Figma layers from this snapshot')
    } finally {
      setBusy(null)
    }
  }

  const { snapshot } = capture

  return (
    <section className="handoff">
      <header className="handoff-head">
        <h2>Page captured</h2>
        <p title={snapshot.url}>{hostOf(snapshot.url)}</p>
      </header>

      <div className="handoff-actions">
        <button type="button" className="ghost bordered" disabled={busy !== null} onClick={() => void forClaudeCode()}>
          {busy === 'claude' ? 'Copying' : 'Copy for Claude Code'}
        </button>
        <button type="button" className="ghost bordered" disabled={busy !== null} onClick={() => void forFigma()}>
          {busy === 'figma' ? 'Building' : 'Figma layers'}
        </button>
      </div>

      {status && <p className="handoff-status">{status}</p>}
      {snapshot.blocked_stylesheets.length > 0 && (
        <p className="handoff-status">
          {snapshot.blocked_stylesheets.length} stylesheet
          {snapshot.blocked_stylesheets.length === 1 ? '' : 's'} could not be read from the page, so
          some styling is missing.
        </p>
      )}
    </section>
  )
}

function hostOf(url: string): string {
  try {
    return new URL(url).host
  } catch {
    return url
  }
}
