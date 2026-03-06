/**
 * Remote Model Configuration Service Constants
 *
 * Configuration constants for the remote model config service.
 */

import { BUILD_CONSTANTS } from '@shared/build-constants'

// API endpoints
const CONFIG_ENDPOINTS = {
  getConfig: '/api/v1/models/config',
  health: '/api/v1/models/config/health'
} as const

// Service configuration
const CONFIG_TIMEOUT = 10000 // 10 seconds
const CONFIG_RETRY_ATTEMPTS = 3
const CONFIG_RETRY_DELAY = 1000 // 1 second between retries
const CACHE_EXPIRY_MS = 24 * 60 * 60 * 1000 // 24 hours

// Storage keys
const STORAGE_KEYS = {
  CACHE: 'remote_model_config_cache',
  LAST_FETCH: 'remote_model_config_last_fetch',
  VERSION: 'remote_model_config_version'
} as const

/**
 * Base URL for the remote model config API.
 * Falls back to UPDATE_SERVER_URL if MODEL_CONFIG_URL is not set.
 */
export const BASE_URL = BUILD_CONSTANTS.MODEL_CONFIG_URL || BUILD_CONSTANTS.UPDATE_SERVER_URL || ''

/**
 * Complete API endpoints configuration
 */
export const REMOTE_CONFIG_API = {
  baseURL: BASE_URL,
  endpoints: CONFIG_ENDPOINTS,
  timeout: CONFIG_TIMEOUT,
  retryAttempts: CONFIG_RETRY_ATTEMPTS,
  retryDelay: CONFIG_RETRY_DELAY,
  cacheExpiry: CACHE_EXPIRY_MS,
  storageKeys: STORAGE_KEYS
} as const

/**
 * Check if remote model config is enabled for this build.
 * Requires:
 * 1. Custom build mode (IS_CUSTOM_BUILD = true)
 * 2. Base URL configured (UPDATE_SERVER_URL or MODEL_CONFIG_URL)
 * 3. Brand is not 'jlpay' (jlpay brand uses local config only)
 */
export const isRemoteConfigEnabled = BUILD_CONSTANTS.IS_CUSTOM_BUILD && !!BASE_URL

/**
 * Get the brand identifier for this build.
 */
export const getBrandIdentifier = (): string => {
  return BUILD_CONSTANTS.BUILD_BRAND || 'default'
}

/**
 * Build the full URL for an API endpoint.
 */
export const buildApiUrl = (endpoint: string, params?: Record<string, string>): string => {
  const url = new URL(endpoint, BASE_URL)
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value)
    })
  }
  return url.toString()
}
