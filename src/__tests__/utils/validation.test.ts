/**
 * Tests for validation utilities
 */

import {
  validateNetworkConfigs,
  validateTokenConfigs,
  validateBalanceRefreshInterval,
  validateRequiredMethods,
  validateAccountIndex,
  validateNetworkName,
  validateTokenAddress,
  validateBalance,
} from '../../utils/validation'
import type { NetworkConfigs, TokenConfigs } from '../../types'

describe('validation', () => {
  describe('validateNetworkConfigs', () => {
    it('should not throw for valid network configs', () => {
      const validConfigs: NetworkConfigs = {
        ethereum: {
          chainId: 1,
          blockchain: 'ethereum',
        },
      }
      expect(() => validateNetworkConfigs(validConfigs)).not.toThrow()
    })

    it('should throw for invalid network configs', () => {
      expect(() => validateNetworkConfigs({} as NetworkConfigs)).toThrow()
      expect(() => validateNetworkConfigs(null as unknown as NetworkConfigs)).toThrow()
      expect(() => validateNetworkConfigs([] as unknown as NetworkConfigs)).toThrow()
    })
  })

  describe('validateTokenConfigs', () => {
    it('should not throw for valid token configs', () => {
      const validConfigs: TokenConfigs = {
        ethereum: {
          native: {
            symbol: 'ETH',
            name: 'Ethereum',
            decimals: 18,
            address: null,
          },
          tokens: [],
        },
      }
      expect(() => validateTokenConfigs(validConfigs)).not.toThrow()
    })

    it('should accept non-EVM token contract addresses', () => {
      const configs: TokenConfigs = {
        ton: {
          native: { symbol: 'TON', name: 'Toncoin', decimals: 9, address: null },
          tokens: [
            {
              address: 'EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs',
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: 6,
            },
          ],
        },
        tron: {
          native: { symbol: 'TRX', name: 'TRON', decimals: 6, address: null },
          tokens: [
            {
              address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t',
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: 6,
            },
          ],
        },
        solana: {
          native: { symbol: 'SOL', name: 'Solana', decimals: 9, address: null },
          tokens: [
            {
              address: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
              symbol: 'USDT',
              name: 'Tether USD',
              decimals: 6,
            },
          ],
        },
      }
      expect(() => validateTokenConfigs(configs)).not.toThrow()
    })

    it('should throw for invalid token configs', () => {
      expect(() => validateTokenConfigs({} as TokenConfigs)).toThrow()
      expect(() => validateTokenConfigs(null as unknown as TokenConfigs)).toThrow()
      expect(() => validateTokenConfigs([] as unknown as TokenConfigs)).toThrow()
    })
  })

  describe('validateBalanceRefreshInterval', () => {
    it('should not throw for valid intervals', () => {
      expect(() => validateBalanceRefreshInterval(0)).not.toThrow()
      expect(() => validateBalanceRefreshInterval(1000)).not.toThrow()
      expect(() => validateBalanceRefreshInterval(undefined)).not.toThrow()
    })

    it('should throw for invalid intervals', () => {
      expect(() => validateBalanceRefreshInterval(-1)).toThrow()
      expect(() => validateBalanceRefreshInterval(NaN)).toThrow()
      expect(() => validateBalanceRefreshInterval(Infinity)).toThrow()
      expect(() => validateBalanceRefreshInterval('1000' as unknown as number)).toThrow()
    })
  })

  describe('validateRequiredMethods', () => {
    it('should not throw for object with required methods', () => {
      const obj = {
        method1: jest.fn(),
        method2: jest.fn(),
      }
      expect(() => validateRequiredMethods(obj, ['method1', 'method2'], 'TestObject')).not.toThrow()
    })

    it('should throw for object without required methods', () => {
      const obj = {
        method1: jest.fn(),
      }
      expect(() => validateRequiredMethods(obj, ['method1', 'method2'], 'TestObject')).toThrow()
      expect(() => validateRequiredMethods(null, ['method1'], 'TestObject')).toThrow()
      expect(() => validateRequiredMethods('string', ['method1'], 'TestObject')).toThrow()
    })
  })

  describe('validateAccountIndex', () => {
    it('should not throw for valid account indices', () => {
      expect(() => validateAccountIndex(0)).not.toThrow()
      expect(() => validateAccountIndex(1)).not.toThrow()
      expect(() => validateAccountIndex(100)).not.toThrow()
    })

    it('should throw for invalid account indices', () => {
      expect(() => validateAccountIndex(-1)).toThrow()
      expect(() => validateAccountIndex(1.5)).toThrow()
      expect(() => validateAccountIndex(NaN)).toThrow()
    })
  })

  describe('validateNetworkName', () => {
    it('should not throw for valid network names', () => {
      expect(() => validateNetworkName('ethereum')).not.toThrow()
      expect(() => validateNetworkName('polygon-mainnet')).not.toThrow()
      expect(() => validateNetworkName('network_1')).not.toThrow()
    })

    it('should throw for invalid network names', () => {
      expect(() => validateNetworkName('')).toThrow()
      expect(() => validateNetworkName('  ')).toThrow()
      expect(() => validateNetworkName('network with spaces')).toThrow()
      expect(() => validateNetworkName('network@invalid')).toThrow()
    })
  })

  describe('validateTokenAddress', () => {
    it('should not throw for valid token addresses', () => {
      expect(() => validateTokenAddress(null)).not.toThrow()
      expect(() => validateTokenAddress('0x1234567890123456789012345678901234567890')).not.toThrow()
      expect(() => validateTokenAddress('0xABCDEFabcdef1234567890123456789012345678')).not.toThrow()
      expect(() => validateTokenAddress('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).not.toThrow()
      expect(() => validateTokenAddress('Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB')).not.toThrow()
      expect(() => validateTokenAddress('EQCxE6mUtQJKFnGfaROTKOt1lZbDiiX1kCixRv7Nw2Id_sDs')).not.toThrow()
    })

    it('should throw for invalid token addresses', () => {
      expect(() => validateTokenAddress('invalid')).toThrow()
      expect(() => validateTokenAddress('0x123')).toThrow()
      expect(() => validateTokenAddress('0x123456789012345678901234567890123456789')).toThrow()
      expect(() => validateTokenAddress('')).toThrow()
    })
  })

  describe('validateBalance', () => {
    it('should not throw for valid balances', () => {
      expect(() => validateBalance('0')).not.toThrow()
      expect(() => validateBalance('100')).not.toThrow()
      expect(() => validateBalance('100.5')).not.toThrow()
      expect(() => validateBalance('-100')).not.toThrow()
    })

    it('should throw for invalid balances', () => {
      expect(() => validateBalance('')).toThrow()
      expect(() => validateBalance('abc')).toThrow()
      expect(() => validateBalance('100.5.5')).toThrow()
      expect(() => validateBalance('100a')).toThrow()
    })
  })
})
