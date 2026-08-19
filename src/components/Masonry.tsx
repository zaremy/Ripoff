import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'

interface MasonryProps<T> {
  items: T[]
  keyOf: (item: T) => string
  /** width / height. Used to balance columns before the images have loaded. */
  aspectOf: (item: T) => number
  /** Rough pixel cost of the caption under each image, for balancing only. */
  captionHeight?: number
  targetColumnWidth?: number
  gap?: number
  children: (item: T) => ReactNode
}

/**
 * A wall of images rather than a table of rows.
 *
 * Items are placed newest-first into whichever column is currently shortest,
 * which keeps the chronological reading order roughly left-to-right while
 * still letting a tall screenshot sit next to a short one without a gap.
 */
export function Masonry<T>({
  items,
  keyOf,
  aspectOf,
  captionHeight = 46,
  targetColumnWidth = 190,
  gap = 14,
  children,
}: MasonryProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)

  useEffect(() => {
    const element = containerRef.current
    if (!element) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(element)
    setWidth(element.getBoundingClientRect().width)
    return () => observer.disconnect()
  }, [])

  const columnCount = useMemo(() => {
    if (width <= 0) return 2
    return Math.max(2, Math.min(6, Math.round(width / targetColumnWidth)))
  }, [targetColumnWidth, width])

  const columns = useMemo(() => {
    const buckets: T[][] = Array.from({ length: columnCount }, () => [])
    const heights = new Array<number>(columnCount).fill(0)
    const columnWidth =
      width > 0 ? (width - gap * (columnCount - 1)) / columnCount : targetColumnWidth

    for (const item of items) {
      let shortest = 0
      for (let i = 1; i < columnCount; i++) {
        if ((heights[i] as number) < (heights[shortest] as number)) shortest = i
      }
      const aspect = aspectOf(item)
      const safeAspect = Number.isFinite(aspect) && aspect > 0 ? aspect : 0.75
      buckets[shortest]?.push(item)
      heights[shortest] = (heights[shortest] as number) + columnWidth / safeAspect + captionHeight + gap
    }
    return buckets
  }, [aspectOf, captionHeight, columnCount, gap, items, targetColumnWidth, width])

  return (
    <div className="masonry" ref={containerRef} style={{ gap }}>
      {columns.map((column, index) => (
        <div className="masonry-column" key={index} style={{ gap }}>
          {column.map((item) => (
            <div key={keyOf(item)}>{children(item)}</div>
          ))}
        </div>
      ))}
    </div>
  )
}
