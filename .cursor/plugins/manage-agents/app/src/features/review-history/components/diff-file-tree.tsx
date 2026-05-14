import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { FileStatusBadge } from "@/features/workers/components/file-tree/file-status-badge";
import { statusLabel } from "@/features/workers/lib/file-status";
import { cn } from "@/lib/utils/cn";
import { buildTree, type TreeNode } from "@/lib/utils/file-tree";

export interface DiffFileEntry {
  path: string;
  status: string;
}

interface Props {
  files: DiffFileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

export function DiffFileTree({ files, selectedPath, onSelect }: Props) {
  const tree = buildTree(files);
  return (
    <div className="rounded-md border bg-card/40 py-1">
      {tree.map((node) => (
        <Node
          key={node.path}
          node={node}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}

interface NodeProps {
  node: TreeNode;
  depth?: number;
  selectedPath: string | null;
  onSelect: (path: string) => void;
}

function Node({ node, depth = 0, selectedPath, onSelect }: NodeProps) {
  const [open, setOpen] = useState(true);
  const padding = depth * 16 + 8;

  if (node.isFile) {
    const isSelected = node.path === selectedPath;
    return (
      <button
        type="button"
        onClick={() => onSelect(node.path)}
        className={cn(
          "flex w-full items-center gap-2 py-0.5 font-mono text-xs hover:bg-accent/40",
          isSelected && "bg-accent",
        )}
        style={{ paddingLeft: padding }}
      >
        <FileStatusBadge label={statusLabel(node.status ?? "??")} />
        <span className="truncate">{node.name}</span>
      </button>
    );
  }

  return (
    <div>
      <button
        type="button"
        className="flex w-full items-center gap-1 py-0.5 font-mono text-xs hover:bg-accent/40"
        style={{ paddingLeft: padding }}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <span>{node.name}/</span>
      </button>
      {open &&
        node.children.map((child) => (
          <Node
            key={child.path}
            node={child}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}
