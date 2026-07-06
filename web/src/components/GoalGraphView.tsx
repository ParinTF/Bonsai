import { useCallback, useEffect, useMemo, useState } from 'react'
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
import { goalsApi, type Goal } from '../lib/api'

const NODE_W = 220
const NODE_H = 88

type GoalNodeData = { goal: Goal; selected: boolean }
type GoalFlowNode = Node<GoalNodeData, 'goal'>

function GoalNodeCard({ data }: NodeProps<GoalFlowNode>) {
  const { goal, selected } = data
  return (
    <div
      className={`w-[220px] bg-white rounded-xl border-2 p-3 shadow-sm cursor-pointer transition-colors ${
        selected ? 'border-emerald-500' : 'border-gray-200 hover:border-emerald-300'
      }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-gray-300" />
      <div className="flex items-center justify-between gap-1 mb-2">
        <span className={`text-sm font-medium truncate ${goal.status === 'done' ? 'text-gray-400 line-through' : 'text-gray-800'}`}>
          {goal.title}
        </span>
        <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-100 text-gray-500 shrink-0">
          {goal.progressType}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden">
          <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${goal.progress}%` }} />
        </div>
        <span className="text-[10px] text-gray-500">{Math.round(goal.progress)}%</span>
      </div>
      <Handle type="source" position={Position.Bottom} className="!bg-gray-300" />
    </div>
  )
}

const nodeTypes = { goal: GoalNodeCard }

/** Dagre top-down tree layout for goals that don't have a saved position yet. */
function autoLayout(goals: Goal[]): Map<string, { x: number; y: number }> {
  const g = new dagre.graphlib.Graph()
  g.setGraph({ rankdir: 'TB', nodesep: 40, ranksep: 70 })
  g.setDefaultEdgeLabel(() => ({}))
  const ids = new Set(goals.map(x => x.id))
  for (const goal of goals) g.setNode(goal.id, { width: NODE_W, height: NODE_H })
  for (const goal of goals) {
    if (goal.parentId && ids.has(goal.parentId)) g.setEdge(goal.parentId, goal.id)
  }
  dagre.layout(g)
  const out = new Map<string, { x: number; y: number }>()
  for (const goal of goals) {
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
  const layout = useMemo(() => autoLayout(goals), [goals])

  const buildNodes = useCallback((): GoalFlowNode[] =>
    goals.map(goal => ({
      id: goal.id,
      type: 'goal',
      position:
        goal.positionX != null && goal.positionY != null
          ? { x: goal.positionX, y: goal.positionY }
          : layout.get(goal.id)!,
      data: { goal, selected: goal.id === selectedId },
    })), [goals, layout, selectedId])

  const [nodes, setNodes] = useState<GoalFlowNode[]>(buildNodes)

  // Refresh node data (progress, selection) when the query refetches,
  // but keep any in-flight drag positions React Flow is tracking.
  useEffect(() => {
    setNodes(prev => {
      const prevById = new Map(prev.map(n => [n.id, n]))
      return buildNodes().map(n => {
        const old = prevById.get(n.id)
        return old && old.dragging ? { ...n, position: old.position } : n
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
        style: { stroke: '#a7b3c0' },
      }))
  }, [goals])

  const onNodesChange = useCallback(
    (changes: NodeChange<GoalFlowNode>[]) => setNodes(ns => applyNodeChanges(changes, ns)),
    [],
  )

  return (
    <div className="h-[560px] bg-white rounded-xl border border-gray-200 overflow-hidden">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onNodeClick={(_, node) => onSelect(node.id)}
        onNodeDragStop={(_, node) => {
          goalsApi.position(node.id, node.position.x, node.position.y).catch(() => {})
        }}
        fitView
        proOptions={{ hideAttribution: true }}
      >
        <Background gap={20} color="#e5e7eb" />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  )
}
