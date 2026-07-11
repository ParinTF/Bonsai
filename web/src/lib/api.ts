const API = import.meta.env.VITE_API_URL ?? 'http://localhost:5264'

/** The user's local calendar date (yyyy-MM-dd) — sent to the server so
 * "today" follows the user's timezone, not UTC. */
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Monday of the user's local week (yyyy-MM-dd). */
export function localMonday(): string {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return localDate(d)
}

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
  code: string | null
  constructor(status: number, message: string, code: string | null = null) {
    super(message)
    this.status = status
    this.code = code
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
    throw new ApiError(res.status, body?.error ?? `Request failed (${res.status})`, body?.code ?? null)
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
  /** Optional "how to do this" note. Null for goals created before this field existed. */
  description: string | null
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
  weeklyStreak: number
  attempts: WeeklyAttemptSummary[]
}

export interface GoalHistory {
  goalId: string
  points: { date: string; progress: number }[]
}

export interface WeeklyReview {
  weekOf: string
  weekly: { goal: Goal; recorded: boolean; result: 'pass' | 'fail' | null; streak: number }[]
  daily: { goal: Goal; daysDone: number; streak: number }[]
  weeklyRecorded: number
  weeklyTotal: number
}

export type SuggestDirection = 'harder' | 'same' | 'retry' | 'easier'
export type SuggestReasonCode = 'strong_pass' | 'strained_pass' | 'first_fail' | 'repeated_fail'

export interface NextSuggestion {
  goalId: string
  parentId: string | null
  weekOf: string
  latestResult: 'pass' | 'fail'
  direction: SuggestDirection
  reasonCode: SuggestReasonCode
  checkinRate: number | null
  consecutiveFails: number
  source: 'rule' | 'llm'
  // Present only when source === 'llm':
  title: string | null
  progressType: ProgressType | null
  reason: string | null
  description: string | null
}

// ---- Endpoints ----

export const authApi = {
  register: (email: string, password: string) =>
    api<{ token: string; email: string }>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) }),
  login: (email: string, password: string) =>
    api<{ token: string; email: string }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  google: (idToken: string) =>
    api<{ token: string; email: string }>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),
  demo: () =>
    api<{ token: string; email: string }>('/auth/demo', { method: 'POST' }),
}

/** True when the stored JWT carries the demo claim. */
export function isDemoToken(): boolean {
  const t = getToken()
  if (!t) return false
  try {
    const payload = JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
    return payload.isDemo === 'true'
  } catch {
    return false
  }
}

export const goalsApi = {
  list: () => api<Goal[]>('/goals'),
  thisWeek: () => api<WeekItem[]>('/goals/this-week'),
  create: (data: { title: string; parentId?: string | null; progressType: ProgressType; stages?: Stage[]; numeric?: NumericProgress; description?: string }) =>
    api<Goal>('/goals', { method: 'POST', body: JSON.stringify(data) }),
  update: (id: string, data: Partial<Pick<Goal, 'title' | 'description' | 'status' | 'progressType' | 'stages' | 'numeric' | 'progress' | 'order'>>) =>
    api<Goal>(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  remove: (id: string) => api<void>(`/goals/${id}`, { method: 'DELETE' }),
  position: (id: string, x: number, y: number) =>
    api<{ id: string; x: number; y: number }>(`/goals/${id}/position`, { method: 'PATCH', body: JSON.stringify({ x, y }) }),
  weeklyAttempt: (id: string, result: 'pass' | 'fail', weekOf?: string) =>
    api<{ goalId: string; weekOf: string; result: string }>(`/goals/${id}/weekly-attempt`, { method: 'POST', body: JSON.stringify({ result, weekOf: weekOf ?? localMonday() }) }),
  suggestNext: (id: string) =>
    api<NextSuggestion>(`/goals/${id}/suggest-next`, { method: 'POST' }),
  suggestionFeedback: (id: string, data: { direction: SuggestDirection; action: 'used' | 'custom' | 'skipped'; newGoalId?: string }) =>
    api<void>(`/goals/${id}/suggestion-feedback`, { method: 'POST', body: JSON.stringify(data) }),
  history: (id: string, days = 30) =>
    api<GoalHistory>(`/goals/${id}/history?days=${days}`),
  breakdown: (title: string, context?: string, parentId?: string) =>
    api<Goal[]>('/goals/breakdown', { method: 'POST', body: JSON.stringify({ title, context, parentId }) }),
}

export interface MonthCheckins {
  month: string
  habitCount: number
  days: { date: string; doneCount: number }[]
}

export type LlmProvider = 'anthropic' | 'openai' | 'gemini'

export interface LlmSettings {
  provider: LlmProvider | null
  keyLast4: string | null
}

export const accountApi = {
  changePassword: (currentPassword: string | null, newPassword: string) =>
    api<{ ok: boolean }>('/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) }),
  deleteAccount: () => api<void>('/account', { method: 'DELETE' }),
  export: () => api<Record<string, unknown>>('/account/export'),
}

export const reviewApi = {
  weekly: () => api<WeeklyReview>(`/me/weekly-review?monday=${localMonday()}&today=${localDate()}`),
}

export const settingsApi = {
  getLlm: () => api<LlmSettings>('/settings/llm'),
  // The key goes straight to the backend and is never kept client-side.
  putLlm: (provider: LlmProvider, apiKey: string) =>
    api<{ provider: LlmProvider; keyLast4: string }>('/settings/llm', { method: 'PUT', body: JSON.stringify({ provider, apiKey }) }),
  deleteLlm: () => api<void>('/settings/llm', { method: 'DELETE' }),
}

export const habitsApi = {
  today: () => api<TodayResponse>(`/today?date=${localDate()}`),
  month: (month?: string) => api<MonthCheckins>(`/checkins?month=${month ?? localDate().slice(0, 7)}`),
  checkin: (id: string, date?: string) =>
    api<{ goalId: string; date: string; done: boolean }>(`/habits/${id}/checkin?date=${date ?? localDate()}`, { method: 'PATCH' }),
}
