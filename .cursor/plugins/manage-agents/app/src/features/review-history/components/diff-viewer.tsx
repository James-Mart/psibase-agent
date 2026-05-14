import { useMemo } from "react";
import { Diff, Hunk, parseDiff, type FileData } from "react-diff-view";
import "react-diff-view/style/index.css";

interface Props {
  diff: string;
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
    <div className="space-y-2">
      {files.map((file, idx) => (
        <div key={idx} className="overflow-hidden rounded-md border bg-card">
          <div className="border-b bg-muted/30 px-2 py-1 text-xs font-mono">
            {file.oldPath === file.newPath ? file.newPath : `${file.oldPath} → ${file.newPath}`}
          </div>
          <div className="overflow-auto text-[11px]">
            <Diff viewType="unified" diffType={file.type} hunks={file.hunks ?? []}>
              {(hunks) => hunks.map((hunk) => <Hunk key={hunk.content} hunk={hunk} />)}
            </Diff>
          </div>
        </div>
      ))}
    </div>
  );
}
