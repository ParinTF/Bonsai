/**
 * "Growth ring" arc — circular progress used on root goal cards instead of a
 * straight bar. Sweeps clockwise from 12 o'clock; animates on value change.
 */
export function GrowthRing({ value, size = 44 }: { value: number; size?: number }) {
  const clamped = Math.min(100, Math.max(0, value))
  const stroke = 4
  const r = (size - stroke) / 2
  const c = 2 * Math.PI * r
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} title={`${Math.round(clamped)}%`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--border)" strokeWidth={stroke} opacity={0.5}
        />
        <circle
          cx={size / 2} cy={size / 2} r={r}
          fill="none" stroke="var(--primary)" strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - clamped / 100)}
          className="transition-[stroke-dashoffset] duration-700 ease-out"
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums text-foreground">
        {Math.round(clamped)}%
      </span>
    </div>
  )
}
