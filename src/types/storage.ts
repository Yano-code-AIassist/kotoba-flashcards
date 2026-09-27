export type DataErrorCode =
  | 'unavailable'
  | 'corrupted'
  | 'unsupported-version'
  | 'quota-exceeded'
  | 'conflict'
  | 'write-failed'
  | 'validation'
  | 'not-found'
  | 'busy';

export interface DataError {
  code: DataErrorCode;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; error: DataError };
