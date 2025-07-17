// src/components/Research/CreateExperimentModal.tsx - Updated with Internal Pub/Sub Event System
'use client'

import { useState, useRef, useCallback } from 'react'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { 
  X, Plus, Upload, Save, Users, AlertCircle,
  TestTubeDiagonal, FileJson, ChevronDown, ChevronUp, Settings
} from 'lucide-react'

interface ParticipantConfig {
  type: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere'
  name: string
  model?: string
  temperature: number
  maxTokens: number
  personality: string
  expertise: string
  ollamaUrl?: string
}

interface ExperimentConfig {
  id: string
  name: string
  participants: ParticipantConfig[]
  startingPrompt: string
  analysisContextSize: number
  analysisProvider: 'claude' | 'gpt'
  maxMessageCount: number
  totalSessions: number
  concurrentSessions: number
  sessionNamePattern: string
  errorRateThreshold: number
  createdAt: Date
  lastModified: Date
}

interface CreateExperimentModalProps {
  isOpen: boolean
  onClose: () => void
  onSave: (config: ExperimentConfig) => void
}

const participantTypes = [
  { type: 'claude' as const, name: 'Claude', description: 'Anthropic\'s AI assistant', badge: 'claude' },
  { type: 'gpt' as const, name: 'GPT', description: 'OpenAI\'s language model', badge: 'gpt' },
  { type: 'grok' as const, name: 'Grok', description: 'xAI\'s conversational AI', badge: 'grok' },
  { type: 'gemini' as const, name: 'Gemini', description: 'Google\'s multimodal AI', badge: 'gemini' },
  { type: 'ollama' as const, name: 'Ollama', description: 'Local language models', badge: 'ollama' },
  { type: 'deepseek' as const, name: 'DeepSeek', description: 'Advanced reasoning model', badge: 'deepseek' },
  { type: 'mistral' as const, name: 'Mistral', description: 'Efficient language model', badge: 'mistral' },
  { type: 'cohere' as const, name: 'Cohere', description: 'Enterprise AI platform', badge: 'cohere' }
]

