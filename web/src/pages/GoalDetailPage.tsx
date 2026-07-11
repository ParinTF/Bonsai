import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Archive, Check, Pencil, Plus, Sparkles, Trash2, Undo2, X } from 'lucide-react'
import { ApiError, goalsApi, type Goal, type ProgressType } from '../lib/api'
import { useI18n } from '../lib/i18n'
import { ProgressBar } from '../components/ProgressBar'
import { Sparkline } from '../components/Sparkline'
import { GoalGraphView } from '../components/GoalGraphView'
import { AddChildForm, GoalEditor } from '../components/GoalEditor'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function GoalDetailPage() {
  const { t } = useI18n()
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const { data: goals, isLoading } = useQuery({ queryKey: ['goals'], queryFn: goalsApi.list })
  const [aiOpen, setAiOpen] = useState(false)
  const [aiContext, setAiContext] = useState('')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')
  const [needsKey, setNeedsKey] = useState(false)
  const [addingChild, setAddingChild] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Set right after an archive so we can offer a transient Undo instead of a hard delete.
  const [archivedInfo, setArchivedInfo] = useState<{ id: string; title: string } | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['goals'] })
    qc.invalidateQueries({ queryKey: ['today'] })
    qc.invalidateQueries({ queryKey: ['this-week'] })
  }

  const restore = useMutation({
    mutationFn: (goalId: string) => goalsApi.update(goalId, { status: 'active' }),
    onSuccess: () => { setArchivedInfo(null); invalidate() },
  })

  // Auto-dismiss the Undo banner after a few seconds.
  useEffect(() => {
    if (!archivedInfo) return
    const timer = setTimeout(() => setArchivedInfo(null), 7000)
    return () => clearTimeout(timer)
  }, [archivedInfo])

  const removeGoal = useMutation({
    mutationFn: (goalId: string) => goalsApi.remove(goalId),
    onSuccess: (_, goalId) => {
      invalidate()
      if (goalId === id) navigate('/')
      else setSelectedId(null)
    },
  })

  if (isLoading) return <p className="text-muted-foreground">{t('common.loading')}</p>

  const goal = goals?.find(g => g.id === id)
  if (!goal) return <p className="text-destructive">{t('detail.notFound')}</p>

  // Subtree of this root goal only, non-archived
  const subtree = (goals ?? []).filter(
    g => g.status !== 'archived' && (g.id === goal.id || g.ancestors.includes(goal.id)),
  )
  const selected = subtree.find(g => g.id === selectedId) ?? null

  async function breakdownWithAi() {
    if (!goal) return
    setAiBusy(true)
    setAiError('')
    setNeedsKey(false)
    try {
      await goalsApi.breakdown(goal.title, aiContext.trim() || undefined, goal.id)
      setAiOpen(false)
      setAiContext('')
      invalidate()
    } catch (e) {
      if (e instanceof ApiError && e.code === 'llm_key_missing') setNeedsKey(true)
      else setAiError(e instanceof Error ? e.message : 'AI breakdown failed')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">{t('detail.back')}</Link>
        <h1 className="text-xl font-bold flex-1 min-w-40 truncate">{goal.title}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setAddingChild(v => !v)}>
            <Plus size={15} /> {t('detail.addSubgoal')}
          </Button>
          <Button size="sm" variant="accent" onClick={() => setAiOpen(v => !v)} disabled={aiBusy}>
            <Sparkles size={15} /> {aiBusy ? t('detail.aiBusy') : t('detail.ai')}
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => { if (confirm(t('detail.deleteConfirm'))) removeGoal.mutate(goal.id) }}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={15} />
          </Button>
        </div>
      </div>

      {archivedInfo && (
        <div className="bg-muted border border-border rounded-xl px-4 py-3 flex items-center gap-3">
          <Archive size={16} className="text-muted-foreground shrink-0" />
          <span className="text-sm flex-1 min-w-0 truncate">
            {t('detail.archivedToast')} "{archivedInfo.title}"
          </span>
          <Button
            size="sm" variant="outline"
            onClick={() => restore.mutate(archivedInfo.id)}
            disabled={restore.isPending}
          >
            <Undo2 size={14} /> {t('common.undo')}
          </Button>
        </div>
      )}

      {aiError && <p className="text-sm text-destructive">{aiError}</p>}

      {aiOpen && !needsKey && (
        <div className="bg-card rounded-xl border border-accent/60 p-4 space-y-2 shadow-sm">
          <textarea
            value={aiContext}
            onChange={e => setAiContext(e.target.value)}
            placeholder={t('detail.aiContext')}
            rows={2}
            className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={() => setAiOpen(false)}>{t('common.cancel')}</Button>
            <Button size="sm" variant="accent" onClick={breakdownWithAi} disabled={aiBusy}>
              <Sparkles size={14} /> {aiBusy ? t('detail.aiBusy') : t('detail.aiGo')}
            </Button>
          </div>
        </div>
      )}

      {needsKey && (
        <div className="bg-accent/15 border border-accent rounded-xl p-4 flex items-center gap-3 flex-wrap">
          <p className="text-sm flex-1 min-w-52">{t('detail.needsKey')}</p>
          <Button size="sm" variant="accent" onClick={() => navigate('/settings')}>
            {t('detail.openSettings')}
          </Button>
        </div>
      )}

      {addingChild && (
        <div className="bg-card rounded-xl border border-primary/30 p-4 shadow-sm">
          <p className="text-sm font-medium mb-2">
            {t('detail.addUnder')} "{selected?.title ?? goal.title}"
          </p>
          <AddChildForm
            parentId={selected?.id ?? goal.id}
            onDone={() => { setAddingChild(false); invalidate() }}
          />
        </div>
      )}

      <GoalGraphView goals={subtree} selectedId={selectedId} onSelect={setSelectedId} />

      {selected && (
        <SelectedPanel
          goal={selected}
          isRoot={selected.id === goal.id}
          onChanged={invalidate}
          onDelete={() => {
            if (confirm(`"${selected.title}" ${t('detail.deleteOneConfirm')}`)) removeGoal.mutate(selected.id)
          }}
          onArchived={g => {
            setSelectedId(null)
            setArchivedInfo({ id: g.id, title: g.title })
          }}
          onClose={() => setSelectedId(null)}
        />
      )}

      <p className="text-xs text-muted-foreground">{t('detail.hint')}</p>
    </div>
  )
}

