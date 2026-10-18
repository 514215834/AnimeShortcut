export type FetchErrorKind = 'timeout' | 'network' | 'proxy' | 'http-status' | 'parse'

export class FetchError extends Error {
  readonly kind: FetchErrorKind
  readonly status?: number
  readonly channel?: string
  constructor(
    kind: FetchErrorKind,
    message: string,
    opts?: { status?: number; channel?: string; cause?: unknown },
  ) {
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined)
    this.name = 'FetchError'
    this.kind = kind
    this.status = opts?.status
    this.channel = opts?.channel
  }
}
