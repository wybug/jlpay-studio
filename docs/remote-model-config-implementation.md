# Remote Model Configuration Implementation Guide

## Overview

This document describes the implementation of the remote model configuration feature for brand/custom builds of Cherry Studio. This feature enables centralized management of AI model providers and default models from a remote server.

## Architecture

### Components

```
┌─────────────────────────────────────────────────────────────┐
│                        Client App                            │
│  ┌──────────────────────────────────────────────────────┐  │
│  │                   App.tsx                             │  │
│  │            (useRemoteModelConfig Hook)                │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │         RemoteModelConfigService                      │  │
│  │  • Fetch configuration from remote API                │  │
│  │  • Apply configuration to Redux store                 │  │
│  │  • Manage cache (24h expiry)                          │  │
│  │  • Retry logic (3 attempts)                           │  │
│  └──────────────────────┬───────────────────────────────┘  │
│                         │                                   │
│  ┌──────────────────────▼───────────────────────────────┐  │
│  │              Redux Store (llm.ts)                     │  │
│  │  • providers: Provider[]                              │  │
│  │  • defaultModel: Model                                │  │
│  │  • quickModel: Model                                  │  │
│  │  • translateModel: Model                              │  │
│  └──────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Remote API Server                         │
│  GET /api/v1/models/config?brand={brand}                    │
└─────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
src/renderer/src/services/RemoteModelConfig/
├── index.ts                    # Export entry point
├── types.ts                    # TypeScript type definitions
├── constants.ts                # Configuration constants
├── api.ts                      # HTTP request handling
└── RemoteModelConfigService.ts # Core service class

src/renderer/src/hooks/
└── useRemoteModelConfig.ts     # React hook for initialization

docs/
├── remote-model-config-api.md          # API specification
└── remote-model-config-implementation.md # This file
```

## Module Details

### 1. types.ts - Type Definitions

Defines all TypeScript types for the remote configuration system:

- `RemoteModelConfigResponse` - API response wrapper
- `RemoteModelConfigData` - Configuration data structure
- `RemoteProvider` - Provider configuration from server
- `RemoteModel` - Model configuration from server
- `RemoteDefaultModels` - Default model references
- `RemoteConfigError` - Error structure
- `RemoteConfigStatus` - Service state enum
- `RemoteConfigCache` - Cached data structure

### 2. constants.ts - Configuration

Contains all configuration values:

```typescript
export const BASE_URL = BUILD_CONSTANTS.MODEL_CONFIG_URL ||
                        BUILD_CONSTANTS.UPDATE_SERVER_URL

export const REMOTE_CONFIG_API = {
  baseURL: BASE_URL,
  endpoints: {
    getConfig: '/api/v1/models/config',
    health: '/api/v1/models/config/health'
  },
  timeout: 10000,        // 10 seconds
  retryAttempts: 3,
  retryDelay: 1000,      // 1 second
  cacheExpiry: 24 * 60 * 60 * 1000  // 24 hours
}

export const isRemoteConfigEnabled =
  BUILD_CONSTANTS.IS_CUSTOM_BUILD && !!BASE_URL
```

### 3. api.ts - HTTP Requests

Handles HTTP communication with the remote server:

- `fetchWithTimeout()` - Fetch with timeout abort
- `fetchRemoteModelConfig()` - Main fetch with retry logic
- `fetchRemoteConfigHealth()` - Health check endpoint

**Retry Logic:**
1. Network errors trigger retry
2. Exponential backoff (1s, 2s, 3s)
3. HTTP errors (404, 400) do not retry

### 4. RemoteModelConfigService.ts - Core Service

Singleton service that manages configuration lifecycle:

**Methods:**
- `init(dispatch)` - Initialize with Redux dispatch
- `isEnabled()` - Check if feature is enabled
- `getState()` - Get current service state
- `fetchAndApplyConfig()` - Fetch from server and apply
- `loadConfig()` - Load from cache or fetch
- `clearCache()` - Clear cached configuration

**Private Methods:**
- `loadCache()` - Load from localStorage
- `saveCache()` - Save to localStorage
- `applyConfig()` - Apply configuration to Redux store
- `convertRemoteProvider()` - Convert remote to local format
- `findModelInProviders()` - Find model by reference

## Integration Points

### 1. Build Constants (`packages/shared/build-constants.ts`)

Added `MODEL_CONFIG_URL` environment variable:

```typescript
export const BUILD_CONSTANTS = {
  // ... existing constants
  MODEL_CONFIG_URL: getEnv('MODEL_CONFIG_URL', ''),
}
```

### 2. Redux Store (`src/renderer/src/store/llm.ts`)

Modified initial state to support brand mode:

