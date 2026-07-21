import { useEffect, useRef, type ReactNode } from "react";
import type { IssueDetail } from "@server/schemas";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import { useInlineEditSession } from "../hooks/use-inline-edit-session";
import { ExternalEditConflictBanner } from "./external-edit-conflict-banner";

export interface InlineFieldProps {
  value: string;
  issue: IssueDetail;
  onSave: (next: string) => Promise<void>;
  /** Return an error message to reject the draft without calling `onSave`. */
  validate?: (next: string) => string | null;
  emptyLabel?: string;
  multiline?: boolean;
  className?: string;
  displayClassName?: string;
  inputClassName?: string;
  renderDisplay?: (display: ReactNode) => ReactNode;
}

export function InlineField({
  value,
  issue,
  onSave,
  validate,
  emptyLabel = "Unset",
  multiline = false,
  className,
  displayClassName,
  inputClassName,
  renderDisplay,
}: InlineFieldProps) {
  const {
    editing,
    draft,
    error,
    saving,
    hasConflict,
    beginEdit,
    setDraft,
    reload,
    acknowledge,
    onKeyDown,
    onBlur,
  } = useInlineEditSession({ value, issue, onSave, validate, multiline });

  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!editing) return;
    const el = multiline ? textareaRef.current : inputRef.current;
    if (!el) return;
    el.focus();
    if (!multiline && el instanceof HTMLInputElement) {
      el.select();
    }
  }, [editing, multiline]);

  if (!editing) {
    const display = (
      <button
        type="button"
        className={cn(
          "block w-full min-w-0 rounded-sm text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
          displayClassName,
        )}
        onClick={beginEdit}
      >
        {value.trim() ? (
          value
        ) : (
          <span className="text-muted-foreground">{emptyLabel}</span>
        )}
      </button>
    );
    return (
      <div className={cn("min-w-0", className)}>
        {renderDisplay ? renderDisplay(display) : display}
      </div>
    );
  }

  return (
    <div className={cn("flex min-w-0 flex-col gap-2", className)}>
      {hasConflict ? (
        <ExternalEditConflictBanner onReload={reload} onKeep={acknowledge} />
      ) : null}

      {multiline ? (
        <Textarea
          ref={textareaRef}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={cn("min-h-[120px] font-mono", inputClassName)}
        />
      ) : (
        <Input
          ref={inputRef}
          value={draft}
          disabled={saving}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          onBlur={onBlur}
          className={inputClassName}
        />
      )}

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
