import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { ApiError, goalsApi, type Goal, type SubBreakdownPreview } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'

/** "✨ Sub-breakdown with AI" — only offered on nodes it's sensible to attach
 * children under (rollup/weekly); daily/numeric/stages/checklist/manual are
 * meant to be leaves, and forcing children onto them would silently flip
 * their progressType (see backend's rootTypeChange warning below). */
export function canSubBreakdown(goal: Goal): boolean {
  return goal.progressType === 'rollup' || goal.progressType === 'weekly'
}

export function SubBreakdownButton({ goal, onDone }: { goal: Goal; onDone: () => void }) {
  const { t } = useI18n()
  const [open, setOpen] = useState(false)
  if (!canSubBreakdown(goal)) return null
  return (
    <>
      <Button size="sm" variant="ghost" title={t('subBreakdown.button')} onClick={() => setOpen(true)} className="text-muted-foreground">
        <Sparkles size={14} />
      </Button>
      {open && <SubBreakdownDialog goal={goal} onClose={() => setOpen(false)} onDone={onDone} />}
    </>
  )
}

type Phase = 'form' | 'busy' | 'preview' | 'needsKey' | 'error'

function SubBreakdownDialog({ goal, onClose, onDone }: { goal: Goal; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [instruction, setInstruction] = useState('')
  const [phase, setPhase] = useState<Phase>('form')
  const [errorMsg, setErrorMsg] = useState('')
  const [preview, setPreview] = useState<SubBreakdownPreview | null>(null)

  const generate = useMutation({
    mutationFn: () => goalsApi.subBreakdown(goal.id, instruction.trim() || undefined),
    onSuccess: res => { setPreview(res); setPhase('preview') },
    onError: (e: unknown) => {
      if (e instanceof ApiError && e.code === 'llm_key_missing') setPhase('needsKey')
      else { setErrorMsg(e instanceof Error ? e.message : 'Sub-breakdown failed'); setPhase('error') }
    },
  })

  const confirm = useMutation({
    mutationFn: () => goalsApi.subBreakdownConfirm(goal.id, preview!.items),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] })
      onDone()
      onClose()
    },
    onError: (e: unknown) => {
      // Stay on the preview screen — the generated items are still good,
      // no need to make the user regenerate over a confirm-time failure.
      setErrorMsg(e instanceof Error ? e.message : 'Sub-breakdown failed')
    },
  })

  return (
    <Dialog open onOpenChange={v => { if (!v) onClose() }}>
      <DialogContent className="sm:max-w-md space-y-3">
        <DialogHeader>
          <DialogTitle>{t('subBreakdown.title').replace('{goal}', goal.title)}</DialogTitle>
          <DialogDescription>{t('subBreakdown.subtitle')}</DialogDescription>
        </DialogHeader>

        {(phase === 'form' || phase === 'busy' || phase === 'error') && (
          <>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder={t('subBreakdown.instruction')}
              rows={2}
              disabled={generate.isPending}
              className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            {phase === 'error' && <p className="text-sm text-destructive">{errorMsg}</p>}
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
              <Button
                size="sm" variant="accent"
                onClick={() => { setErrorMsg(''); setPhase('busy'); generate.mutate() }}
                disabled={generate.isPending}
              >
                <Sparkles size={14} /> {generate.isPending ? t('subBreakdown.generating') : t('subBreakdown.generate')}
              </Button>
            </DialogFooter>
          </>
        )}

        {phase === 'needsKey' && (
          <>
            <p className="text-sm">{t('subBreakdown.needsKey')}</p>
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
              <Button size="sm" variant="accent" onClick={() => navigate('/settings')}>{t('detail.openSettings')}</Button>
            </DialogFooter>
          </>
        )}

        {phase === 'preview' && preview && (
          <>
            {preview.rootTypeChange && (
              <div className="rounded-lg bg-accent/15 border border-accent px-3 py-2 text-xs">
                {t('subBreakdown.typeChangeWarning')
                  .replace('{title}', goal.title)
                  .replace('{from}', t(`type.${preview.rootTypeChange.from}`))
                  .replace('{to}', t(`type.${preview.rootTypeChange.to}`))}
              </div>
            )}
            {preview.preview.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('subBreakdown.empty')}</p>
            ) : (
              <ul className="space-y-1.5 max-h-64 overflow-y-auto">
                {preview.preview.map(g => (
                  <li key={g.id} className="rounded-lg border border-border bg-card px-3 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium truncate">{g.title}</span>
                      <span className="text-[10px] uppercase tracking-wide text-muted-foreground shrink-0">
                        {t(`type.${g.progressType}`)}
                      </span>
                    </div>
                    {g.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{g.description}</p>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {errorMsg && <p className="text-sm text-destructive">{errorMsg}</p>}
            <DialogFooter>
              <Button size="sm" variant="ghost" onClick={onClose}>{t('common.cancel')}</Button>
              <Button size="sm" variant="outline" onClick={() => { setErrorMsg(''); setPreview(null); setPhase('form') }} disabled={confirm.isPending}>
                {t('subBreakdown.regenerate')}
              </Button>
              <Button
                size="sm" variant="accent"
                onClick={() => { setErrorMsg(''); confirm.mutate() }}
                disabled={confirm.isPending || preview.preview.length === 0}
              >
                {confirm.isPending ? t('subBreakdown.confirming') : t('subBreakdown.confirm')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
