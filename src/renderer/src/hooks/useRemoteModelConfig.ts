/**
 * useRemoteModelConfig Hook
 *
 * React hook that initializes and manages remote model configuration.
 * Should be called once in the App component.
 */

import { loggerService } from '@logger'
import { remoteModelConfigService } from '@renderer/services/RemoteModelConfig'
import { getBrandIdentifier, isRemoteConfigEnabled } from '@renderer/services/RemoteModelConfig'
import type { AppDispatch } from '@renderer/store'
import { useEffect } from 'react'
import { useDispatch } from 'react-redux'

const logger = loggerService.withContext('useRemoteModelConfig')

/**
 * Hook to initialize remote model configuration on app startup.
 *
 * In brand/custom build mode:
 * 1. Initializes the RemoteModelConfigService with Redux dispatch
 * 2. Attempts to load configuration from cache or fetch from server
 * 3. Applies the configuration to the Redux store
 *
 * In standard build mode, this hook does nothing.
 */
export function useRemoteModelConfig(): void {
  const dispatch = useDispatch<AppDispatch>()

  useEffect(() => {
    // Only run in brand/custom build mode
    if (!isRemoteConfigEnabled) {
      logger.debug('Remote model config disabled, skipping initialization')
      return
    }

    const initRemoteConfig = async () => {
      try {
        // Initialize the service with Redux dispatch
        remoteModelConfigService.init(dispatch)

        logger.info('Initializing remote model config', {
          brand: getBrandIdentifier()
        })

        // Load configuration (from cache or fetch from server)
        await remoteModelConfigService.loadConfig()

        const state = remoteModelConfigService.getState()
        logger.info('Remote model config initialized', {
          status: state.status,
          configVersion: state.configVersion
        })
      } catch (error) {
        logger.error('Failed to initialize remote model config', { error })
      }
    }

    // Run initialization
    initRemoteConfig()
  }, [dispatch])
}
