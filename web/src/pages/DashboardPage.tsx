import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { PartyPopper } from 'lucide-react'
import { goalsApi, habitsApi, type ProgressType } from '../lib/api'
import { GrowthRing } from '../components/GrowthRing'
import { AnimatedCheckbox } from '../components/AnimatedCheckbox'
import { WeekGoalCard } from '../components/WeekGoalCard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const progressTypeLabels: Record<ProgressType, string> = {
  rollup: 'Rolls up from children',
  stages: 'Stage checklist',
  numeric: 'Numeric target',
  checklist: 'Child checklist',
  manual: 'Manual %',
  daily: 'Daily habit',
  weekly: 'Weekly commitment',
}

export function DashboardPage() {
  return (
    <div className="space-y-8">
      <TodaySection />
      <ThisWeekSection />
      <YourGoalsSection />
    </div>
  )
}

// ---- 1. Today (hero section — the daily check-in ritual) ----

function TodaySection() {
  const qc = useQueryClient()
  const { data, isLoading } = useQuery({ queryKey: ['today'], queryFn: habitsApi.today })

  const checkin = useMutation({
    mutationFn: (goalId: string) => habitsApi.checkin(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['goals'] })
    },
  })

  const habits = data?.habits ?? []
  const allDone = habits.length > 0 && habits.every(h => h.checkedToday)

  return (
    <section>
      <div className="flex items-baseline justify-between mb-3">
        <h1 className="text-2xl font-bold">Today</h1>
        <span className="text-sm text-muted-foreground">{data?.date}</span>
      </div>

      {allDone && (
        <div className="mb-3 flex items-center gap-2 bg-primary text-primary-foreground rounded-xl px-4 py-3 text-sm font-medium">
          <PartyPopper size={18} /> All done for today! Your bonsai is thriving 🌱
        </div>
      )}

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {!isLoading && habits.length === 0 && (
        <p className="text-muted-foreground text-sm">
          No daily habits yet — add a goal with type "Daily habit" to build your routine.
        </p>
      )}

      <ul className="space-y-2">
        {habits.map(({ goal, checkedToday, streak }) => (
          <li key={goal.id} className="bg-card rounded-xl border border-border shadow-sm px-4 py-3.5 flex items-center gap-3">
            <AnimatedCheckbox
              checked={checkedToday}
              onToggle={() => checkin.mutate(goal.id)}
              label={`Check in ${goal.title}`}
            />
            <span className={`flex-1 ${checkedToday ? 'text-muted-foreground line-through' : ''}`}>
              {goal.title}
            </span>
            <span className="text-sm text-accent-deep font-semibold tabular-nums" title="Current streak">
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
  const { data: items, isLoading } = useQuery({ queryKey: ['this-week'], queryFn: goalsApi.thisWeek })

  return (
    <section>
      <h2 className="text-lg font-bold mb-3">This Week</h2>
      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {!isLoading && (items ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">No active weekly commitments.</p>
      )}
      <div className="space-y-3">
        {(items ?? []).map(item => <WeekGoalCard key={item.goal.id} item={item} />)}
      </div>
    </section>
  )
}

// ---- 3. Your Goals ----

function YourGoalsSection() {
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
      <h2 className="text-lg font-bold mb-3">Your Goals</h2>

      <form
        onSubmit={e => { e.preventDefault(); if (title.trim()) createGoal.mutate() }}
        className="flex flex-col sm:flex-row gap-2 mb-4"
      >
        <Input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Add a big goal…"
          className="flex-1 bg-card"
        />
        <div className="flex gap-2">
          <Select value={progressType} onValueChange={v => setProgressType(v as ProgressType)}>
            <SelectTrigger className="flex-1 sm:w-44 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(progressTypeLabels).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="submit" disabled={createGoal.isPending || !title.trim()}>
            Add
          </Button>
        </div>
      </form>

      {isLoading && <p className="text-muted-foreground">Loading…</p>}
      {!isLoading && roots.length === 0 && (
        <p className="text-muted-foreground text-sm">No goals yet — add your first one above.</p>
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
                  <span className="text-xs text-muted-foreground">{progressTypeLabels[goal.progressType]}</span>
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
