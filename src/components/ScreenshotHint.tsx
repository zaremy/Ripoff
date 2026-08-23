/**
 * How to take a screenshot, drawn rather than borrowed.
 *
 * Apple's own illustration of this gesture is copyrighted, and every hosted
 * image is a network request in an app whose whole promise is working with no
 * connection. A few paths cost nothing, theme themselves from the surrounding
 * text colour, and carry no licence.
 */
export function ScreenshotHint() {
  return (
    <svg
      className="shot-hint"
      viewBox="0 0 108 132"
      role="img"
      aria-label="Press the side button and volume up at the same time"
    >
      {/* the phone */}
      <rect
        x="26"
        y="8"
        width="56"
        height="112"
        rx="12"
        className="shot-hint-body"
      />
      <rect x="32" y="14" width="44" height="100" rx="7" className="shot-hint-screen" />
      <rect x="46" y="17" width="16" height="3.4" rx="1.7" className="shot-hint-island" />

      {/* volume up, left; side button, right - the two that matter */}
      <rect x="22.5" y="38" width="3.5" height="15" rx="1.75" className="shot-hint-key" />
      <rect x="82" y="44" width="3.5" height="22" rx="1.75" className="shot-hint-key" />

      {/* press marks, one on each button */}
      <circle cx="15" cy="45.5" r="4.5" className="shot-hint-press" />
      <circle cx="93" cy="55" r="4.5" className="shot-hint-press" />
      <path d="M19.5 45.5h3.5M85.5 55h3.5" className="shot-hint-lead" />
    </svg>
  )
}