function SelectedPanel({ goal, isRoot, onChanged, onDelete, onArchived, onClose }: {
  goal: Goal
  isRoot: boolean
  onChanged: () => void
  onDelete: () => void
  onArchived: (g: Goal) => void
  onClose: () => void
}) {
  const { t } = useI18n()
  const qc = useQueryClient()
  const [renaming, setRenaming] = useState(false)
  const [title, setTitle] = useState(goal.title)

  const { data: history } = useQuery({
    queryKey: ['history', goal.id],
    queryFn: () => goalsApi.history(goal.id),
  })

  const rename = useMutation({
    mutationFn: () => goalsApi.update(goal.id, { title: title.trim() }),
    onSuccess: () => { setRenaming(false); onChanged() },
  })

  const changeType = useMutation({
    mutationFn: (progressType: ProgressType) => goalsApi.update(goal.id, { progressType }),
    onSuccess: onChanged,
  })

  const archive = useMutation({
    mutationFn: () => goalsApi.update(goal.id, { status: 'archived' }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['goals'] })
      qc.invalidateQueries({ queryKey: ['today'] })
      qc.invalidateQueries({ queryKey: ['this-week'] })
      onArchived(goal)
    },
  })

  return (
    <div className="bg-card rounded-xl border border-primary/30 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          {renaming ? (
            <form
              onSubmit={e => { e.preventDefault(); if (title.trim()) rename.mutate() }}
              className="flex gap-1 items-center"
            >
              <Input value={title} onChange={e => setTitle(e.target.value)} autoFocus className="h-8 text-sm" />
              <Button size="sm" type="submit" disabled={rename.isPending || !title.trim()}>
                <Check size={14} />
              </Button>
            </form>
          ) : (
            <>
              <span className="text-sm font-medium">{goal.title}</span>
              <select
                value={goal.progressType}
                onChange={e => changeType.mutate(e.target.value as ProgressType)}
                disabled={changeType.isPending}
                title={t('detail.changeType')}
                className="ml-2 text-xs border border-input bg-card text-muted-foreground rounded px-1 py-0.5 cursor-pointer hover:text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              >
                {(['rollup', 'stages', 'numeric', 'checklist', 'manual', 'daily', 'weekly'] as ProgressType[]).map(v => (
                  <option key={v} value={v}>{t(`type.${v}`)}</option>
                ))}
              </select>
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm" variant="ghost" title={t('detail.rename')}
            onClick={() => { setTitle(goal.title); setRenaming(v => !v) }}
            className="text-muted-foreground"
          >
            <Pencil size={14} />
          </Button>
          <Button
            size="sm" variant="ghost" title={t('detail.archive')}
            onClick={() => { if (confirm(t('detail.archiveConfirm'))) archive.mutate() }}
            className="text-muted-foreground"
          >
            <Archive size={14} />
          </Button>
          {!isRoot && (
            <Button
              size="sm" variant="ghost" onClick={onDelete}
              className="text-destructive hover:bg-destructive/10"
            >
              <Trash2 size={14} />
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onClose} className="text-muted-foreground">
            <X size={14} />
          </Button>
        </div>
      </div>
      <ProgressBar value={goal.progress} />
      <DescriptionEditor goal={goal} onChanged={onChanged} />
      {history && history.points.length >= 2 && (
        <div className="mt-3">
          <p className="text-xs text-muted-foreground mb-1">{t('detail.trend')}</p>
          <Sparkline points={history.points} />
        </div>
      )}
      <GoalEditor goal={goal} onChanged={onChanged} />
    </div>
  )
}

