import { useQuery } from '@tanstack/react-query'
import { goalsApi } from '../lib/api'
import { WeekGoalCard } from '../components/WeekGoalCard'

export function WeekPage() {
  const { data: items, isLoading, error } = useQuery({ queryKey: ['this-week'], queryFn: goalsApi.thisWeek })

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error) return <p className="text-destructive">Failed to load: {(error as Error).message}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">This Week</h1>

      {(items ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">No active weekly goals (progressType = weekly).</p>
      )}

      <div className="space-y-3">
        {(items ?? []).map(item => <WeekGoalCard key={item.goal.id} item={item} />)}
      </div>
    </div>
  )
}
