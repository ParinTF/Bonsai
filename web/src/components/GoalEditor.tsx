import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCircle } from 'lucide-react'
import { goalsApi, type Goal, type ProgressType } from '../lib/api'
import { useI18n } from '../lib/i18n'

export function GoalEditor({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
  const { t } = useI18n()
  const update = useMutation({
    mutationFn: (data: Parameters<typeof goalsApi.update>[1]) => goalsApi.update(goal.id, data),
    onSuccess: onChanged,
  })

  switch (goal.progressType) {
    case 'stages':
      return (
        <ul className="mt-3 space-y-1">
          {(goal.stages ?? []).map((s, i) => (
            <li key={i}>
              <label className="flex items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox" checked={s.done}
                  onChange={() => {
                    const stages = (goal.stages ?? []).map((x, j) => (j === i ? { ...x, done: !x.done } : x))
                    update.mutate({ stages })
                  }}
                  className="accent-primary"
                />
                <span className={s.done ? 'line-through text-muted-foreground' : ''}>{s.title}</span>
              </label>
            </li>
          ))}
          <AddStageForm goal={goal} onChanged={onChanged} />
        </ul>
      )
    case 'numeric': {
      const n = goal.numeric ?? { target: 0, current: 0, unit: '' }
      return (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="number" defaultValue={n.current} key={n.current}
            onBlur={e => {
              const current = Number(e.target.value)
              if (current !== n.current) update.mutate({ numeric: { ...n, current } })
            }}
            className="w-24 px-2 py-1 rounded border border-input bg-card"
          />
          <span className="text-muted-foreground">/ {n.target} {n.unit}</span>
        </div>
      )
    }
    case 'manual':
      return (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="range" min={0} max={100} defaultValue={goal.progress} key={goal.progress}
            onMouseUp={e => update.mutate({ progress: Number((e.target as HTMLInputElement).value) })}
            className="flex-1 accent-primary"
          />
        </div>
      )
    case 'checklist':
      return (
        <label className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox" checked={goal.status === 'done'}
            onChange={() => update.mutate({ status: goal.status === 'done' ? 'active' : 'done' })}
            className="accent-primary"
          />
          {t('editor.checklistDone')}
        </label>
      )
    case 'rollup':
      // A rollup's own % is normally the average of its children — this is the
      // one manual override: call the whole branch a success regardless of what
      // its sub-goals say, without touching them. update()/onSuccess just
      // refetches ['goals'], so the recomputed 100% (or, on undo, the real
      // average) comes back from the server, never guessed client-side.
      return goal.status === 'done' ? (
        <div className="mt-3 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/15 text-primary px-3 py-1 text-sm font-medium">
            <CheckCircle size={14} /> {t('editor.success')}
          </span>
          <button
            type="button"
            onClick={() => update.mutate({ status: 'active' })}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            {t('editor.undoSuccess')}
          </button>
        </div>
      ) : (
        <div className="mt-3 space-y-1">
          <button
            type="button"
            onClick={() => update.mutate({ status: 'done' })}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-3 py-1.5 text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <CheckCircle size={15} /> {t('editor.markSuccess')}
          </button>
          {goal.progress < 100 && (
            <p className="text-xs text-muted-foreground">{t('editor.successHint')}</p>
          )}
        </div>
      )
    default:
      // daily/weekly: progress computed elsewhere; allow marking done
      return (
        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox" checked={goal.status === 'done'}
            onChange={() => update.mutate({ status: goal.status === 'done' ? 'active' : 'done' })}
            className="accent-primary"
          />
          {t('editor.done')}
        </label>
      )
  }
}

function AddStageForm({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const update = useMutation({
    mutationFn: () => goalsApi.update(goal.id, { stages: [...(goal.stages ?? []), { title, done: false }] }),
    onSuccess: () => { setTitle(''); onChanged() },
  })
  return (
    <li>
      <form onSubmit={e => { e.preventDefault(); if (title.trim()) update.mutate() }} className="flex gap-1 mt-1">
        <input
          value={title} onChange={e => setTitle(e.target.value)} placeholder={t('editor.addStep')}
          className="flex-1 px-2 py-1 rounded border border-border text-xs"
        />
        <button type="submit" className="text-xs text-primary px-2">{t('common.add')}</button>
      </form>
    </li>
  )
}

export function AddChildForm({ parentId, onDone }: { parentId: string; onDone: () => void }) {
  const { t } = useI18n()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [progressType, setProgressType] = useState<ProgressType>('manual')
  const qc = useQueryClient()
  const create = useMutation({
    mutationFn: () => goalsApi.create({ title, parentId, progressType, description: description.trim() || undefined }),
    onSuccess: () => {
      // A new goal can be a daily habit or weekly commitment — refresh those views too
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['this-week'] })
      onDone()
    },
  })
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (title.trim()) create.mutate() }}
      className="mt-3 space-y-1.5"
    >
      <div className="flex gap-1">
        <input
          value={title} onChange={e => setTitle(e.target.value)} placeholder={t('editor.subgoalTitle')} autoFocus
          className="flex-1 px-2 py-1 rounded border border-input bg-card text-xs"
        />
        <select value={progressType} onChange={e => setProgressType(e.target.value as ProgressType)} className="text-xs border border-input bg-card rounded px-1">
          <option value="manual">manual</option>
          <option value="stages">stages</option>
          <option value="numeric">numeric</option>
          <option value="checklist">checklist</option>
          <option value="rollup">rollup</option>
          <option value="daily">daily</option>
          <option value="weekly">weekly</option>
        </select>
        <button type="submit" className="text-xs text-primary px-2">{t('common.add')}</button>
      </div>
      <textarea
        value={description} onChange={e => setDescription(e.target.value)}
        placeholder={t('editor.descOptional')} rows={2}
        className="w-full px-2 py-1 rounded border border-input bg-card text-xs resize-y"
      />
    </form>
  )
}
