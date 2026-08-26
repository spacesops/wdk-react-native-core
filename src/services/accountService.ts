/**
 * Account Service
 * 
 * Handles account method calls through the worklet.
 * This service provides a generic interface for calling account methods
 * like getBalance, getTokenBalance, signMessage, signTransaction, etc.
 */

import { convertBigIntToString } from '../utils/balanceUtils'
import { handleServiceError } from '../utils/errorHandling'
import { safeStringify } from '../utils/jsonUtils'
import { workletResponseSchema } from '../utils/schemas'
import { requireInitialized } from '../utils/storeHelpers'
import { validateAccountIndex, validateNetworkName } from '../utils/validation'

/**
 * Account Service
 * 
 * Provides methods for calling account operations through the worklet.
 */
export class AccountService {
  /**
   * Call a method on a wallet account
   * Generic method for calling any account method through the worklet
   * 
   * The worklet should already have the correct wallet loaded via `initializeWDK`.
   * Wallet switching is handled at the hook level before calling this service.
   * 
   * @param network - Network name
   * @param accountIndex - Account index
   * @param methodName - Method name
   * @param args - Optional arguments for the method
   * @param walletId - Optional wallet identifier (for consistency, worklet should already have correct wallet loaded)
   * @returns Promise with the method result
   * @throws Error if validation fails
   * 
   * @example
   * ```typescript
   * // Get balance
   * const balance = await AccountService.callAccountMethod('ethereum', 0, 'getBalance', null)
   * 
   * // Get token balance
   * const tokenBalance = await AccountService.callAccountMethod(
   *   'ethereum', 
   *   0, 
   *   'getTokenBalance', 
   *   '0x...'
   * )
   * 
   * // Sign a message
   * const signature = await AccountService.callAccountMethod(
   *   'ethereum',
   *   0,
   *   'signMessage',
   *   { message: 'Hello World' }
   * )
   * ```
   */
  static async callAccountMethod<T = unknown>(
    network: string,
    accountIndex: number,
    methodName: string,
    args?: unknown,
    walletId?: string
  ): Promise<T> {
    // Validate methodName parameter
    if (typeof methodName !== 'string' || methodName.trim().length === 0) {
      throw new Error('methodName must be a non-empty string')
    }

    // Validate inputs
    validateNetworkName(network)
    validateAccountIndex(accountIndex)

    // Require initialized worklet
    const hrpc = requireInitialized()

    // Validate and sanitize args before stringification
    let argsString: string | null = null
    if (args !== undefined && args !== null) {
      // Validate structure and stringify safely
      argsString = safeStringify(args)
    }

    try {
      const response = await hrpc.callMethod({
        methodName,
        network,
        accountIndex,
        args: argsString,
      })

      // Validate response structure
      const validatedResponse = workletResponseSchema.parse(response)

      if (!validatedResponse.result) {
        throw new Error(`Method ${methodName} returned no result`)
      }

      // Parse the result and handle BigInt values
      let parsed: T
      try {
        parsed = JSON.parse(validatedResponse.result) as T
        // Basic validation: ensure parsed is not null/undefined
        if (parsed === null || parsed === undefined) {
          throw new Error('Parsed result is null or undefined')
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Parsed result is null')) {
          throw error
        }
        throw new Error(`Failed to parse result from ${methodName}: ${error instanceof Error ? error.message : String(error)}`)
      }
      
      // Runtime type validation based on method type
      if (methodName === 'getBalance' || methodName === 'getTokenBalance') {
        // Validate balance format
        if (typeof parsed !== 'string' || !/^\d+$/.test(parsed)) {
          throw new Error(`Invalid balance format: ${parsed}`)
        }
      }
      
      // Recursively convert BigInt values to strings to prevent serialization errors
      return convertBigIntToString(parsed) as T
    } catch (error) {
      handleServiceError(error, 'AccountService', `callAccountMethod:${methodName}`, {
        network,
        accountIndex,
        methodName,
      })
    }
  }

