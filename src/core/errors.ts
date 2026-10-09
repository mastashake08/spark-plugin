export interface SparkApiErrorDetail {
  code?: string;
  message?: string;
  field?: string;
}

/**
 * Thrown for any non-success response from the Spark API, including both
 * transport-level HTTP failures and `{ D: { success: false } }` envelopes.
 */
export class SparkApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly details: SparkApiErrorDetail[];
  readonly requestId?: string;

  constructor(
    message: string,
    options: {
      status: number;
      code?: string;
      details?: SparkApiErrorDetail[];
      requestId?: string;
      cause?: unknown;
    },
  ) {
    super(message, { cause: options.cause });
    this.name = 'SparkApiError';
    this.status = options.status;
    this.code = options.code;
    this.details = options.details ?? [];
    this.requestId = options.requestId;
  }
}

/**
 * Thrown by `ParagonClient` for login, transport, and RETS reply-code failures
 * (`code` is the RETS ReplyCode, e.g. `'20200'` for an unknown query field).
 * Extends `SparkApiError` so `instanceof SparkApiError` checks and the
 * hooks' `error` typing work unchanged whichever client you use.
 */
export class ParagonApiError extends SparkApiError {
  constructor(message: string, options: ConstructorParameters<typeof SparkApiError>[1]) {
    super(message, options);
    this.name = 'ParagonApiError';
  }
}
