/**
 * Transaction Service
 *
 * Fetches wallet transaction history from the WDK Indexer API.
 * Endpoint: GET /api/v1/{network}/{token}/{address}/token-transfers
 */

import { getIndexerConfig } from '../store/indexerConfigStore'
import { BALANCE_FETCH_INTRA_NETWORK_STAGGER_MS, BALANCE_FETCH_STAGGER_MS } from '../utils/constants'
import { logError, logWarn } from '../utils/logger'
import { delay, withTransientRetry } from '../utils/retryUtils'
import type { IndexerTokenTransfersResponse, TokenConfig, TokenConfigs, WalletTransaction } from '../types'

export interface FetchWalletTransactionsParams {
  addresses: Record<string, Record<number, string>>
  accountIndex: number
  tokenConfigs: TokenConfigs
}

function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '')
}

/**
 * Resolve the WDK Indexer `{token}` path segment, or null when this asset has no indexer history.
 *
 * The indexer only tracks select assets (e.g. `usdt`, `xaut`, `btc`). Native EVM gas tokens
 * (`eth`, `matic`, …) are not valid and return 400 if requested.
 */
function indexerTokenSlugFromConfig(token: TokenConfig): string | null {
  if (token.indexerToken) {
    return token.indexerToken.toLowerCase()
  }

  if (token.address !== null) {
    return token.symbol.toLowerCase()
  }

  // Native: only Bitcoin is indexed under `btc` today.
  if (token.symbol.toLowerCase() === 'btc') {
    return 'btc'
  }

  return null
}

function transactionDedupeKey(tx: WalletTransaction): string {
  return [
    tx.blockchain,
    tx.transactionHash,
    tx.token,
    tx.transferIndex ?? '',
    tx.logIndex ?? '',
    tx.from,
    tx.to,
    tx.amount,
  ].join('|')
}

function parseIndexerTransfers(payload: unknown): WalletTransaction[] {
  if (!payload || typeof payload !== 'object') {
    return []
  }
  const transfers = (payload as IndexerTokenTransfersResponse).transfers
  if (!Array.isArray(transfers)) {
    return []
  }

  const parsed: WalletTransaction[] = []
  for (const item of transfers) {
    if (!item || typeof item !== 'object') continue
    const tx = item as Partial<WalletTransaction>
    if (
      typeof tx.transactionHash !== 'string' ||
      typeof tx.token !== 'string' ||
      typeof tx.amount !== 'string' ||
      typeof tx.timestamp !== 'number' ||
      typeof tx.from !== 'string' ||
      typeof tx.to !== 'string'
    ) {
      continue
    }
    parsed.push({
      blockchain: typeof tx.blockchain === 'string' ? tx.blockchain : '',
      blockNumber: typeof tx.blockNumber === 'number' ? tx.blockNumber : undefined,
      transactionHash: tx.transactionHash,
      transferIndex: typeof tx.transferIndex === 'number' ? tx.transferIndex : undefined,
      token: tx.token.toLowerCase(),
      amount: tx.amount,
      timestamp: tx.timestamp,
      transactionIndex: typeof tx.transactionIndex === 'number' ? tx.transactionIndex : undefined,
      logIndex: typeof tx.logIndex === 'number' ? tx.logIndex : undefined,
      from: tx.from,
      to: tx.to,
      label: typeof tx.label === 'string' ? tx.label : undefined,
    })
  }
  return parsed
}

export class TransactionService {
  /**
   * Fetch token transfers for one network/token/address from the indexer.
   */
  static async fetchTokenTransfers(
    network: string,
    tokenSlug: string,
    address: string
  ): Promise<WalletTransaction[]> {
    const config = getIndexerConfig()
    if (!config?.baseUrl || !config.apiKey) {
      throw new Error('WDK Indexer is not configured')
    }

    const url = `${normalizeBaseUrl(config.baseUrl)}/api/v1/${encodeURIComponent(network)}/${encodeURIComponent(tokenSlug)}/${encodeURIComponent(address)}/token-transfers`

    const response = await withTransientRetry(
      async () => {
        const res = await fetch(url, {
          method: 'GET',
          headers: {
            'x-api-key': config.apiKey,
            Accept: 'application/json',
          },
        })

        if (res.status === 404) {
          return { ok: true as const, transfers: [] as WalletTransaction[] }
        }

        if (!res.ok) {
          const text = await res.text().catch(() => '')
          throw new Error(
            `Indexer token-transfers failed (${res.status}) for ${network}/${tokenSlug}: ${text.slice(0, 200)}`
          )
        }

        const json: unknown = await res.json()
        return { ok: true as const, transfers: parseIndexerTransfers(json) }
      },
      { label: `${network}/${tokenSlug} token-transfers` }
    )

    return response.transfers
  }

  /**
   * Fetch transfers for all configured networks/tokens for one account index.
   */
  static async fetchWalletTransactions(
    params: FetchWalletTransactionsParams
  ): Promise<WalletTransaction[]> {
    const { addresses, accountIndex, tokenConfigs } = params
    const networks = Object.keys(tokenConfigs)
    const deduped = new Map<string, WalletTransaction>()
    let isFirstNetwork = true

    for (const network of networks) {
      const networkTokens = tokenConfigs[network]
      const indexerBlockchain = networkTokens?.indexerBlockchain
      if (!indexerBlockchain) {
        continue
      }

      const address = addresses[network]?.[accountIndex]
      if (!address) {
        continue
      }

      if (!isFirstNetwork) {
        await delay(BALANCE_FETCH_STAGGER_MS)
      }
      isFirstNetwork = false

      const tokens = [networkTokens.native, ...networkTokens.tokens]
      for (let i = 0; i < tokens.length; i++) {
        const token = tokens[i]
        if (!token) continue
        if (i > 0) {
          await delay(BALANCE_FETCH_INTRA_NETWORK_STAGGER_MS)
        }

        const tokenSlug = indexerTokenSlugFromConfig(token)
        if (!tokenSlug) {
          continue
        }
        try {
          const transfers = await this.fetchTokenTransfers(
            indexerBlockchain,
            tokenSlug,
            address
          )
          for (const tx of transfers) {
            const withBlockchain = tx.blockchain
              ? tx
              : { ...tx, blockchain: network }
            deduped.set(transactionDedupeKey(withBlockchain), withBlockchain)
          }
        } catch (error) {
          logError(
            `Failed to fetch token transfers for ${indexerBlockchain}/${tokenSlug}:`,
            error
          )
        }
      }
    }

    return Array.from(deduped.values()).sort((a, b) => b.timestamp - a.timestamp)
  }

  /**
   * Resolve wallet transactions (alias for fetchWalletTransactions).
   * Matches the legacy resolveWalletTransactions name used by consuming apps.
   */
  static async resolveWalletTransactions(
    params: FetchWalletTransactionsParams
  ): Promise<WalletTransaction[]> {
    if (!getIndexerConfig()) {
      logWarn('[TransactionService] Indexer not configured — returning empty transaction list')
      return []
    }
    return this.fetchWalletTransactions(params)
  }
}