  /**
   * Call a method on a wallet account resolved by BIP relative derivation path
   * via worklet `callMethodByPath` → `wdk.getAccountByPath(network, path)`.
   *
   * Path is the wallet-relative BIP suffix (e.g. `"0'/0/0"` or `"9'/0/1"`),
   * not the full `m/86'/0'/…` path.
   *
   * @example
   * ```typescript
   * const address = await AccountService.callAccountMethodByPath(
   *   'bitcoin',
   *   "9'/0/0",
   *   'getAddress'
   * )
   * const scriptPubKeyHex = await AccountService.callAccountMethodByPath(
   *   'bitcoin',
   *   "9'/0/0",
   *   'getScriptPubKeyHex',
   *   address
   * )
   * ```
   */
  static async callAccountMethodByPath<T = unknown>(
    network: string,
    path: string,
    methodName: string,
    args?: unknown,
    walletId?: string
  ): Promise<T> {
    if (typeof methodName !== 'string' || methodName.trim().length === 0) {
      throw new Error('methodName must be a non-empty string')
    }
    if (typeof path !== 'string' || path.trim().length === 0) {
      throw new Error('path must be a non-empty string')
    }

    validateNetworkName(network)

    const hrpc = requireInitialized()

    if (typeof hrpc.callMethodByPath !== 'function') {
      throw new Error(
        'HRPC.callMethodByPath is not available — upgrade @spacesops/pear-wrk-wdk'
      )
    }

    let argsString: string | null = null
    if (args !== undefined && args !== null) {
      argsString = safeStringify(args)
    }

    const trimmedPath = path.trim()

    try {
      const response = await hrpc.callMethodByPath({
        methodName,
        network,
        path: trimmedPath,
        args: argsString,
      })

      const validatedResponse = workletResponseSchema.parse(response)

      // Some account methods (e.g. getTaprootKeyMaterialHex) intentionally return null
      if (validatedResponse.result === null || validatedResponse.result === undefined) {
        throw new Error(`Method ${methodName} returned no result`)
      }

      let parsed: T
      try {
        parsed = JSON.parse(validatedResponse.result) as T
      } catch (error) {
        throw new Error(
          `Failed to parse result from ${methodName}: ${error instanceof Error ? error.message : String(error)}`
        )
      }

      if (methodName === 'getBalance' || methodName === 'getTokenBalance') {
        if (typeof parsed !== 'string' || !/^\d+$/.test(parsed)) {
          throw new Error(`Invalid balance format: ${parsed}`)
        }
      }

      return convertBigIntToString(parsed) as T
    } catch (error) {
      handleServiceError(error, 'AccountService', `callAccountMethodByPath:${methodName}`, {
        network,
        path: trimmedPath,
        methodName,
        ...(walletId ? { walletId } : {}),
      })
    }
  }

  /**
   * Quote an on-chain hex-update transaction (no broadcast).
   *
   * `WalletAccountBtc` needs a live `priorAcct`; the worklet resolves
   * `priorAccountRelativePath` via `getAccountByPath` before calling the method.
   */
  static async quoteUpdateTransactionWithHexTX(
    network: string,
    fundingAccountIndex: number,
    options: UpdateTransactionWithHexOptions
  ): Promise<QuotedUpdateTransactionWithHex> {
    validateUpdateTransactionWithHexOptions(options)
    const result = await AccountService.callAccountMethod<
      { hex?: string; txHex?: string; fee?: string | number } | string
    >(network, fundingAccountIndex, 'quoteUpdateTransactionWithHexTX', options)

    const txHex =
      typeof result === 'string'
        ? result
        : result?.txHex || result?.hex || ''
    if (!txHex) {
      throw new Error('quoteUpdateTransactionWithHexTX returned no transaction hex')
    }
    const fee =
      typeof result === 'object' && result?.fee != null ? String(result.fee) : undefined
    return fee != null ? { txHex, fee } : { txHex }
  }

