import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "sonner";
import { createQueryClient } from "@/lib/query/client";
import { ErrorFallback } from "./error-fallback";

interface Props {
  children: ReactNode;
}

export function Providers({ children }: Props) {
  const [queryClient] = useState(createQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {children}
      </ErrorBoundary>
      <Toaster theme="dark" richColors position="top-right" />
    </QueryClientProvider>
  );
}
