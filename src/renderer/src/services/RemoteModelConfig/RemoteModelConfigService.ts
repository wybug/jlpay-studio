/**
 * Remote Model Configuration Service
 *
 * Singleton service that manages remote model configuration.
 * Handles fetching, caching, and applying remote model configuration.
 */

import { loggerService } from '@logger'
import type { AppDispatch } from '@renderer/store'
import { setDefaultModel, setQuickModel, setTranslateModel, updateProviders } from '@renderer/store/llm'
import type { Model, Provider } from '@types'

import { fetchRemoteModelConfig } from './api'
import { BASE_URL, getBrandIdentifier, isRemoteConfigEnabled, REMOTE_CONFIG_API } from './constants'
import type { RemoteConfigCache, RemoteConfigServiceState, RemoteModelConfigData } from './types'
import { RemoteConfigStatus } from './types'

const logger = loggerService.withContext('RemoteModelConfigService')

/**
 * Convert remote provider to local Provider type
 */
const convertRemoteProvider = (remoteProvider: any): Provider => {
  // Determine anthropicApiHost based on provider type
  let anthropicApiHost = remoteProvider.anthropicApiHost

  // For OpenAI-compatible providers, set anthropicApiHost if not specified
  // This is needed for ClaudeCode service compatibility
  if (!anthropicApiHost && remoteProvider.apiHost) {
    if (remoteProvider.id === 'deepseek') {
      // DeepSeek uses /anthropic path for Anthropic API compatibility
      anthropicApiHost = remoteProvider.apiHost.replace(/\/$/, '') + '/anthropic'
    } else if (remoteProvider.id === 'silicon') {
      // SiliconFlow uses the same host for Anthropic API
      anthropicApiHost = remoteProvider.apiHost
    } else if (remoteProvider.type === 'openai' || remoteProvider.type === 'openai-compatible') {
      // Other OpenAI-compatible providers use the same host
      anthropicApiHost = remoteProvider.apiHost
    }
  }

  return {
    id: remoteProvider.id,
    type: remoteProvider.type as any,
    name: remoteProvider.name,
    apiKey: remoteProvider.apiKey || '',
    apiHost: remoteProvider.apiHost,
    anthropicApiHost,
    apiVersion: remoteProvider.apiVersion,
    enabled: remoteProvider.enabled ?? true,
    isSystem: remoteProvider.isSystem ?? false,
    models: (remoteProvider.models || []).map((m: any) => convertRemoteModel(m, remoteProvider.id)),
    apiOptions: remoteProvider.apiOptions,
    serviceTier: remoteProvider.serviceTier,
    verbosity: remoteProvider.verbosity
  }
}

/**
 * Convert remote model to local Model type
 */
const convertRemoteModel = (remoteModel: any, providerId: string): Model => {
  return {
    id: remoteModel.id,
    provider: providerId,
    name: remoteModel.name,
    group: remoteModel.group,
    owned_by: remoteModel.owned_by,
    description: remoteModel.description
  }
}

/**
 * Find a model in the provider list by its reference
 */
const findModelInProviders = (providers: Provider[], modelRef: { id: string; provider: string }): Model | null => {
  const provider = providers.find((p) => p.id === modelRef.provider)
  if (!provider) return null

  const model = provider.models.find((m) => m.id === modelRef.id)
  return model || null
}

class RemoteModelConfigServiceClass {
  private state: RemoteConfigServiceState = {
    status: RemoteConfigStatus.DISABLED,
    error: null,
    lastFetch: null,
    configVersion: null
  }

  private dispatch: AppDispatch | null = null

  /**
   * Initialize the service with Redux dispatch
   */
  init(dispatch: AppDispatch): void {
    this.dispatch = dispatch

    if (!this.isEnabled()) {
      this.state.status = RemoteConfigStatus.DISABLED
      logger.info('Remote model config is disabled for this build')
      return
    }

    logger.info('Remote model config service initialized', {
      brand: getBrandIdentifier(),
      baseURL: BASE_URL
    })
  }

  /**
   * Check if remote config is enabled
   */
  isEnabled(): boolean {
    return isRemoteConfigEnabled
  }

  /**
   * Get current service state
   */
  getState(): RemoteConfigServiceState {
    return { ...this.state }
  }

  /**
   * Load cached configuration from localStorage
   */
  private loadCache(): RemoteConfigCache | null {
    try {
      const cacheStr = localStorage.getItem(REMOTE_CONFIG_API.storageKeys.CACHE)
      if (!cacheStr) return null

      const cache: RemoteConfigCache = JSON.parse(cacheStr)

      // Check if cache is expired
      const now = Date.now()
      if (now - cache.timestamp > REMOTE_CONFIG_API.cacheExpiry) {
        logger.info('Cache expired', { age: now - cache.timestamp })
        localStorage.removeItem(REMOTE_CONFIG_API.storageKeys.CACHE)
        return null
      }

      logger.info('Loaded cached configuration', { version: cache.version })
      return cache
    } catch (error) {
      logger.error('Failed to load cache', { error })
      return null
    }
  }

