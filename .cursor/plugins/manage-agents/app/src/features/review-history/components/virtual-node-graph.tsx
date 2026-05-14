import { useMemo } from "react";
import {
  Background,
  type Edge,
  type Node,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { cn } from "@/lib/utils/cn";
import { useRhsUiStore } from "../store/use-rhs-ui-store";
import type { NodeGraph, VirtualNode } from "../types";

interface Props {
  graph: NodeGraph;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;
const X_GAP = 240;
const Y_GAP = 90;

export function VirtualNodeGraph({ graph }: Props) {
  const { nodes, edges } = useMemo(() => layout(graph), [graph]);
  const setSelectedNode = useRhsUiStore((s) => s.setSelectedNode);
  const selectedNodeId = useRhsUiStore((s) => s.selectedNodeId);

  const decoratedNodes = useMemo<Node[]>(
    () =>
      nodes.map((n) =>
        n.id === selectedNodeId
          ? {
              ...n,
              style: {
                ...n.style,
                border: "2px solid hsl(var(--primary))",
                boxShadow: "0 0 0 2px hsl(var(--ring)/0.25)",
              },
            }
          : n,
      ),
    [nodes, selectedNodeId],
  );

  return (
    <div className="h-72 rounded-md border bg-card">
      <ReactFlow
        nodes={decoratedNodes}
        edges={edges}
        fitView
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable
        proOptions={{ hideAttribution: true }}
        onNodeClick={(_e, node) => setSelectedNode(node.id)}
      >
        <Background gap={16} />
      </ReactFlow>
    </div>
  );
}

interface LayoutResult {
  nodes: Node[];
  edges: Edge[];
}

function layout(graph: NodeGraph): LayoutResult {
  const activeChain = new Set(graph.activeChainIds);
  const childrenByParent = new Map<string | null, VirtualNode[]>();
  for (const node of graph.nodes) {
    const list = childrenByParent.get(node.parentNodeId) ?? [];
    list.push(node);
    childrenByParent.set(node.parentNodeId, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  const branchSlot = new Map<string, number>();
  let nextSlot = 1;

  function place(nodeId: string | null, depth: number, slot: number): void {
    const children = childrenByParent.get(nodeId) ?? [];
    children.sort((a, b) => Number(activeChain.has(b.nodeId)) - Number(activeChain.has(a.nodeId)));
    for (const child of children) {
      const isActive = activeChain.has(child.nodeId);
      const childSlot = isActive ? slot : nextSlot++;
      branchSlot.set(child.nodeId, childSlot);
      positions.set(child.nodeId, { x: depth * X_GAP, y: childSlot * Y_GAP });
      place(child.nodeId, depth + 1, childSlot);
    }
  }

  const baseSlot = 0;
  positions.set(graph.baseNodeId, { x: 0, y: baseSlot * Y_GAP });
  branchSlot.set(graph.baseNodeId, baseSlot);
  place(graph.baseNodeId, 1, baseSlot);

  const nodes: Node[] = graph.nodes.map((n) => {
    const pos = positions.get(n.nodeId) ?? { x: 0, y: 0 };
    const isActive = activeChain.has(n.nodeId);
    return {
      id: n.nodeId,
      type: "default",
      position: pos,
      data: {
        label: (
          <div
            className={cn(
              "flex flex-col gap-0.5 px-2 py-1 text-left text-[10px] leading-tight",
              isActive ? "" : "opacity-60",
            )}
          >
            <span className={cn("truncate font-medium", isActive && "text-primary")}>
              {n.title}
            </span>
            <span className="truncate text-muted-foreground">
              {n.commitSha.slice(0, 7)} · {n.treeId.slice(0, 7)}
            </span>
          </div>
        ),
      },
      style: {
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        padding: 0,
        background: isActive ? "hsl(var(--card))" : "hsl(var(--muted))",
        border: isActive
          ? "1px solid hsl(var(--primary))"
          : "1px solid hsl(var(--border))",
        borderRadius: 6,
      },
    };
  });

  const edges: Edge[] = graph.nodes
    .filter((n) => n.parentNodeId)
    .map((n) => ({
      id: `${n.parentNodeId}->${n.nodeId}`,
      source: n.parentNodeId as string,
      target: n.nodeId,
      type: "smoothstep",
      style: {
        stroke: activeChain.has(n.nodeId) ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))",
        strokeWidth: activeChain.has(n.nodeId) ? 2 : 1,
      },
    }));

  return { nodes, edges };
}
