import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArchiveRestore, PartyPopper } from 'lucide-react'
import { goalsApi, habitsApi, type Goal, type ProgressType } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { GrowthRing } from '../components/GrowthRing'
import { AnimatedCheckbox } from '../components/AnimatedCheckbox'
import { WeekGoalCard } from '../components/WeekGoalCard'
import { CalendarHeatmap } from '../components/CalendarHeatmap'
import { GoalEditor } from '../components/GoalEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const progressTypes: ProgressType[] = ['rollup', 'stages', 'numeric', 'checklist', 'manual', 'daily', 'weekly']

/** Type-specific one-line summary of what's inside a goal, so the card says
 * "4 / 12 books" or "2/5 steps" without opening the goal. Null when there's
 * nothing meaningful to show. */
function goalCardMeta(goal: Goal, all: Goal[], t: ReturnType<typeof useI18n>['t']): string | null {
  switch (goal.progressType) {
    case 'numeric':
      return goal.numeric ? `${goal.numeric.current} / ${goal.numeric.target} ${goal.numeric.unit}`.trim() : null
    case 'stages': {
      const s = goal.stages ?? []
      if (s.length === 0) return null
      return t('dash.meta.steps')
        .replace('{done}', String(s.filter(x => x.done).length))
        .replace('{total}', String(s.length))
    }
    case 'checklist': {
      const kids = all.filter(g => g.parentId === goal.id && g.status !== 'archived')
      if (kids.length === 0) return null
      return t('dash.meta.items')
        .replace('{done}', String(kids.filter(k => k.status === 'done').length))
        .replace('{total}', String(kids.length))
    }
    case 'rollup': {
      const kids = all.filter(g => g.parentId === goal.id && g.status !== 'archived')
      return kids.length > 0 ? t('dash.meta.subgoals').replace('{n}', String(kids.length)) : null
    }
    case 'daily':
      // daily progress is exactly doneDays/7*100, so this recovers the day count
      return t('dash.meta.days7').replace('{n}', String(Math.round((goal.progress / 100) * 7)))
    default:
      return null
  }
}

export function DashboardPage() {
  const { t } = useI18n()
  return (
    <div className="space-y-8">
      <TodaySection />
      <ThisWeekSection />
      <TodoSection />
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
            <div className="flex-1 min-w-0">
              <span className={`block ${checkedToday ? 'text-muted-foreground line-through' : ''}`}>
                {goal.title}
              </span>
              {goal.description && (
                <span className="block text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">
                  {goal.description}
                </span>
              )}
            </div>
            <span className="text-sm text-accent-deep font-semibold tabular-nums self-start" title={t('dash.streak')}>
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

// ---- 2.5 To Do: actionable one-off work (stages/numeric/checklist/manual)
// pulled from EVERY tree, so it's workable right here without opening each
// goal's graph. Daily/weekly live in their own sections; rollup has nothing
// to act on. ----

function TodoSection() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data: goals } = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list })
  const [showAll, setShowAll] = useState(false)

  const all = goals ?? []
  const rootId = (g: Goal) => g.ancestors[0] ?? g.id
  const statusById = new Map(all.map(g => [g.id, g.status]))
  // Once a bigger goal above it has been marked a success, its own leftover
  // one-off work stops needing attention — it's still there if you drill in,
  // just not nagging you from the dashboard anymore.
  const hasDoneAncestor = (g: Goal) => g.ancestors.some(id => statusById.get(id) === 'done')
  const tasks = all
    .filter(g => g.status === 'active'
      && ['stages', 'numeric', 'checklist', 'manual'].includes(g.progressType)
      && g.progress < 100
      && !hasDoneAncestor(g))
    // group by tree, then keep the tree's own ordering — stable while editing
    .sort((a, b) => rootId(a).localeCompare(rootId(b)) || a.order - b.order)
  if (tasks.length === 0) return null

  const rootTitle = (g: Goal) =>
    g.ancestors.length > 0 ? all.find(x => x.id === g.ancestors[0])?.title ?? null : null

  const visible = showAll ? tasks : tasks.slice(0, 6)

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">{t('dash.todo')}</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map(goal => (
          <div key={goal.id} className="bg-card rounded-xl border border-border shadow-sm p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <Link to={`/goals/${rootId(goal)}`} className="text-sm font-medium hover:underline block truncate">
                  {goal.title}
                </Link>
                {rootTitle(goal) && (
                  <span className="text-xs text-muted-foreground block truncate">
                    {t('dash.todoIn').replace('{goal}', rootTitle(goal)!)}
                  </span>
                )}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums shrink-0">{Math.round(goal.progress)}%</span>
            </div>
            {goal.description && (
              <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{goal.description}</p>
            )}
            <GoalEditor goal={goal} onChanged={() => qc.invalidateQueries({ queryKey: ['goals'] })} />
          </div>
        ))}
      </div>
      {tasks.length > 6 && (
        <Button variant="ghost" size="sm" className="mt-2" onClick={() => setShowAll(v => !v)}>
          {showAll ? t('dash.todoLess') : t('dash.todoAll').replace('{n}', String(tasks.length))}
        </Button>
      )}
    </section>
  )
}

// ---- 3. Your Goals ----

function YourGoalsSection() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data: goals, isLoading } = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list })
  const [title, setTitle] = useState('')
  const [query, setQuery] = useState('')
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

  const q = query.trim().toLowerCase()
  const roots = (goals ?? [])
    .filter(g => g.parentId === null && g.status !== 'archived')
    .filter(g => q === '' || g.title.toLowerCase().includes(q))
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

      {(goals ?? []).filter(g => g.parentId === null && g.status !== 'archived').length > 3 && (
        <Input
          value={query} onChange={e => setQuery(e.target.value)}
          placeholder={t('dash.search')}
          className="mb-3 bg-card"
        />
      )}

      {isLoading && <p className="text-muted-foreground">{t('common.loading')}</p>}
      {!isLoading && roots.length === 0 && (
        <p className="text-muted-foreground text-sm">{q ? t('dash.noMatch') : t('dash.noGoals')}</p>
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
                  <span className="text-xs text-muted-foreground">
                    {t(`type.${goal.progressType}`)}
                    {(() => { const m = goalCardMeta(goal, goals ?? [], t); return m ? ` · ${m}` : '' })()}
                  </span>
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
