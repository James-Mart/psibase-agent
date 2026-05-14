import { ApiError } from "./errors";

type JsonInit = Omit<RequestInit, "body"> & { body?: unknown };

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function extractError(body: unknown, fallback: string): string {
  if (
    body &&
    typeof body === "object" &&
    "error" in body &&
    typeof (body as { error: unknown }).error === "string"
  ) {
    return (body as { error: string }).error;
  }
  return fallback;
}

/** Typed fetch wrapper. Throws ApiError on non-2xx. */
export async function request<T>(
  input: string,
  init: JsonInit = {},
): Promise<T> {
  const { body, headers, ...rest } = init;
  const res = await fetch(input, {
    ...rest,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const parsed = await readJson(res);
  if (!res.ok) {
    throw new ApiError(
      extractError(parsed, `Request failed with status ${res.status}`),
      res.status,
      parsed,
    );
  }
  return parsed as T;
}
