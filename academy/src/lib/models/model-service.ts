// src/lib/models/model-service.ts
// Dynamic model fetching service for all AI providers

export interface ModelInfo {
  id: string
  name: string
  provider: string
  description?: string
  contextWindow?: number
  maxOutputTokens?: number
  capabilities?: string[]
  created?: number
}

export interface ProviderModels {
  provider: string
  models: ModelInfo[]
  available: boolean
  error?: string
  lastFetched?: Date
}

// Cache for fetched models
const modelCache: Map<string, ProviderModels> = new Map()
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export class ModelService {
  private static instance: ModelService

  static getInstance(): ModelService {
    if (!ModelService.instance) {
      ModelService.instance = new ModelService()
    }
    return ModelService.instance
  }

  // Check if cache is still valid
  private isCacheValid(provider: string): boolean {
    const cached = modelCache.get(provider)
    if (!cached || !cached.lastFetched) return false
    return Date.now() - cached.lastFetched.getTime() < CACHE_TTL
  }

  // Get models for a specific provider (with caching)
  async getModelsForProvider(provider: string, forceRefresh = false): Promise<ProviderModels> {
    if (!forceRefresh && this.isCacheValid(provider)) {
      return modelCache.get(provider)!
    }

    let result: ProviderModels

    try {
      switch (provider) {
        case 'claude':
          result = await this.fetchAnthropicModels()
          break
        case 'openai':
        case 'gpt':
          result = await this.fetchOpenAIModels()
          break
        case 'grok':
          result = await this.fetchGrokModels()
          break
        case 'gemini':
          result = await this.fetchGeminiModels()
          break
        case 'ollama':
          result = await this.fetchOllamaModels()
          break
        case 'deepseek':
          result = await this.fetchDeepSeekModels()
          break
        case 'mistral':
          result = await this.fetchMistralModels()
          break
        case 'cohere':
          result = await this.fetchCohereModels()
          break
        default:
          result = {
            provider,
            models: [],
            available: false,
            error: `Unknown provider: ${provider}`,
            lastFetched: new Date(),
          }
      }
    } catch (error) {
      console.error(`Failed to fetch models for ${provider}:`, error)
      result = {
        provider,
        models: [],
        available: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        lastFetched: new Date(),
      }
    }

    modelCache.set(provider, result)
    return result
  }

  // Fetch models from all providers
  async getAllModels(forceRefresh = false): Promise<Record<string, ProviderModels>> {
    // Use provider names that match UI expectations
    const providers = ['claude', 'gpt', 'grok', 'gemini', 'ollama', 'deepseek', 'mistral', 'cohere']
    const results: Record<string, ProviderModels> = {}

    await Promise.all(
      providers.map(async (provider) => {
        const result = await this.getModelsForProvider(provider, forceRefresh)
        // Ensure the provider name in result matches what UI expects
        results[provider] = { ...result, provider }
      })
    )

    return results
  }

  // Anthropic Claude API - https://api.anthropic.com/v1/models
  private async fetchAnthropicModels(): Promise<ProviderModels> {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return { provider: 'claude', models: [], available: false, error: 'No API key configured', lastFetched: new Date() }
    }

    try {
      console.log('🔍 Fetching Anthropic models...')
      const response = await fetch('https://api.anthropic.com/v1/models', {
        headers: {
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`❌ Anthropic API error ${response.status}:`, errorText)
        throw new Error(`Anthropic API error: ${response.status}`)
      }

      const data = await response.json()
      console.log('✅ Anthropic API response:', JSON.stringify(data).slice(0, 200))
      const models: ModelInfo[] = (data.data || [])
        .filter((m: any) => m.type === 'model')
        .map((m: any) => ({
          id: m.id,
          name: this.formatModelName(m.id, 'claude'),
          provider: 'claude',
          description: m.display_name || m.id,
          created: m.created_at ? new Date(m.created_at).getTime() / 1000 : undefined,
        }))
        .sort((a: ModelInfo, b: ModelInfo) => (b.created || 0) - (a.created || 0))

      console.log(`✅ Anthropic: Found ${models.length} models`)
      return { provider: 'claude', models, available: true, lastFetched: new Date() }
    } catch (error) {
      console.error('❌ Failed to fetch Anthropic models:', error)
      return { provider: 'claude', models: [], available: false, error: String(error), lastFetched: new Date() }
    }
  }

  // OpenAI API - https://api.openai.com/v1/models
  private async fetchOpenAIModels(): Promise<ProviderModels> {
    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      return { provider: 'openai', models: [], available: false, error: 'No API key configured', lastFetched: new Date() }
    }

    try {
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const data = await response.json()
      // Filter to only chat-capable models
      const chatModels = (data.data || [])
        .filter((m: any) =>
          m.id.startsWith('gpt-') ||
          m.id.startsWith('o1') ||
          m.id.startsWith('o3') ||
          m.id.startsWith('chatgpt')
        )
        .filter((m: any) => !m.id.includes('instruct') && !m.id.includes('vision'))
        .map((m: any) => ({
          id: m.id,
          name: this.formatModelName(m.id, 'openai'),
          provider: 'openai',
          created: m.created,
        }))
        .sort((a: ModelInfo, b: ModelInfo) => (b.created || 0) - (a.created || 0))

      return { provider: 'openai', models: chatModels, available: true, lastFetched: new Date() }
    } catch (error) {
      console.error('Failed to fetch OpenAI models:', error)
      return { provider: 'openai', models: [], available: false, error: String(error), lastFetched: new Date() }
    }
  }

  // xAI Grok API - https://api.x.ai/v1/models
  private async fetchGrokModels(): Promise<ProviderModels> {
    const apiKey = process.env.XAI_API_KEY
    if (!apiKey) {
      return { provider: 'grok', models: [], available: false, error: 'No API key configured', lastFetched: new Date() }
    }

    try {
      const response = await fetch('https://api.x.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })

      if (!response.ok) {
        throw new Error(`xAI API error: ${response.status}`)
      }

      const data = await response.json()
      const models: ModelInfo[] = (data.data || [])
        .filter((m: any) => m.id.startsWith('grok'))
        .map((m: any) => ({
          id: m.id,
          name: this.formatModelName(m.id, 'grok'),
          provider: 'grok',
          created: m.created,
        }))
        .sort((a: ModelInfo, b: ModelInfo) => (b.created || 0) - (a.created || 0))

      return { provider: 'grok', models, available: true, lastFetched: new Date() }
    } catch (error) {
      console.error('Failed to fetch Grok models:', error)
      return { provider: 'grok', models: [], available: false, error: String(error), lastFetched: new Date() }
    }
  }

  // Google Gemini API - https://generativelanguage.googleapis.com/v1beta/models
  private async fetchGeminiModels(): Promise<ProviderModels> {
    const apiKey = process.env.GOOGLE_AI_API_KEY
    if (!apiKey) {
      return { provider: 'gemini', models: [], available: false, error: 'No API key configured', lastFetched: new Date() }
    }

    try {
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`)

      if (!response.ok) {
        throw new Error(`Google API error: ${response.status}`)
      }

      const data = await response.json()
      const models: ModelInfo[] = (data.models || [])
        .filter((m: any) => m.name.includes('gemini') && m.supportedGenerationMethods?.includes('generateContent'))
        .map((m: any) => ({
          id: m.name.replace('models/', ''),
          name: m.displayName || this.formatModelName(m.name.replace('models/', ''), 'gemini'),
          provider: 'gemini',
          description: m.description,
          contextWindow: m.inputTokenLimit,
          maxOutputTokens: m.outputTokenLimit,
        }))

      return { provider: 'gemini', models, available: true, lastFetched: new Date() }
    } catch (error) {
      console.error('Failed to fetch Gemini models:', error)
      return { provider: 'gemini', models: [], available: false, error: String(error), lastFetched: new Date() }
    }
  }

  // Ollama local API - http://localhost:11434/api/tags
  private async fetchOllamaModels(ollamaUrl?: string): Promise<ProviderModels> {
    const baseUrl = ollamaUrl || process.env.OLLAMA_URL || 'http://localhost:11434'

    try {
      const response = await fetch(`${baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000), // 5 second timeout for local
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`)
      }

      const data = await response.json()
      const models: ModelInfo[] = (data.models || []).map((m: any) => ({
        id: m.name,
        name: m.name,
        provider: 'ollama',
        description: `${m.details?.family || ''} ${m.details?.parameter_size || ''}`.trim(),
      }))

      return { provider: 'ollama', models, available: models.length > 0, lastFetched: new Date() }
    } catch (error) {
      console.error('Failed to fetch Ollama models:', error)
      return { provider: 'ollama', models: [], available: false, error: 'Ollama not running or unreachable', lastFetched: new Date() }
    }
  }

  // DeepSeek API (OpenAI-compatible) - https://api.deepseek.com/models
  private async fetchDeepSeekModels(): Promise<ProviderModels> {
    const apiKey = process.env.DEEPSEEK_API_KEY
    if (!apiKey) {
      return { provider: 'deepseek', models: [], available: false, error: 'No API key configured', lastFetched: new Date() }
    }

    try {
      const response = await fetch('https://api.deepseek.com/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })

      if (!response.ok) {
        throw new Error(`DeepSeek API error: ${response.status}`)
      }

      const data = await response.json()
      const models: ModelInfo[] = (data.data || []).map((m: any) => ({
        id: m.id,
        name: this.formatModelName(m.id, 'deepseek'),
        provider: 'deepseek',
        created: m.created,
      }))

      return { provider: 'deepseek', models, available: true, lastFetched: new Date() }
    } catch (error) {
      console.error('Failed to fetch DeepSeek models:', error)
      return { provider: 'deepseek', models: [], available: false, error: String(error), lastFetched: new Date() }
    }
  }

  // Mistral API - https://api.mistral.ai/v1/models
  private async fetchMistralModels(): Promise<ProviderModels> {
    const apiKey = process.env.MISTRAL_API_KEY
    if (!apiKey) {
      return { provider: 'mistral', models: [], available: false, error: 'No API key configured', lastFetched: new Date() }
    }

    try {
      const response = await fetch('https://api.mistral.ai/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })

      if (!response.ok) {
        throw new Error(`Mistral API error: ${response.status}`)
      }

      const data = await response.json()
      const models: ModelInfo[] = (data.data || [])
        .filter((m: any) => m.capabilities?.completion_chat)
        .map((m: any) => ({
          id: m.id,
          name: m.name || this.formatModelName(m.id, 'mistral'),
          provider: 'mistral',
          description: m.description,
          contextWindow: m.max_context_length,
          created: m.created,
        }))
        .sort((a: ModelInfo, b: ModelInfo) => (b.created || 0) - (a.created || 0))

      return { provider: 'mistral', models, available: true, lastFetched: new Date() }
    } catch (error) {
      console.error('Failed to fetch Mistral models:', error)
      return { provider: 'mistral', models: [], available: false, error: String(error), lastFetched: new Date() }
    }
  }

  // Cohere API - https://api.cohere.com/v1/models
  private async fetchCohereModels(): Promise<ProviderModels> {
    const apiKey = process.env.COHERE_API_KEY
    if (!apiKey) {
      return { provider: 'cohere', models: [], available: false, error: 'No API key configured', lastFetched: new Date() }
    }

    try {
      const response = await fetch('https://api.cohere.com/v1/models', {
        headers: { 'Authorization': `Bearer ${apiKey}` },
      })

      if (!response.ok) {
        throw new Error(`Cohere API error: ${response.status}`)
      }

      const data = await response.json()
      const models: ModelInfo[] = (data.models || [])
        .filter((m: any) => m.endpoints?.includes('chat'))
        .map((m: any) => ({
          id: m.name,
          name: this.formatModelName(m.name, 'cohere'),
          provider: 'cohere',
          contextWindow: m.context_length,
        }))

      return { provider: 'cohere', models, available: true, lastFetched: new Date() }
    } catch (error) {
      console.error('Failed to fetch Cohere models:', error)
      return { provider: 'cohere', models: [], available: false, error: String(error), lastFetched: new Date() }
    }
  }

  // Helper to format model IDs into readable names
  private formatModelName(id: string, provider: string): string {
    // Common patterns to format
    let name = id
      .replace(/-/g, ' ')
      .replace(/\./g, '.')
      .replace(/(\d+)([a-z])/gi, '$1 $2')
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ')

    // Provider-specific formatting
    switch (provider) {
      case 'claude':
        name = name.replace('Claude ', 'Claude ')
        break
      case 'openai':
        name = name.replace('Gpt ', 'GPT-').replace('O1', 'o1').replace('O3', 'o3')
        break
      case 'grok':
        name = name.replace('Grok ', 'Grok ')
        break
    }

    return name
  }

  // Clear cache for a specific provider or all
  clearCache(provider?: string): void {
    if (provider) {
      modelCache.delete(provider)
    } else {
      modelCache.clear()
    }
  }
}

export const modelService = ModelService.getInstance()

