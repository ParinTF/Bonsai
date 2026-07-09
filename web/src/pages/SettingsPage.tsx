import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle, KeyRound, Trash2 } from 'lucide-react'
import { settingsApi, type LlmProvider } from '../lib/api'
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
    <div className="space-y-6 max-w-xl">
      <h1 className="text-2xl font-bold">Settings</h1>

      <section className="bg-card rounded-xl border border-border shadow-sm p-5 space-y-4">
        <div className="flex items-center gap-2">
          <KeyRound size={18} className="text-primary" />
          <h2 className="text-lg font-bold">AI provider (bring your own key)</h2>
        </div>
        <p className="text-sm text-muted-foreground">
          "Break down with AI" uses your own LLM API key. The key is validated,
          encrypted at rest, and never shown again — only its last 4 characters.
        </p>

        {isLoading ? (
          <p className="text-muted-foreground text-sm">Loading…</p>
        ) : llm?.provider ? (
          <div className="flex items-center gap-3 bg-primary/5 border border-primary/20 rounded-lg px-4 py-3">
            <CheckCircle size={18} className="text-primary shrink-0" />
            <div className="flex-1 text-sm">
              <span className="font-medium">{providerLabels[llm.provider]}</span>
              <span className="text-muted-foreground ml-2 tabular-nums">key ••••{llm.keyLast4}</span>
            </div>
            <Button
              size="sm" variant="ghost"
              onClick={() => { if (confirm('Remove your API key?')) remove.mutate() }}
              disabled={remove.isPending}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={14} /> Remove
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground bg-muted rounded-lg px-4 py-3">
            No key configured yet — AI breakdown is disabled until you add one.
          </p>
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
              placeholder="Paste your API key…"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              autoComplete="off"
              className="flex-1"
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <Button type="submit" disabled={save.isPending || !apiKey.trim()}>
            {save.isPending ? 'Testing key…' : 'Test & Save'}
          </Button>
        </form>
      </section>
    </div>
  )
}
