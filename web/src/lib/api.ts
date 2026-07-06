const API = 'http://localhost:5264'

let token: string | null = localStorage.getItem('bonsai_token')

export function setToken(t: string | null) {
  token = t
  if (t) localStorage.setItem('bonsai_token', t)
  else localStorage.removeItem('bonsai_token')
}

export function getToken() {
  return token
}

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  })
  if (res.status === 401) {
    setToken(null)
    window.location.href = '/login'
    throw new ApiError(401, 'Unauthorized')
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`)
  }
  if (res.status === 204) return undefined as T
  return res.json()
}

// ---- Types ----

export type ProgressType = 'stages' | 'numeric' | 'checklist' | 'manual' | 'rollup' | 'daily' | 'weekly'
export type GoalStatus = 'active' | 'done' | 'archived'

export interface Stage {
  title: string
  done: boolean
}

export interface NumericProgress {
  target: number
  current: number
  unit: string
}

export interface Goal {
  id: string
  userId: string
  parentId: string | null
  ancestors: string[]
  title: string
  status: GoalStatus
  progressType: ProgressType
  stages: Stage[] | null
  numeric: NumericProgress | null
  progress: number
  order: number
  positionX: number | null
  positionY: number | null
  updatedAt: string
}

export interface HabitToday {
  goal: Goal
  checkedToday: boolean
  streak: number
}

export interface TodayResponse {
  date: string
  habits: HabitToday[]
}

export interface WeeklyAttemptSummary {
  weekOf: string
  result: 'pass' | 'fail'
}

export interface WeekItem {
  goal: Goal
  attempts: WeeklyAttemptSummary[]
}

// ---- Endpoints ----

export const authApi = {
  register: (email: string, password: string) =>
    api<{ token: string; email: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    api<{ token: string; email: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
}

export const goalsApi = {
  list: () => api<Goal[]>('/goals'),
  thisWeek: () => api<WeekItem[]>('/goals/this-week'),
  create: (data: { title: string; parentId?: string | null; progressType: ProgressType; stages?: Stage[]; numeric?: NumericProgress }) =>
    api<Goal>('/goals', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Pick<Goal, 'title' | 'status' | 'progressType' | 'stages' | 'numeric' | 'progress' | 'order'>>) =>
    api<Goal>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => api<void>(`/goals/${id}`, { method: 'DELETE' }),
  position: (id: string, x: number, y: number) =>
    api<{ id: string; x: number; y: number }>(`/goals/${id}/position`, { method: 'PATCH', body: JSON.stringify({ x, y }) }),
  weeklyAttempt: (id: string, result: 'pass' | 'fail') =>
    api<{ goalId: string; weekOf: string; result: string }>(`/goals/${id}/weekly-attempt`, { method: 'POST', body: JSON.stringify({ result }) }),
  breakdown: (title: string, context?: string, parentId?: string) =>
    api<Goal[]>('/goals/breakdown', { method: 'POST', body: JSON.stringify({ title, context, parentId }) }),
}

export const habitsApi = {
  today: () => api<TodayResponse>('/today'),
  checkin: (id: string, date?: string) =>
    api<{ goalId: string; date: string; done: boolean }>(`/habits/${id}/checkin${date ? `?date=${date}` : ''}`, { method: 'PATCH' }),
}
