import type { WorkerInfo, WorkerStatus } from "../api";
import type { CreatePlaceholder } from "./DetailPane";
import { CreatingRow, FailedRow } from "./PlaceholderRow";
import { WorkerRow } from "./WorkerRow";

interface WorkerTableProps {
  workers: WorkerInfo[];
  createPlaceholders: CreatePlaceholder[];
  initialLoading: boolean;
  busyWorkers: Set<string>;
  selectedName: string | null;
  editing: string | null;
  editValue: string;
  copied: string | null;
  onRowClick: (name: string, e: React.MouseEvent) => void;
  onStatusChange: (name: string, status: WorkerStatus) => void;
  onStart: (name: string) => void;
  onStop: (name: string) => void;
  onDelete: (worker: WorkerInfo) => void;
  onEditStart: (name: string) => void;
  onEditChange: (value: string) => void;
  onEditSave: (name: string) => void;
  onEditCancel: () => void;
  onCopy: (path: string) => void;
}

export function WorkerTable({
  workers,
  createPlaceholders,
  initialLoading,
  busyWorkers,
  selectedName,
  editing,
  editValue,
  copied,
  onRowClick,
  onStatusChange,
  onStart,
  onStop,
  onDelete,
  onEditStart,
  onEditChange,
  onEditSave,
  onEditCancel,
  onCopy,
}: WorkerTableProps) {
  const creatingRows = createPlaceholders.filter((p) => p.phase === "creating");
  const failedRows = createPlaceholders.filter((p) => p.phase === "failed");

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th className="status-col">Status</th>
            <th className="pr-col"><span className="sr-only">PR</span></th>
            <th>Name</th>
            <th>Remote Access</th>
            <th className="actions-col">
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {initialLoading ? (
            <tr className="empty-row">
              <td colSpan={5}>Loading...</td>
            </tr>
          ) : workers.length === 0 && createPlaceholders.length === 0 ? (
            <tr className="empty-row">
              <td colSpan={5}>No worktrees found</td>
            </tr>
          ) : (
            <>
              {creatingRows.map((p) => (
                <CreatingRow key={p.id} placeholder={p} />
              ))}
              {failedRows.map((p) => (
                <FailedRow
                  key={p.id}
                  placeholder={p}
                  selected={selectedName === p.id}
                  onRowClick={onRowClick}
                />
              ))}
              {(["active", "blocked", "inactive"] as const).flatMap((status) => {
                const group = workers.filter((w) => w.status === status);
                if (group.length === 0) return [];
                const label = status.charAt(0).toUpperCase() + status.slice(1);
                return [
                  <tr key={`group-${status}`} className={`group-header group-header-${status}`}>
                    <td colSpan={5}>
                      {label}
                      <span className="group-count">{group.length}</span>
                    </td>
                  </tr>,
                  ...group.map((w) => (
                    <WorkerRow
                      key={w.name}
                      worker={w}
                      busy={busyWorkers.has(w.name)}
                      selected={selectedName === w.name}
                      editing={editing === w.name}
                      editValue={editValue}
                      copied={copied === w.path}
                      onRowClick={onRowClick}
                      onStatusChange={onStatusChange}
                      onStart={onStart}
                      onStop={onStop}
                      onDelete={onDelete}
                      onEditStart={onEditStart}
                      onEditChange={onEditChange}
                      onEditSave={onEditSave}
                      onEditCancel={onEditCancel}
                      onCopy={onCopy}
                    />
                  )),
                ];
              })}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
}
