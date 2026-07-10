import { useQuery } from '@tanstack/react-query'
import { goalsApi } from '../lib/api'
import { WeekGoalCard } from '../components/WeekGoalCard'
import { useI18n } from '../lib/i18n'

export function WeekPage() {
  const { t } = useI18n()
  const { data: items, isLoading, error } = useQuery({ queryKey: ['this-week'], queryFn: goalsApi.thisWeek })

  if (isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>
  if (error) return <p className="text-destructive">{t('common.loadFailed')} {(error as Error).message}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">{t('week.title')}</h1>

      {(items ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">{t('week.none')}</p>
      )}

      <div className="space-y-3">
        {(items ?? []).map(item => <WeekGoalCard key={item.goal.id} item={item} />)}
      </div>
    </div>
  )
}
