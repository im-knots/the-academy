// src/components/Participants/AddParticipant.tsx
'use client'

import { useState } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { X, Plus, Brain, MessageSquare, User, Sparkles, Settings } from 'lucide-react'
import { Participant } from '@/types/chat'

interface AddParticipantProps {
  isOpen: boolean
  onClose: () => void
}

export function AddParticipant({ isOpen, onClose }: AddParticipantProps) {
  const { addParticipant, currentSession } = useChatStore()
  const [selectedType, setSelectedType] = useState<'claude' | 'gpt' | grok | 'human' | null>(null)
  const [name, setName] = useState('')
  const [customSettings, setCustomSettings] = useState({
    temperature: 0.7,
    maxTokens: 1000,
    model: '',
    personality: '',
    expertise: ''
  })

  const tokenSteps = [500, 1000, 2000, 4000]
  
  const modelOptions = {
    claude: [
      { value: 'claude-opus-4-20250514', label: 'Claude 4 Opus'},
      { value: 'claude-sonnet-4-20250514', label: 'Claude 4 Sonnet'},
      { value: 'claude-3-7-sonnet-20250219', lablel: 'Claude 3.7 Sonnet'},
      { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
      { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
      { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus' },
      { value: 'claude-3-sonnet-20240229', label: 'Claude 3 Sonnet' },
      { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' }
    ],
    gpt: [
      { value: 'gpt-4.1-2025-04-14', label: 'GPT-4.1' },
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
      badge: 'gpt'
    }
  ]

  const handleAdd = () => {
    if (!selectedType) return

    const participantName = name.trim() || `${selectedType === 'claude' ? 'Claude' : selectedType === 'gpt' ? 'GPT' : selectedType === 'grok' ? 'Grok'  : 'Human'} ${(currentSession?.participants.length || 0) + 1}`

    const newParticipant: Omit<Participant, 'id' | 'joinedAt' | 'messageCount'> = {
      name: participantName,
      type: selectedType,
      status: 'idle',
      settings: {
        temperature: customSettings.temperature,
        maxTokens: customSettings.maxTokens,
        model: selectedType !== 'human' ? (customSettings.model || modelOptions[selectedType]?.[0]?.value) : undefined,
      },
      characteristics: selectedType !== 'human' ? {
        personality: customSettings.personality || 'Curious and thoughtful',
        expertise: customSettings.expertise ? [customSettings.expertise] : ['General conversation']
      } : undefined
    }

    addParticipant(newParticipant)
    
    // Reset form
    setSelectedType(null)
    setName('')
    setCustomSettings({
      temperature: 0.7,
      maxTokens: 1000,
      model: '',
      personality: '',
      expertise: ''
    })
    
    onClose()
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
                    placeholder={`${selectedType === 'claude' ? 'Claude' : selectedType === 'gpt' ? 'GPT' : selectedType === 'grok' ? 'Grok'  : 'Human'} ${(currentSession?.participants.length || 0) + 1}`}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>

                {/* AI-specific settings */}
                {selectedType !== 'human' && (
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
                )}

                {/* Characteristics */}
                {selectedType !== 'human' && (
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
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer - Fixed */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleAdd}
              disabled={!selectedType}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Participant
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}