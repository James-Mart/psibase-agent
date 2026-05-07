import { useMemo } from "react";
import type { FileEntry } from "@/lib/api/types";
import { buildTree } from "../../lib/file-status";
import { FileTreeNode } from "./file-tree-node";

interface Props {
  files: FileEntry[];
}

export function FileTree({ files }: Props) {
  const tree = useMemo(() => buildTree(files), [files]);
  return (
    <div className="rounded-md border bg-card/40 py-1">
      {tree.map((node) => (
        <FileTreeNode key={node.path} node={node} />
      ))}
    </div>
  );
}
