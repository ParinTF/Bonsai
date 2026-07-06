/**
 * Large tap-friendly checkbox whose checkmark draws itself as a stroke
 * (stroke-dashoffset animation) instead of appearing instantly.
 */
export function AnimatedCheckbox({ checked, onToggle, label }: {
  checked: boolean
  onToggle: () => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={onToggle}
      className={`w-7 h-7 shrink-0 rounded-md border-2 flex items-center justify-center cursor-pointer
        transition-colors duration-150 ease-out
        focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:ring-offset-background
        ${checked ? 'bg-primary border-primary-deep' : 'bg-card border-earth hover:border-primary'}`}
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M2.5 8.5 L6 12 L13.5 4"
          stroke="var(--primary-foreground)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="18"
          strokeDashoffset={checked ? 0 : 18}
          className="transition-[stroke-dashoffset] duration-300 ease-out"
        />
      </svg>
    </button>
  )
}
