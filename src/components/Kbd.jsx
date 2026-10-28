// A keyboard key cap. `label` gives screen readers a spoken name for symbols
// like arrows ("Left arrow") while sighted users see the glyph.
export default function Kbd({ children, label }) {
  if (!label) return <kbd className="kbd">{children}</kbd>
  return (
    <kbd className="kbd">
      <span aria-hidden="true">{children}</span>
      <span className="sr-only">{label}</span>
    </kbd>
  )
}
