import { branchToWorkerName, branchToWorktreePath } from "../hooks/useWorkers";
import type { CreatePlaceholder } from "./DetailPane";

interface CreatingRowProps {
  placeholder: CreatePlaceholder;
}

export function CreatingRow({ placeholder }: CreatingRowProps) {
  return (
    <tr className="row-pending" aria-busy="true">
      <td />
      <td className="pr-cell" />
      <td className="mono">
        <span className="name-cell">
          <span className="name-row">{branchToWorkerName(placeholder.branch)}</span>
          <span className="name-path mono">{branchToWorktreePath(placeholder.branch)}</span>
        </span>
      </td>
      <td>
        <div className="status-cell">
          <span className="badge badge-setting-up">Setting up</span>
        </div>
      </td>
      <td className="actions-cell" />
    </tr>
  );
}

interface FailedRowProps {
  placeholder: CreatePlaceholder;
  selected: boolean;
  onRowClick: (name: string, e: React.MouseEvent) => void;
}

export function FailedRow({ placeholder, selected, onRowClick }: FailedRowProps) {
  return (
    <tr
      className={[
        "clickable row-failed-create",
        selected ? "row-selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      onClick={(e) => onRowClick(placeholder.id, e)}
    >
      <td />
      <td className="pr-cell" />
      <td className="mono">
        <span className="name-cell">
          <span className="name-row">{branchToWorkerName(placeholder.branch)}</span>
          <span className="name-path mono">{branchToWorktreePath(placeholder.branch)}</span>
        </span>
      </td>
      <td>
        <div className="status-cell">
          <span className="badge badge-setup-failed">Setup failed</span>
        </div>
      </td>
      <td className="actions-cell" />
    </tr>
  );
}
