import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BuildNotifier } from "@/features/workers/components/build-notifier";
import { createQueryClient } from "@/lib/query/client";
import { ErrorFallback } from "./error-fallback";

interface Props {
  children: ReactNode;
}

export function Providers({ children }: Props) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <ErrorBoundary FallbackComponent={ErrorFallback}>
          {children}
        </ErrorBoundary>
      </TooltipProvider>
      <BuildNotifier />
      <Toaster theme="dark" richColors position="top-right" />
    </QueryClientProvider>
  );
}