const modelOptions = {
  claude: [
    { value: 'claude-opus-4-20250514', label: 'Claude 4 Opus'},
    { value: 'claude-sonnet-4-20250514', label: 'Claude 4 Sonnet'},
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
  ],
  gpt: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4o-mini', label: 'GPT-4o Mini' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' }
  ],
  grok: [
    { value: 'grok-2-latest', label: 'Grok 2' },
    { value: 'grok-2-mini', label: 'Grok 2 Mini' }
  ],
  gemini: [
    { value: 'gemini-2.0-flash-exp', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
    { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash' }
  ],
  ollama: [
    { value: 'llama3.2', label: 'Llama 3.2' },
    { value: 'mistral', label: 'Mistral' },
    { value: 'deepseek-r1:latest', label: 'DeepSeek R1' }
  ],
  deepseek: [
    { value: 'deepseek-chat', label: 'DeepSeek Chat' },
    { value: 'deepseek-coder', label: 'DeepSeek Coder' }
  ],
  mistral: [
    { value: 'mistral-large-latest', label: 'Mistral Large' },
    { value: 'mistral-medium', label: 'Mistral Medium' },
    { value: 'mistral-small', label: 'Mistral Small' }
  ],
  cohere: [
    { value: 'command-r-plus', label: 'Command R+' },
    { value: 'command-r', label: 'Command R' }
  ]
}

export function CreateExperimentModal({ isOpen, onClose, onSave }: CreateExperimentModalProps) {
  // ALL HOOKS MUST GO HERE FIRST - before any conditional returns
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [showParticipantPicker, setShowParticipantPicker] = useState(false)
  const [selectedTypes, setSelectedTypes] = useState<Set<typeof participantTypes[0]['type']>>(new Set())
  const [expandedParticipants, setExpandedParticipants] = useState<Set<number>>(new Set())
  
  const [formData, setFormData] = useState<Partial<ExperimentConfig>>({
    name: '',
    participants: [],
    startingPrompt: '',
    analysisContextSize: 10,
    analysisProvider: 'claude',
    maxMessageCount: 50,
    totalSessions: 25,
    concurrentSessions: 3,
    sessionNamePattern: '',
    errorRateThreshold: 0.1
  })

  // Auto-generate session name pattern whenever name changes
  const generateSessionNamePattern = useCallback((name: string) => {
    if (!name) return ''
    const sanitizedName = name.toLowerCase().replace(/\s+/g, '_')
    return `${sanitizedName}-<date>-<n>`
  }, [])

  // Update session name pattern when name changes
  const handleNameChange = useCallback((name: string) => {
    setFormData(prev => ({
      ...prev,
      name,
      sessionNamePattern: generateSessionNamePattern(name)
    }))
  }, [generateSessionNamePattern])

  // Reset form to initial state
  const resetForm = useCallback(() => {
    setFormData({
      name: '',
      participants: [],
      startingPrompt: '',
      analysisContextSize: 10,
      analysisProvider: 'claude',
      maxMessageCount: 50,
      totalSessions: 25,
      concurrentSessions: 3,
      sessionNamePattern: '',
      errorRateThreshold: 0.1
    })
    setSelectedTypes(new Set())
    setExpandedParticipants(new Set())
    setShowParticipantPicker(false)
  }, [])

  const handleCreate = useCallback(() => {
    if (!formData.name || !formData.startingPrompt || formData.participants?.length === 0) {
      return
    }
    
    const newExperiment: ExperimentConfig = {
      id: `exp-${Date.now()}`,
      ...formData as ExperimentConfig,
      createdAt: new Date(),
      lastModified: new Date()
    }
    
    console.log('🧪 CreateExperimentModal: Creating new experiment, will emit EXPERIMENT_CREATED event')
    
    // Call the parent save handler
    onSave(newExperiment)
    
    // EVENT-DRIVEN: Emit experiment created event via internal pub/sub
    eventBus.emit(EVENT_TYPES.EXPERIMENT_CREATED, {
      experimentId: newExperiment.id,
      experimentData: newExperiment
    })
    
    // Reset form and close modal
    resetForm()
    onClose()
  }, [formData, onSave, onClose, resetForm])

  // NOW we can do conditional rendering - after ALL hooks are called
  if (!isOpen) return null

  const handleToggleParticipantType = (type: typeof participantTypes[0]['type']) => {
    const newSelected = new Set(selectedTypes)
    if (newSelected.has(type)) {
      newSelected.delete(type)
    } else {
      newSelected.add(type)
    }
    setSelectedTypes(newSelected)
  }

  const handleAddSelectedParticipants = () => {
    const newParticipants: ParticipantConfig[] = Array.from(selectedTypes).map((type, index) => ({
      type,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)} ${(formData.participants?.length || 0) + index + 1}`,
      model: modelOptions[type]?.[0]?.value || '',
      temperature: 0.7,
      maxTokens: 1000,
      personality: '',
      expertise: '',
      ollamaUrl: type === 'ollama' ? 'http://localhost:11434' : undefined
    }))
    
    setFormData(prev => ({
      ...prev,
      participants: [...(prev.participants || []), ...newParticipants]
    }))
    setSelectedTypes(new Set())
    setShowParticipantPicker(false)
  }

  const handleRemoveParticipant = (index: number) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants?.filter((_, i) => i !== index) || []
    }))
    
    const newExpanded = new Set(expandedParticipants)
    newExpanded.delete(index)
    setExpandedParticipants(newExpanded)
  }

  const handleUpdateParticipant = (index: number, updates: Partial<ParticipantConfig>) => {
    setFormData(prev => ({
      ...prev,
      participants: prev.participants?.map((p, i) => i === index ? { ...p, ...updates } : p) || []
    }))
  }

  const toggleParticipantExpanded = (index: number) => {
    const newExpanded = new Set(expandedParticipants)
    if (newExpanded.has(index)) {
      newExpanded.delete(index)
    } else {
      newExpanded.add(index)
    }
    setExpandedParticipants(newExpanded)
  }

  const handleLoadTemplate = () => {
    fileInputRef.current?.click()
  }

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    
    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const json = JSON.parse(event.target?.result as string)
        // Regenerate session name pattern based on loaded name
        const updatedData = {
          ...json,
          sessionNamePattern: generateSessionNamePattern(json.name || '')
        }
        setFormData(updatedData)
      } catch (error) {
        console.error('Failed to parse template file:', error)
        alert('Failed to parse template file. Please check the file format.')
      }
    }
    reader.readAsText(file)
  }

  const handleSaveTemplate = () => {
    try {
      const dataStr = JSON.stringify(formData, null, 2)
      const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr)
      
      const exportFileDefaultName = `experiment-template-${Date.now()}.json`
      
      const linkElement = document.createElement('a')
      linkElement.setAttribute('href', dataUri)
      linkElement.setAttribute('download', exportFileDefaultName)
      linkElement.click()
    } catch (error) {
      console.error('Failed to save template:', error)
      alert('Failed to save template. Please try again.')
    }
  }

  const tokenSteps = [500, 1000, 2000, 4000]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-3xl bg-white dark:bg-gray-800 rounded-2xl shadow-2xl animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-green-500 to-blue-600 rounded-xl flex items-center justify-center">
              <TestTubeDiagonal className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Create New Experiment</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Configure your AI conversation experiment</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleLoadTemplate}>
              <Upload className="h-4 w-4 mr-1" />
              Load Template
            </Button>
            <Button variant="outline" size="sm" onClick={handleSaveTemplate}>
              <Save className="h-4 w-4 mr-1" />
              Save Template
            </Button>
            <Button variant="ghost" size="sm" onClick={onClose} className="ml-2">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="max-h-[70vh] overflow-y-auto">
          <div className="p-6 space-y-6">
            {/* Basic Information */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Basic Information</h3>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Experiment Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleNameChange(e.target.value)}
                  placeholder="e.g., Philosophy Deep Dive"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Moderator Starting Prompt
                </label>
                <textarea
                  value={formData.startingPrompt}
                  onChange={(e) => setFormData(prev => ({ ...prev, startingPrompt: e.target.value }))}
                  placeholder="Enter the initial prompt that will start each conversation..."
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            {/* Participants */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Participants</h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowParticipantPicker(!showParticipantPicker)}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add Participants
                </Button>
              </div>

              {showParticipantPicker && (
                <div className="space-y-3 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                  <p className="text-sm text-gray-600 dark:text-gray-400">Select multiple participants to add:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {participantTypes.map((type) => {
                      const isSelected = selectedTypes.has(type.type)
                      return (
                        <button
                          key={type.type}
                          onClick={() => handleToggleParticipantType(type.type)}
                          className={`flex items-center gap-3 p-3 rounded-lg transition-all text-left ${
                            isSelected 
                              ? 'bg-blue-50 dark:bg-blue-900/20 border-2 border-blue-500' 
                              : 'bg-white dark:bg-gray-600 border-2 border-transparent hover:border-gray-300 dark:hover:border-gray-500'
                          }`}
                        >
                          <ParticipantAvatar participantType={type.type} size="sm" />
                          <div className="flex-1">
                            <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{type.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{type.description}</p>
                          </div>
                          {isSelected && (
                            <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                              <div className="w-2 h-2 bg-white rounded-full" />
                            </div>
                          )}
                        </button>
                      )
                    })}
                  </div>
                  {selectedTypes.size > 0 && (
                    <Button 
                      onClick={handleAddSelectedParticipants}
                      size="sm"
                      className="w-full bg-gradient-to-r from-blue-500 to-green-600 hover:from-blue-600 hover:to-green-700"
                    >
                      Add {selectedTypes.size} Participant{selectedTypes.size > 1 ? 's' : ''}
                    </Button>
                  )}
                </div>
              )}

              {formData.participants && formData.participants.length > 0 ? (
                <div className="space-y-2">
                  {formData.participants.map((participant, index) => {
                    const isExpanded = expandedParticipants.has(index)
                    return (
                      <div key={index} className="border border-gray-200 dark:border-gray-600 rounded-lg overflow-hidden">
                        <div className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/50">
                          <ParticipantAvatar participantType={participant.type} size="sm" />
                          <div className="flex-1">
                            <input
                              type="text"
                              value={participant.name}
                              onChange={(e) => handleUpdateParticipant(index, { name: e.target.value })}
                              className="text-sm font-medium bg-transparent border-none outline-none text-gray-900 dark:text-gray-100 w-full"
                            />
                            <p className="text-xs text-gray-500 dark:text-gray-400">{participant.type.toUpperCase()}</p>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleParticipantExpanded(index)}
                            className="h-8 w-8"
                          >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleRemoveParticipant(index)}
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                        
                        {isExpanded && (
                          <div className="p-4 bg-white dark:bg-gray-800 space-y-4 border-t border-gray-200 dark:border-gray-600">
                            {/* Model Selection */}
                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Model
                              </label>
                              <select
                                value={participant.model}
                                onChange={(e) => handleUpdateParticipant(index, { model: e.target.value })}
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                              >
                                {modelOptions[participant.type]?.map((model) => (
                                  <option key={model.value} value={model.value}>
                                    {model.label}
                                  </option>
                                ))}
                              </select>
                            </div>

                            {participant.type === 'ollama' && (
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Ollama Server URL
                                </label>
                                <input
                                  type="text"
                                  value={participant.ollamaUrl}
                                  onChange={(e) => handleUpdateParticipant(index, { ollamaUrl: e.target.value })}
                                  placeholder="http://localhost:11434"
                                  className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                                />
                              </div>
                            )}

                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Temperature
                                </label>
                                <input
                                  type="range"
                                  min="0"
                                  max="2"
                                  step="0.1"
                                  value={participant.temperature}
                                  onChange={(e) => handleUpdateParticipant(index, { temperature: parseFloat(e.target.value) })}
                                  className="w-full"
                                />
                                <div className="text-xs text-gray-500 dark:text-gray-400 text-center">
                                  {participant.temperature.toFixed(1)}
                                </div>
                              </div>

                              <div>
                                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                  Max Tokens
                                </label>
                                <div className="flex gap-2">
                                  {tokenSteps.map((step) => (
                                    <button
                                      key={step}
                                      onClick={() => handleUpdateParticipant(index, { maxTokens: step })}
                                      className={`flex-1 text-xs py-1 rounded ${
                                        participant.maxTokens === step
                                          ? 'bg-blue-500 text-white'
                                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                                      }`}
                                    >
                                      {step >= 1000 ? `${step / 1000}k` : step}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Personality (optional)
                              </label>
                              <input
                                type="text"
                                value={participant.personality}
                                onChange={(e) => handleUpdateParticipant(index, { personality: e.target.value })}
                                placeholder="e.g., Curious, Analytical, Friendly"
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>

                            <div>
                              <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                                Expertise (optional)
                              </label>
                              <input
                                type="text"
                                value={participant.expertise}
                                onChange={(e) => handleUpdateParticipant(index, { expertise: e.target.value })}
                                placeholder="e.g., Philosophy, Science, Technology"
                                className="w-full px-2 py-1 text-sm border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-1 focus:ring-blue-500 focus:border-transparent"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              ) : (
                <div className="p-8 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-center">
                  <Users className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    No participants added yet
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Click "Add Participants" to select AI agents
                  </p>
                </div>
              )}

              {formData.participants && formData.participants.length < 2 && formData.participants.length > 0 && (
                <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-800 dark:text-amber-200">
                      <p className="font-medium mb-1">Need More Participants</p>
                      <p>Add at least 2 AI participants for conversations.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Analysis Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Analysis Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Analysis Context Size
                  </label>
                  <input
                    type="number"
                    value={formData.analysisContextSize}
                    onChange={(e) => setFormData(prev => ({ ...prev, analysisContextSize: parseInt(e.target.value) }))}
                    min="5"
                    max="100"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Analysis Provider
                  </label>
                  <select
                    value={formData.analysisProvider}
                    onChange={(e) => setFormData(prev => ({ ...prev, analysisProvider: e.target.value as 'claude' | 'gpt' }))}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="claude">Claude</option>
                    <option value="gpt">GPT</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Execution Settings */}
            <div className="space-y-4">
              <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">Execution Settings</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Total Sessions to Run
                  </label>
                  <input
                    type="number"
                    value={formData.totalSessions}
                    onChange={(e) => setFormData(prev => ({ ...prev, totalSessions: parseInt(e.target.value) }))}
                    min="1"
                    max="1000"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Concurrent Sessions
                  </label>
                  <input
                    type="number"
                    value={formData.concurrentSessions}
                    onChange={(e) => setFormData(prev => ({ ...prev, concurrentSessions: parseInt(e.target.value) }))}
                    min="1"
                    max="10"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Max Messages per Session
                  </label>
                  <input
                    type="number"
                    value={formData.maxMessageCount}
                    onChange={(e) => setFormData(prev => ({ ...prev, maxMessageCount: parseInt(e.target.value) }))}
                    min="10"
                    max="1000"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Session Name Pattern
                  </label>
                  <div className="w-full px-3 py-2 bg-gray-100 dark:bg-gray-700/50 border border-gray-300 dark:border-gray-600 rounded-lg">
                    <code className="text-sm text-gray-700 dark:text-gray-300 font-mono">
                      {formData.sessionNamePattern || 'Enter experiment name to generate pattern'}
                    </code>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Auto-generated based on experiment name
                  </p>
                </div>
                
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Error Rate Threshold (%)
                  </label>
                  <input
                    type="number"
                    value={(formData.errorRateThreshold || 0) * 100}
                    onChange={(e) => setFormData(prev => ({ ...prev, errorRateThreshold: parseFloat(e.target.value) / 100 }))}
                    min="0"
                    max="100"
                    step="0.1"
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreate}
              disabled={!formData.name || !formData.startingPrompt || !formData.participants || formData.participants.length < 2}
              className="bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700"
            >
              Create Experiment
            </Button>
          </div>
        </div>
      </div>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        onChange={handleFileUpload}
        className="hidden"
      />
    </div>
  )
}