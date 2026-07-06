import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { habitsApi } from '../lib/api'
import { AnimatedCheckbox } from '../components/AnimatedCheckbox'

export function TodayPage() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['today'], queryFn: habitsApi.today })

  const checkin = useMutation({
    mutationFn: (goalId: string) => habitsApi.checkin(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['goals'] })
    },
  })

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error) return <p className="text-destructive">Failed to load: {(error as Error).message}</p>

  const habits = data?.habits ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Today</h1>
        <p className="text-sm text-muted-foreground">{data?.date}</p>
      </div>

      {habits.length === 0 && (
        <p className="text-muted-foreground text-sm">No habits yet (create a goal with progressType = daily).</p>
      )}

      <ul className="space-y-2">
        {habits.map(({ goal, checkedToday, streak }) => (
          <li key={goal.id} className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-3">
            <AnimatedCheckbox
              checked={checkedToday}
              onToggle={() => checkin.mutate(goal.id)}
              label={`Check in ${goal.title}`}
            />
            <span className={`flex-1 text-sm ${checkedToday ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {goal.title}
            </span>
            <span className="text-sm text-accent-deep font-semibold tabular-nums" title="Current streak">
              🔥 {streak}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
