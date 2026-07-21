import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent,
  type MutableRefObject,
  type ReactNode,
  type RefObject,
} from "react";
import type { IssueDetail } from "@server/schemas";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils/cn";
import type { DescriptionEditorUploadProps } from "../hooks/use-description-editor-upload";
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
  /** Wrap the display control (e.g. title `<h1>`). */
  renderDisplay?: (display: ReactNode) => ReactNode;
  /** Replace default plain-text / empty-label content inside the display control. */
  renderDisplayContent?: (value: string) => ReactNode;
  /**
   * Non-`<button>` display so nested interactive content (e.g. markdown links)
   * stays valid; clicks on links do not enter edit.
   */
  richDisplay?: boolean;
  /** External textarea ref (e.g. description upload hook); falls back to internal. */
  textareaRef?: RefObject<HTMLTextAreaElement>;
  textareaProps?: DescriptionEditorUploadProps | Record<string, never>;
  /** Extra attributes on the multiline textarea (e.g. `DESCRIPTION_EDITOR_ATTR`). */
  textareaAttrs?: Record<string, string | undefined>;
  /** When true, skip the blur-triggered commit (e.g. while an upload disables the field). */
  shouldDeferBlurCommit?: () => boolean;
  /** Mirror draft to a parent that needs it (e.g. attachment insert). */
  onDraftChange?: (draft: string) => void;
  /** Let a parent push draft updates into the session (e.g. attachment insert). */
  setDraftRef?: MutableRefObject<((draft: string) => void) | null>;
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
  renderDisplayContent,
  richDisplay = false,
  textareaRef: textareaRefProp,
  textareaProps,
  textareaAttrs,
  shouldDeferBlurCommit,
  onDraftChange,
  setDraftRef,
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
  const internalTextareaRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = textareaRefProp ?? internalTextareaRef;

  useEffect(() => {
    onDraftChange?.(draft);
  }, [draft, onDraftChange]);

  useEffect(() => {
    if (!setDraftRef) return;
    setDraftRef.current = setDraft;
    return () => {
      setDraftRef.current = null;
    };
  }, [setDraft, setDraftRef]);

  useEffect(() => {
    if (!editing) return;
    const el = multiline ? textareaRef.current : inputRef.current;
    if (!el) return;
    el.focus();
    if (!multiline && el instanceof HTMLInputElement) {
      el.select();
    }
  }, [editing, multiline, textareaRef]);

  if (!editing) {
    const content = renderDisplayContent ? (
      renderDisplayContent(value)
    ) : value.trim() ? (
      value
    ) : (
      <span className="text-muted-foreground">{emptyLabel}</span>
    );

    const displayClass = cn(
      "block w-full min-w-0 rounded-sm text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
      richDisplay && "cursor-text",
      displayClassName,
    );

    const onDisplayClick = (event: MouseEvent<HTMLElement>) => {
      if (richDisplay && (event.target as HTMLElement).closest("a")) return;
      beginEdit();
    };

    const onDisplayKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        beginEdit();
      }
    };

    const display = richDisplay ? (
      <div
        tabIndex={0}
        className={displayClass}
        onClick={onDisplayClick}
        onKeyDown={onDisplayKeyDown}
      >
        {content}
      </div>
    ) : (
      <button type="button" className={displayClass} onClick={beginEdit}>
        {content}
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
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          className={cn("min-h-[120px] font-mono", inputClassName)}
          {...textareaAttrs}
          {...textareaProps}
          disabled={saving || Boolean(textareaProps?.disabled)}
          onBlur={() => {
            if (shouldDeferBlurCommit?.()) return;
            onBlur();
          }}
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
