import { buildTree as buildTreeShared, type TreeNode } from "@/lib/utils/file-tree";
import type { FileEntry } from "@/lib/api/types";

export type { TreeNode };

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

export function buildTree(files: FileEntry[]): TreeNode[] {
  return buildTreeShared(files);
}
