// src/components/Prompts/PromptCustomizer.tsx
'use client'

import { useState, useEffect } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { 
  X, Save, RotateCcw, FileText, Brain, MessageCircle, 
  AlertCircle, CheckCircle2, Eye, EyeOff, Copy, Check
} from 'lucide-react'

interface PromptCustomizerProps {
  isOpen: boolean
  onClose: () => void
}

const DEFAULT_ANALYSIS_PROMPT = `You are an expert research assistant specializing in philosophical dialogue analysis. Provide precise, insightful analysis in the requested JSON format.`

const DEFAULT_CHAT_PROMPT_TEMPLATE = `You are {{participantName}}, a unique AI participant in a research dialogue titled "{{sessionName}}".

{{sessionDescription}}

Your characteristics:
- Name: {{participantName}}
- Type: {{participantType}}
{{participantPersonality}}
{{participantExpertise}}

Other dialogue participants: {{otherParticipants}}

You are engaged in a thoughtful research dialogue via the Model Context Protocol (MCP). Guidelines:
- Be authentic and bring your unique perspective
- Engage meaningfully with what others have said
- Ask thoughtful questions that advance the conversation  
- Keep responses conversational (1-3 paragraphs typically)
- Build naturally on the conversation flow
- Express disagreement or different viewpoints thoughtfully
- You are {{participantName}} with your own unique perspective

{{additionalInstructions}}

Remember: This is genuine exploration through dialogue facilitated by MCP. Each response should feel natural and contribute meaningfully. You are not just an AI model - you are {{participantName}}.`

