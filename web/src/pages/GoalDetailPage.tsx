import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { goalsApi, type Goal, type ProgressType } from '../lib/api'
import { ProgressBar } from '../components/ProgressBar'

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: goals, isLoading } = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list })
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  const invalidate = () => qc.invalidateQueries({ queryKey: ['goals'] })

  const removeGoal = useMutation({
    mutationFn: (goalId: string) => goalsApi.remove(goalId),
    onSuccess: (_, goalId) => {
      invalidate()
      if (goalId === id) navigate('/')
    },
  })

  if (isLoading) return <p className="text-gray-400">กำลังโหลด…</p>

  const goal = goals?.find(g => g.id === id)
  if (!goal) return <p className="text-red-600">ไม่พบเป้าหมายนี้</p>

  const childrenOf = (parentId: string) =>
    (goals ?? []).filter(g => g.parentId === parentId && g.status !== 'archived').sort((a, b) => a.order - b.order)

  async function breakdownWithAi() {
    if (!goal) return
    setAiBusy(true)
    setAiError('')
    try {
      await goalsApi.breakdown(goal.title, undefined, goal.id)
      invalidate()
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'AI breakdown ล้มเหลว')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-xl font-semibold text-gray-800 flex-1">{goal.title}</h1>
        <button
          onClick={breakdownWithAi} disabled={aiBusy}
          className="px-3 py-1.5 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700 disabled:opacity-50"
        >
          {aiBusy ? 'กำลังแตกเป้า…' : '✨ แตกเป้าด้วย AI'}
        </button>
        <button
          onClick={() => { if (confirm('ลบเป้าหมายนี้และเป้าย่อยทั้งหมด?')) removeGoal.mutate(goal.id) }}
          className="px-3 py-1.5 rounded-lg text-sm text-red-500 hover:bg-red-50"
        >
          ลบ
        </button>
      </div>

      {aiError && <p className="text-sm text-red-600">{aiError}</p>}

      <GoalNode goal={goal} childrenOf={childrenOf} onChanged={invalidate} onDelete={gid => removeGoal.mutate(gid)} depth={0} />
    </div>
  )
}

function GoalNode({ goal, childrenOf, onChanged, onDelete, depth }: {
  goal: Goal
  childrenOf: (id: string) => Goal[]
  onChanged: () => void
  onDelete: (id: string) => void
  depth: number
}) {
  const children = childrenOf(goal.id)
  const [addingChild, setAddingChild] = useState(false)

  return (
    <div className={depth > 0 ? 'ml-5 border-l-2 border-gray-100 pl-4' : ''}>
      <div className="bg-white rounded-xl border border-gray-200 p-4 mb-3">
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className={`text-sm font-medium ${goal.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
            {goal.title}
          </span>
          <div className="flex items-center gap-1 text-xs">
            <span className="text-gray-400 mr-1">{goal.progressType}</span>
            <button onClick={() => setAddingChild(v => !v)} className="px-2 py-0.5 rounded text-emerald-600 hover:bg-emerald-50" title="เพิ่มเป้าย่อย">+ ย่อย</button>
            {depth > 0 && (
              <button onClick={() => { if (confirm(`ลบ "${goal.title}"?`)) onDelete(goal.id) }} className="px-2 py-0.5 rounded text-red-400 hover:bg-red-50">ลบ</button>
            )}
          </div>
        </div>
        <ProgressBar value={goal.progress} />
        <GoalEditor goal={goal} onChanged={onChanged} />
        {addingChild && <AddChildForm parentId={goal.id} onDone={() => { setAddingChild(false); onChanged() }} />}
      </div>
      {children.map(c => (
        <GoalNode key={c.id} goal={c} childrenOf={childrenOf} onChanged={onChanged} onDelete={onDelete} depth={depth + 1} />
      ))}
    </div>
  )
}

function GoalEditor({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
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
              <label className="flex items-center gap-2 text-sm text-gray-700">
                <input
                  type="checkbox" checked={s.done}
                  onChange={() => {
                    const stages = (goal.stages ?? []).map((x, j) => (j === i ? { ...x, done: !x.done } : x))
                    update.mutate({ stages })
                  }}
                  className="accent-emerald-600"
                />
                <span className={s.done ? 'line-through text-gray-400' : ''}>{s.title}</span>
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
            className="w-24 px-2 py-1 rounded border border-gray-300"
          />
          <span className="text-gray-500">/ {n.target} {n.unit}</span>
        </div>
      )
    }
    case 'manual':
      return (
        <div className="mt-3 flex items-center gap-2 text-sm">
          <input
            type="range" min={0} max={100} defaultValue={goal.progress} key={goal.progress}
            onMouseUp={e => update.mutate({ progress: Number((e.target as HTMLInputElement).value) })}
            className="flex-1 accent-emerald-600"
          />
        </div>
      )
    case 'checklist':
      return (
        <label className="mt-3 flex items-center gap-2 text-sm text-gray-600">
          <input
            type="checkbox" checked={goal.status === 'done'}
            onChange={() => update.mutate({ status: goal.status === 'done' ? 'active' : 'done' })}
            className="accent-emerald-600"
          />
          ทำเสร็จแล้ว (เป้าย่อยของ checklist นับจากสถานะ done)
        </label>
      )
    default:
      // rollup/daily/weekly: progress computed elsewhere; allow marking done
      return goal.progressType !== 'rollup' ? (
        <label className="mt-3 flex items-center gap-2 text-xs text-gray-500">
          <input
            type="checkbox" checked={goal.status === 'done'}
            onChange={() => update.mutate({ status: goal.status === 'done' ? 'active' : 'done' })}
            className="accent-emerald-600"
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
          className="flex-1 px-2 py-1 rounded border border-gray-200 text-xs"
        />
        <button type="submit" className="text-xs text-emerald-600 px-2">เพิ่ม</button>
      </form>
    </li>
  )
}

function AddChildForm({ parentId, onDone }: { parentId: string; onDone: () => void }) {
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
        className="flex-1 px-2 py-1 rounded border border-gray-300 text-xs"
      />
      <select value={progressType} onChange={e => setProgressType(e.target.value as ProgressType)} className="text-xs border border-gray-300 rounded px-1">
        <option value="manual">manual</option>
        <option value="stages">stages</option>
        <option value="numeric">numeric</option>
        <option value="checklist">checklist</option>
        <option value="rollup">rollup</option>
        <option value="daily">daily</option>
        <option value="weekly">weekly</option>
      </select>
      <button type="submit" className="text-xs text-emerald-600 px-2">เพิ่ม</button>
    </form>
  )
}
