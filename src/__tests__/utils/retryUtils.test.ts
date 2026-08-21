/**
 * Tests for retry utilities
 */

import {
  delay,
  isTransientBlockchainError,
  withTransientRetry,
} from '../../utils/retryUtils'

describe('retryUtils', () => {
  describe('isTransientBlockchainError', () => {
    it('detects 429 rate limit errors', () => {
      expect(isTransientBlockchainError(new Error('HTTP 429 Too Many Requests'))).toBe(true)
      expect(isTransientBlockchainError(new Error('rate limit exceeded'))).toBe(true)
    })

    it('detects 5xx server errors', () => {
      expect(isTransientBlockchainError(new Error('upstream returned 502 Bad Gateway'))).toBe(true)
      expect(isTransientBlockchainError(new Error('status 503'))).toBe(true)
    })

    it('detects network and timeout errors', () => {
      expect(isTransientBlockchainError(new Error('network request failed'))).toBe(true)
      expect(isTransientBlockchainError(new Error('ETIMEDOUT'))).toBe(true)
      expect(isTransientBlockchainError(new Error('408 Request Timeout'))).toBe(true)
    })

    it('does not treat client errors as transient', () => {
      expect(isTransientBlockchainError(new Error('Invalid balance format: abc'))).toBe(false)
      expect(isTransientBlockchainError(new Error('HTTP 400 Bad Request'))).toBe(false)
      expect(isTransientBlockchainError(new Error('HTTP 404 Not Found'))).toBe(false)
    })
  })

  describe('withTransientRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('returns immediately on success', async () => {
      const fn = jest.fn().mockResolvedValue('ok')
      await expect(withTransientRetry(fn)).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('retries transient errors with exponential backoff', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
        .mockRejectedValueOnce(new Error('HTTP 429 Too Many Requests'))
        .mockResolvedValue('ok')

      const promise = withTransientRetry(fn, { label: 'test' })

      await jest.advanceTimersByTimeAsync(1000)
      await jest.advanceTimersByTimeAsync(2000)

      await expect(promise).resolves.toBe('ok')
      expect(fn).toHaveBeenCalledTimes(3)
    })

    it('does not retry non-transient errors', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Invalid balance format'))
      await expect(withTransientRetry(fn)).rejects.toThrow('Invalid balance format')
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('throws after exhausting retries', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('HTTP 429'))
      const promise = withTransientRetry(fn, { maxAttempts: 3, initialBackoffMs: 100 })

      await jest.advanceTimersByTimeAsync(100)
      await jest.advanceTimersByTimeAsync(200)

      await expect(promise).rejects.toThrow('HTTP 429')
      expect(fn).toHaveBeenCalledTimes(3)
    })
  })

  describe('delay', () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.useRealTimers()
    })

    it('resolves after the specified duration', async () => {
      const promise = delay(500)
      jest.advanceTimersByTime(500)
      await expect(promise).resolves.toBeUndefined()
    })
  })
})
