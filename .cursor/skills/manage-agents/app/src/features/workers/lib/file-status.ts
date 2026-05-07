import type { FileEntry } from "@/lib/api/types";

export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
  status?: string;
}

export interface FileStatusLabel {
  letter: string;
  variant: "modified" | "added" | "deleted" | "renamed" | "untracked";
}

export function statusLabel(status: string): FileStatusLabel {
  switch (status) {
    case "M":
      return { letter: "M", variant: "modified" };
    case "A":
      return { letter: "A", variant: "added" };
    case "D":
      return { letter: "D", variant: "deleted" };
    case "R":
      return { letter: "R", variant: "renamed" };
    case "??":
      return { letter: "U", variant: "untracked" };
    default:
      return { letter: status.charAt(0) || "?", variant: "untracked" };
  }
}

const sortChildren = (a: TreeNode, b: TreeNode): number => {
  if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
  return a.name.localeCompare(b.name);
};

export function buildTree(files: FileEntry[]): TreeNode[] {
  const root: TreeNode = {
    name: "",
    path: "",
    children: [],
    isFile: false,
  };
  for (const { path: filePath, status } of files) {
    const parts = filePath.split("/").filter(Boolean);
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      let child = current.children.find(
        (c) => c.name === part && c.isFile === isFile,
      );
      if (!child) {
        child = {
          name: part,
          path: parts.slice(0, i + 1).join("/"),
          children: [],
          isFile,
          status: isFile ? status : undefined,
        };
        current.children.push(child);
      }
      current = child;
    }
  }
  const sortRecursive = (node: TreeNode) => {
    node.children.sort(sortChildren);
    node.children.forEach(sortRecursive);
  };
  sortRecursive(root);
  return root.children;
}
