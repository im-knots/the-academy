// src/components/Participants/AddParticipant.tsx - Updated with Dynamic Model Loading
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { useAvailableModels } from '@/hooks/useAvailableModels'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { X, Plus, Loader2, RefreshCw, AlertCircle } from 'lucide-react'
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
  const { modelOptions, providerStatus, isLoading: isLoadingModels, refresh: refreshModels } = useAvailableModels()
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
                      <div className="flex items-center justify-between mb-2">
                        <label className="block text-sm font-medium text-gray-900 dark:text-gray-100">
                          Model
                        </label>
                        <button
                          type="button"
                          onClick={() => refreshModels()}
                          disabled={isLoadingModels}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 disabled:opacity-50"
                        >
                          <RefreshCw className={`w-3 h-3 ${isLoadingModels ? 'animate-spin' : ''}`} />
                          Refresh
                        </button>
                      </div>
                      {isLoadingModels ? (
                        <div className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-100 dark:bg-gray-800 text-gray-500 flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Loading models...
                        </div>
                      ) : !providerStatus[selectedType]?.available ? (
                        <div className="w-full px-3 py-2 border border-yellow-300 dark:border-yellow-600 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm">
                            {providerStatus[selectedType]?.error || 'Provider not configured'}
                          </span>
                        </div>
                      ) : modelOptions[selectedType]?.length === 0 ? (
                        <div className="w-full px-3 py-2 border border-yellow-300 dark:border-yellow-600 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" />
                          <span className="text-sm">No models available</span>
                        </div>
                      ) : (
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
                      )}
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