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

  if (isLoading) return <p className="text-muted-foreground">กำลังโหลด…</p>
  if (error) return <p className="text-destructive">โหลดไม่สำเร็จ: {(error as Error).message}</p>

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold text-foreground">สัปดาห์นี้</h1>

      {(goals ?? []).length === 0 && (
        <p className="text-muted-foreground text-sm">ไม่มีเป้ารายสัปดาห์ที่ active (progressType = weekly)</p>
      )}

      <ul className="space-y-3">
        {(goals ?? []).map(goal => (
          <li key={goal.id} className="bg-card rounded-xl border border-border shadow-sm p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-foreground">{goal.title}</span>
              <div className="flex gap-2">
                <button
                  onClick={() => record.mutate({ id: goal.id, result: 'pass' })}
                  disabled={record.isPending}
                  className="px-3 py-1 rounded-lg bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 disabled:opacity-50"
                >
                  ✓ ผ่าน
                </button>
                <button
                  onClick={() => record.mutate({ id: goal.id, result: 'fail' })}
                  disabled={record.isPending}
                  className="px-3 py-1 rounded-lg bg-destructive/10 text-destructive text-xs font-medium hover:bg-destructive/20 disabled:opacity-50"
                >
                  ✗ ไม่ผ่าน
                </button>
              </div>
            </div>
            <ProgressBar value={goal.progress} />
            <p className="text-xs text-muted-foreground">อัตราผ่าน 4 สัปดาห์ล่าสุด</p>
          </li>
        ))}
      </ul>
    </div>
  )
}
