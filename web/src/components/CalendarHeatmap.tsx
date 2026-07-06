import { useQuery } from '@tanstack/react-query'
import { habitsApi } from '../lib/api'

/**
 * Current-month heatmap: each day is shaded by the fraction of daily habits
 * checked that day (solid pine green = all done).
 */
export function CalendarHeatmap() {
  const { data, isLoading } = useQuery({ queryKey: ['checkins-month'], queryFn: () => habitsApi.month() })

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (!data || data.habitCount === 0) {
    return <p className="text-muted-foreground text-sm">The heatmap appears once you have daily habits.</p>
  }

  const doneByDate = new Map(data.days.map(d => [d.date, d.doneCount]))
  const [year, month] = data.month.split('-').map(Number)
  const daysInMonth = new Date(year, month, 0).getDate()
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7 // Monday = 0
  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const monthName = new Date(year, month - 1).toLocaleString('en', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4">
      <p className="text-sm font-medium mb-3">{monthName}</p>
      <div className="grid grid-cols-7 gap-1.5">
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <span key={i} className="text-[10px] text-muted-foreground text-center">{d}</span>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <span key={`pad-${i}`} />
          const date = `${data.month}-${String(day).padStart(2, '0')}`
          const fraction = Math.min(1, (doneByDate.get(date) ?? 0) / data.habitCount)
          const isFuture = date > todayStr
          return (
            <div
              key={date}
              title={`${date}: ${doneByDate.get(date) ?? 0}/${data.habitCount} habits`}
              className={`h-10 sm:h-12 rounded-md flex items-center justify-center text-xs tabular-nums
                ${date === todayStr ? 'ring-2 ring-ring' : ''}
                ${isFuture ? 'text-muted-foreground/40' : fraction === 1 ? 'text-primary-foreground' : 'text-foreground'}`}
              style={{
                backgroundColor: isFuture
                  ? 'transparent'
                  : fraction === 0
                    ? 'var(--muted)'
                    : `color-mix(in srgb, var(--primary) ${25 + fraction * 75}%, var(--muted))`,
              }}
            >
              {day}
            </div>
          )
        })}
      </div>
      <p className="text-[11px] text-muted-foreground mt-3">
        Darker days = more habits completed · solid green = all done
      </p>
    </div>
  )
}
