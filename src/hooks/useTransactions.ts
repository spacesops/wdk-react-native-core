/**
 * Transaction hooks with TanStack Query
 *
 * Fetches wallet activity from the WDK Indexer (token-transfers per network/token/address).
 * Requires indexerConfig on WdkAppProvider (typically from EXPO_PUBLIC_WDK_INDEXER_* in the app).
 */

import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'

import { TransactionService } from '../services/transactionService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { isIndexerConfigured } from '../store/indexerConfigStore'
import { resolveWalletId } from '../utils/storeHelpers'
import {
  DEFAULT_QUERY_GC_TIME_MS,
  DEFAULT_QUERY_STALE_TIME_MS,
} from '../utils/constants'
import type { TokenConfigProvider, WalletTransaction } from '../types'

export interface WalletTransactionsQueryOptions {
  enabled?: boolean
  staleTime?: number
  refetchInterval?: number | false
  walletId?: string
}

export const transactionQueryKeys = {
  all: ['transactions'] as const,
  byWallet: (walletId: string, accountIndex: number) =>
    ['transactions', 'wallet', walletId, accountIndex] as const,
}

function resolveTokenConfigs(tokenConfigs: TokenConfigProvider) {
  return typeof tokenConfigs === 'function' ? tokenConfigs() : tokenConfigs
}

function addressesFingerprint(
  addresses: Record<string, Record<number, string>>,
  accountIndex: number
): string {
  const parts: string[] = []
  for (const network of Object.keys(addresses).sort()) {
    const address = addresses[network]?.[accountIndex]
    if (address) {
      parts.push(`${network}:${address.toLowerCase()}`)
    }
  }
  return parts.join('|')
}

async function fetchWalletTransactionsForAccount(
  walletId: string,
  accountIndex: number,
  tokenConfigs: TokenConfigProvider
): Promise<WalletTransaction[]> {
  const walletStore = getWalletStore()
  const addresses = walletStore.getState().addresses[walletId] ?? {}

  return TransactionService.resolveWalletTransactions({
    addresses,
    accountIndex,
    tokenConfigs: resolveTokenConfigs(tokenConfigs),
  })
}

/**
 * Fetch aggregated wallet transactions from the WDK Indexer.
 */
export function useWalletTransactions(
  accountIndex: number,
  tokenConfigs: TokenConfigProvider,
  options?: WalletTransactionsQueryOptions
) {
  const workletStore = getWorkletStore()
  const walletStore = getWalletStore()
  const isInitialized = workletStore.getState().isInitialized
  const walletId = resolveWalletId(options?.walletId)
  const addresses = walletStore(
    useShallow((state) => state.addresses[walletId] ?? {})
  )
  const addressKey = addressesFingerprint(addresses, accountIndex)
  const indexerReady = isIndexerConfigured()

  return useQuery({
    queryKey: [...transactionQueryKeys.byWallet(walletId, accountIndex), addressKey],
    queryFn: () => fetchWalletTransactionsForAccount(walletId, accountIndex, tokenConfigs),
    enabled:
      (options?.enabled !== false) &&
      isInitialized &&
      indexerReady &&
      addressKey.length > 0,
    staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    refetchInterval: options?.refetchInterval,
  })
}
