export class SDKError extends Error {
  constructor(
    message: string,
    public status: number,
    public response?: unknown,
  ) {
    super(message);
    this.name = 'SDKError';
  }
}

export class NotFoundError extends SDKError {
  constructor(resource: string) {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
  }
}

export class UnauthorizedError extends SDKError {
  constructor() {
    super('Invalid API key', 401);
    this.name = 'UnauthorizedError';
  }
}

export class RateLimitError extends SDKError {
  retryAfter: number;

  constructor(retryAfter: number) {
    super(`Rate limit exceeded. Retry after ${retryAfter}s`, 429);
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}
