/**
 * Retry helpers for transient blockchain/RPC failures (429, 5xx, network errors).
 */

import {
  TRANSIENT_ERROR_INITIAL_BACKOFF_MS,
  TRANSIENT_ERROR_MAX_ATTEMPTS,
} from './constants'
import { getErrorMessage } from './errorUtils'
import { log } from './logger'

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Whether an error is likely transient and worth retrying with backoff.
 * Matches Spaces API retry rules: 429, 408, 5xx, and common network failures.
 */
export function isTransientBlockchainError(error: unknown): boolean {
  const message = getErrorMessage(error).toLowerCase()

  if (
    message.includes('429') ||
    message.includes('too many requests') ||
    message.includes('rate limit') ||
    message.includes('408') ||
    message.includes('request timeout') ||
    message.includes('etimedout') ||
    message.includes('econnreset') ||
    message.includes('econnrefused') ||
    message.includes('network request failed') ||
    message.includes('network error') ||
    message.includes('socket hang up')
  ) {
    return true
  }

  return /\b5\d{2}\b/.test(message)
}

export interface WithTransientRetryOptions {
  maxAttempts?: number
  initialBackoffMs?: number
  /** Label for retry log messages */
  label?: string
}

/**
 * Run an async function with exponential backoff on transient errors.
 */
export async function withTransientRetry<T>(
  fn: () => Promise<T>,
  options: WithTransientRetryOptions = {}
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? TRANSIENT_ERROR_MAX_ATTEMPTS
  const initialBackoffMs = options.initialBackoffMs ?? TRANSIENT_ERROR_INITIAL_BACKOFF_MS
  const label = options.label ?? 'operation'

  let lastError: unknown

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error
      if (!isTransientBlockchainError(error) || attempt >= maxAttempts) {
        throw error
      }
      const backoffMs = initialBackoffMs * (1 << (attempt - 1))
      log(`[Balance] ${label}: retry in ${backoffMs}ms (${attempt}/${maxAttempts})`)
      await delay(backoffMs)
    }
  }

  throw lastError
}
