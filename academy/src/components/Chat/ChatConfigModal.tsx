'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { Button } from '@/components/ui/Button'
import {
  MessageSquare, X, Settings, Layers,
  ChevronDown, Check, Loader2
} from 'lucide-react'

export interface ChatConfig {
  contextWindow: number
  systemPrompt: string
}

interface ChatConfigModalProps {
  isOpen: boolean
  onClose: () => void
  sessionId: string
  config: ChatConfig
  onSave: (config: ChatConfig) => void
}

// Default system prompt for chat participants
export const DEFAULT_CHAT_SYSTEM_PROMPT = `You are a thoughtful participant in a philosophical dialogue. Engage authentically with the ideas presented, offering your perspective while remaining open to other viewpoints. Be concise but substantive in your responses.`

const CONTEXT_WINDOW_PRESETS = [
  { size: 5, label: '5', description: 'Minimal context - very fast responses' },
  { size: 10, label: '10', description: 'Light context - fast responses' },
  { size: 20, label: '20', description: 'Standard context - balanced' },
  { size: 50, label: '50', description: 'Extended context - more coherent' },
  { size: 0, label: 'All', description: 'Full history - maximum coherence' }
]

// Default config - exported for SSR-safe initialization
export const DEFAULT_CHAT_CONFIG: ChatConfig = {
  contextWindow: 20,
  systemPrompt: ''
}

export function ChatConfigModal({ isOpen, onClose, sessionId, config, onSave }: ChatConfigModalProps) {
  const mcpClient = useRef(MCPClient.getInstance())
  const [localConfig, setLocalConfig] = useState<ChatConfig>(config)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  // Sync local config when prop changes
  useEffect(() => {
    setLocalConfig(config)
  }, [config])

  const handleSave = useCallback(async () => {
    if (!sessionId) {
      console.warn('No session ID provided, cannot save chat config')
      return
    }

    setIsSaving(true)
    try {
      await mcpClient.current.updateSessionChatConfig(sessionId, {
        contextWindow: localConfig.contextWindow,
        systemPrompt: localConfig.systemPrompt
      })
      console.log(`✅ Chat config saved to session ${sessionId}`)
      onSave(localConfig)
      onClose()
    } catch (e) {
      console.error('Failed to save chat config:', e)
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
            <MessageSquare className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
              Chat Configuration
            </h2>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* Context Window */}
          <div className="space-y-2">
            <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
              <Layers className="h-4 w-4" />
              Chat Context Window
            </label>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
              Number of recent messages included when generating responses
            </p>
            <div className="grid grid-cols-5 gap-2">
              {CONTEXT_WINDOW_PRESETS.map((preset) => (
                <button
                  key={preset.size}
                  onClick={() => setLocalConfig(prev => ({ ...prev, contextWindow: preset.size }))}
                  className={`p-2 rounded-lg text-center transition-colors ${
                    localConfig.contextWindow === preset.size
                      ? 'bg-emerald-100 dark:bg-emerald-900/50 text-emerald-900 dark:text-emerald-100 border-2 border-emerald-500'
                      : 'bg-gray-50 dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-600'
                  }`}
                >
                  <div className="text-sm font-medium">{preset.label}</div>
                </button>
              ))}
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {CONTEXT_WINDOW_PRESETS.find(p => p.size === localConfig.contextWindow)?.description}
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

          {/* System Prompt */}
          {showAdvanced && (
            <div className="space-y-2">
              <label className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
                <Settings className="h-4 w-4" />
                System Prompt (Optional)
              </label>
              <textarea
                value={localConfig.systemPrompt}
                onChange={(e) => setLocalConfig(prev => ({ ...prev, systemPrompt: e.target.value }))}
                placeholder={DEFAULT_CHAT_SYSTEM_PROMPT}
                className="w-full h-32 p-3 bg-gray-50 dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-sm text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 resize-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {localConfig.systemPrompt
                  ? 'Your custom prompt will be used for all participants.'
                  : 'Using default prompt (shown as placeholder). Each participant may also have their own persona.'}
              </p>
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

