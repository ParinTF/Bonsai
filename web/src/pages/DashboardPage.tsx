import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore, PartyPopper } from 'lucide-react'
import { goalsApi, habitsApi, type ProgressType } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { GrowthRing } from '../components/GrowthRing'
import { AnimatedCheckbox } from '../components/AnimatedCheckbox'
import { WeekGoalCard } from '../components/WeekGoalCard'
import { CalendarHeatmap } from '../components/CalendarHeatmap'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const progressTypes: ProgressType[] = ['rollup', 'stages', 'numeric', 'checklist', 'manual', 'daily', 'weekly']

export function DashboardPage() {
  const { t } = useI18n()
  return (
    <div className="space-y-8">
      <TodaySection />
      <ThisWeekSection />
      <YourGoalsSection />
      <section>
        <h2 className="text-lg font-bold mb-3">{t('dash.consistency')}</h2>
        <CalendarHeatmap />
      </section>
      <ArchivedSection />
    </div>
  )
}

// ---- 1. Today (hero section — the daily check-in ritual) ----

function TodaySection() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['today'], queryFn: habitsApi.today })

  const checkin = useMutation({
    mutationFn: (goalId: string) => habitsApi.checkin(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['goals'] })
      qc.invalidateQueries({ queryKey: ['checkins-month'] })
    },
  })

  const habits = data?.habits ?? []
  const allDone = habits.length > 0 && habits.every(h => h.checkedToday)

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h1 className="text-2xl font-bold">{t('dash.today')}</h1>
        <span className="text-sm text-muted-foreground">{data?.date}</span>
      </div>

      {allDone && (
        <div className="mb-3 flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-3 text-sm font-medium">
          <PartyPopper size={18} /> {t('dash.allDone')}
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && habits.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('dash.noHabits')}</p>
      )}

      <ul className="space-y-2">
        {habits.map(({ goal, checkedToday, streak }) => (
          <li key={goal.id} className="bg-card rounded-xl border border-border shadow-sm px-4 py-3.5 flex items-center gap-3">
            <AnimatedCheckbox
              checked={checkedToday}
              onToggle={() => checkin.mutate(goal.id)}
              label={goal.title}
            />
            <span className={`flex-1 ${checkedToday ? 'text-muted-foreground line-through' : ''}`}>
              {goal.title}
            </span>
            <span className="text-sm text-accent-deep font-semibold tabular-nums" title={t('dash.streak')}>
              🔥 {streak}
            </span>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---- 2. This Week ----

function ThisWeekSection() {
  const { t } = useI18n()
  const { data: items, isLoading } = useQuery({ queryKey: ['this-week'], queryFn: goalsApi.thisWeek })

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">{t('dash.thisWeek')}</h2>
      {isLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && (items ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">{t('dash.noWeekly')}</p>
      )}
      <div className="space-y-3">
        {(items ?? []).map(item => <WeekGoalCard key={item.goal.id} item={item} />)}
      </div>
    </section>
  )
}

// ---- 3. Your Goals ----

function YourGoalsSection() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data: goals, isLoading } = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list })
  const [title, setTitle] = useState('')
  const [progressType, setProgressType] = useState<ProgressType>('rollup')

  const createGoal = useMutation({
    mutationFn: () => goalsApi.create({ title, progressType }),
    onSuccess: () => {
      setTitle('')
      qc.invalidateQueries({ queryKey: ['goals'] })
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['this-week'] })
    },
  })

  const roots = (goals ?? [])
    .filter(g => g.parentId === null && g.status !== 'archived')
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">{t('dash.yourGoals')}</h2>

      <form
        onSubmit={e => { e.preventDefault(); if (title.trim()) createGoal.mutate() }}
        className="flex flex-col sm:flex-row gap-2 mb-4"
      >
        <Input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder={t('dash.addGoal')}
          className="flex-1 bg-card"
        />
        <div className="flex gap-2">
          <Select value={progressType} onValueChange={v => setProgressType(v as ProgressType)}>
            <SelectTrigger className="flex-1 sm:w-44 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {progressTypes.map(v => (
                <SelectItem key={v} value={v}>{t(`type.${v}`)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={createGoal.isPending || !title.trim()}>
            {t('common.add')}
          </Button>
        </div>
      </form>

      {isLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && roots.length === 0 && (
        <p className="text-muted-foreground text-sm">{t('dash.noGoals')}</p>
      )}

      <ul className="space-y-3">
        {roots.map(goal => (
          <li key={goal.id}>
            <Link
              to={`/goals/${goal.id}`}
              className="block bg-background rounded-xl border-2 border-earth p-4 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ease-out"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <span className={`font-heading text-lg font-semibold block truncate ${goal.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>
                    {goal.title}
                  </span>
                  <span className="text-xs text-muted-foreground">{t(`type.${goal.progressType}`)}</span>
                </div>
                <GrowthRing value={goal.progress} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

// ---- 4. Archived goals (soft-deleted; restorable) ----

function ArchivedSection() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data: goals } = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list })

  const restore = useMutation({
    mutationFn: (id: string) => goalsApi.update(id, { status: 'active' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] })
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['this-week'] })
    },
  })

  const archived = (goals ?? []).filter(g => g.status === 'archived')
  if (archived.length === 0) return null

  return (
    <section>
      <h2 className="text-lg font-bold mb-3 text-muted-foreground">{t('dash.archived')}</h2>
      <ul className="space-y-2">
        {archived.map(goal => (
          <li key={goal.id} className="bg-muted/60 rounded-xl border border-border px-4 py-3 flex items-center gap-3">
            <span className="flex-1 text-sm text-muted-foreground truncate">{goal.title}</span>
            <Button
              size="sm" variant="outline"
              onClick={() => restore.mutate(goal.id)}
              disabled={restore.isPending}
            >
              <ArchiveRestore size={14} /> {t('dash.restore')}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  )
}
