/**
 * Runtime WDK Indexer configuration (set by WdkAppProvider from app env).
 */

import type { IndexerConfig } from '../types'

let indexerConfig: IndexerConfig | null = null

export function setIndexerConfig(config: IndexerConfig | null): void {
  indexerConfig = config
}

export function getIndexerConfig(): IndexerConfig | null {
  return indexerConfig
}

export function isIndexerConfigured(): boolean {
  return Boolean(indexerConfig?.baseUrl && indexerConfig?.apiKey)
}
