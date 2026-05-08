import { AlertTriangle, ExternalLink, MessageSquare } from "lucide-react";
import type { ChatError } from "@/lib/api/types";

interface Props {
  agentId: string | null;
  error: ChatError | null;
}

export function WorkerChatSection({ agentId, error }: Props) {
  if (!agentId && !error) return null;
  return (
    <section className="space-y-1">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        Chat
      </h3>
      {agentId && (
        <a
          href={`https://cursor.com/agents/${agentId}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
        >
          <MessageSquare className="h-4 w-4" />
          Open chat in Cursor
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      {error && <ChatErrorView error={error} />}
    </section>
  );
}

function ChatErrorView({ error }: { error: ChatError }) {
  if (error.kind === "missing_api_key") {
    return (
      <ErrorPanel>
        <p>
          Chat couldn't start: <code className="font-mono">CURSOR_API_KEY</code>{" "}
          is not set in the dev server's environment.
        </p>
        <p>
          Create a key at{" "}
          <a
            href="https://cursor.com/dashboard/integrations"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 underline"
          >
            cursor.com/dashboard/integrations
            <ExternalLink className="h-3 w-3" />
          </a>{" "}
          (Create API Key), then{" "}
          <code className="font-mono">export CURSOR_API_KEY=...</code>, restart{" "}
          <code className="font-mono">npm run dev</code>, and click Start again.
        </p>
      </ErrorPanel>
    );
  }
  return (
    <ErrorPanel>
      <p>Chat init failed.</p>
      <p className="font-mono text-xs">{error.message}</p>
    </ErrorPanel>
  );
}

function ErrorPanel({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div className="space-y-1">{children}</div>
    </div>
  );
}
