export const workersKeys = {
  all: ["workers"] as const,
  list: () => [...workersKeys.all, "list"] as const,
  details: (name: string) => [...workersKeys.all, "details", name] as const,
  build: (name: string) => [...workersKeys.all, "build", name] as const,
  buildLog: (name: string, stream: "stdout" | "stderr") =>
    [...workersKeys.all, "buildLog", name, stream] as const,
  allBuilds: () => [...workersKeys.all, "allBuilds"] as const,
  chain: (name: string) => [...workersKeys.all, "chain", name] as const,
  chainLog: (name: string, phase: string, stream: "stdout" | "stderr") =>
    [...workersKeys.all, "chainLog", name, phase, stream] as const,
};

export const diskKeys = {
  all: ["disk"] as const,
  stats: () => [...diskKeys.all, "stats"] as const,
  size: (name: string) => [...diskKeys.all, "size", name] as const,
};
