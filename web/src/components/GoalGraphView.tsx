import { useCallback, useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  applyNodeChanges,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import dagre from '@dagrejs/dagre'
import {
  CalendarCheck,
  CheckCircle,
  CheckSquare,
  Flame,
  GitBranch,
  Hash,
  ListChecks,
  SlidersHorizontal,
} from 'lucide-react'
import { goalsApi, type Goal, type ProgressType } from '../lib/api'

const NODE_W = 200
const NODE_H = 76

// Per-progressType accent: card border + badge tint + icon
const typeStyle: Record<ProgressType, { border: string; badge: string; Icon: typeof Flame }> = {
  rollup: { border: 'border-slate-300', badge: 'bg-slate-100 text-slate-600', Icon: GitBranch },
  stages: { border: 'border-sky-300', badge: 'bg-sky-100 text-sky-700', Icon: ListChecks },
  numeric: { border: 'border-amber-300', badge: 'bg-amber-100 text-amber-700', Icon: Hash },
  checklist: { border: 'border-teal-300', badge: 'bg-teal-100 text-teal-700', Icon: CheckSquare },
  manual: { border: 'border-gray-300', badge: 'bg-gray-100 text-gray-600', Icon: SlidersHorizontal },
  daily: { border: 'border-orange-300', badge: 'bg-orange-100 text-orange-700', Icon: Flame },
  weekly: { border: 'border-violet-300', badge: 'bg-violet-100 text-violet-700', Icon: CalendarCheck },
}

// Selection highlight comes from React Flow's own `selected` prop, NOT from
// node data — so selecting/deselecting never rebuilds node positions.
type GoalNodeData = { goal: Goal }
type GoalFlowNode = Node<GoalNodeData, 'goal'>

function GoalNodeCard({ data, selected }: NodeProps<GoalFlowNode>) {
  const { goal } = data
  const { border, badge, Icon } = typeStyle[goal.progressType]
  const done = goal.status === 'done'
  return (
    <div
      className={`w-[200px] bg-white rounded-xl border-2 shadow-md px-3 pt-2.5 pb-2 cursor-pointer transition-colors ${
        selected ? 'border-emerald-500 ring-2 ring-emerald-200' : `${border} hover:border-emerald-400`
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-300" />
      <div className="flex items-center gap-1.5 mb-1.5">
        {done ? (
          <CheckCircle size={14} className="text-emerald-500 shrink-0" />
        ) : (
          <Icon size={14} className="text-gray-400 shrink-0" />
        )}
        <span className={`text-[13px] font-medium truncate flex-1 ${done ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {goal.title}
        </span>
        <span className={`text-[9px] px-1.5 py-0.5 rounded-full shrink-0 ${badge}`}>
          {goal.progressType}
        </span>
      </div>
      <div className="flex items-center gap-1.5">
        <div className="flex-1 h-1 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${goal.progress}%` }} />
        </div>
        <span className="text-[9px] text-gray-500 w-6 text-right">{Math.round(goal.progress)}%</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-300" />
    </div>
  )
}

const nodeTypes = { goal: GoalNodeCard }

/**
 * Dagre top-down layout — computed ONLY for goals whose position is null.
 * Goals with a saved position keep it and are excluded from the layout graph
 * (they still don't affect where unplaced nodes go, which keeps the
 * computation deterministic across refetches).
 */
function layoutUnplaced(goals: Goal[]): Map<string, { x: number; y: number }> {
  const unplaced = goals.filter(g => g.positionX == null || g.positionY == null)
  if (unplaced.length === 0) return new Map()

  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 36, ranksep: 64 })
  g.setDefaultEdgeLabel(() => ({}))
  // Layout over the whole tree so unplaced nodes land in sensible spots
  // relative to their siblings, but only unplaced nodes consume the result.
  const ids = new Set(goals.map(x => x.id))
  for (const goal of goals) g.setNode(goal.id, { width: NODE_W, height: NODE_H })
  for (const goal of goals) {
    if (goal.parentId && ids.has(goal.parentId)) g.setEdge(goal.parentId, goal.id)
  }
  dagre.layout(g)

  const out = new Map<string, { x: number; y: number }>()
  for (const goal of unplaced) {
    const n = g.node(goal.id)
    out.set(goal.id, { x: n.x - NODE_W / 2, y: n.y - NODE_H / 2 })
  }
  return out
}

export function GoalGraphView({ goals, selectedId, onSelect }: {
  goals: Goal[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const qc = useQueryClient()

  // Recomputed only when the goals data itself changes (query refetch),
  // never on selection changes or unrelated re-renders.
  const layout = useMemo(() => layoutUnplaced(goals), [goals])

  const buildNodes = useCallback((): GoalFlowNode[] =>
    goals.map(goal => ({
      id: goal.id,
      type: 'goal',
      position:
        goal.positionX != null && goal.positionY != null
          ? { x: goal.positionX, y: goal.positionY }
          : layout.get(goal.id)!,
      data: { goal },
      selected: goal.id === selectedId,
    })), [goals, layout, selectedId])

  const [nodes, setNodes] = useState<GoalFlowNode[]>(buildNodes)

  // Sync nodes when goals DATA changes (refetch after an edit). Positions are
  // taken from the query cache, which onNodeDragStop keeps up to date — so a
  // rebuild can never snap a dragged node back. In-flight drags keep their
  // live position.
  useEffect(() => {
    setNodes(prev => {
      const prevById = new Map(prev.map(n => [n.id, n]))
      return buildNodes().map(n => {
        const old = prevById.get(n.id)
        return old?.dragging ? { ...n, position: old.position, selected: n.selected } : n
      })
    })
  }, [buildNodes])

  const edges: Edge[] = useMemo(() => {
    const ids = new Set(goals.map(g => g.id))
    return goals
      .filter(g => g.parentId && ids.has(g.parentId))
      .map(g => ({
        id: `${g.parentId}-${g.id}`,
        source: g.parentId!,
        target: g.id,
        type: 'smoothstep',
        style: { stroke: '#a7b3c0', strokeWidth: 1.5 },
      }))
  }, [goals])

  const onNodesChange = useCallback(
    (changes: NodeChange<GoalFlowNode>[]) => setNodes(ns => applyNodeChanges(changes, ns)),
    [],
  )

  const persistPosition = useCallback((goalId: string, x: number, y: number) => {
    // Write into the query cache FIRST so any rebuild uses the new position,
    // then persist to the server in the background.
    qc.setQueryData<Goal[]>(['goals'], old =>
      old?.map(g => (g.id === goalId ? { ...g, positionX: x, positionY: y } : g)))
    goalsApi.position(goalId, x, y).catch(() => {})
  }, [qc])

  return (
    <div className="h-[560px] bg-white rounded-xl border border-gray-200 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDragStop={(_, node) => persistPosition(node.id, node.position.x, node.position.y)}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="#e5e7eb" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
