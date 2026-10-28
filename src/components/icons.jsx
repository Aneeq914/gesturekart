// Inline SVG icons (no icon library). All are decorative: the text next to
// them carries the meaning, so they are aria-hidden.

function Icon({ size = 20, className, children, strokeWidth = 2 }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** Brand mark: a traffic light (red / amber / green) in a rounded tile. */
export function LogoMark({ size = 44, className = '' }) {
  return (
    <svg
      className={`logo-mark ${className}`}
      width={size}
      height={size}
      viewBox="0 0 48 48"
      aria-hidden="true"
      focusable="false"
    >
      {/* Colours are also set as attributes (same hex as tokens.css): the
          html-to-image export doesn't apply class styles to SVG children, so
          without them the lamps print black on the PDF score card. */}
      <rect className="logo-mark__tile" x="1" y="1" width="46" height="46" rx="13" fill="#111832" />
      <rect className="logo-mark__housing" x="15" y="5.5" width="18" height="37" rx="9" fill="#0b1020" />
      <circle className="logo-mark__lamp logo-mark__lamp--red" cx="24" cy="14.5" r="4.4" fill="#ff4d5e" />
      <circle className="logo-mark__lamp logo-mark__lamp--amber" cx="24" cy="24" r="4.4" fill="#ffc531" />
      <circle className="logo-mark__lamp logo-mark__lamp--green" cx="24" cy="33.5" r="4.4" fill="#2ee6a0" />
    </svg>
  )
}

export const ArrowLeftIcon = (p) => (
  <Icon {...p}>
    <path d="M19 12H5" />
    <path d="M11 6l-6 6 6 6" />
  </Icon>
)

export const ArrowRightIcon = (p) => (
  <Icon {...p}>
    <path d="M5 12h14" />
    <path d="M13 6l6 6-6 6" />
  </Icon>
)

export const CruiseIcon = (p) => (
  <Icon {...p}>
    <path d="M12 19V5" />
    <path d="M6 11l6-6 6 6" />
  </Icon>
)

export const HandIcon = (p) => (
  <Icon {...p}>
    <path d="M8 13V6.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M14 10.5V5.5a1.5 1.5 0 0 1 3 0V12" />
    <path d="M17 11V8.5a1.5 1.5 0 0 1 3 0V14a7 7 0 0 1-7 7h-1.2a6 6 0 0 1-4.7-2.3L4.4 15.4a1.6 1.6 0 0 1 2.5-2L8 15" />
  </Icon>
)

export const CameraIcon = (p) => (
  <Icon {...p}>
    <path d="M3 8.5A2.5 2.5 0 0 1 5.5 6H7l1.6-2h6.8L17 6h1.5A2.5 2.5 0 0 1 21 8.5v9a2.5 2.5 0 0 1-2.5 2.5h-13A2.5 2.5 0 0 1 3 17.5z" />
    <circle cx="12" cy="13" r="3.5" />
  </Icon>
)

export const KeyboardIcon = (p) => (
  <Icon {...p}>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7.5 14h9" />
  </Icon>
)

export const DownloadIcon = (p) => (
  <Icon {...p}>
    <path d="M12 4v11" />
    <path d="M7 10.5l5 5 5-5" />
    <path d="M5 20h14" />
  </Icon>
)

export const ReplayIcon = (p) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1" />
    <path d="M3.5 4v5h5" />
  </Icon>
)

export const HomeIcon = (p) => (
  <Icon {...p}>
    <path d="M4 11l8-7 8 7" />
    <path d="M6 9.5V20h12V9.5" />
    <path d="M10 20v-5h4v5" />
  </Icon>
)

export const CheckIcon = (p) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7" />
  </Icon>
)

export const AlertIcon = (p) => (
  <Icon {...p}>
    <path d="M10.3 4.1L2.6 17.5A2 2 0 0 0 4.3 20.5h15.4a2 2 0 0 0 1.7-3L13.7 4.1a2 2 0 0 0-3.4 0z" />
    <path d="M12 9.5v4" />
    <path d="M12 17h.01" />
  </Icon>
)

export const InfoIcon = (p) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5" />
    <path d="M12 7.8h.01" />
  </Icon>
)

export const SpinnerIcon = ({ className = '', ...p }) => (
  <Icon {...p} className={`icon-spin ${className}`}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Icon>
)

/* ── Larger "how to play" figures (48×48) ─────────────────────────────── */

function Figure({ children }) {
  return (
    <svg
      width="40"
      height="40"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  )
}

/** A person leaning sideways, with left/right chevrons. */
export const LeanFigure = () => (
  <Figure>
    <g transform="rotate(-16 24 42)">
      <circle cx="24" cy="11" r="4.5" />
      <path d="M24 16v14" />
      <path d="M16 21h16" />
      <path d="M24 30l-5 11M24 30l5 11" />
    </g>
    <path d="M8 20l-4 4 4 4" />
    <path d="M40 20l4 4-4 4" />
  </Figure>
)

/** A person with one hand raised above the head. */
export const RaiseHandFigure = () => (
  <Figure>
    <circle cx="25" cy="15" r="4.5" />
    <path d="M25 20v13" />
    <path d="M25 23l-7-7-1-9" />
    <path d="M25 23l7 7" />
    <path d="M25 33l-5 10M25 33l5 10" />
    <circle cx="17" cy="5" r="2.2" />
  </Figure>
)

/** A small keyboard. */
export const KeyboardFigure = () => (
  <Figure>
    <rect x="4" y="13" width="40" height="23" rx="5" />
    <path d="M11 20h.01M17 20h.01M23 20h.01M29 20h.01M36 20h.01" />
    <path d="M15 29h18" />
  </Figure>
)