  /**
   * Save configuration to localStorage cache
   */
  private saveCache(data: RemoteModelConfigData, version: string): void {
    try {
      const cache: RemoteConfigCache = {
        data,
        timestamp: Date.now(),
        version
      }
      localStorage.setItem(REMOTE_CONFIG_API.storageKeys.CACHE, JSON.stringify(cache))
      localStorage.setItem(REMOTE_CONFIG_API.storageKeys.LAST_FETCH, Date.now().toString())
      localStorage.setItem(REMOTE_CONFIG_API.storageKeys.VERSION, version)
      logger.info('Saved configuration to cache', { version })
    } catch (error) {
      logger.error('Failed to save cache', { error })
    }
  }

  /**
   * Apply remote configuration to Redux store
   */
  private applyConfig(data: RemoteModelConfigData): boolean {
    if (!this.dispatch) {
      logger.error('Dispatch not initialized')
      return false
    }

    try {
      // Convert remote providers to local format
      const providers = data.providers.map(convertRemoteProvider)

      // Update providers in Redux store
      this.dispatch(updateProviders(providers))

      // Apply default models
      const assistantModel = findModelInProviders(providers, data.defaultModels.assistant)
      const quickModel = findModelInProviders(providers, data.defaultModels.quick)
      const translateModel = findModelInProviders(providers, data.defaultModels.translate)

      if (assistantModel) {
        this.dispatch(setDefaultModel({ model: assistantModel }))
        logger.info('Set default model', { model: assistantModel.id })
      } else {
        logger.warn('Default model not found in providers', {
          modelRef: data.defaultModels.assistant
        })
      }

      if (quickModel) {
        this.dispatch(setQuickModel({ model: quickModel }))
        logger.info('Set quick model', { model: quickModel.id })
      }

      if (translateModel) {
        this.dispatch(setTranslateModel({ model: translateModel }))
        logger.info('Set translate model', { model: translateModel.id })
      }

      logger.info('Configuration applied successfully', {
        providerCount: providers.length,
        configVersion: data.configVersion
      })

      return true
    } catch (error) {
      logger.error('Failed to apply configuration', { error })
      return false
    }
  }

  /**
   * Fetch and apply remote configuration
   */
  async fetchAndApplyConfig(): Promise<boolean> {
    if (!this.isEnabled()) {
      logger.info('Remote config is disabled, skipping fetch')
      return false
    }

    if (!this.dispatch) {
      logger.error('Service not initialized. Call init() first.')
      return false
    }

    this.state.status = RemoteConfigStatus.LOADING
    this.state.error = null
    logger.info('Fetching remote configuration...')

    const brand = getBrandIdentifier()
    const response = await fetchRemoteModelConfig(brand)

    if (!response.success) {
      this.state.status = RemoteConfigStatus.ERROR
      this.state.error = response.error?.message || 'Unknown error'

      // Try to use cached config on error
      const cache = this.loadCache()
      if (cache) {
        logger.info('Using cached config due to fetch error', { error: response.error?.code })
        this.applyConfig(cache.data)
        return true
      }

      logger.error('Failed to fetch configuration', { error: response.error })
      return false
    }

    if (!response.data) {
      this.state.status = RemoteConfigStatus.ERROR
      this.state.error = 'No data in response'
      logger.error('Empty response data')
      return false
    }

    // Apply the configuration
    const success = this.applyConfig(response.data)

    if (success) {
      // Save to cache
      this.saveCache(response.data, response.data.configVersion)

      this.state.status = RemoteConfigStatus.SUCCESS
      this.state.lastFetch = Date.now()
      this.state.configVersion = response.data.configVersion

      logger.info('Configuration loaded successfully', {
        version: response.data.configVersion
      })
    } else {
      this.state.status = RemoteConfigStatus.ERROR
      this.state.error = 'Failed to apply configuration'
    }

    return success
  }

  /**
   * Load configuration from cache or fetch if needed
   */
  async loadConfig(): Promise<boolean> {
    if (!this.isEnabled()) {
      return false
    }

    if (!this.dispatch) {
      logger.error('Service not initialized. Call init() first.')
      return false
    }

    // Try cache first
    const cache = this.loadCache()
    if (cache) {
      logger.info('Using cached configuration')
      return this.applyConfig(cache.data)
    }

    // No cache, fetch from server
    return this.fetchAndApplyConfig()
  }

  /**
   * Clear cached configuration
   */
  clearCache(): void {
    localStorage.removeItem(REMOTE_CONFIG_API.storageKeys.CACHE)
    localStorage.removeItem(REMOTE_CONFIG_API.storageKeys.LAST_FETCH)
    localStorage.removeItem(REMOTE_CONFIG_API.storageKeys.VERSION)
    logger.info('Cache cleared')
  }
}

// Singleton instance
export const remoteModelConfigService = new RemoteModelConfigServiceClass()
