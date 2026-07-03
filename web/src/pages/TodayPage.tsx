import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { habitsApi } from '../lib/api'

export function TodayPage() {
  const qc = useQueryClient()
  const { data, isLoading, error } = useQuery({ queryKey: ['today'], queryFn: habitsApi.today })

  const checkin = useMutation({
    mutationFn: (goalId: string) => habitsApi.checkin(goalId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['goals'] })
    },
  })

  if (isLoading) return <p className="text-gray-400">กำลังโหลด…</p>
  if (error) return <p className="text-red-600">โหลดไม่สำเร็จ: {(error as Error).message}</p>

  const habits = data?.habits ?? []

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-gray-800">วันนี้</h1>
        <p className="text-sm text-gray-400">{data?.date}</p>
      </div>

      {habits.length === 0 && (
        <p className="text-gray-400 text-sm">ยังไม่มี habit (สร้างเป้าที่ progressType = daily)</p>
      )}

      <ul className="space-y-2">
        {habits.map(({ goal, checkedToday, streak }) => (
          <li key={goal.id} className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-3">
            <input
              type="checkbox" checked={checkedToday}
              onChange={() => checkin.mutate(goal.id)}
              className="w-5 h-5 accent-emerald-600 cursor-pointer"
            />
            <span className={`flex-1 text-sm ${checkedToday ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
              {goal.title}
            </span>
            <span className="text-sm text-orange-500 font-medium" title="streak ปัจจุบัน">
              🔥 {streak}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
