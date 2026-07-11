/** Minimal inline SVG sparkline for a 0-100 progress series. Theme-aware via currentColor. */
export function Sparkline({ points, className = '' }: { points: { date: string; progress: number }[]; className?: string }) {
  if (points.length < 2) return null

  const w = 240
  const h = 40
  const pad = 3
  const n = points.length
  const x = (i: number) => pad + (i * (w - 2 * pad)) / (n - 1)
  const y = (v: number) => h - pad - (Math.max(0, Math.min(100, v)) / 100) * (h - 2 * pad)

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.progress).toFixed(1)}`).join(' ')
  const area = `${line} L${x(n - 1).toFixed(1)},${h - pad} L${x(0).toFixed(1)},${h - pad} Z`
  const last = points[n - 1]

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className={`w-full text-primary ${className}`} preserveAspectRatio="none" role="img" aria-label="Progress trend">
      <path d={area} fill="currentColor" opacity={0.12} />
      <path d={line} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={x(n - 1)} cy={y(last.progress)} r={2.2} fill="currentColor" />
    </svg>
  )
}
