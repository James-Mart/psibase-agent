import { useState } from "react";
import type { FileEntry } from "../api";

interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
  status?: string;
}

function statusLabel(status: string): { letter: string; className: string } {
  switch (status) {
    case "M": return { letter: "M", className: "status-modified" };
    case "A": return { letter: "A", className: "status-added" };
    case "D": return { letter: "D", className: "status-deleted" };
    case "R": return { letter: "R", className: "status-renamed" };
    case "??": return { letter: "U", className: "status-untracked" };
    default: return { letter: status.charAt(0) || "?", className: "status-untracked" };
  }
}

function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [], isFile: false };
  for (const { path: filePath, status } of files) {
    const parts = filePath.split("/").filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      let child = current.children.find((c) => c.name === part && c.isFile === isFile);
      if (!child) {
        child = { name: part, path: parts.slice(0, i + 1).join("/"), children: [], isFile, status: isFile ? status : undefined };
        current.children.push(child);
      }
      current = child;
    }
  }
  root.children.sort((a, b) => {
    if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
  return root.children;
}

function FileTreeNode({ node, depth = 0 }: { node: TreeNode; depth?: number }) {
  const [open, setOpen] = useState(!node.isFile);
  if (node.isFile) {
    const s = statusLabel(node.status ?? "??");
    return (
      <div className="tree-leaf mono" style={{ paddingLeft: depth * 16 + 12 }}>
        <span className={`tree-status ${s.className}`}>{s.letter}</span>
        {node.name}
      </div>
    );
  }
  return (
    <div>
      <div
        className="tree-dir mono"
        style={{ paddingLeft: depth * 16 + 12 }}
        onClick={() => setOpen(!open)}
      >
        <span className="tree-arrow">{open ? "\u25BE" : "\u25B8"}</span>
        {node.name}/
      </div>
      {open && node.children
        .sort((a, b) => {
          if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
          return a.name.localeCompare(b.name);
        })
        .map((child) => (
          <FileTreeNode key={child.path} node={child} depth={depth + 1} />
        ))}
    </div>
  );
}

export function FileTree({ files }: { files: FileEntry[] }) {
  const tree = buildTree(files);
  return (
    <div className="file-tree">
      {tree.map((node) => (
        <FileTreeNode key={node.path} node={node} />
      ))}
    </div>
  );
}
