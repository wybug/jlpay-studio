/**
 * Remote Model Configuration Service Types
 *
 * Defines types for remote model configuration API responses and service state.
 */

export interface RemoteModelConfigResponse {
  success: boolean
  data?: RemoteModelConfigData
  error?: RemoteConfigError
  timestamp?: number
}

export interface RemoteModelConfigData {
  providers: RemoteProvider[]
  defaultModels: RemoteDefaultModels
  configVersion: string
}

export interface RemoteProvider {
  id: string
  type: string
  name: string
  apiHost: string
  enabled: boolean
  isSystem: boolean
  apiKey?: string
  anthropicApiHost?: string
  apiVersion?: string
  models?: RemoteModel[]
  apiOptions?: RemoteApiOptions
  serviceTier?: string
  verbosity?: string
}

export interface RemoteModel {
  id: string
  name: string
  provider: string
  group: string
  owned_by?: string
  description?: string
}

export interface RemoteApiOptions {
  isNotSupportArrayContent?: boolean
  isNotSupportStreamOptions?: boolean
  isSupportDeveloperRole?: boolean
  isNotSupportServiceTier?: boolean
  isNotSupportEnableThinking?: boolean
  isNotSupportAPIVersion?: boolean
  isNotSupportVerbosity?: boolean
}

export interface RemoteDefaultModels {
  assistant: RemoteModelReference
  quick: RemoteModelReference
  translate: RemoteModelReference
}

export interface RemoteModelReference {
  id: string
  provider: string
}

export interface RemoteConfigError {
  code: RemoteConfigErrorCode
  message: string
}

export type RemoteConfigErrorCode =
  | 'CONFIG_NOT_FOUND'
  | 'INVALID_VERSION'
  | 'SERVICE_UNAVAILABLE'
  | 'INVALID_BRAND'
  | 'NETWORK_ERROR'
  | 'PARSE_ERROR'

export interface RemoteConfigHealthResponse {
  success: boolean
  data?: {
    status: string
    configVersion?: string
    lastUpdated?: number
  }
  error?: RemoteConfigError
}

export enum RemoteConfigStatus {
  IDLE = 'idle',
  LOADING = 'loading',
  SUCCESS = 'success',
  ERROR = 'error',
  DISABLED = 'disabled'
}

export interface RemoteConfigCache {
  data: RemoteModelConfigData
  timestamp: number
  version: string
}

export interface RemoteConfigServiceState {
  status: RemoteConfigStatus
  error: string | null
  lastFetch: number | null
  configVersion: string | null
}