/** Inline "how to do this" note: shows the description with an edit affordance,
 * or a "+ Add details" prompt when the goal has none. */
function DescriptionEditor({ goal, onChanged }: { goal: Goal; onChanged: () => void }) {
  const { t } = useI18n()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(goal.description ?? '')

  const save = useMutation({
    // Empty string clears the description server-side (see PATCH /goals/{id}).
    mutationFn: () => goalsApi.update(goal.id, { description: text.trim() }),
    onSuccess: () => { setEditing(false); onChanged() },
  })

  if (editing) {
    return (
      <form
        onSubmit={e => { e.preventDefault(); save.mutate() }}
        className="mt-3 space-y-1.5"
      >
        <textarea
          value={text} onChange={e => setText(e.target.value)} autoFocus rows={3}
          placeholder={t('editor.descOptional')}
          className="w-full px-2 py-1.5 rounded border border-input bg-background text-sm resize-y focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex gap-1">
          <Button size="sm" type="submit" disabled={save.isPending}>{t('editor.descSave')}</Button>
          <Button size="sm" variant="ghost" type="button" onClick={() => { setText(goal.description ?? ''); setEditing(false) }}>
            {t('common.cancel')}
          </Button>
        </div>
      </form>
    )
  }

  return goal.description ? (
    <button
      type="button" onClick={() => { setText(goal.description ?? ''); setEditing(true) }}
      title={t('detail.rename')}
      className="mt-3 block w-full text-left text-sm text-muted-foreground whitespace-pre-wrap hover:text-foreground transition-colors"
    >
      {goal.description}
    </button>
  ) : (
    <button
      type="button" onClick={() => setEditing(true)}
      className="mt-2 text-xs text-primary hover:underline"
    >
      {t('editor.descAdd')}
    </button>
  )
}
