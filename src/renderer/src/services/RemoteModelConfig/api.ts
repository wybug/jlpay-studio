/**
 * Remote Model Configuration API
 *
 * Handles HTTP requests to the remote model configuration service.
 */

import { buildApiUrl, REMOTE_CONFIG_API } from './constants'
import type {
  RemoteConfigError,
  RemoteConfigErrorCode,
  RemoteConfigHealthResponse,
  RemoteModelConfigResponse
} from './types'

/**
 * Sleep for a specified duration (used for retry delays).
 */
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * Determine if an error is a network error (should retry).
 */
const isNetworkError = (error: unknown): boolean => {
  if (error instanceof TypeError) {
    // Network errors (CORS, connection refused, etc.) are TypeErrors
    return true
  }
  if (error instanceof Error) {
    const message = error.message.toLowerCase()
    return message.includes('network') || message.includes('fetch') || message.includes('connection')
  }
  return false
}

/**
 * Create a RemoteConfigError object from an error.
 */
const createConfigError = (code: RemoteConfigErrorCode, message: string): RemoteConfigError => ({
  code,
  message
})

/**
 * Convert snake_case string to camelCase
 */
const toCamelCase = (str: string): string => {
  return str.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase())
}

/**
 * Recursively convert object keys from snake_case to camelCase
 * Server returns snake_case, client uses camelCase for compatibility with database types
 */
const convertKeysToCamelCase = <T>(obj: any): T => {
  if (obj === null || obj === undefined) return obj
  if (Array.isArray(obj)) return obj.map((item) => convertKeysToCamelCase(item)) as any
  if (typeof obj !== 'object') return obj

  return Object.entries(obj).reduce((acc, [key, value]) => {
    const camelKey = toCamelCase(key)
    acc[camelKey] = convertKeysToCamelCase(value)
    return acc
  }, {} as any)
}

/**
 * Make a fetch request with timeout.
 */
const fetchWithTimeout = async (url: string, timeout: number): Promise<Response> => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json'
      }
    })
    clearTimeout(timeoutId)
    return response
  } catch (error) {
    clearTimeout(timeoutId)
    throw error
  }
}

/**
 * Fetch model configuration from the remote server with retry logic.
 *
 * @param brand - Brand identifier
 * @param version - Client version (optional)
 * @returns Promise resolving to the configuration response
 */
export const fetchRemoteModelConfig = async (brand: string, version?: string): Promise<RemoteModelConfigResponse> => {
  const url = buildApiUrl(REMOTE_CONFIG_API.endpoints.getConfig, {
    brand,
    ...(version && { version })
  })

  let lastError: Error | null = null

  // Retry loop
  for (let attempt = 1; attempt <= REMOTE_CONFIG_API.retryAttempts; attempt++) {
    try {
      const response = await fetchWithTimeout(url, REMOTE_CONFIG_API.timeout)

      if (!response.ok) {
        // Non-retryable HTTP errors
        if (response.status === 404) {
          return {
            success: false,
            error: createConfigError('CONFIG_NOT_FOUND', `Configuration not found for brand: ${brand}`)
          }
        }
        if (response.status === 400) {
          return {
            success: false,
            error: createConfigError('INVALID_BRAND', `Invalid brand identifier: ${brand}`)
          }
        }
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const text = await response.text()
      let data: any

      try {
        data = JSON.parse(text)
      } catch {
        return {
          success: false,
          error: createConfigError('PARSE_ERROR', 'Failed to parse response JSON')
        }
      }

      // Validate response structure
      if (typeof data !== 'object' || data === null) {
        return {
          success: false,
          error: createConfigError('PARSE_ERROR', 'Invalid response format')
        }
      }

      // Convert server response (snake_case) to client format (camelCase)
      // Server uses snake_case (api_host, is_system, etc.) but client types use camelCase
      // to maintain compatibility with existing database/provider types
      if (data.success && data.data) {
        data.data = convertKeysToCamelCase(data.data)
      }

      return data as RemoteModelConfigResponse
    } catch (error) {
      lastError = error as Error

      // Don't retry on network errors for the last attempt
      if (attempt < REMOTE_CONFIG_API.retryAttempts && isNetworkError(error)) {
        await sleep(REMOTE_CONFIG_API.retryDelay * attempt)
        continue
      }

      // Don't retry on non-network errors
      if (!isNetworkError(error)) {
        break
      }
    }
  }

  // All retries exhausted
  return {
    success: false,
    error: createConfigError(
      'NETWORK_ERROR',
      lastError?.message || 'Failed to fetch configuration after multiple attempts'
    )
  }
}

/**
 * Fetch health check from the remote server.
 *
 * @returns Promise resolving to the health check response
 */
export const fetchRemoteConfigHealth = async (): Promise<RemoteConfigHealthResponse> => {
  try {
    const url = buildApiUrl(REMOTE_CONFIG_API.endpoints.health)
    const response = await fetchWithTimeout(url, REMOTE_CONFIG_API.timeout)

    if (!response.ok) {
      return {
        success: false,
        error: createConfigError('SERVICE_UNAVAILABLE', `Health check failed: ${response.statusText}`)
      }
    }

    const data = (await response.json()) as RemoteConfigHealthResponse
    // Convert server response (snake_case) to client format (camelCase)
    if (data.success && data.data) {
      data.data = convertKeysToCamelCase(data.data)
    }
    return data
  } catch (error) {
    return {
      success: false,
      error: createConfigError('NETWORK_ERROR', error instanceof Error ? error.message : 'Health check failed')
    }
  }
}
