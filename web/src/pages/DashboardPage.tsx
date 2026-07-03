import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { goalsApi, type ProgressType } from '../lib/api'
import { ProgressBar } from '../components/ProgressBar'

const progressTypeLabels: Record<ProgressType, string> = {
  rollup: 'เฉลี่ยจากเป้าย่อย',
  stages: 'เป็นขั้นตอน',
  numeric: 'ตัวเลขสะสม',
  checklist: 'เช็คลิสต์',
  manual: 'กรอกเอง',
  daily: 'ทำทุกวัน',
  weekly: 'ทำรายสัปดาห์',
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

  if (isLoading) return <p className="text-gray-400">กำลังโหลด…</p>
  if (error) return <p className="text-red-600">โหลดไม่สำเร็จ: {(error as Error).message}</p>

  const roots = (goals ?? []).filter(g => g.parentId === null && g.status !== 'archived')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">เป้าหมายของฉัน</h1>

      <form
        onSubmit={e => { e.preventDefault(); if (title.trim()) createGoal.mutate() }}
        className="flex gap-2"
      >
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="เพิ่มเป้าหมายใหญ่…"
          className="flex-1 px-3 py-2 rounded-lg border border-gray-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
        />
        <select
          value={progressType} onChange={e => setProgressType(e.target.value as ProgressType)}
          className="px-2 py-2 rounded-lg border border-gray-300 text-sm bg-white"
        >
          {Object.entries(progressTypeLabels).map(([v, label]) => (
            <option key={v} value={v}>{label}</option>
          ))}
        </select>
        <button
          type="submit" disabled={createGoal.isPending || !title.trim()}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700 disabled:opacity-50"
        >
          เพิ่ม
        </button>
      </form>

      {roots.length === 0 && <p className="text-gray-400 text-sm">ยังไม่มีเป้าหมาย เริ่มเพิ่มเป้าแรกได้เลย</p>}

      <ul className="space-y-3">
        {roots.map(goal => (
          <li key={goal.id}>
            <Link
              to={`/goals/${goal.id}`}
              className="block bg-white rounded-xl border border-gray-200 p-4 hover:border-emerald-300 transition-colors"
            >
              <div className="flex items-center justify-between mb-2">
                <span className={`font-medium ${goal.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
                  {goal.title}
                </span>
                <span className="text-xs text-gray-400">{progressTypeLabels[goal.progressType]}</span>
              </div>
              <ProgressBar value={goal.progress} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
