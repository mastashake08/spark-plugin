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