```typescript
const getBrandInitialState = (): LlmState => {
  return {
    // ... default values
    providers: [], // Empty, populated by remote config
  }
}

const llmSlice = createSlice({
  initialState: (() => {
    if (isLocalAi) return getIntegratedInitialState()
    if (BUILD_CONSTANTS.IS_CUSTOM_BUILD) return getBrandInitialState()
    return initialState
  })()
})
```

### 3. App Initialization (`src/renderer/src/App.tsx`)

Added hook call:

```typescript
import { useRemoteModelConfig } from '@renderer/hooks/useRemoteModelConfig'

function App(): React.ReactElement {
  useRemoteModelConfig() // Initialize remote config
  // ...
}
```

### 4. Settings UI (`src/renderer/src/pages/settings/SettingsPage.tsx`)

Hide provider/model settings in brand mode:

```typescript
{!BUILD_CONSTANTS.IS_CUSTOM_BUILD ? (
  <>
    <MenuItemLink to="/settings/provider">...</MenuItemLink>
    <MenuItemLink to="/settings/model">...</MenuItemLink>
  </>
) : (
  <>
    <MenuItem className="readonly">
      <Cloud size={18} />
      {t('settings.provider.title')}
      <Lock size={12} />
    </MenuItem>
    {/* ... */}
  </>
)}
```

## Build Configuration

### Environment Variables

Set these during brand build:

```bash
# Enable custom build mode
export CUSTOM_BUILD=true

# Set brand identifier
export BUILD_BRAND=jlpay

# Set model config server URL
export MODEL_CONFIG_URL=http://localhost:8080

# Or use general update server
export UPDATE_SERVER_URL=http://localhost:8080
```

### Brand Build Script

```bash
node scripts/brand-builder.js jlpay --build
```

## Cache Strategy

### Storage Keys

- `remote_model_config_cache` - JSON string of cached data
- `remote_model_config_last_fetch` - Timestamp of last fetch
- `remote_model_config_version` - Configuration version string

### Cache Flow

1. **On Startup:** Try cache first (if valid)
2. **On Cache Miss:** Fetch from server
3. **On Success:** Save to cache with timestamp
4. **On Cache Expiry:** Fetch fresh data

### Cache Expiry

- **Duration:** 24 hours
- **Check:** `Date.now() - cache.timestamp > cacheExpiry`

## Error Handling

### Error Categories

1. **Network Errors** - Retry with backoff
2. **HTTP Errors** - No retry, specific handling
3. **Parse Errors** - No retry, log error
4. **Apply Errors** - Log error, keep previous state

### Fallback Behavior

1. Remote fetch fails → Try cache
2. Cache expired/missing → Continue with empty state
3. Apply fails → Log error, don't update state

## Testing

### Manual Testing

1. **Brand Mode Test:**
   ```bash
   CUSTOM_BUILD=true BUILD_BRAND=jlpay MODEL_CONFIG_URL=http://localhost:8080 pnpm dev
   ```
   - Verify remote config loads
   - Verify settings menu shows locked icons
   - Verify models are available in dropdown

2. **Standard Mode Test:**
   ```bash
   pnpm dev
   ```
   - Verify settings menu shows normal provider/model items
   - Verify no remote config requests

3. **Server Error Test:**
   - Stop server
   - Verify fallback to cache
   - Verify graceful degradation

### Automated Testing

Create test in `src/renderer/src/services/RemoteModelConfig/__tests__/`:

```typescript
describe('RemoteModelConfigService', () => {
  it('should fetch and apply config', async () => {
    // Mock fetch, verify Redux calls
  })

  it('should use cache on error', async () => {
    // Mock error, verify cache usage
  })
})
```

## Troubleshooting

### Configuration Not Loading

1. Check `BUILD_CONSTANTS.IS_CUSTOM_BUILD` is true
2. Check `MODEL_CONFIG_URL` or `UPDATE_SERVER_URL` is set
3. Check server is accessible
4. Check browser console for errors
5. Check localStorage for cached data

### Settings Menu Still Shows Provider/Model

1. Verify `BUILD_CONSTANTS.IS_CUSTOM_BUILD` is true at build time
2. Check SettingsPage.tsx conditional rendering
3. Rebuild the application

### Models Not Appearing in Dropdown

1. Check Redux store state (DevTools)
2. Verify remote config response format
3. Check model/provider ID matching
4. Verify dispatch calls in service

## Future Enhancements

1. **Authentication** - Add API key or OAuth
2. **WebSocket Updates** - Real-time config push
3. **Version Validation** - Client version compatibility
4. **Partial Updates** - Incremental config changes
5. **Encryption** - Encrypt sensitive data at rest
6. **Multi-tenancy** - Per-user configuration
