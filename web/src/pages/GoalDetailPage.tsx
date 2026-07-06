import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Sparkles, Trash2, X } from 'lucide-react'
import { goalsApi } from '../lib/api'
import { ProgressBar } from '../components/ProgressBar'
import { GoalGraphView } from '../components/GoalGraphView'
import { AddChildForm, GoalEditor } from '../components/GoalEditor'
import { Button } from '@/components/ui/button'

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

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>

  const goal = goals?.find(g => g.id === id)
  if (!goal) return <p className="text-destructive">Goal not found</p>

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
      setAiError(e instanceof Error ? e.message : 'AI breakdown failed')
    } finally {
      setAiBusy(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Link to="/" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        <h1 className="text-xl font-bold flex-1 min-w-40 truncate">{goal.title}</h1>
        <div className="flex items-center gap-2 flex-wrap">
          <Button size="sm" onClick={() => setAddingChild(v => !v)}>
            <Plus size={15} /> Add subgoal
          </Button>
          <Button
            size="sm" variant="accent" onClick={breakdownWithAi} disabled={aiBusy}
          >
            <Sparkles size={15} /> {aiBusy ? 'Breaking down…' : 'Break down with AI'}
          </Button>
          <Button
            size="sm" variant="ghost"
            onClick={() => { if (confirm('Delete this goal and its whole subtree?')) removeGoal.mutate(goal.id) }}
            className="text-destructive hover:bg-destructive/10"
          >
            <Trash2 size={15} />
          </Button>
        </div>
      </div>

      {aiError && <p className="text-sm text-destructive">{aiError}</p>}

      {addingChild && (
        <div className="bg-card rounded-xl border border-primary/30 p-4 shadow-sm">
          <p className="text-sm font-medium mb-2">
            Add a subgoal under "{selected?.title ?? goal.title}"
          </p>
          <AddChildForm
            parentId={selected?.id ?? goal.id}
            onDone={() => { setAddingChild(false); invalidate() }}
          />
        </div>
      )}

      <GoalGraphView goals={subtree} selectedId={selectedId} onSelect={setSelectedId} />

      {selected && (
        <div className="bg-card rounded-xl border border-primary/30 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="min-w-0">
              <span className="text-sm font-medium">{selected.title}</span>
              <span className="ml-2 text-xs text-muted-foreground">{selected.progressType}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {selected.id !== goal.id && (
                <Button
                  size="sm" variant="ghost"
                  onClick={() => { if (confirm(`Delete "${selected.title}" and its subtree?`)) removeGoal.mutate(selected.id) }}
                  className="text-destructive hover:bg-destructive/10"
                >
                  <Trash2 size={14} />
                </Button>
              )}
              <Button size="sm" variant="ghost" onClick={() => setSelectedId(null)} className="text-muted-foreground">
                <X size={14} />
              </Button>
            </div>
          </div>
          <ProgressBar value={selected.progress} />
          <GoalEditor goal={selected} onChanged={invalidate} />
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Drag nodes to arrange (saved automatically) · Click a node to edit its progress
      </p>
    </div>
  )
}
