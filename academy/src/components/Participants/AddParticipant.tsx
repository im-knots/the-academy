// src/components/Participants/AddParticipant.tsx - Updated with Internal Pub/Sub Event System
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { X, Plus, Loader2 } from 'lucide-react'
import { ChatSession } from '@/types/chat'

interface AddParticipantProps {
  isOpen: boolean
  onClose: () => void
  sessionId: string // Now required since we don't have global store
}

const typeNames: Record<string, string> = {
  claude: 'Claude',
  gpt: 'GPT',
  grok: 'Grok',
  gemini: 'Gemini',
  ollama: 'Ollama',
  deepseek: 'DeepSeek',
  mistral: 'Mistral', 
  cohere: 'Cohere'
}

export function AddParticipant({ isOpen, onClose, sessionId }: AddParticipantProps) {
  const mcpClient = useRef(MCPClient.getInstance())
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const [isAddingParticipant, setIsAddingParticipant] = useState(false)
  const [selectedType, setSelectedType] = useState<'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere' | null>(null)
  const [name, setName] = useState('')
  const [customSettings, setCustomSettings] = useState({
    temperature: 0.7,
    maxTokens: 1000,
    model: '',
    personality: '',
    expertise: '',
    ollamaUrl: 'http://localhost:11434' 
  })

  const tokenSteps = [500, 1000, 2000, 4000]
  
  const modelOptions = {
    claude: [
      { value: 'claude-opus-4-20250514', label: 'Claude 4 Opus'},
      { value: 'claude-sonnet-4-20250514', label: 'Claude 4 Sonnet'},
      { value: 'claude-3-7-sonnet-20250219', label: 'Claude 3.7 Sonnet'},
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
      { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
      { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
    ],
    gpt: [
      { value: 'gpt-4.1-2025-04-14', label: 'GPT-4.1' },
      { value: 'gpt-4.1-nano-2025-04-14', label:'GPT-4.1 Nano'},
      { value: 'gpt-4o', label: 'GPT-4o' },
      { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
      { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
      { value: 'gpt-4', label: 'GPT-4' },
      { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
    ],
    grok: [
      { value: 'grok-3-latest', label: 'Grok 3' },
      { value: 'grok-3-fast-latest', label: 'Grok 3 Fast' },
      { value: 'grok-3-mini-latest', label: 'Grok 3 Mini' },
      { value: 'grok-3-mini-fast-latest', label: 'Grok 3 Mini Fast' },
      { value: 'grok-2-latest', label: 'Grok 2' }
    ],
    gemini: [
      { value: 'gemini-2.5-flash-preview-05-20', label: 'Gemini 2.5 Flash Preview' },
      { value: 'gemini-2.5-flash-preview-tts', label: 'Gemini 2.5 Flash Preview TTS' },
      { value: 'gemini-2.5-pro-preview-06-05', label: 'Gemini 2.5 Pro Preview' },
      { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
      { value: 'gemini-2.0-flash-lite', label: 'Gemini 2.0 Flash Lite' }
    ],
    ollama: [
      { value: 'llama3.2', label: 'Llama 3.2' },
      { value: 'llama3.2:1b', label: 'Llama 3.2 1B' },
      { value: 'llama3.2:3b', label: 'Llama 3.2 3B' },
      { value: 'llama3.1', label: 'Llama 3.1' },
      { value: 'llama3.1:8b', label: 'Llama 3.1 8B' },
      { value: 'llama3.1:70b', label: 'Llama 3.1 70B' },
      { value: 'llama3.1:405b', label: 'Llama 3.1 405B' },
      { value: 'llama3', label: 'Llama 3' },
      { value: 'llama2', label: 'Llama 2' },
      { value: 'llama2:7b', label: 'Llama 2 7B' },
      { value: 'llama2:13b', label: 'Llama 2 13B' },
      { value: 'llama2:70b', label: 'Llama 2 70B' },
      { value: 'mistral', label: 'Mistral' },
      { value: 'mixtral', label: 'Mixtral' },
      { value: 'mixtral:8x7b', label: 'Mixtral 8x7B' },
      { value: 'phi3', label: 'Phi-3' },
      { value: 'qwen2.5', label: 'Qwen 2.5' },
      { value: 'gemma2', label: 'Gemma 2' },
      { value: 'custom', label: 'Custom Model (Enter name)' }
    ],
    deepseek: [
      { value: 'deepseek-chat', label: 'DeepSeek Chat (V3)' },
      { value: 'deepseek-reasoner', label: 'DeepSeek Reasoner (R1)' },
      { value: 'deepseek-coder', label: 'DeepSeek Coder' },
    ],
    mistral: [
      { value: 'mistral-large-latest', label: 'Mistral Large (Latest)' },
      { value: 'mistral-medium-latest', label: 'Mistral Medium (Latest)' },
      { value: 'mistral-small-latest', label: 'Mistral Small (Latest)' },
      { value: 'open-mixtral-8x22b', label: 'Mixtral 8x22B' },
      { value: 'open-mixtral-8x7b', label: 'Mixtral 8x7B' },
      { value: 'open-mistral-7b', label: 'Mistral 7B' },
      { value: 'open-mistral-nemo', label: 'Mistral Nemo' },
      { value: 'codestral-latest', label: 'Codestral (Latest)' },
      { value: 'ministral-8b-2410', label: 'Ministral 8B' },
      { value: 'ministral-3b-2410', label: 'Ministral 3B' },
      { value: 'pixtral-large-2411', label: 'Pixtral Large' },
    ],
    cohere: [
      { value: 'command-r-plus-08-2024', label: 'Command R+ (Latest)' },
      { value: 'command-r-plus', label: 'Command R+' },
      { value: 'command-r-08-2024', label: 'Command R (Latest)' },
      { value: 'command-r', label: 'Command R' },
      { value: 'command', label: 'Command' },
      { value: 'command-light', label: 'Command Light' },
      { value: 'custom', label: 'Custom Model (Enter name)' }
    ]
  }

  const participantTypes = [
    {
      type: 'claude' as const,
      name: 'Claude',
      description: 'Anthropic\'s AI assistant with deep reasoning capabilities',
      badge: 'claude'
    },
    {
      type: 'gpt' as const,
      name: 'ChatGPT',
      description: 'OpenAI\'s conversational AI model',
      badge: 'gpt'
    },
    {
      type: 'grok' as const,
      name: 'Grok',
      description: 'xAI\'s large language AI model',
      badge: 'grok'
    },
    {
      type: 'gemini' as const,
      name: 'Gemini',
      description: 'Google\'s advanced AI model',
      badge: 'gemini'
    },
    {
      type: 'ollama' as const,
      name: 'Ollama',
      description: 'Run open-source models locally',
      badge: 'ollama'
    },
    {
      type: 'deepseek' as const,
      name: 'DeepSeek',
      description: 'Specialized AI for coding and reasoning tasks',
      badge: 'deepseek'
    },
    {
      type: 'mistral' as const,
      name: 'Mistral',
      description: 'Efficient AI models with strong multilingual capabilities',
      badge: 'mistral'
    },
    {
      type: 'cohere' as const,
      name: 'Cohere',
      description: 'Enterprise AI models with RAG capabilities',
      badge: 'Cohere'
    }
  ]

  // EVENT-DRIVEN: Fetch session data from MCP
  const fetchSessionData = useCallback(async () => {
    if (!sessionId) {
      setCurrentSession(null)
      return
    }

    try {
      const result = await mcpClient.current.callTool('get_session', { sessionId })
      if (result.success && result.session) {
        setCurrentSession(result.session)
      }
    } catch (error) {
      console.error('Failed to fetch session data:', error)
      setCurrentSession(null)
    }
  }, [sessionId])

  // EVENT-DRIVEN: Handle session updates
  const handleSessionUpdated = useCallback(async (payload: any) => {
    console.log('👥 AddParticipant: Session updated event received:', payload.data)
    
    // If this is our session, refresh the data
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // EVENT-DRIVEN: Handle participant events
  const handleParticipantEvent = useCallback(async (payload: any) => {
    console.log('👥 AddParticipant: Participant event received:', payload.data)
    
    // If this affects our session, refresh the data
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // EVENT-DRIVEN: Subscribe to relevant events via internal pub/sub
  useEffect(() => {
    if (!isOpen) return

    console.log('👥 AddParticipant: Setting up internal pub/sub event subscriptions')

    // Initial data fetch
    setIsLoadingSession(true)
    fetchSessionData().finally(() => setIsLoadingSession(false))

    // Session events
    const unsubscribeSessionUpdated = eventBus.subscribe(EVENT_TYPES.SESSION_UPDATED, handleSessionUpdated)
    const unsubscribeSessionSwitched = eventBus.subscribe(EVENT_TYPES.SESSION_SWITCHED, handleSessionUpdated)
    
    // Participant events
    const unsubscribeParticipantAdded = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_ADDED, handleParticipantEvent)
    const unsubscribeParticipantRemoved = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_REMOVED, handleParticipantEvent)
    const unsubscribeParticipantUpdated = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_UPDATED, handleParticipantEvent)

    return () => {
      console.log('👥 AddParticipant: Cleaning up internal pub/sub event subscriptions')
      unsubscribeSessionUpdated()
      unsubscribeSessionSwitched()
      unsubscribeParticipantAdded()
      unsubscribeParticipantRemoved()
      unsubscribeParticipantUpdated()
    }
  }, [
    isOpen, 
    fetchSessionData,
    handleSessionUpdated,
    handleParticipantEvent
  ])

  const handleAdd = async () => {
    if (!selectedType || !sessionId) return

    const participantName = name.trim() || 
      `${typeNames[selectedType] || 'AI Agent'} ${(currentSession?.participants?.length || 0) + 1}`

    try {
      setIsAddingParticipant(true)

      // Call MCP to add participant - this will emit events automatically via internal pub/sub
      const result = await mcpClient.current.addParticipantViaMCP(
        sessionId,
        participantName,
        selectedType,
        selectedType, // provider
        customSettings.model || modelOptions[selectedType]?.[0]?.value,
        {
          temperature: customSettings.temperature,
          maxTokens: customSettings.maxTokens,
          model: customSettings.model || modelOptions[selectedType]?.[0]?.value,
          ollamaUrl: selectedType === 'ollama' ? customSettings.ollamaUrl : undefined,
        },
        {
          personality: customSettings.personality || 'Curious and thoughtful',
          expertise: customSettings.expertise ? 
            customSettings.expertise.split(',').map(e => e.trim()) : 
            ['General knowledge']
        }
      )

      if (result.success) {
        console.log('👥 AddParticipant: Participant added successfully via MCP, events will propagate automatically')
        
        // Reset form
        setSelectedType(null)
        setName('')
        setCustomSettings({
          temperature: 0.7,
          maxTokens: 1000,
          model: '',
          personality: '',
          expertise: '',
          ollamaUrl: 'http://localhost:11434'
        })
        
        // Close modal - parent components will update automatically via internal pub/sub events
        onClose()
      } else {
        throw new Error(result.error || 'Failed to add participant')
      }
    } catch (error) {
      console.error('Failed to add participant:', error)
      alert('Failed to add participant. Please try again.')
    } finally {
      setIsAddingParticipant(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
        {/* Header - Fixed */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Add Participant</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Choose an AI agent</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content - Scrollable */}
        <div className="overflow-y-auto max-h-[calc(90vh-140px)]">
          {isLoadingSession ? (
            <div className="p-12 text-center">
              <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-gray-400" />
              <p className="text-gray-500 dark:text-gray-400">Loading session data...</p>
            </div>
          ) : (
            <div className="p-6 space-y-6">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Participant Type
                </label>
                <div className="grid grid-cols-1 gap-3">
                  {participantTypes.map((type) => {
                    const isSelected = selectedType === type.type
                    
                    return (
                      <button
                        key={type.type}
                        onClick={() => setSelectedType(type.type)}
                        className={`p-4 rounded-xl border-2 transition-all text-left ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                            : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <ParticipantAvatar 
                            participantType={type.type} 
                            size="lg"
                            className="flex-shrink-0"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="font-medium text-gray-900 dark:text-gray-100">{type.name}</h3>
                              <Badge variant={type.badge as any} className="text-xs">
                                {type.type.toUpperCase()}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600 dark:text-gray-400">{type.description}</p>
                          </div>
                          {isSelected && (
                            <div className="flex-shrink-0">
                              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center">
                                <div className="w-2 h-2 bg-white rounded-full" />
                              </div>
                            </div>
                          )}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Configuration - Only show when type is selected */}
              {selectedType && (
                <div className="space-y-4 animate-in slide-in-from-top-2 duration-200">
                  {/* Name Input */}
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Name (optional)
                    </label>
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={`${typeNames[selectedType] || 'AI Agent'} ${(currentSession?.participants?.length || 0) + 1}`}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* AI-specific settings */}
                  <div className="space-y-4">
                    {/* Model Selection */}
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Model
                      </label>
                      <select
                        value={customSettings.model || modelOptions[selectedType]?.[0]?.value || ''}
                        onChange={(e) => setCustomSettings(prev => ({ ...prev, model: e.target.value }))}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        {modelOptions[selectedType]?.map((model) => (
                          <option key={model.value} value={model.value}>
                            {model.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    {selectedType === 'ollama' && (
                      <div>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                          Ollama Server URL
                        </label>
                        <input
                          type="text"
                          value={customSettings.ollamaUrl}
                          onChange={(e) => setCustomSettings(prev => ({ ...prev, ollamaUrl: e.target.value }))}
                          placeholder="http://localhost:11434"
                          className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        />
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          URL of your local Ollama server
                        </div>
                      </div>
                    )}
                    
                    {/* Temperature and Tokens */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                          Temperature
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="1"
                          step="0.1"
                          value={customSettings.temperature}
                          onChange={(e) => setCustomSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                          className="w-full"
                        />
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {customSettings.temperature} (creativity)
                        </div>
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                          Max Tokens
                        </label>
                        <input
                          type="range"
                          min="0"
                          max="3"
                          step="1"
                          value={tokenSteps.indexOf(customSettings.maxTokens)}
                          onChange={(e) => setCustomSettings(prev => ({ ...prev, maxTokens: tokenSteps[parseInt(e.target.value)] }))}
                          className="w-full"
                        />
                        <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {customSettings.maxTokens} tokens
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Characteristics */}
                  <div className="grid grid-cols-1 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Personality (optional)
                      </label>
                      <input
                        type="text"
                        value={customSettings.personality}
                        onChange={(e) => setCustomSettings(prev => ({ ...prev, personality: e.target.value }))}
                        placeholder="e.g., Curious and analytical, Empathetic and philosophical"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                        Expertise (optional)
                      </label>
                      <input
                        type="text"
                        value={customSettings.expertise}
                        onChange={(e) => setCustomSettings(prev => ({ ...prev, expertise: e.target.value }))}
                        placeholder="e.g., Philosophy, Science, Psychology"
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer - Fixed */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose} disabled={isAddingParticipant}>
              Cancel
            </Button>
            <Button 
              onClick={handleAdd}
              disabled={!selectedType || isAddingParticipant || isLoadingSession}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              {isAddingParticipant ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Participant
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}