/**
 * Transaction hooks with TanStack Query
 *
 * Fetches wallet activity from the WDK Indexer (token-transfers per network/token/address).
 * Requires indexerConfig on WdkAppProvider (typically from EXPO_PUBLIC_WDK_INDEXER_* in the app).
 */

import { useQuery } from '@tanstack/react-query'
import { useShallow } from 'zustand/react/shallow'

import { AddressService } from '../services/addressService'
import { TransactionService } from '../services/transactionService'
import { getWalletStore } from '../store/walletStore'
import { getWorkletStore } from '../store/workletStore'
import { isIndexerConfigured } from '../store/indexerConfigStore'
import { resolveWalletId } from '../utils/storeHelpers'
import { logWarn } from '../utils/logger'
import {
  DEFAULT_QUERY_GC_TIME_MS,
  DEFAULT_QUERY_STALE_TIME_MS,
} from '../utils/constants'
import type { TokenConfigProvider, TokenConfigs, WalletTransaction } from '../types'

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
  accountIndex: number,
  tokenConfigs: TokenConfigs
): string {
  const parts: string[] = []
  for (const network of Object.keys(tokenConfigs).sort()) {
    if (!tokenConfigs[network]?.indexerBlockchain) {
      continue
    }
    const address = addresses[network]?.[accountIndex]
    if (address) {
      parts.push(`${network}:${address.toLowerCase()}`)
    }
  }
  return parts.join('|')
}

async function ensureIndexerAddresses(
  walletId: string,
  accountIndex: number,
  tokenConfigs: TokenConfigs
): Promise<void> {
  for (const [network, networkTokens] of Object.entries(tokenConfigs)) {
    if (!networkTokens.indexerBlockchain) {
      continue
    }

    const walletStore = getWalletStore()
    const cached = walletStore.getState().addresses[walletId]?.[network]?.[accountIndex]
    if (cached) {
      continue
    }

    try {
      await AddressService.getAddress(network, accountIndex, walletId)
    } catch (error) {
      logWarn(
        `[useWalletTransactions] Could not resolve ${network} address for wallet ${walletId}:`,
        error
      )
    }
  }
}

async function fetchWalletTransactionsForAccount(
  walletId: string,
  accountIndex: number,
  tokenConfigs: TokenConfigProvider
): Promise<WalletTransaction[]> {
  const configs = resolveTokenConfigs(tokenConfigs)
  await ensureIndexerAddresses(walletId, accountIndex, configs)

  const walletStore = getWalletStore()
  const addresses = walletStore.getState().addresses[walletId] ?? {}

  return TransactionService.resolveWalletTransactions({
    addresses,
    accountIndex,
    tokenConfigs: configs,
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
  const tokenConfigsObj = resolveTokenConfigs(tokenConfigs)
  const addresses = walletStore(
    useShallow((state) => state.addresses[walletId] ?? {})
  )
  const addressKey = addressesFingerprint(addresses, accountIndex, tokenConfigsObj)
  const indexerReady = isIndexerConfigured()
  const hasIndexerNetworks = Object.values(tokenConfigsObj).some(
    (networkTokens) => Boolean(networkTokens?.indexerBlockchain)
  )

  return useQuery({
    queryKey: [...transactionQueryKeys.byWallet(walletId, accountIndex), addressKey],
    queryFn: () => fetchWalletTransactionsForAccount(walletId, accountIndex, tokenConfigs),
    enabled:
      (options?.enabled !== false) &&
      isInitialized &&
      indexerReady &&
      hasIndexerNetworks,
    staleTime: options?.staleTime ?? DEFAULT_QUERY_STALE_TIME_MS,
    gcTime: DEFAULT_QUERY_GC_TIME_MS,
    refetchInterval: options?.refetchInterval,
  })
}
