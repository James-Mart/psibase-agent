export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(message: string, status: number, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export class CreateWorkerError extends ApiError {
  readonly stderr?: string;
  readonly output?: string;

  constructor(
    message: string,
    status: number,
    opts: { stderr?: string; output?: string; body?: unknown } = {},
  ) {
    super(message, status, opts.body);
    this.name = "CreateWorkerError";
    this.stderr = opts.stderr;
    this.output = opts.output;
  }
}
