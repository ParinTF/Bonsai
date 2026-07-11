import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, XCircle } from 'lucide-react'
import { reviewApi } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { ProgressBar } from '../components/ProgressBar'

/** Read-only "how did this week go" digest — the reminder surface, in-app. */
export function WeeklyReviewPage() {
  const { t } = useI18n()
  const { data, isLoading, error } = useQuery({ queryKey: ['weekly-review'], queryFn: reviewApi.weekly })

  if (isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>
  if (error) return <p className="text-destructive">{t('common.loadFailed')} {(error as Error).message}</p>
  if (!data) return null

  const nothing = data.weekly.length === 0 && data.daily.length === 0

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-foreground">{t('review.title')}</h1>
        <p className="text-sm text-muted-foreground">
          {t('review.weekOf').replace('{date}', data.weekOf)} ·{' '}
          {t('review.summary')
            .replace('{done}', String(data.weeklyRecorded))
            .replace('{total}', String(data.weeklyTotal))}
        </p>
      </div>

      {nothing && <p className="text-muted-foreground text-sm">{t('review.none')}</p>}

      {data.weekly.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">{t('review.weekly')}</h2>
          {data.weekly.map(w => (
            <div key={w.goal.id} className="bg-card rounded-xl border border-border shadow-sm p-3 flex items-center gap-3">
              {w.result === 'pass'
                ? <CheckCircle2 size={18} className="text-primary shrink-0" />
                : w.result === 'fail'
                  ? <XCircle size={18} className="text-destructive shrink-0" />
                  : <Circle size={18} className="text-muted-foreground/50 shrink-0" />}
              <span className="flex-1 text-sm min-w-0 truncate">{w.goal.title}</span>
              {w.streak > 0 && (
                <span className="text-xs text-accent-deep font-semibold tabular-nums">🔥 {w.streak}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {w.result === 'pass' ? t('review.passed') : w.result === 'fail' ? t('review.failed') : t('review.notRecorded')}
              </span>
            </div>
          ))}
          {data.weeklyRecorded < data.weeklyTotal && (
            <Link to="/week" className="inline-block text-sm text-primary hover:underline">{t('review.recordCta')}</Link>
          )}
        </section>
      )}

      {data.daily.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wide">{t('review.daily')}</h2>
          {data.daily.map(d => (
            <div key={d.goal.id} className="bg-card rounded-xl border border-border shadow-sm p-3 space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="flex-1 text-sm min-w-0 truncate">{d.goal.title}</span>
                {d.streak > 0 && (
                  <span className="text-xs text-accent-deep font-semibold tabular-nums">🔥 {d.streak}</span>
                )}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {t('review.daysDone').replace('{n}', String(d.daysDone))}
                </span>
              </div>
              <ProgressBar value={(d.daysDone / 7) * 100} />
            </div>
          ))}
        </section>
      )}
    </div>
  )
}
