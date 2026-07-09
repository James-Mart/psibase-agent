export function Shimmer({ label = "agent working…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-1.5 px-1 text-xs">
      <span className="chat-shimmer font-medium">{label}</span>
    </div>
  );
}
