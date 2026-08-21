/**
 * Tests for TransactionService
 */

import { setIndexerConfig } from '../../store/indexerConfigStore'
import { TransactionService } from '../../services/transactionService'

const mockFetch = jest.fn()
global.fetch = mockFetch as typeof fetch

describe('TransactionService', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    setIndexerConfig({
      baseUrl: 'https://wdk-api.tether.io',
      apiKey: 'test-api-key',
    })
  })

  afterEach(() => {
    setIndexerConfig(null)
  })

  it('fetches and parses token transfers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        transfers: [
          {
            blockchain: 'ethereum',
            transactionHash: '0xabc',
            token: 'xaut',
            amount: '1.5',
            timestamp: 1700000000,
            from: '0xfrom',
            to: '0xto',
          },
        ],
      }),
    })

    const transfers = await TransactionService.fetchTokenTransfers(
      'ethereum',
      'xaut',
      '0xWallet'
    )

    expect(mockFetch).toHaveBeenCalledWith(
      'https://wdk-api.tether.io/api/v1/ethereum/xaut/0xWallet/token-transfers',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          'x-api-key': 'test-api-key',
        }),
      })
    )
    expect(transfers).toHaveLength(1)
    expect(transfers[0].token).toBe('xaut')
    expect(transfers[0].amount).toBe('1.5')
  })

  it('returns empty list on 404', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'not found',
    })

    const transfers = await TransactionService.fetchTokenTransfers(
      'ethereum',
      'usdt',
      '0xWallet'
    )
    expect(transfers).toEqual([])
  })

  it('aggregates transfers across networks and dedupes', async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ transfers: [] }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          transfers: [
            {
              blockchain: 'ethereum',
              transactionHash: '0x1',
              token: 'usdt',
              amount: '10',
              timestamp: 100,
              from: '0xa',
              to: '0xb',
            },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          transfers: [
            {
              blockchain: 'ethereum',
              transactionHash: '0x2',
              token: 'xaut',
              amount: '0.5',
              timestamp: 200,
              from: '0xc',
              to: '0xd',
            },
          ],
        }),
      })

    const tokenConfigs = {
      ethereum: {
        indexerBlockchain: 'ethereum',
        native: { address: null, symbol: 'ETH', name: 'Ethereum', decimals: 18 },
        tokens: [
          {
            address: '0xusdt',
            symbol: 'USDT',
            name: 'Tether USD',
            decimals: 6,
          },
          {
            address: '0xxaut',
            symbol: 'XAUT',
            name: 'Tether Gold',
            decimals: 6,
          },
        ],
      },
    }

    const list = await TransactionService.fetchWalletTransactions({
      addresses: { ethereum: { 0: '0xWallet' } },
      accountIndex: 0,
      tokenConfigs,
    })

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(list).toHaveLength(2)
    expect(list[0].transactionHash).toBe('0x2')
    expect(list[1].transactionHash).toBe('0x1')
  })

  it('skips networks without indexerBlockchain configured', async () => {
    await TransactionService.fetchWalletTransactions({
      addresses: { solana: { 0: 'SolWallet' } },
      accountIndex: 0,
      tokenConfigs: {
        solana: {
          native: { address: null, symbol: 'SOL', name: 'Solana', decimals: 9 },
          tokens: [
            {
              address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: 6,
            },
          ],
        },
      },
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('skips native gas tokens that the indexer does not track', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ transfers: [] }),
    })

    await TransactionService.fetchWalletTransactions({
      addresses: { ethereum: { 0: '0xWallet' } },
      accountIndex: 0,
      tokenConfigs: {
        ethereum: {
          indexerBlockchain: 'ethereum',
          native: { address: null, symbol: 'ETH', name: 'Ethereum', decimals: 18 },
          tokens: [],
        },
      },
    })

    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('resolveWalletTransactions returns empty when indexer not configured', async () => {
    setIndexerConfig(null)
    const list = await TransactionService.resolveWalletTransactions({
      addresses: { ethereum: { 0: '0xWallet' } },
      accountIndex: 0,
      tokenConfigs: {
        ethereum: {
          indexerBlockchain: 'ethereum',
          native: { address: null, symbol: 'ETH', name: 'Ethereum', decimals: 18 },
          tokens: [],
        },
      },
    })
    expect(list).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
