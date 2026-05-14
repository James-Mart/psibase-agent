import { memo, useMemo } from "react";
import {
  Background,
  Handle,
  Position,
  type Edge,
  type Node,
  type NodeProps,
  ReactFlow,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { useSetNodeCanonical } from "../api/mutations";
import { useRhsUiStore } from "../store/use-rhs-ui-store";
import type { NodeGraph, VirtualNode } from "../types";

interface Props {
  sessionId: string;
  graph: NodeGraph;
}

const NODE_WIDTH = 200;
const NODE_HEIGHT = 56;
const X_GAP = 220;
const Y_GAP = 110;

interface NodeData {
  node: VirtualNode;
  isBase: boolean;
  isSelected: boolean;
  sessionId: string;
  [key: string]: unknown;
}

export function VirtualNodeGraph({ sessionId, graph }: Props) {
  const setSelectedNode = useRhsUiStore((s) => s.setSelectedNode);
  const selectedNodeId = useRhsUiStore((s) => s.selectedNodeId);

  const nodeTypes = useMemo(() => ({ rhs: RhsNodeCard }), []);

  const { nodes, edges } = useMemo(
    () => layout(graph, sessionId, selectedNodeId),
    [graph, sessionId, selectedNodeId],
  );

  return (
    <div className="h-full min-h-[18rem] rounded-md border bg-card">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
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
  nodes: Node<NodeData>[];
  edges: Edge[];
}

function layout(
  graph: NodeGraph,
  sessionId: string,
  selectedNodeId: string | null,
): LayoutResult {
  const canonicalSet = new Set(graph.canonicalNodeIds);
  const chainSet = new Set(graph.canonicalChainIds);
  const chainPairs = new Set<string>();
  for (let i = 1; i < graph.canonicalChainIds.length; i++) {
    chainPairs.add(
      `${graph.canonicalChainIds[i - 1]}->${graph.canonicalChainIds[i]}`,
    );
  }

  const childrenByParent = new Map<string | null, VirtualNode[]>();
  for (const node of graph.nodes) {
    const list = childrenByParent.get(node.parentNodeId) ?? [];
    list.push(node);
    childrenByParent.set(node.parentNodeId, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  let nextSlot = 1;

  function place(nodeId: string, depth: number, slot: number): void {
    const children = childrenByParent.get(nodeId) ?? [];
    children.sort(
      (a, b) => Number(chainSet.has(b.nodeId)) - Number(chainSet.has(a.nodeId)),
    );
    for (const child of children) {
      const onChain = chainSet.has(child.nodeId);
      const childSlot = onChain ? slot : nextSlot++;
      positions.set(child.nodeId, { x: childSlot * X_GAP, y: -depth * Y_GAP });
      place(child.nodeId, depth + 1, childSlot);
    }
  }

  positions.set(graph.baseNodeId, { x: 0, y: 0 });
  place(graph.baseNodeId, 1, 0);

  const nodes: Node<NodeData>[] = graph.nodes.map((n) => {
    const pos = positions.get(n.nodeId) ?? { x: 0, y: 0 };
    return {
      id: n.nodeId,
      type: "rhs",
      position: pos,
      data: {
        node: { ...n, isCanonical: canonicalSet.has(n.nodeId) },
        isBase: n.nodeId === graph.baseNodeId,
        isSelected: n.nodeId === selectedNodeId,
        sessionId,
      },
    };
  });

  const edges: Edge[] = graph.nodes
    .filter((n) => n.parentNodeId)
    .map((n) => {
      const onChain = chainPairs.has(`${n.parentNodeId}->${n.nodeId}`);
      return {
        id: `${n.parentNodeId}->${n.nodeId}`,
        source: n.parentNodeId as string,
        target: n.nodeId,
        type: "smoothstep",
        style: {
          stroke: onChain
            ? "hsl(var(--success))"
            : "hsl(var(--muted-foreground))",
          strokeWidth: onChain ? 2 : 1,
        },
      };
    });

  return { nodes, edges };
}

const RhsNodeCard = memo(function RhsNodeCard({ data }: NodeProps) {
  const { node, isBase, isSelected, sessionId } = data as NodeData;
  const mutation = useSetNodeCanonical(sessionId);

  const borderColor = node.isCanonical
    ? "hsl(var(--success))"
    : isSelected
      ? "hsl(var(--primary))"
      : "hsl(var(--border))";
  const borderWidth = node.isCanonical || isSelected ? 2 : 1;

  return (
    <div
      className={cn(
        "relative flex h-full w-full items-center gap-1 rounded-md bg-card px-2 py-1",
        node.isCanonical ? "" : "opacity-90",
      )}
      style={{
        width: NODE_WIDTH,
        height: NODE_HEIGHT,
        border: `${borderWidth}px solid ${borderColor}`,
        boxShadow: isSelected ? "0 0 0 2px hsl(var(--ring)/0.25)" : undefined,
      }}
    >
      <Handle type="target" position={Position.Bottom} style={{ opacity: 0 }} />
      <div className="flex min-w-0 flex-1 flex-col gap-0.5 text-left text-[10px] leading-tight">
        <span
          className={cn(
            "truncate font-medium",
            node.isCanonical && "text-[hsl(var(--success))]",
          )}
        >
          {node.title}
        </span>
        <span className="truncate text-muted-foreground">
          {node.commitSha.slice(0, 7)} · {node.treeId.slice(0, 7)}
        </span>
      </div>
      {!isBase && (
        <button
          type="button"
          aria-label={node.isCanonical ? "Unmark canonical" : "Mark canonical"}
          title={node.isCanonical ? "Unmark canonical" : "Mark canonical"}
          disabled={mutation.isPending}
          onClick={(e) => {
            e.stopPropagation();
            mutation.mutate({
              nodeId: node.nodeId,
              isCanonical: !node.isCanonical,
            });
          }}
          className={cn(
            "flex h-5 w-5 shrink-0 items-center justify-center rounded border",
            node.isCanonical
              ? "border-[hsl(var(--success))] bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]"
              : "border-border bg-background text-muted-foreground hover:text-foreground",
          )}
        >
          <Check className="h-3 w-3" />
        </button>
      )}
      <Handle type="source" position={Position.Top} style={{ opacity: 0 }} />
    </div>
  );
});
