export type CreatePlaceholderPhase = "creating" | "failed";

export interface CreatePlaceholder {
  id: string;
  branch: string;
  phase: CreatePlaceholderPhase;
  errorMessage?: string;
  errorExtra?: string;
}
