import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { habitsApi, localDate } from '../lib/api'
import { useI18n } from '../lib/i18n'

/**
 * Month heatmap with prev/next navigation: each day is shaded by the fraction
 * of daily habits checked that day (solid pine green = all done).
 */
export function CalendarHeatmap() {
  const { t } = useI18n()
  const currentMonth = localDate().slice(0, 7)
  const [month, setMonth] = useState(currentMonth)
  const { data, isLoading } = useQuery({
    queryKey: ['checkins-month', month],
    queryFn: () => habitsApi.month(month),
  })

  function shift(delta: number) {
    const [y, m] = month.split('-').map(Number)
    const d = new Date(y, m - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
  }

  if (isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>
  if (!data || data.habitCount === 0) {
    return <p className="text-muted-foreground text-sm">{t('heatmap.empty')}</p>
  }

  const doneByDate = new Map(data.days.map(d => [d.date, d.doneCount]))
  const [year, monthNum] = data.month.split('-').map(Number)
  const daysInMonth = new Date(year, monthNum, 0).getDate()
  const firstWeekday = (new Date(year, monthNum - 1, 1).getDay() + 6) % 7 // Monday = 0
  const todayStr = localDate()

  const cells: (number | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]

  const monthName = new Date(year, monthNum - 1).toLocaleString('en', { month: 'long', year: 'numeric' })

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-sm font-medium">{monthName}</p>
        <div className="flex gap-1">
          <button
            onClick={() => shift(-1)}
            className="p-1 rounded hover:bg-secondary text-muted-foreground"
            aria-label="Previous month"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => shift(1)}
            disabled={month >= currentMonth}
            className="p-1 rounded hover:bg-secondary text-muted-foreground disabled:opacity-30"
            aria-label="Next month"
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
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
      <p className="text-[11px] text-muted-foreground mt-3">{t('heatmap.caption')}</p>
    </div>
  )
}
