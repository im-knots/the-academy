// src/hooks/useAvailableModels.ts
// Hook for fetching available models from all providers via MCP

import { useState, useEffect, useCallback, useRef } from 'react'
import { MCPClient } from '@/lib/mcp/client'

export interface ModelOption {
  value: string
  label: string
  description?: string
}

export interface ProviderModels {
  provider: string
  models: ModelOption[]
  available: boolean
  error?: string
}

export interface UseAvailableModelsResult {
  modelOptions: Record<string, ModelOption[]>
  providerStatus: Record<string, ProviderModels>
  isLoading: boolean
  error: string | null
  refresh: (provider?: string) => Promise<void>
}

export function useAvailableModels(): UseAvailableModelsResult {
  const mcpClient = useRef(MCPClient.getInstance())
  const [modelOptions, setModelOptions] = useState<Record<string, ModelOption[]>>({})
  const [providerStatus, setProviderStatus] = useState<Record<string, ProviderModels>>({})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const hasFetched = useRef(false)

  const fetchModels = useCallback(async (refresh = false) => {
    try {
      setIsLoading(true)
      setError(null)

      const result = await mcpClient.current.listAvailableModels(undefined, refresh)

      console.log('🔍 useAvailableModels - Raw result:', JSON.stringify(result, null, 2))

      // Transform the response into ModelOption format
      const options: Record<string, ModelOption[]> = {}
      const status: Record<string, ProviderModels> = {}

      if (result.providers) {
        for (const [provider, data] of Object.entries(result.providers)) {
          const providerData = data as {
            models: Array<{ id: string; name: string; description?: string }>
            available: boolean
            error?: string
          }

          // Convert models to options format
          options[provider] = providerData.models.map(m => ({
            value: m.id,
            label: m.name || m.id,
            description: m.description
          }))

          status[provider] = {
            provider,
            models: options[provider],
            available: providerData.available,
            error: providerData.error
          }
        }
      } else if (result.models) {
        // Fallback to simple models format
        for (const [provider, modelIds] of Object.entries(result.models)) {
          const ids = modelIds as string[]
          options[provider] = ids.map(id => ({
            value: id,
            label: formatModelLabel(id, provider)
          }))
          status[provider] = {
            provider,
            models: options[provider],
            available: options[provider].length > 0
          }
        }
      }

      setModelOptions(options)
      setProviderStatus(status)
    } catch (err) {
      console.error('Failed to fetch models:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch models')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const refresh = useCallback(async (_provider?: string) => {
    await fetchModels(true)
  }, [fetchModels])

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true
      fetchModels()
    }
  }, [fetchModels])

  return {
    modelOptions,
    providerStatus,
    isLoading,
    error,
    refresh
  }
}

// Helper to format model IDs into labels when name not provided
function formatModelLabel(id: string, provider: string): string {
  // Common formatting patterns
  let label = id
    .replace(/-/g, ' ')
    .replace(/\./g, '.')
    .split(' ')
    .map(word => {
      // Keep version numbers as-is
      if (/^\d+/.test(word)) return word
      // Capitalize first letter
      return word.charAt(0).toUpperCase() + word.slice(1)
    })
    .join(' ')

  // Provider-specific adjustments
  switch (provider) {
    case 'openai':
    case 'gpt':
      label = label.replace('Gpt ', 'GPT-')
      break
    case 'claude':
      // Already formatted well
      break
  }

  return label
}

