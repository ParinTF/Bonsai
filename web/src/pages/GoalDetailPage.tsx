import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { goalsApi } from '../lib/api'
import { ProgressBar } from '../components/ProgressBar'
import { GoalGraphView } from '../components/GoalGraphView'
import { AddChildForm, GoalEditor } from '../components/GoalEditor'

export function GoalDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: goals, isLoading } = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list })
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [addingChild, setAddingChild] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const invalidate = () => qc.invalidateQueries({ queryKey: ['goals'] })

  const removeGoal = useMutation({
    mutationFn: (goalId: string) => goalsApi.remove(goalId),
    onSuccess: (_, goalId) => {
      invalidate()
      if (goalId === id) navigate('/')
      else setSelectedId(null)
    },
  })

  if (isLoading) return <p className="text-gray-400">กำลังโหลด…</p>

  const goal = goals?.find(g => g.id === id)
  if (!goal) return <p className="text-red-600">ไม่พบเป้าหมายนี้</p>

  // Subtree of this root goal only, non-archived
  const subtree = (goals ?? []).filter(
    g => g.status !== 'archived' && (g.id === goal.id || g.ancestors.includes(goal.id)),
  )
  const selected = subtree.find(g => g.id === selectedId) ?? null

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
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-sm text-gray-400 hover:text-gray-600">← กลับ</Link>
        <h1 className="text-xl font-semibold text-gray-800 flex-1">{goal.title}</h1>
        <button
          onClick={() => setAddingChild(v => !v)}
          className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700"
        >
          + เพิ่มเป้าย่อย
        </button>
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

      {addingChild && (
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <p className="text-sm font-medium text-gray-700 mb-2">
            เพิ่มเป้าย่อยใต้ "{selected?.title ?? goal.title}"
          </p>
          <AddChildForm
            parentId={selected?.id ?? goal.id}
            onDone={() => { setAddingChild(false); invalidate() }}
          />
        </div>
      )}

      <GoalGraphView goals={subtree} selectedId={selectedId} onSelect={setSelectedId} />

      {selected && (
        <div className="bg-white rounded-xl border border-emerald-200 p-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div>
              <span className="text-sm font-medium text-gray-800">{selected.title}</span>
              <span className="ml-2 text-xs text-gray-400">{selected.progressType}</span>
            </div>
            <div className="flex items-center gap-2">
              {selected.id !== goal.id && (
                <button
                  onClick={() => { if (confirm(`ลบ "${selected.title}" และเป้าย่อยทั้งหมด?`)) removeGoal.mutate(selected.id) }}
                  className="text-xs text-red-400 hover:bg-red-50 px-2 py-1 rounded"
                >
                  ลบ
                </button>
              )}
              <button onClick={() => setSelectedId(null)} className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1">
                ✕ ปิด
              </button>
            </div>
          </div>
          <ProgressBar value={selected.progress} />
          <GoalEditor goal={selected} onChanged={invalidate} />
        </div>
      )}

      <p className="text-xs text-gray-400">
        ลาก node เพื่อจัดตำแหน่ง (บันทึกอัตโนมัติ) · คลิก node เพื่อแก้ไข progress
      </p>
    </div>
  )
}
