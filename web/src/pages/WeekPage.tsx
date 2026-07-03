import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { goalsApi } from '../lib/api'
import { ProgressBar } from '../components/ProgressBar'

export function WeekPage() {
  const qc = useQueryClient()
  const { data: goals, isLoading, error } = useQuery({ queryKey: ['this-week'], queryFn: goalsApi.thisWeek })

  const record = useMutation({
    mutationFn: ({ id, result }: { id: string; result: 'pass' | 'fail' }) => goalsApi.weeklyAttempt(id, result),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['this-week'] })
      qc.invalidateQueries({ queryKey: ['goals'] })
    },
  })

  if (isLoading) return <p className="text-gray-400">กำลังโหลด…</p>
  if (error) return <p className="text-red-600">โหลดไม่สำเร็จ: {(error as Error).message}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-gray-800">สัปดาห์นี้</h1>

      {(goals ?? []).length === 0 && (
        <p className="text-gray-400 text-sm">ไม่มีเป้ารายสัปดาห์ที่ active (progressType = weekly)</p>
      )}

      <ul className="space-y-3">
        {(goals ?? []).map(goal => (
          <li key={goal.id} className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-800">{goal.title}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => record.mutate({ id: goal.id, result: 'pass' })}
                  disabled={record.isPending}
                  className="px-3 py-1 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium hover:bg-emerald-200 disabled:opacity-50"
                >
                  ✓ ผ่าน
                </button>
                <button
                  onClick={() => record.mutate({ id: goal.id, result: 'fail' })}
                  disabled={record.isPending}
                  className="px-3 py-1 rounded-lg bg-red-100 text-red-600 text-xs font-medium hover:bg-red-200 disabled:opacity-50"
                >
                  ✗ ไม่ผ่าน
                </button>
              </div>
            </div>
            <ProgressBar value={goal.progress} />
            <p className="text-xs text-gray-400">อัตราผ่าน 4 สัปดาห์ล่าสุด</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
