export const issuesKeys = {
  all: ["issues"] as const,
  list: () => [...issuesKeys.all, "list"] as const,
  detail: (id: string) => [...issuesKeys.all, "detail", id] as const,
};