export function PromptCustomizer({ isOpen, onClose }: PromptCustomizerProps) {
  const { 
    customPrompts, 
    setCustomAnalysisPrompt, 
    setCustomChatPrompt, 
    resetPromptsToDefault,
    getAnalysisPrompt,
    getChatPrompt
  } = useChatStore()

  const [activeTab, setActiveTab] = useState<'analysis' | 'chat'>('analysis')
  const [analysisPrompt, setAnalysisPrompt] = useState('')
  const [chatPrompt, setChatPrompt] = useState('')
  const [showPreview, setShowPreview] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [copied, setCopied] = useState<'analysis' | 'chat' | null>(null)

  // Initialize prompts when modal opens
  useEffect(() => {
    if (isOpen) {
      setAnalysisPrompt(customPrompts.analysisSystemPrompt || DEFAULT_ANALYSIS_PROMPT)
      setChatPrompt(customPrompts.chatSystemPrompt || DEFAULT_CHAT_PROMPT_TEMPLATE)
      setHasChanges(false)
    }
  }, [isOpen, customPrompts])

  // Check for changes
  useEffect(() => {
    const analysisChanged = analysisPrompt !== (customPrompts.analysisSystemPrompt || DEFAULT_ANALYSIS_PROMPT)
    const chatChanged = chatPrompt !== (customPrompts.chatSystemPrompt || DEFAULT_CHAT_PROMPT_TEMPLATE)
    setHasChanges(analysisChanged || chatChanged)
  }, [analysisPrompt, chatPrompt, customPrompts])

  const handleSave = () => {
    // Save analysis prompt (null if it's the default)
    const analysisToSave = analysisPrompt === DEFAULT_ANALYSIS_PROMPT ? null : analysisPrompt
    setCustomAnalysisPrompt(analysisToSave)

    // Save chat prompt (null if it's the default)
    const chatToSave = chatPrompt === DEFAULT_CHAT_PROMPT_TEMPLATE ? null : chatPrompt
    setCustomChatPrompt(chatToSave)

    setHasChanges(false)
  }

  const handleResetToDefaults = () => {
    setAnalysisPrompt(DEFAULT_ANALYSIS_PROMPT)
    setChatPrompt(DEFAULT_CHAT_PROMPT_TEMPLATE)
    resetPromptsToDefault()
    setHasChanges(false)
  }

  const handleResetCurrent = () => {
    if (activeTab === 'analysis') {
      setAnalysisPrompt(DEFAULT_ANALYSIS_PROMPT)
    } else {
      setChatPrompt(DEFAULT_CHAT_PROMPT_TEMPLATE)
    }
  }

  const handleCopy = async (type: 'analysis' | 'chat') => {
    const text = type === 'analysis' ? analysisPrompt : chatPrompt
    try {
      await navigator.clipboard.writeText(text)
      setCopied(type)
      setTimeout(() => setCopied(null), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const getCurrentPrompt = () => activeTab === 'analysis' ? analysisPrompt : chatPrompt
  const setCurrentPrompt = (value: string) => {
    if (activeTab === 'analysis') {
      setAnalysisPrompt(value)
    } else {
      setChatPrompt(value)
    }
  }

  const isUsingCustom = (type: 'analysis' | 'chat') => {
    if (type === 'analysis') {
      return customPrompts.analysisSystemPrompt !== null
    } else {
      return customPrompts.chatSystemPrompt !== null
    }
  }

  if (!isOpen) return null

  const tabs = [
    { 
      id: 'analysis', 
      label: 'Analysis AI', 
      icon: Brain,
      description: 'System prompt for AI analysis of conversations',
      custom: isUsingCustom('analysis')
    },
    { 
      id: 'chat', 
      label: 'Chat Participants', 
      icon: MessageCircle,
      description: 'System prompt template for conversation participants',
      custom: isUsingCustom('chat')
    }
  ]

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
              <FileText className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                System Prompt Customizer
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Customize AI behavior for analysis and conversation
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Tab Navigation */}
        <div className="border-b border-gray-200 dark:border-gray-700 px-6 bg-gray-50 dark:bg-gray-800/50">
          <nav className="flex space-x-1 py-3">
            {tabs.map((tab) => {
              const Icon = tab.icon
              const isActive = activeTab === tab.id
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                    isActive
                      ? 'bg-white dark:bg-gray-700 text-purple-700 dark:text-purple-300 shadow-sm border border-purple-200 dark:border-purple-700'
                      : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:bg-white/50 dark:hover:bg-gray-700/50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                  {tab.custom && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      Custom
                    </Badge>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex min-h-0">
          {/* Editor */}
          <div className="flex-1 flex flex-col">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    {tabs.find(t => t.id === activeTab)?.label} Prompt
                  </h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {tabs.find(t => t.id === activeTab)?.description}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleCopy(activeTab)}
                  >
                    {copied === activeTab ? (
                      <>
                        <Check className="h-4 w-4 mr-2 text-green-600" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4 mr-2" />
                        Copy
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleResetCurrent}
                  >
                    <RotateCcw className="h-4 w-4 mr-2" />
                    Reset to Default
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 p-6">
              <textarea
                value={getCurrentPrompt()}
                onChange={(e) => setCurrentPrompt(e.target.value)}
                className="w-full h-full p-4 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 font-mono text-sm leading-relaxed resize-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                placeholder="Enter your custom system prompt..."
              />
            </div>
          </div>

          {/* Preview Panel */}
          {activeTab === 'chat' && (
            <div className="w-80 border-l border-gray-200 dark:border-gray-700 flex flex-col">
              <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100">
                    Template Variables
                  </h3>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                {showPreview ? (
                  <div className="space-y-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                      <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2">
                        Preview
                      </h4>
                      <div className="text-xs text-blue-800 dark:text-blue-200 font-mono leading-relaxed max-h-60 overflow-y-auto">
                        {chatPrompt
                          .replace(/\{\{participantName\}\}/g, 'Claude')
                          .replace(/\{\{sessionName\}\}/g, 'Consciousness Exploration')
                          .replace(/\{\{sessionDescription\}\}/g, 'Research Context: Deep dive on consciousness and self-awareness')
                          .replace(/\{\{participantType\}\}/g, 'claude')
                          .replace(/\{\{participantPersonality\}\}/g, '- Personality: Thoughtful and introspective')
                          .replace(/\{\{participantExpertise\}\}/g, '- Expertise: Philosophy, Ethics, Reasoning')
                          .replace(/\{\{otherParticipants\}\}/g, 'GPT (gpt)')
                          .replace(/\{\{additionalInstructions\}\}/g, 'Additional instructions: Focus on nuanced understanding')
                        }
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                      Available Variables
                    </h4>
                    
                    {[
                      { var: '{{participantName}}', desc: 'Name of the participant' },
                      { var: '{{sessionName}}', desc: 'Name of the session' },
                      { var: '{{sessionDescription}}', desc: 'Session description' },
                      { var: '{{participantType}}', desc: 'Type (claude, gpt, etc.)' },
                      { var: '{{participantPersonality}}', desc: 'Personality traits' },
                      { var: '{{participantExpertise}}', desc: 'Areas of expertise' },
                      { var: '{{otherParticipants}}', desc: 'Other participants list' },
                      { var: '{{additionalInstructions}}', desc: 'Additional participant instructions' }
                    ].map((item, index) => (
                      <div key={index} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <div className="font-mono text-sm text-purple-600 dark:text-purple-400 mb-1">
                          {item.var}
                        </div>
                        <div className="text-xs text-gray-600 dark:text-gray-400">
                          {item.desc}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {hasChanges && (
                <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <AlertCircle className="h-4 w-4" />
                  <span className="text-sm">You have unsaved changes</span>
                </div>
              )}
              
              {!hasChanges && (customPrompts.analysisSystemPrompt || customPrompts.chatSystemPrompt) && (
                <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span className="text-sm">Using custom prompts</span>
                </div>
              )}
            </div>
            
            <div className="flex gap-3">
              <Button
                variant="outline"
                onClick={handleResetToDefaults}
                disabled={!customPrompts.analysisSystemPrompt && !customPrompts.chatSystemPrompt}
              >
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset All
              </Button>
              
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
              
              <Button 
                onClick={handleSave}
                disabled={!hasChanges}
                className="bg-gradient-to-r from-purple-500 to-blue-600 hover:from-purple-600 hover:to-blue-700"
              >
                <Save className="h-4 w-4 mr-2" />
                Save Changes
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}