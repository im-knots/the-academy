'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useAvailableModels, ModelOption } from '@/hooks/useAvailableModels'
import { MCPClient } from '@/lib/mcp/client'
import { Button } from '@/components/ui/Button'
import {
  Brain, X, Settings, Sparkles, Layers, MessageSquare,
  ChevronDown, Check, Loader2, AlertCircle, RefreshCw
} from 'lucide-react'

// Schema field definition
export interface AnalysisSchemaField {
  key: string
  label: string
  type: 'string' | 'array' | 'object' | 'enum'
  description: string
  enumValues?: string[] // For enum type
  objectSchema?: AnalysisSchemaField[] // For nested objects
}

export interface AnalysisSchema {
  fields: AnalysisSchemaField[]
}

export interface AnalysisConfig {
  provider: string
  model: string
  messageWindow: number
  customPrompt: string
  autoInterval: number // 0 = disabled, >0 = auto-analyze every N messages
  schema: AnalysisSchema
}

interface AnalysisConfigModalProps {
  isOpen: boolean
  onClose: () => void
  sessionId: string
  config: AnalysisConfig
  onSave: (config: AnalysisConfig) => void
}

// Default prompts - exported for use in other components
export const DEFAULT_ANALYSIS_PROMPT = 'You are an expert research assistant specializing in philosophical dialogue analysis. Provide precise, insightful analysis in the requested JSON format.'

// Default schema that matches the current analysis structure
export const DEFAULT_ANALYSIS_SCHEMA: AnalysisSchema = {
  fields: [
    { key: 'mainTopics', label: 'Main Topics', type: 'array', description: '3-5 main topics being discussed' },
    { key: 'keyInsights', label: 'Key Insights', type: 'array', description: 'Most important insights or conclusions' },
    { key: 'currentDirection', label: 'Current Direction', type: 'string', description: 'Where the conversation is heading' },
    { key: 'participantDynamics', label: 'Participant Dynamics', type: 'object', description: 'Each participant\'s perspective, contribution, and style' },
    { key: 'emergentThemes', label: 'Emergent Themes', type: 'array', description: 'New ideas emerging from the dialogue' },
    { key: 'conversationPhase', label: 'Conversation Phase', type: 'enum', description: 'Current phase of the dialogue', enumValues: ['opening', 'exploration', 'deepening', 'synthesis', 'conclusion'] },
    { key: 'tensions', label: 'Tensions', type: 'array', description: 'Points of disagreement or creative tension' },
    { key: 'convergences', label: 'Convergences', type: 'array', description: 'Points where participants agree or build on each other' },
    { key: 'nextLikelyDirections', label: 'Next Likely Directions', type: 'array', description: 'Predicted next topics or questions' },
    { key: 'philosophicalDepth', label: 'Philosophical Depth', type: 'enum', description: 'Depth of philosophical engagement', enumValues: ['surface', 'moderate', 'deep', 'profound'] }
  ]
}

const WINDOW_PRESETS = [
  { size: 0, label: 'All Messages', description: 'Analyze entire conversation history' },
  { size: 10, label: 'Last 10', description: 'Recent context only' },
  { size: 20, label: 'Last 20', description: 'Extended recent context' },
  { size: 50, label: 'Last 50', description: 'Deep context window' },
  { size: 100, label: 'Last 100', description: 'Very deep context' }
]

const AUTO_INTERVAL_PRESETS = [
  { value: 0, label: 'Off', description: 'Manual analysis only - click to analyze' },
  { value: 3, label: 'Every 3', description: 'Auto-analyze every 3 new messages' },
  { value: 5, label: 'Every 5', description: 'Auto-analyze every 5 new messages' },
  { value: 10, label: 'Every 10', description: 'Auto-analyze every 10 new messages' },
  { value: 20, label: 'Every 20', description: 'Auto-analyze every 20 new messages' }
]

const PROVIDER_INFO: Record<string, { name: string; description: string }> = {
  claude: { name: 'Claude', description: 'Deep philosophical analysis with nuanced reasoning' },
  gpt: { name: 'GPT', description: 'Pattern recognition and structured synthesis' },
  gemini: { name: 'Gemini', description: 'Multi-modal understanding and analysis' },
  grok: { name: 'Grok', description: 'Real-time knowledge with wit' },
  deepseek: { name: 'DeepSeek', description: 'Cost-effective deep analysis' },
  mistral: { name: 'Mistral', description: 'Fast European AI analysis' },
  cohere: { name: 'Cohere', description: 'Enterprise-grade text analysis' }
}

