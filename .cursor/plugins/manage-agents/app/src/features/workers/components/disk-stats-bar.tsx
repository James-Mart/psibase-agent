import { useDiskStatsQuery } from "../api/queries";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let value = bytes;
  for (const unit of units) {
    value /= 1024;
    if (value < 1024 || unit === "TB") return `${value.toFixed(1)} ${unit}`;
  }
  return `${value.toFixed(1)} TB`;
}

export function DiskStatsBar() {
  const { data, isPending } = useDiskStatsQuery();

  if (isPending || !data) {
    return (
      <div className="space-y-1 px-1">
        <div className="h-2 rounded-full bg-muted" />
        <div className="h-3" />
      </div>
    );
  }

  const pct = data.total > 0 ? (data.used / data.total) * 100 : 0;

  return (
    <div className="space-y-1 px-1">
      <div className="h-2 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{ width: `${pct.toFixed(1)}%` }}
        />
      </div>
      <p className="text-[10px] leading-tight text-muted-foreground">
        {formatBytes(data.used)} / {formatBytes(data.total)} used
        {" \u00B7 "}
        {formatBytes(data.free)} free
      </p>
    </div>
  );
}
