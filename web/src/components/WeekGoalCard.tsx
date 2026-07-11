import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { goalsApi, localDate, type NextSuggestion, type ProgressType, type WeekItem } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { ProgressBar } from './ProgressBar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

const DIRECTION_ICONS: Record<NextSuggestion['direction'], string> = {
  harder: '⬆️', same: '➡️', retry: '🔁', easier: '⬇️',
}

/** Monday (yyyy-MM-dd) for this week and the previous `count-1` weeks, newest first. */
function recentMondays(count = 6): string[] {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    out.push(localDate(d))
    d.setDate(d.getDate() - 7)
  }
  return out
}

/** Weekly goal card: pass/fail recording (with past-week backfill), a streak badge,
 * a 4-week history dot row, and a post-attempt "next goal" suggestion. */
export function WeekGoalCard({ item }: { item: WeekItem }) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const mondays = recentMondays()
  const [weekOf, setWeekOf] = useState(mondays[0])
  const [suggestion, setSuggestion] = useState<NextSuggestion | null>(null)
  // null = new-goal form hidden; a string = the form is open with this prefill
  const [formTitle, setFormTitle] = useState<string | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['this-week'] })
    qc.invalidateQueries({ queryKey: ['goals'] })
  }

  const record = useMutation({
    mutationFn: (result: 'pass' | 'fail') => goalsApi.weeklyAttempt(item.goal.id, result, weekOf),
    onSuccess: async () => {
      invalidate()
      setFormTitle(null)
      // Only offer a suggestion for the current week; backfilling a past week shouldn't nag.
      if (weekOf !== mondays[0]) { setSuggestion(null); return }
      // Suggestion is advisory — a failure here never affects the recorded attempt.
      try {
        setSuggestion(await goalsApi.suggestNext(item.goal.id))
      } catch {
        setSuggestion(null)
      }
    },
  })

  const feedback = (action: 'used' | 'custom' | 'skipped', newGoalId?: string) => {
    if (!suggestion) return
    goalsApi.suggestionFeedback(item.goal.id, { direction: suggestion.direction, action, newGoalId }).catch(() => {})
  }

  const createGoal = useMutation({
    mutationFn: (data: { title: string; progressType: ProgressType; action: 'used' | 'custom' }) =>
      goalsApi.create({ title: data.title, parentId: item.goal.parentId, progressType: data.progressType }),
    onSuccess: (created, data) => {
      feedback(data.action, created.id)
      invalidate()
      setSuggestion(null)
      setFormTitle(null)
    },
  })

  const skip = () => { feedback('skipped'); setSuggestion(null) }

  // Oldest → newest so the row reads left-to-right in time order
  const dots = [...item.attempts].reverse()

  const hasAi = suggestion?.title != null
  const shortReason = suggestion
    ? t(`suggest.reason.${suggestion.reasonCode}`).replace('{n}', String(suggestion.consecutiveFails))
    : ''

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className="text-sm font-medium flex items-center gap-2">
          {item.goal.title}
          {item.weeklyStreak > 0 && (
            <span className="text-xs text-accent-deep font-semibold tabular-nums" title={t('week.streakTitle')}>
              🔥 {item.weeklyStreak}
            </span>
          )}
        </span>
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
          <select
            value={weekOf}
            onChange={e => setWeekOf(e.target.value)}
            title={t('week.recordFor')}
            className="h-8 rounded-md border border-input bg-background text-xs px-1.5 text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {mondays.map((m, i) => (
              <option key={m} value={m}>{i === 0 ? t('week.thisWeek') : m}</option>
            ))}
          </select>
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

      {suggestion && (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{t('suggest.title')}</p>
            {hasAi && (
              <span className="text-[10px] uppercase tracking-wide rounded bg-primary/15 text-primary px-1.5 py-0.5">
                {t('suggest.aiBadge')}
              </span>
            )}
          </div>

          {hasAi ? (
            <>
              <p className="text-sm font-medium">
                {DIRECTION_ICONS[suggestion.direction]} {suggestion.title}
              </p>
              <p className="text-xs text-muted-foreground">{suggestion.reason}</p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium">
                {DIRECTION_ICONS[suggestion.direction]} {t(`suggest.action.${suggestion.direction}`)}
              </p>
              <p className="text-xs text-muted-foreground">{shortReason}</p>
            </>
          )}

          {formTitle === null ? (
            <div className="flex gap-2 flex-wrap">
              {hasAi ? (
                <>
                  <Button
                    size="sm"
                    onClick={() => createGoal.mutate({
                      title: suggestion.title!,
                      progressType: suggestion.progressType ?? 'weekly',
                      action: 'used',
                    })}
                    disabled={createGoal.isPending}
                  >
                    {t('suggest.use')}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setFormTitle(suggestion.title!)}>
                    {t('suggest.custom')}
                  </Button>
                </>
              ) : (
                // No AI content — only an empty-form option, never a one-click create.
                <Button size="sm" variant="outline" onClick={() => setFormTitle('')}>
                  {t('suggest.setNew')}
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={skip}>
                {t('suggest.skip')}
              </Button>
            </div>
          ) : (
            <form
              className="flex gap-2 flex-wrap"
              onSubmit={e => {
                e.preventDefault()
                if (formTitle.trim()) createGoal.mutate({ title: formTitle.trim(), progressType: 'weekly', action: 'custom' })
              }}
            >
              <Input
                autoFocus
                value={formTitle}
                onChange={e => setFormTitle(e.target.value)}
                placeholder={t('suggest.newGoalTitle')}
                className="h-8 text-sm flex-1 min-w-40"
              />
              <Button size="sm" type="submit" disabled={!formTitle.trim() || createGoal.isPending}>
                {t('suggest.create')}
              </Button>
              <Button size="sm" variant="ghost" type="button" onClick={() => setFormTitle(null)}>
                {t('common.cancel')}
              </Button>
            </form>
          )}
        </div>
      )}
    </div>
  )
}
