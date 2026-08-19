import { useEffect, useState } from 'react'
import { resolveImage } from '../lib/blobStore'

/**
 * Resolve a stored image ref to something an <img> can show, and release it
 * again on unmount. Object URLs are not garbage collected, and the grid
 * mounts and unmounts a lot of images.
 */
export function useImageUrl(ref: string | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!ref) {
      setUrl(null)
      return
    }

    let cancelled = false
    let release: (() => void) | null = null

    void resolveImage(ref)
      .then((resolved) => {
        if (cancelled) {
          resolved.release()
          return
        }
        release = resolved.release
        setUrl(resolved.url)
      })
      .catch(() => {
        if (!cancelled) setUrl(null)
      })

    return () => {
      cancelled = true
      release?.()
      release = null
    }
  }, [ref])

  return url
}
