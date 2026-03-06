# Remote Model Configuration API

## Overview

The Remote Model Configuration API allows centralized management of AI model configurations for brand/custom builds of Cherry Studio. This enables organizations to manage model providers and default models from a server instead of local configuration.

## Base URL

The API base URL is configured via build-time environment variables:
- `MODEL_CONFIG_URL` (preferred) - Dedicated model config server URL
- `UPDATE_SERVER_URL` (fallback) - General update server URL

Example: `http://localhost:8080`

## Authentication

Currently, the API does not require authentication. This may change in future versions.

## API Endpoints

### 1. Get Model Configuration

Fetches the model configuration for a specific brand.

```
GET /api/v1/models/config
```

#### Query Parameters

| Parameter | Type   | Required | Description                              |
|-----------|--------|----------|------------------------------------------|
| `brand`   | string | Yes      | Brand identifier (e.g., "jlpay", "default") |
| `version` | string | No       | Client version for compatibility checks  |

#### Request Example

```bash
curl "http://localhost:8080/api/v1/models/config?brand=jlpay&version=1.0.0"
```

#### Success Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "data": {
    "providers": [
      {
        "id": "openai",
        "type": "openai",
        "name": "OpenAI",
        "apiHost": "https://api.openai.com/v1",
        "enabled": true,
        "isSystem": true,
        "models": [
          {
            "id": "gpt-4o",
            "name": "GPT-4o",
            "provider": "openai",
            "group": "GPT"
          },
          {
            "id": "gpt-4o-mini",
            "name": "GPT-4o Mini",
            "provider": "openai",
            "group": "GPT"
          }
        ]
      },
      {
        "id": "anthropic",
        "type": "anthropic",
        "name": "Anthropic",
        "apiHost": "https://api.anthropic.com",
        "enabled": true,
        "isSystem": true,
        "models": [
          {
            "id": "claude-3-5-sonnet-20241022",
            "name": "Claude 3.5 Sonnet",
            "provider": "anthropic",
            "group": "Claude"
          }
        ]
      }
    ],
    "defaultModels": {
      "assistant": {
        "id": "gpt-4o",
        "provider": "openai"
      },
      "quick": {
        "id": "gpt-4o-mini",
        "provider": "openai"
      },
      "translate": {
        "id": "gpt-4o-mini",
        "provider": "openai"
      }
    },
    "configVersion": "2024-03-05"
  },
  "timestamp": 1709600000000
}
```

#### Data Schema

##### Provider Object

| Field               | Type    | Required | Description                                          |
|---------------------|---------|----------|------------------------------------------------------|
| `id`                | string  | Yes      | Unique provider identifier                           |
| `type`              | string  | Yes      | Provider type (e.g., "openai", "anthropic")          |
| `name`              | string  | Yes      | Display name of the provider                         |
| `apiHost`           | string  | Yes      | API base URL                                         |
| `enabled`           | boolean | Yes      | Whether the provider is enabled                      |
| `isSystem`          | boolean | Yes      | Whether this is a system provider                    |
| `apiKey`            | string  | No       | API key (if pre-configured)                          |
| `anthropicApiHost`  | string  | No       | Anthropic-specific API host                          |
| `apiVersion`        | string  | No       | API version (for Azure, etc.)                        |
| `models`            | array   | Yes      | Array of Model objects                               |

##### Model Object

| Field        | Type   | Required | Description                    |
|--------------|--------|----------|--------------------------------|
| `id`         | string | Yes      | Unique model identifier        |
| `name`       | string | Yes      | Display name                   |
| `provider`   | string | Yes      | Provider ID                    |
| `group`      | string | Yes      | Model group/category           |
| `owned_by`   | string | No       | Model owner                    |
| `description`| string | No       | Model description              |

##### Default Models Object

| Field      | Type   | Required | Description                     |
|------------|--------|----------|---------------------------------|
| `assistant` | object | Yes      | Default model for assistant     |
| `quick`     | object | Yes      | Default model for quick tasks   |
| `translate` | object | Yes      | Default model for translation   |

Each default model reference contains:
| Field    | Type   | Required | Description        |
|----------|--------|----------|--------------------|
| `id`     | string | Yes      | Model ID           |
| `provider`| string | Yes      | Provider ID        |

#### Error Responses

##### Configuration Not Found (404)

```json
{
  "success": false,
  "error": {
    "code": "CONFIG_NOT_FOUND",
    "message": "No configuration found for this brand"
  }
}
```

##### Invalid Brand (400)

```json
{
  "success": false,
  "error": {
    "code": "INVALID_BRAND",
    "message": "Invalid brand identifier"
  }
}
```

##### Service Unavailable (503)

```json
{
  "success": false,
  "error": {
    "code": "SERVICE_UNAVAILABLE",
    "message": "Service temporarily unavailable"
  }
}
```

### 2. Health Check

Check the health status of the configuration service.

```
GET /api/v1/models/config/health
```

#### Request Example

```bash
curl "http://localhost:8080/api/v1/models/config/health"
```

#### Success Response

**Status Code:** `200 OK`

```json
{
  "success": true,
  "data": {
    "status": "healthy",
    "configVersion": "2024-03-05",
    "lastUpdated": 1709600000000
  }
}
```

## Error Codes

| Error Code              | Description                              | HTTP Status |
|-------------------------|------------------------------------------|-------------|
| `CONFIG_NOT_FOUND`      | No configuration found for this brand    | 404         |
| `INVALID_VERSION`       | Unsupported client version               | 400         |
| `SERVICE_UNAVAILABLE`   | Service temporarily unavailable          | 503         |
| `INVALID_BRAND`         | Invalid brand identifier                 | 400         |
| `NETWORK_ERROR`         | Network error on client side             | -           |
| `PARSE_ERROR`           | Failed to parse response JSON            | -           |

## Client Behavior

### Retry Logic

The client implements automatic retry with exponential backoff:
- **Maximum attempts:** 3
- **Initial delay:** 1 second
- **Retry on:** Network errors only

### Caching

- **Cache duration:** 24 hours
- **Cache storage:** localStorage
- **Cache keys:**
  - `remote_model_config_cache` - Configuration data
  - `remote_model_config_last_fetch` - Last fetch timestamp
  - `remote_model_config_version` - Configuration version

### Fallback

If the remote fetch fails:
1. Client tries to use cached configuration (if available and not expired)
2. If no valid cache, client continues with empty provider list

## Implementation Reference

See `src/renderer/src/services/RemoteModelConfig/` for the client implementation.
