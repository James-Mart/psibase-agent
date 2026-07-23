import { useState, type ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { ErrorBoundary } from "react-error-boundary";
import { Toaster } from "sonner";
import { createQueryClient } from "@/lib/query/client";
import { useTheme } from "@/lib/theme/use-theme";
import { ErrorFallback } from "./error-fallback";

interface Props {
  children: ReactNode;
}

export function Providers({ children }: Props) {
  const [queryClient] = useState(createQueryClient);
  const { theme } = useTheme();
  return (
    <QueryClientProvider client={queryClient}>
      <ErrorBoundary FallbackComponent={ErrorFallback}>
        {children}
      </ErrorBoundary>
      <Toaster theme={theme} richColors position="top-right" />
    </QueryClientProvider>
  );
}
