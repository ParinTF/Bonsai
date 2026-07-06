import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { goalsApi, type ProgressType } from '../lib/api'
import { ProgressBar } from '../components/ProgressBar'
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
  const qc = useQueryClient()
  const { data: goals, isLoading, error } = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list })
  const [title, setTitle] = useState('')
  const [progressType, setProgressType] = useState<ProgressType>('rollup')

  const createGoal = useMutation({
    mutationFn: () => goalsApi.create({ title, progressType }),
    onSuccess: () => {
      setTitle('')
      qc.invalidateQueries({ queryKey: ['goals'] })
    },
  })

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>
  if (error) return <p className="text-destructive">Failed to load: {(error as Error).message}</p>

  const roots = (goals ?? []).filter(g => g.parentId === null && g.status !== 'archived')

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">My Goals</h1>

      <form
        onSubmit={e => { e.preventDefault(); if (title.trim()) createGoal.mutate() }}
        className="flex flex-col sm:flex-row gap-2"
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

      {roots.length === 0 && <p className="text-muted-foreground text-sm">No goals yet — add your first one above.</p>}

      <ul className="space-y-3">
        {roots.map(goal => (
          <li key={goal.id}>
            <Link
              to={`/goals/${goal.id}`}
              className="block bg-card rounded-xl border border-border p-4 shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
            >
              <div className="flex items-center justify-between mb-2 gap-2">
                <span className={`font-medium ${goal.status === 'done' ? 'text-muted-foreground line-through' : ''}`}>
                  {goal.title}
                </span>
                <span className="text-xs text-muted-foreground shrink-0">{progressTypeLabels[goal.progressType]}</span>
              </div>
              <ProgressBar value={goal.progress} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