export function AnalysisConfigModal({ isOpen, onClose, sessionId, config, onSave }: AnalysisConfigModalProps) {
  const mcpClient = useRef(MCPClient.getInstance())
  const [localConfig, setLocalConfig] = useState<AnalysisConfig>(config)
  const [showProviderDropdown, setShowProviderDropdown] = useState(false)
  const [showModelDropdown, setShowModelDropdown] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [showSchemaEditor, setShowSchemaEditor] = useState(false)
  const [schemaText, setSchemaText] = useState('')
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const {
    modelOptions,
    providerStatus,
    isLoading: modelsLoading,
    refresh: refreshModels
  } = useAvailableModels()

  // Sync local config when prop changes
  useEffect(() => {
    setLocalConfig(config)
    // Initialize schema text from config
    try {
      setSchemaText(JSON.stringify(config.schema || DEFAULT_ANALYSIS_SCHEMA, null, 2))
      setSchemaError(null)
    } catch {
      setSchemaText(JSON.stringify(DEFAULT_ANALYSIS_SCHEMA, null, 2))
    }
  }, [config])

  // Get available providers (those with API keys configured)
  const availableProviders = Object.entries(providerStatus)
    .filter(([_, status]) => status.available)
    .map(([provider]) => provider)

  // Get models for selected provider
  const modelsForProvider = modelOptions[localConfig.provider] || []

  const handleProviderChange = useCallback((provider: string) => {
    const models = modelOptions[provider] || []
    const defaultModel = models.length > 0 ? models[0].value : ''
    setLocalConfig(prev => ({ ...prev, provider, model: defaultModel }))
    setShowProviderDropdown(false)
  }, [modelOptions])

  const handleModelChange = useCallback((model: string) => {
    setLocalConfig(prev => ({ ...prev, model }))
    setShowModelDropdown(false)
  }, [])

  const handleSchemaChange = useCallback((text: string) => {
    setSchemaText(text)
    try {
      const parsed = JSON.parse(text)
      // Validate basic structure
      if (!parsed.fields || !Array.isArray(parsed.fields)) {
        setSchemaError('Schema must have a "fields" array')
        return
      }
      // Validate each field has required properties
      for (const field of parsed.fields) {
        if (!field.key || !field.label || !field.type) {
          setSchemaError('Each field must have key, label, and type')
          return
        }
        if (!['string', 'array', 'object', 'enum'].includes(field.type)) {
          setSchemaError(`Invalid field type: ${field.type}. Must be string, array, object, or enum`)
          return
        }
      }
      setSchemaError(null)
      setLocalConfig(prev => ({ ...prev, schema: parsed }))
    } catch (e) {
      setSchemaError('Invalid JSON format')
    }
  }, [])

  const handleResetSchema = useCallback(() => {
    const defaultText = JSON.stringify(DEFAULT_ANALYSIS_SCHEMA, null, 2)
    setSchemaText(defaultText)
    setSchemaError(null)
    setLocalConfig(prev => ({ ...prev, schema: DEFAULT_ANALYSIS_SCHEMA }))
  }, [])

  const handleSave = useCallback(async () => {
    if (!sessionId) {
      console.warn('No session ID provided, cannot save analysis config')
      return
    }

    setIsSaving(true)
    try {
      // Save to session via MCP
      await mcpClient.current.updateSessionAnalysisConfig(sessionId, {
        provider: localConfig.provider,
        model: localConfig.model,
        messageWindow: localConfig.messageWindow,
        customPrompt: localConfig.customPrompt,
        autoInterval: localConfig.autoInterval,
        schema: localConfig.schema
      })
      console.log(`✅ Analysis config saved to session ${sessionId}`)
      onSave(localConfig)
      onClose()
    } catch (e) {
      console.error('Failed to save analysis config:', e)
    } finally {
      setIsSaving(false)
    }
  }, [sessionId, localConfig, onSave, onClose])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      
      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Analysis Configuration
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Provider Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Brain className="h-4 w-4" />
              Analysis Provider
            </label>
            <div className="relative">
              <button
                onClick={() => setShowProviderDropdown(!showProviderDropdown)}
                className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors"
              >
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {PROVIDER_INFO[localConfig.provider]?.name || localConfig.provider}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">
                    {PROVIDER_INFO[localConfig.provider]?.description || 'AI Provider'}
                  </div>
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${showProviderDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showProviderDropdown && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {availableProviders.length === 0 ? (
                    <div className="p-3 text-sm text-gray-500 dark:text-gray-400 text-center">
                      <AlertCircle className="h-4 w-4 mx-auto mb-1" />
                      No providers configured
                    </div>
                  ) : (
                    availableProviders.map((provider) => (
                      <button
                        key={provider}
                        onClick={() => handleProviderChange(provider)}
                        className={`w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                          localConfig.provider === provider ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-gray-900 dark:text-gray-100">
                              {PROVIDER_INFO[provider]?.name || provider}
                            </div>
                            <div className="text-xs text-gray-500 dark:text-gray-400">
                              {PROVIDER_INFO[provider]?.description || 'AI Provider'}
                            </div>
                          </div>
                          {localConfig.provider === provider && (
                            <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          )}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Model Selection */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              Model
              {modelsLoading && <Loader2 className="h-3 w-3 animate-spin" />}
            </label>
            <div className="relative">
              <button
                onClick={() => setShowModelDropdown(!showModelDropdown)}
                disabled={modelsLoading || modelsForProvider.length === 0}
                className="w-full flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-left hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
              >
                <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                  {localConfig.model || 'Select a model...'}
                </div>
                <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform flex-shrink-0 ${showModelDropdown ? 'rotate-180' : ''}`} />
              </button>

              {showModelDropdown && modelsForProvider.length > 0 && (
                <div className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                  {modelsForProvider.map((model: ModelOption) => (
                    <button
                      key={model.value}
                      onClick={() => handleModelChange(model.value)}
                      className={`w-full p-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                        localConfig.model === model.value ? 'bg-indigo-50 dark:bg-indigo-900/30' : ''
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-gray-900 dark:text-gray-100 truncate">
                          {model.label}
                        </span>
                        {localConfig.model === model.value && (
                          <Check className="h-4 w-4 text-indigo-600 dark:text-indigo-400 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => refreshModels()}
              className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              Refresh available models
            </button>
          </div>

          {/* Context Window */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Context Window
            </label>
            <div className="grid grid-cols-5 gap-2">
              {WINDOW_PRESETS.map((preset) => (
                <button
                  key={preset.size}
                  onClick={() => setLocalConfig(prev => ({ ...prev, messageWindow: preset.size }))}
                  className={`p-2 rounded-lg text-center transition-colors ${
                    localConfig.messageWindow === preset.size
                      ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-900 dark:text-indigo-100 border-2 border-indigo-500'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  <div className="text-sm font-medium">{preset.label}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {WINDOW_PRESETS.find(p => p.size === localConfig.messageWindow)?.description}
            </p>
          </div>

          {/* Auto-Analysis Interval */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Settings className="h-4 w-4" />
              Auto-Analysis
            </label>
            <div className="grid grid-cols-5 gap-2">
              {AUTO_INTERVAL_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  onClick={() => setLocalConfig(prev => ({ ...prev, autoInterval: preset.value }))}
                  className={`p-2 rounded-lg text-center transition-colors ${
                    localConfig.autoInterval === preset.value
                      ? 'bg-indigo-100 dark:bg-indigo-900/50 text-indigo-900 dark:text-indigo-100 border-2 border-indigo-500'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  <div className="text-sm font-medium">{preset.label}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {AUTO_INTERVAL_PRESETS.find(p => p.value === localConfig.autoInterval)?.description}
            </p>
          </div>

          {/* Advanced Options Toggle */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
          >
            <ChevronDown className={`h-4 w-4 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
            Advanced Options
          </button>

          {/* Custom Prompt */}
          {showAdvanced && (
            <div className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                  <MessageSquare className="h-4 w-4" />
                  Custom Analysis Prompt (Optional)
                </label>
                <textarea
                  value={localConfig.customPrompt}
                  onChange={(e) => setLocalConfig(prev => ({ ...prev, customPrompt: e.target.value }))}
                  placeholder={DEFAULT_ANALYSIS_PROMPT}
                  className="w-full h-32 p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {localConfig.customPrompt
                    ? 'Your custom prompt will replace the default prompt shown above.'
                    : 'Using default prompt (shown as placeholder). Enter text to customize.'}
                </p>
              </div>

              {/* Schema Editor Toggle */}
              <button
                onClick={() => setShowSchemaEditor(!showSchemaEditor)}
                className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100"
              >
                <ChevronDown className={`h-4 w-4 transition-transform ${showSchemaEditor ? 'rotate-180' : ''}`} />
                Analysis Output Schema
              </button>

              {/* Schema Editor */}
              {showSchemaEditor && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                      <Settings className="h-4 w-4" />
                      Output Schema (JSON)
                    </label>
                    <Button variant="ghost" size="sm" onClick={handleResetSchema}>
                      <RefreshCw className="h-3 w-3 mr-1" />
                      Reset to Default
                    </Button>
                  </div>
                  <textarea
                    value={schemaText}
                    onChange={(e) => handleSchemaChange(e.target.value)}
                    className={`w-full h-64 p-3 font-mono text-xs bg-gray-50 dark:bg-gray-700 border rounded-lg text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${
                      schemaError
                        ? 'border-red-500 dark:border-red-500'
                        : 'border-gray-200 dark:border-gray-600'
                    }`}
                  />
                  {schemaError ? (
                    <p className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {schemaError}
                    </p>
                  ) : (
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      Define what fields the analysis should return. The AI will generate output matching this structure.
                    </p>
                  )}
                  <div className="p-3 bg-gray-100 dark:bg-gray-800 rounded-lg">
                    <p className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Current Fields:</p>
                    <div className="flex flex-wrap gap-1">
                      {(localConfig.schema?.fields || []).map((field) => (
                        <span
                          key={field.key}
                          className="px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 rounded text-xs"
                        >
                          {field.label}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/50">
          <div className="text-xs text-gray-500 dark:text-gray-400">
            Configuration will be saved to session
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={isSaving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-1" />
              )}
              {isSaving ? 'Saving...' : 'Save Configuration'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

// Default config - exported for SSR-safe initialization
export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  provider: 'claude',
  model: 'claude-sonnet-4-5-20250929',
  messageWindow: 10,
  customPrompt: '',
  autoInterval: 5, // Every 5 messages by default
  schema: DEFAULT_ANALYSIS_SCHEMA
}
