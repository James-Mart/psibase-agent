export interface TreeNode {
  name: string;
  path: string;
  children: TreeNode[];
  isFile: boolean;
  status?: string;
}

export interface FileTreeEntry {
  path: string;
  status?: string;
}

const sortChildren = (a: TreeNode, b: TreeNode): number => {
  if (a.isFile !== b.isFile) return a.isFile ? 1 : -1;
  return a.name.localeCompare(b.name);
};

export function buildTree(files: FileTreeEntry[]): TreeNode[] {
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
