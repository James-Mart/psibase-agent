import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { statusLabel, type TreeNode } from "../../lib/file-status";
import { FileStatusBadge } from "./file-status-badge";

interface Props {
  node: TreeNode;
  depth?: number;
}

export function FileTreeNode({ node, depth = 0 }: Props) {
  const [open, setOpen] = useState(true);
  const padding = depth * 16 + 8;

  if (node.isFile) {
    return (
      <div
        className="flex items-center gap-2 py-0.5 font-mono text-xs"
        style={{ paddingLeft: padding }}
      >
        <FileStatusBadge label={statusLabel(node.status ?? "??")} />
        <span>{node.name}</span>
      </div>
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
          <FileTreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}
