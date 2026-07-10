import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { habitsApi } from '../lib/api'
import { AnimatedCheckbox } from '../components/AnimatedCheckbox'
import { useI18n } from '../lib/i18n'

export function TodayPage() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['today'], queryFn: habitsApi.today })

  const checkin = useMutation({
    mutationFn: (goalId: string) => habitsApi.checkin(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['goals'] })
    },
  })

  if (isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>
  if (error) return <p className="text-destructive">{t('common.loadFailed')} {(error as Error).message}</p>

  const habits = data?.habits ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('today.title')}</h1>
        <p className="text-sm text-muted-foreground">{data?.date}</p>
      </div>

      {habits.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('today.none')}</p>
      )}

      <ul className="space-y-2">
        {habits.map(({ goal, checkedToday, streak }) => (
          <li key={goal.id} className="bg-card rounded-xl border border-border shadow-sm p-4 flex items-center gap-3">
            <AnimatedCheckbox
              checked={checkedToday}
              onToggle={() => checkin.mutate(goal.id)}
              label={goal.title}
            />
            <span className={`flex-1 text-sm ${checkedToday ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
              {goal.title}
            </span>
            <span className="text-sm text-accent-deep font-semibold tabular-nums" title={t('dash.streak')}>
              🔥 {streak}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
