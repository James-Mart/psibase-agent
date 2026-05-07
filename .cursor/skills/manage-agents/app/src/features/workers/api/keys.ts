export const workersKeys = {
  all: ["workers"] as const,
  list: () => [...workersKeys.all, "list"] as const,
  details: (name: string) => [...workersKeys.all, "details", name] as const,
};
