import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type { BuildSummary } from "@/lib/api/builds";
import { workersKeys } from "../api/keys";
import { useWorkerUiStore } from "../store/use-worker-ui-store";

function formatElapsed(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return "";
  const ms = Math.max(0, Date.parse(finishedAt) - Date.parse(startedAt));
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return m === 0 ? `${s}s` : `${m}m ${s.toString().padStart(2, "0")}s`;
}

function notifyDesktop(title: string, body: string, name: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    const notif = new Notification(title, { body, tag: `build-${name}` });
    notif.onclick = () => {
      window.focus();
      useWorkerUiStore.getState().selectWorker(name);
      notif.close();
    };
  } catch {
    // ignore: Notification constructor can throw in some browsers
  }
}

function announce(summary: BuildSummary): void {
  const elapsed = formatElapsed(summary.startedAt, summary.finishedAt);
  const name = summary.workerName;
  if (summary.status === "success") {
    const msg = `Build succeeded for ${name}${elapsed ? ` in ${elapsed}` : ""}`;
    toast.success(msg);
    notifyDesktop("Build succeeded", `${name}${elapsed ? ` (${elapsed})` : ""}`, name);
  } else if (summary.status === "cancelled") {
    const msg = `Build cancelled for ${name}${elapsed ? ` after ${elapsed}` : ""}`;
    toast.info(msg);
    notifyDesktop("Build cancelled", `${name}${elapsed ? ` (${elapsed})` : ""}`, name);
  } else if (summary.status === "failed") {
    const exit =
      summary.exitCode != null ? ` (exit ${summary.exitCode})` : "";
    const msg = `Build failed for ${name}${elapsed ? ` after ${elapsed}` : ""}${exit}`;
    toast.error(msg);
    notifyDesktop("Build failed", `${name}${elapsed ? ` (${elapsed})${exit}` : exit}`, name);
  }
}

export function BuildNotifier() {
  const qc = useQueryClient();

  useEffect(() => {
    const es = new EventSource("/api/builds/events");
    es.addEventListener("finished", (ev) => {
      let summary: BuildSummary;
      try {
        summary = JSON.parse((ev as MessageEvent).data) as BuildSummary;
      } catch {
        return;
      }
      announce(summary);
      qc.invalidateQueries({ queryKey: workersKeys.build(summary.workerName) });
      qc.invalidateQueries({ queryKey: workersKeys.allBuilds() });
    });
    return () => es.close();
  }, [qc]);

  return null;
}
