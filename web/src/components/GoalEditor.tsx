import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { goalsApi, type Goal, type ProgressType } from '../lib/api'

export function GoalEditor({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
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
          ทำเสร็จแล้ว (เป้าย่อยของ checklist นับจากสถานะ done)
        </label>
      )
    default:
      // rollup/daily/weekly: progress computed elsewhere; allow marking done
      return goal.progressType !== 'rollup' ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input
            type="checkbox" checked={goal.status === 'done'}
            onChange={() => update.mutate({ status: goal.status === 'done' ? 'active' : 'done' })}
            className="accent-primary"
          />
          ปิดเป้านี้ (done)
        </label>
      ) : null
  }
}

function AddStageForm({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
  const [title, setTitle] = useState('')
  const update = useMutation({
    mutationFn: () => goalsApi.update(goal.id, { stages: [...(goal.stages ?? []), { title, done: false }] }),
    onSuccess: () => { setTitle(''); onChanged() },
  })
  return (
    <li>
      <form onSubmit={e => { e.preventDefault(); if (title.trim()) update.mutate() }} className="flex gap-1 mt-1">
        <input
          value={title} onChange={e => setTitle(e.target.value)} placeholder="เพิ่มขั้นตอน…"
          className="flex-1 px-2 py-1 rounded border border-border text-xs"
        />
        <button type="submit" className="text-xs text-primary px-2">เพิ่ม</button>
      </form>
    </li>
  )
}

export function AddChildForm({ parentId, onDone }: { parentId: string; onDone: () => void }) {
  const [title, setTitle] = useState('')
  const [progressType, setProgressType] = useState<ProgressType>('manual')
  const create = useMutation({
    mutationFn: () => goalsApi.create({ title, parentId, progressType }),
    onSuccess: onDone,
  })
  return (
    <form
      onSubmit={e => { e.preventDefault(); if (title.trim()) create.mutate() }}
      className="mt-3 flex gap-1"
    >
      <input
        value={title} onChange={e => setTitle(e.target.value)} placeholder="ชื่อเป้าย่อย…" autoFocus
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
      <button type="submit" className="text-xs text-primary px-2">เพิ่ม</button>
    </form>
  )
}
