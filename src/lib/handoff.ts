/**
 * Getting a capture out of the library and into whatever you were going to
 * build with it.
 *
 * Two destinations, two shapes. Claude Code wants the markup plus the human
 * context that made the capture worth keeping. Figma wants layers. Both are
 * produced locally; nothing here calls a service.
 */

import type { Capture } from './types'

/**
 * A single pasteable block: what this was, why it was kept, and the markup
 * behind it. The FROM and FOR tags lead, because they are the part a model
 * cannot infer from the HTML.
 */
export function claudeCodeHandoff(capture: Capture, html: string | null): string {
  const lines = [
    `# Reference from ${capture.source}`,
    '',
    `- **From:** ${capture.source}`,
    `- **For:** ${capture.relevant_to.join(', ')}`,
  ]

  if (capture.snapshot) {
    lines.push(`- **URL:** ${capture.snapshot.url}`)
    if (capture.snapshot.title) lines.push(`- **Page title:** ${capture.snapshot.title}`)
    lines.push(
      `- **Viewport:** ${capture.snapshot.viewport.width}x${capture.snapshot.viewport.height}`,
    )
    if (capture.snapshot.blocked_stylesheets.length > 0) {
      lines.push(
        `- **Note:** ${capture.snapshot.blocked_stylesheets.length} cross-origin stylesheet(s) could not be read, so some styling is missing.`,
      )
    }
  }

  if (!html) {
    lines.push(
      '',
      'No markup was captured for this reference - it came from a screenshot rather than a web page.',
    )
    return lines.join('\n')
  }

  lines.push('', '```html', html, '```')
  return lines.join('\n')
}

export function figmaFileName(capture: Capture): string {
  const slug = capture.source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `${slug || 'reference'}-figma-layers.json`
}

/**
 * Copy to the clipboard, falling back to the old selection trick. WKWebView
 * only exposes the async clipboard API in a secure context, and a failed copy
 * should be reported rather than swallowed.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fall through to the textarea approach below.
  }

  try {
    const holder = document.createElement('textarea')
    holder.value = text
    holder.setAttribute('readonly', '')
    holder.style.cssText = 'position:fixed;left:-100000px;top:0'
    document.body.appendChild(holder)
    holder.select()
    const copied = document.execCommand('copy')
    holder.remove()
    return copied
  } catch {
    return false
  }
}

/**
 * Offer a file to save. This works on the desktop, where Figma imports
 * happen; on a phone the caller falls back to copying.
 */
export function downloadJson(fileName: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  // Revoking immediately can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