  /**
   * Build, sign, and broadcast an on-chain hex-update transaction.
   * Same prior-account resolution as {@link quoteUpdateTransactionWithHexTX}.
   */
  static async updateTransactionWithHex(
    network: string,
    fundingAccountIndex: number,
    options: UpdateTransactionWithHexOptions
  ): Promise<{ hash: string; fee: string }> {
    validateUpdateTransactionWithHexOptions(options)
    const result = await AccountService.callAccountMethod<{
      hash?: string
      fee?: string | number
    }>(network, fundingAccountIndex, 'updateTransactionWithHex', options)

    const hash = result?.hash ? String(result.hash) : ''
    if (!hash) {
      throw new Error('updateTransactionWithHex returned no transaction hash')
    }
    return { hash, fee: result?.fee != null ? String(result.fee) : '0' }
  }

  /**
   * Batch-derive Taproot addresses / scriptPubKeys (optional key material)
   * for wallet-relative BIP path suffixes. Runs inside the worklet via
   * `wdk.getAccountByPath` so Find Spaces / path reservation is one HRPC round-trip.
   */
  static async deriveTaprootAddressesFromPaths(
    relativePaths: string[],
    options?: { network?: string; includeKeyMaterial?: boolean }
  ): Promise<{ addressesJson: string }> {
    if (!Array.isArray(relativePaths) || relativePaths.length === 0) {
      throw new Error('relativePaths must be a non-empty array of path suffix strings')
    }
    const trimmed = relativePaths.map((rel) => {
      if (typeof rel !== 'string' || rel.trim().length === 0) {
        throw new Error('Each relative path must be a non-empty string')
      }
      return rel.trim()
    })

    const network = options?.network?.trim() || 'bitcoin'
    validateNetworkName(network)

    const hrpc = requireInitialized() as {
      deriveTaprootAddressesFromPaths?: (args: {
        relativePathsJson: string
        network?: string
        includeKeyMaterial?: number
      }) => Promise<{ addressesJson?: string | null }>
    }

    if (typeof hrpc.deriveTaprootAddressesFromPaths !== 'function') {
      throw new Error(
        'HRPC.deriveTaprootAddressesFromPaths is not available — upgrade @spacesops/pear-wrk-wdk'
      )
    }

    try {
      const response = await hrpc.deriveTaprootAddressesFromPaths({
        relativePathsJson: JSON.stringify(trimmed),
        network,
        ...(options?.includeKeyMaterial ? { includeKeyMaterial: 1 } : {}),
      })
      const addressesJson = response?.addressesJson
      if (typeof addressesJson !== 'string' || addressesJson.length === 0) {
        throw new Error('deriveTaprootAddressesFromPaths returned no addressesJson')
      }
      return { addressesJson }
    } catch (error) {
      handleServiceError(error, 'AccountService', 'deriveTaprootAddressesFromPaths', {
        network,
        pathCount: trimmed.length,
      })
    }
  }
}

export type UpdateTransactionWithHexOptions = {
  to: string
  hex: string
  priorTx: string
  /** BIP relative path resolved inside the worklet via `getAccountByPath`. */
  priorAccountRelativePath: string
  value?: string | number
  feeRate?: string | number
  confirmationTarget?: number
}

export type QuotedUpdateTransactionWithHex = {
  txHex: string
  fee?: string
}

export type DerivedTaprootAddressEntry = {
  address: string
  scriptPubKeyHex: string
  internalPubKeyHex?: string
  privateKeyHex?: string
  tweakedPrivateKeyHex?: string
}

function validateUpdateTransactionWithHexOptions(
  options: UpdateTransactionWithHexOptions
): void {
  if (!options || typeof options !== 'object') {
    throw new Error('options must be an object')
  }
  if (typeof options.to !== 'string' || options.to.trim().length === 0) {
    throw new Error('options.to must be a non-empty string')
  }
  if (typeof options.hex !== 'string' || options.hex.trim().length === 0) {
    throw new Error('options.hex must be a non-empty string')
  }
  if (typeof options.priorTx !== 'string' || options.priorTx.trim().length === 0) {
    throw new Error('options.priorTx must be a non-empty string')
  }
  if (
    typeof options.priorAccountRelativePath !== 'string' ||
    options.priorAccountRelativePath.trim().length === 0
  ) {
    throw new Error('options.priorAccountRelativePath must be a non-empty string')
  }
}

