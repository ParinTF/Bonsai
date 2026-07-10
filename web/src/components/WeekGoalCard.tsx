import { useMutation, useQueryClient } from '@tanstack/react-query'
import { goalsApi, type WeekItem } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { ProgressBar } from './ProgressBar'
import { Button } from '@/components/ui/button'

/** Weekly goal card with pass/fail recording and a 4-week history dot row. */
export function WeekGoalCard({ item }: { item: WeekItem }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const record = useMutation({
    mutationFn: (result: 'pass' | 'fail') => goalsApi.weeklyAttempt(item.goal.id, result),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['this-week'] })
      qc.invalidateQueries({ queryKey: ['goals'] })
    },
  })

  // Oldest → newest so the row reads left-to-right in time order
  const dots = [...item.attempts].reverse()

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium">{item.goal.title}</span>
        <div className="flex gap-2 items-center">
          <div className="flex gap-1 mr-1" title={t('week.last4')}>
            {dots.map(a => (
              <span
                key={a.weekOf}
                title={`${a.weekOf}: ${a.result}`}
                className={`w-2.5 h-2.5 rounded-full ${a.result === 'pass' ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              />
            ))}
            {dots.length === 0 && <span className="text-xs text-muted-foreground">{t('week.noAttempts')}</span>}
          </div>
          <Button
            size="sm" variant="outline"
            onClick={() => record.mutate('pass')} disabled={record.isPending}
            className="text-primary border-primary/40 hover:bg-primary/10"
          >
            {t('week.pass')}
          </Button>
          <Button
            size="sm" variant="outline"
            onClick={() => record.mutate('fail')} disabled={record.isPending}
            className="text-destructive border-destructive/30 hover:bg-destructive/10"
          >
            {t('week.fail')}
          </Button>
        </div>
      </div>
      <ProgressBar value={item.goal.progress} />
    </div>
  )
}
