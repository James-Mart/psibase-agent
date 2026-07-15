import { useState, type KeyboardEvent } from "react";
import { Send } from "lucide-react";
import type { ChatMessage } from "@server/schemas";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useChatQuery } from "../api/queries";
import { usePostMessage } from "../api/mutations";
import { Markdown } from "./markdown";
import { MessageScroller } from "./chat/message-scroller";
import { Bubble, Message, type MessageAlign } from "./chat/message";
import { Marker } from "./chat/marker";
import { Shimmer } from "./chat/shimmer";

const COMPOSER_ROLE = "human";

function alignOf(role: string): MessageAlign {
  return role === COMPOSER_ROLE ? "end" : "start";
}

function dayKey(at: string): string {
  const date = new Date(at);
  return Number.isNaN(date.getTime()) ? at : date.toDateString();
}

function dayLabel(at: string): string {
  const date = new Date(at);
  if (Number.isNaN(date.getTime())) return at;
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function MessageList({
  messages,
  attachmentsIssueId,
}: {
  messages: ChatMessage[];
  attachmentsIssueId?: string;
}) {
  let lastDay = "";
  return (
    <>
      {messages.map((message, index) => {
        const key = dayKey(message.at);
        const showMarker = key !== lastDay;
        lastDay = key;
        const align = alignOf(message.role);
        return (
          <div key={`${message.at}-${index}`} className="flex flex-col gap-2">
            {showMarker ? <Marker>{dayLabel(message.at)}</Marker> : null}
            <Message align={align}>
              <Bubble align={align} author={message.name ?? message.role} at={message.at}>
                <Markdown issueId={attachmentsIssueId}>{message.body}</Markdown>
              </Bubble>
            </Message>
          </div>
        );
      })}
    </>
  );
}

export function ChatPanel({
  id,
  attachmentsIssueId,
}: {
  id: string;
  /** When set, relative Markdown links in chat resolve to this issue's attachments. */
  attachmentsIssueId?: string;
}) {
  const { data, isLoading, error } = useChatQuery(id);
  const post = usePostMessage(id);
  const [draft, setDraft] = useState("");

  const messages = data?.messages ?? [];
  const problems = data?.problems ?? [];

  const send = () => {
    const body = draft.trim();
    if (!body || post.isPending) return;
    post.mutate({ role: COMPOSER_ROLE, body }, { onSuccess: () => setDraft("") });
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <h2 className="text-sm font-semibold text-muted-foreground">Chat</h2>

      {error ? (
        <p className="text-sm text-destructive-foreground">{error.message}</p>
      ) : null}

      {problems.length > 0 ? (
        <div className="rounded-md border border-warning/40 bg-warning/10 p-2 text-xs text-muted-foreground">
          {problems.map((p) => (
            <div key={p.message}>{p.message}</div>
          ))}
        </div>
      ) : null}

      {isLoading ? (
        <p className="px-1 py-4 text-sm text-muted-foreground">Loading chat…</p>
      ) : messages.length === 0 ? (
        <p className="px-1 py-4 text-sm text-muted-foreground">
          No messages yet.
        </p>
      ) : (
        <MessageScroller bottomKey={messages.length}>
          <MessageList
            messages={messages}
            attachmentsIssueId={attachmentsIssueId}
          />
        </MessageScroller>
      )}

      {post.isPending ? <Shimmer label="Sending…" /> : null}

      <div className="flex items-end gap-2">
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a message… (Enter to send, Shift+Enter for newline)"
          className="min-h-[40px] resize-none"
        />
        <Button
          size="icon"
          onClick={send}
          disabled={post.isPending || !draft.trim()}
          title="Send"
        >
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
