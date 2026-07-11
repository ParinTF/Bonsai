import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, Download, KeyRound, Trash2, UserRound } from 'lucide-react'
import { accountApi, isDemoToken, setToken, settingsApi, type LlmProvider } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'

const providerLabels: Record<LlmProvider, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI (GPT)',
  gemini: 'Google (Gemini)',
}

export function SettingsPage() {
  const { t } = useI18n()
  return (
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold">{t('settings.title')}</h1>
      <LlmSection />
      <AccountSection />
    </div>
  )
}

function LlmSection() {
  const { t } = useI18n()
  const qc = useQueryClient()
  const { data: llm, isLoading } = useQuery({ queryKey: ['settings-llm'], queryFn: settingsApi.getLlm })

  const [provider, setProvider] = useState<LlmProvider>('anthropic')
  // The key lives only in this transient form state and is cleared after
  // saving — it is never written to localStorage or any long-lived store.
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')

  const save = useMutation({
    mutationFn: () => settingsApi.putLlm(provider, apiKey),
    onSuccess: () => {
      setApiKey('')
      setError('')
      qc.invalidateQueries({ queryKey: ['settings-llm'] })
    },
    onError: (e: Error) => setError(e.message),
  })

  const remove = useMutation({
    mutationFn: settingsApi.deleteLlm,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings-llm'] }),
    onError: (e: Error) => setError(e.message),
  })

  return (
    <section className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <KeyRound size={18} className="text-primary" />
        <h2 className="text-lg font-bold">{t('settings.aiTitle')}</h2>
      </div>
      <p className="text-sm text-muted-foreground">{t('settings.aiDesc')}</p>

      {isLoading ? (
        <p className="text-muted-foreground text-sm">{t('common.loading')}</p>
      ) : llm?.provider ? (
        <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
          <CheckCircle size={18} className="text-primary shrink-0" />
          <div className="flex-1 text-sm">
            <span className="font-medium">{providerLabels[llm.provider]}</span>
            <span className="text-muted-foreground ml-2 tabular-nums">key ••••{llm.keyLast4}</span>
          </div>
          <Button
            size="sm" variant="ghost"
            onClick={() => { if (confirm(t('settings.removeKeyConfirm'))) remove.mutate() }}
            disabled={remove.isPending}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={14} /> {t('common.remove')}
          </Button>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">{t('settings.noKey')}</p>
      )}

      <form
        onSubmit={e => { e.preventDefault(); if (apiKey.trim()) save.mutate() }}
        className="space-y-3"
      >
        <div className="flex flex-col sm:flex-row gap-2">
          <Select value={provider} onValueChange={v => setProvider(v as LlmProvider)}>
            <SelectTrigger className="sm:w-48 bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Object.entries(providerLabels).map(([v, label]) => (
                <SelectItem key={v} value={v}>{label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            type="password"
            placeholder={t('settings.keyPlaceholder')}
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            autoComplete="off"
            className="flex-1"
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={save.isPending || !apiKey.trim()}>
          {save.isPending ? t('settings.testing') : t('settings.testSave')}
        </Button>
      </form>
    </section>
  )
}

function AccountSection() {
  const { t } = useI18n()
  const navigate = useNavigate()
  const demo = isDemoToken()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')

  const change = useMutation({
    mutationFn: () => accountApi.changePassword(current || null, next),
    onSuccess: () => {
      setCurrent('')
      setNext('')
      setError('')
      setMsg(t('settings.passwordChanged'))
    },
    onError: (e: Error) => { setMsg(''); setError(e.message) },
  })

  const remove = useMutation({
    mutationFn: accountApi.deleteAccount,
    onSuccess: () => { setToken(null); navigate('/login') },
    onError: (e: Error) => setError(e.message),
  })

  const exportData = useMutation({
    mutationFn: accountApi.export,
    onSuccess: data => downloadJson(data, `bonsai-export-${new Date().toISOString().slice(0, 10)}.json`),
    onError: (e: Error) => setError(e.message),
  })

  if (demo) return null // shared demo account: no password/delete management

  return (
    <section className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
      <div className="flex items-center gap-2">
        <UserRound size={18} className="text-primary" />
        <h2 className="text-lg font-bold">{t('settings.accountTitle')}</h2>
      </div>

      <form
        onSubmit={e => { e.preventDefault(); if (next.length >= 8) change.mutate() }}
        className="space-y-2"
      >
        <Input
          type="password" placeholder={t('settings.currentPassword')}
          value={current} onChange={e => setCurrent(e.target.value)} autoComplete="current-password"
        />
        <Input
          type="password" placeholder={t('settings.newPassword')} minLength={8}
          value={next} onChange={e => setNext(e.target.value)} autoComplete="new-password"
        />
        {msg && <p className="text-sm text-primary">{msg}</p>}
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" disabled={change.isPending || next.length < 8}>
          {t('settings.changePassword')}
        </Button>
      </form>

      <div className="border-t border-border pt-4 space-y-2">
        <p className="text-sm text-muted-foreground">{t('settings.exportDesc')}</p>
        <Button variant="outline" onClick={() => exportData.mutate()} disabled={exportData.isPending}>
          <Download size={14} /> {exportData.isPending ? t('common.loading') : t('settings.exportData')}
        </Button>
      </div>

      <div className="border-t border-border pt-4">
        <Button
          variant="destructive"
          onClick={() => { if (confirm(t('settings.deleteConfirm'))) remove.mutate() }}
          disabled={remove.isPending}
        >
          <Trash2 size={14} /> {t('settings.deleteAccount')}
        </Button>
      </div>
    </section>
  )
}

/** Serialise `data` and trigger a client-side download. */
function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
