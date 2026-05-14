import { useEffect, useMemo, useState } from "react";
import { Maximize2 } from "lucide-react";
import { Diff, Hunk, parseDiff, type FileData } from "react-diff-view";
import "react-diff-view/style/index.css";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils/cn";
import {
  DiffFileTree,
  type DiffFileEntry,
} from "./diff-file-tree";

interface Props {
  diff: string;
}

function fileTypeToLetter(type: FileData["type"]): string {
  switch (type) {
    case "add":
      return "A";
    case "delete":
      return "D";
    case "rename":
    case "copy":
      return "R";
    default:
      return "M";
  }
}

function filePath(file: FileData): string {
  return file.newPath && file.newPath !== "/dev/null"
    ? file.newPath
    : file.oldPath;
}

export function DiffViewer({ diff }: Props) {
  const files = useMemo<FileData[]>(() => {
    if (!diff.trim()) return [];
    try {
      return parseDiff(diff);
    } catch {
      return [];
    }
  }, [diff]);

  const entries = useMemo<DiffFileEntry[]>(
    () =>
      files.map((f) => ({
        path: filePath(f),
        status: fileTypeToLetter(f.type),
      })),
    [files],
  );

  const [selectedPath, setSelectedPath] = useState<string | null>(
    entries[0]?.path ?? null,
  );
  const [fullscreen, setFullscreen] = useState(false);

  useEffect(() => {
    setSelectedPath(entries[0]?.path ?? null);
  }, [diff, entries]);

  if (!diff.trim()) {
    return (
      <p className="rounded-md border bg-card p-3 text-xs text-muted-foreground">
        (no diff at this node)
      </p>
    );
  }

  if (files.length === 0) {
    return (
      <pre className="max-h-96 overflow-auto rounded-md border bg-card p-2 font-mono text-[11px] whitespace-pre-wrap">
        {diff}
      </pre>
    );
  }

  return (
    <>
      <div className="diff-viewer flex flex-col gap-2">
        <div className="flex items-center justify-end">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => setFullscreen(true)}
          >
            <Maximize2 className="h-3 w-3" /> Fullscreen
          </Button>
        </div>
        <DiffSplit
          files={files}
          entries={entries}
          selectedPath={selectedPath}
          onSelect={setSelectedPath}
          containerClassName="h-[70vh]"
        />
      </div>

      <Dialog open={fullscreen} onOpenChange={setFullscreen}>
        <DialogContent className="diff-viewer flex h-[98vh] w-[98vw] max-w-none flex-col gap-2 p-3">
          <DialogTitle className="sr-only">Diff viewer</DialogTitle>
          <DiffSplit
            files={files}
            entries={entries}
            selectedPath={selectedPath}
            onSelect={setSelectedPath}
            containerClassName="flex-1 min-h-0"
          />
        </DialogContent>
      </Dialog>
    </>
  );
}

interface SplitProps {
  files: FileData[];
  entries: DiffFileEntry[];
  selectedPath: string | null;
  onSelect: (path: string) => void;
  containerClassName: string;
}

function DiffSplit({
  files,
  entries,
  selectedPath,
  onSelect,
  containerClassName,
}: SplitProps) {
  const selectedFile = useMemo(() => {
    if (!selectedPath) return files[0] ?? null;
    return files.find((f) => filePath(f) === selectedPath) ?? files[0] ?? null;
  }, [files, selectedPath]);

  return (
    <div className={cn("flex gap-2", containerClassName)}>
      <aside className="w-[280px] shrink-0 overflow-auto">
        <DiffFileTree
          files={entries}
          selectedPath={selectedPath}
          onSelect={onSelect}
        />
      </aside>
      <div className="flex flex-1 flex-col overflow-hidden rounded-md border bg-card">
        {selectedFile ? (
          <>
            <div className="border-b bg-muted/30 px-2 py-1 font-mono text-xs">
              {selectedFile.oldPath === selectedFile.newPath
                ? selectedFile.newPath
                : `${selectedFile.oldPath} → ${selectedFile.newPath}`}
            </div>
            <div className="flex-1 overflow-auto">
              <Diff
                viewType="unified"
                diffType={selectedFile.type}
                hunks={selectedFile.hunks ?? []}
              >
                {(hunks) =>
                  hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)
                }
              </Diff>
            </div>
          </>
        ) : (
          <p className="p-3 text-xs text-muted-foreground">
            Select a file to view its diff.
          </p>
        )}
      </div>
    </div>
  );
}
