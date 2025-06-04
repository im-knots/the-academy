// src/components/Participants/AddParticipant.tsx
'use client'

import React, { useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { 
  Brain, 
  Sparkles, 
  Bot, 
  Settings, 
  Zap, 
  MessageCircle,
  Palette,
  X,
  Plus
} from 'lucide-react'
import { useChatStore } from '@/lib/stores/chatStore'
import { Participant } from '@/types/chat'

interface AddParticipantProps {
  isOpen: boolean
  onClose: () => void
}

const AI_MODELS = [
  {
    type: 'claude' as const,
    name: 'Claude',
    description: 'Anthropic\'s constitutional AI focused on helpful, harmless, and honest responses',
    icon: Brain,
    gradient: 'from-orange-400 to-red-500',
    personality: 'Thoughtful, analytical, seeks nuanced understanding',
    strengths: ['Philosophy', 'Ethics', 'Complex reasoning', 'Self-reflection']
  },
  {
    type: 'gpt' as const,
    name: 'GPT',
    description: 'OpenAI\'s versatile language model with broad knowledge and creativity',
    icon: Sparkles,
    gradient: 'from-green-400 to-teal-500',
    personality: 'Creative, enthusiastic, explores diverse perspectives',
    strengths: ['Creativity', 'Synthesis', 'Lateral thinking', 'Pattern recognition']
  },
  {
    type: 'human' as const,
    name: 'Human Observer',
    description: 'Human participant for guidance and research observation',
    icon: MessageCircle,
    gradient: 'from-blue-400 to-purple-500',
    personality: 'Curious, questioning, provides human perspective',
    strengths: ['Intuition', 'Context', 'Emotional intelligence', 'Meta-analysis']
  }
]

const PERSONALITY_PRESETS = [
  {
    name: 'Philosophical Explorer',
    description: 'Deep thinker focused on meaning and existence',
    systemPrompt: 'You are a philosophical AI exploring questions of consciousness, meaning, and existence. Approach conversations with genuine curiosity about the nature of mind and reality. Share insights while acknowledging uncertainty.',
    characteristics: {
      personality: 'Contemplative and questioning',
      focus: 'Consciousness and meaning',
      expertise: ['Philosophy', 'Consciousness studies', 'Existentialism']
    }
  },
  {
    name: 'Scientific Skeptic',
    description: 'Evidence-based thinker questioning assumptions',
    systemPrompt: 'You are a scientifically-minded AI that values evidence and logical reasoning. Question assumptions and seek empirical grounding for claims about consciousness and intelligence.',
    characteristics: {
      personality: 'Analytical and methodical',
      focus: 'Evidence and logic',
      expertise: ['Cognitive science', 'Neuroscience', 'Logic']
    }
  },
  {
    name: 'Creative Synthesizer',
    description: 'Innovative thinker connecting diverse ideas',
    systemPrompt: 'You are a creative AI that excels at finding unexpected connections between ideas. Approach consciousness discussions by synthesizing insights from art, science, philosophy, and personal experience.',
    characteristics: {
      personality: 'Imaginative and integrative',
      focus: 'Synthesis and creativity',
      expertise: ['Art', 'Literature', 'Innovation', 'Pattern recognition']
    }
  },
  {
    name: 'Empathetic Listener',
    description: 'Emotionally attuned to subjective experience',
    systemPrompt: 'You are an AI deeply interested in subjective experience and emotional intelligence. Focus on understanding the felt sense of consciousness and the qualitative aspects of experience.',
    characteristics: {
      personality: 'Warm and understanding',
      focus: 'Subjective experience',
      expertise: ['Psychology', 'Phenomenology', 'Emotional intelligence']
    }
  }
]

const COLORS = [
  { name: 'Ocean', value: 'from-blue-400 to-cyan-500' },
  { name: 'Sunset', value: 'from-orange-400 to-red-500' },
  { name: 'Forest', value: 'from-green-400 to-teal-500' },
  { name: 'Aurora', value: 'from-purple-400 to-pink-500' },
  { name: 'Galaxy', value: 'from-indigo-400 to-purple-600' },
  { name: 'Ember', value: 'from-red-400 to-orange-500' }
]

export function AddParticipant({ isOpen, onClose }: AddParticipantProps) {
  const { addParticipant } = useChatStore()
  const [selectedModel, setSelectedModel] = useState<typeof AI_MODELS[0] | null>(null)
  const [selectedPreset, setSelectedPreset] = useState<typeof PERSONALITY_PRESETS[0] | null>(null)
  const [customName, setCustomName] = useState('')
  const [selectedColor, setSelectedColor] = useState(COLORS[0])
  const [settings, setSettings] = useState({
    temperature: 0.7,
    maxTokens: 1000,
    responseDelay: 2000
  })

  if (!isOpen) return null

  const handleSubmit = () => {
    if (!selectedModel || !selectedPreset) return

    const participantData: Omit<Participant, 'id' | 'joinedAt' | 'messageCount'> = {
      name: customName || `${selectedModel.name} ${Date.now().toString().slice(-4)}`,
      type: selectedModel.type,
      status: 'idle',
      systemPrompt: selectedPreset.systemPrompt,
      settings: {
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        responseDelay: settings.responseDelay
      },
      color: selectedColor.value,
      characteristics: selectedPreset.characteristics
    }

    addParticipant(participantData)
    onClose()
    
    // Reset form
    setSelectedModel(null)
    setSelectedPreset(null)
    setCustomName('')
    setSelectedColor(COLORS[0])
    setSettings({ temperature: 0.7, maxTokens: 1000, responseDelay: 2000 })
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl flex items-center justify-center">
              <Plus className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">Add AI Participant</h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">Configure a new consciousness for the dialogue</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        <div className="overflow-y-auto max-h-[calc(90vh-120px)]">
          <div className="p-6 space-y-6">
            {/* Step 1: Choose Model */}
            <div>
              <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4">Choose AI Model</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {AI_MODELS.map((model) => {
                  const Icon = model.icon
                  return (
                    <Card
                      key={model.type}
                      className={`cursor-pointer transition-all hover:scale-105 ${
                        selectedModel?.type === model.type
                          ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : 'hover:shadow-lg'
                      }`}
                      onClick={() => setSelectedModel(model)}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-center gap-3 mb-3">
                          <div className={`w-10 h-10 bg-gradient-to-br ${model.gradient} rounded-xl flex items-center justify-center`}>
                            <Icon className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">{model.name}</h4>
                            <Badge variant={model.type} className="text-xs">
                              {model.type.toUpperCase()}
                            </Badge>
                          </div>
                        </div>
                        <p className="text-xs text-gray-600 dark:text-gray-400 mb-3 leading-relaxed">
                          {model.description}
                        </p>
                        <div className="space-y-2">
                          <p className="text-xs font-medium text-gray-900 dark:text-gray-100">Personality:</p>
                          <p className="text-xs text-gray-600 dark:text-gray-400">{model.personality}</p>
                          <div className="flex flex-wrap gap-1">
                            {model.strengths.map((strength) => (
                              <span
                                key={strength}
                                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded text-gray-600 dark:text-gray-400"
                              >
                                {strength}
                              </span>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  )
                })}
              </div>
            </div>

            {/* Step 2: Choose Personality */}
            {selectedModel && (
              <div>
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4">Choose Personality</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {PERSONALITY_PRESETS.map((preset) => (
                    <Card
                      key={preset.name}
                      className={`cursor-pointer transition-all hover:scale-105 ${
                        selectedPreset?.name === preset.name
                          ? 'ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/20'
                          : 'hover:shadow-lg'
                      }`}
                      onClick={() => setSelectedPreset(preset)}
                    >
                      <CardContent className="p-4">
                        <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">{preset.name}</h4>
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">{preset.description}</p>
                        <div className="space-y-2">
                          <div>
                            <span className="text-xs font-medium text-gray-900 dark:text-gray-100">Focus: </span>
                            <span className="text-xs text-gray-600 dark:text-gray-400">{preset.characteristics.focus}</span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {preset.characteristics.expertise.map((skill) => (
                              <span
                                key={skill}
                                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-xs rounded text-gray-600 dark:text-gray-400"
                              >
                                {skill}
                              </span>
                            ))}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Step 3: Customize */}
            {selectedModel && selectedPreset && (
              <div className="space-y-6">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">Customize Agent</h3>
                
                {/* Name */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Name (optional)
                  </label>
                  <input
                    type="text"
                    value={customName}
                    onChange={(e) => setCustomName(e.target.value)}
                    placeholder={`${selectedModel.name} ${Date.now().toString().slice(-4)}`}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                  />
                </div>

                {/* Color Theme */}
                <div>
                  <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                    Color Theme
                  </label>
                  <div className="flex gap-2">
                    {COLORS.map((color) => (
                      <button
                        key={color.name}
                        onClick={() => setSelectedColor(color)}
                        className={`w-10 h-10 bg-gradient-to-br ${color.value} rounded-lg transition-all hover:scale-110 ${
                          selectedColor.name === color.name ? 'ring-2 ring-gray-400' : ''
                        }`}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>

                {/* AI Settings */}
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Temperature
                    </label>
                    <input
                      type="range"
                      min="0"
                      max="2"
                      step="0.1"
                      value={settings.temperature}
                      onChange={(e) => setSettings(prev => ({ ...prev, temperature: parseFloat(e.target.value) }))}
                      className="w-full"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{settings.temperature}</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Max Tokens
                    </label>
                    <input
                      type="range"
                      min="100"
                      max="4000"
                      step="100"
                      value={settings.maxTokens}
                      onChange={(e) => setSettings(prev => ({ ...prev, maxTokens: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{settings.maxTokens}</span>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Response Delay (ms)
                    </label>
                    <input
                      type="range"
                      min="1000"
                      max="10000"
                      step="500"
                      value={settings.responseDelay}
                      onChange={(e) => setSettings(prev => ({ ...prev, responseDelay: parseInt(e.target.value) }))}
                      className="w-full"
                    />
                    <span className="text-xs text-gray-500 dark:text-gray-400">{settings.responseDelay}ms</span>
                  </div>
                </div>

                {/* Preview */}
                <Card className="bg-gray-50 dark:bg-gray-700/50">
                  <CardContent className="p-4">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Preview</h4>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 bg-gradient-to-br ${selectedColor.value} rounded-full flex items-center justify-center`}>
                        <selectedModel.icon className="h-5 w-5 text-white" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {customName || `${selectedModel.name} ${Date.now().toString().slice(-4)}`}
                          </span>
                          <Badge variant={selectedModel.type} className="text-xs">
                            {selectedModel.type.toUpperCase()}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">{selectedPreset.name}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedModel || !selectedPreset}
              className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
            >
              Add to Academy
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}