// src/components/Research/LiveSummary.tsx - AI-Powered Analysis with Save Feature
'use client'

import { useState, useEffect, useRef } from 'react'
import { useChatStore } from '@/lib/stores/chatStore'
import { useMCP } from '@/hooks/useMCP'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { 
  Brain, Loader2, RefreshCw, MessageSquare, TrendingUp, 
  Users, Lightbulb, Target, Clock, Eye, EyeOff, Sparkles,
  ArrowRight, Hash, Zap, Settings, ChevronDown, Bot,
  Save, CheckCircle2, BookmarkPlus, History
} from 'lucide-react'

interface AnalysisProvider {
  id: 'claude' | 'gpt'
  name: string
  description: string
  strengths: string[]
}

interface SummaryData {
  mainTopics: string[]
  keyInsights: string[]
  currentDirection: string
  participantDynamics: Record<string, {
    perspective: string
    contribution: string
    style: string
  }>
  emergentThemes: string[]
  conversationPhase: string
  tensions: string[]
  convergences: string[]
  nextLikelyDirections: string[]
  philosophicalDepth: 'surface' | 'moderate' | 'deep' | 'profound'
  lastUpdated: Date
  messageCount: number
  analysisProvider: string
}

interface LiveSummaryProps {
  className?: string
}

const ANALYSIS_PROVIDERS: AnalysisProvider[] = [
  {
    id: 'claude',
    name: 'Claude',
    description: 'Deep philosophical analysis',
    strengths: ['Nuanced reasoning', 'Philosophical insight', 'Context awareness']
  },
  {
    id: 'gpt',
    name: 'GPT',
    description: 'Pattern recognition and synthesis',
    strengths: ['Pattern detection', 'Structured analysis', 'Comparative insights']
  }
]

export function LiveSummary({ className = '' }: LiveSummaryProps) {
  const { currentSession, addAnalysisSnapshot, getAnalysisHistory } = useChatStore()
  const mcp = useMCP()
  
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [showProviderSelect, setShowProviderSelect] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<'claude' | 'gpt'>('claude')
  const [error, setError] = useState<string | null>(null)
  const [lastAnalyzedMessageCount, setLastAnalyzedMessageCount] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [analysisCount, setAnalysisCount] = useState(0)
  
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const ANALYSIS_TRIGGER_INTERVAL = 3 // Analyze every 3 new messages

  // Get analysis history for current session and update count when it changes
  useEffect(() => {
    if (currentSession) {
      const history = getAnalysisHistory(currentSession.id)
      setAnalysisCount(history.length)
    }
  }, [currentSession, getAnalysisHistory])

  // Auto-refresh logic
  useEffect(() => {
    if (!currentSession || !mcp.isConnected) return

    const messageCount = currentSession.messages.length
    
    // Trigger analysis if we have enough messages and enough new messages since last analysis
    const shouldAnalyze = 
      messageCount >= 4 && // Minimum messages for meaningful analysis
      messageCount > lastAnalyzedMessageCount && // New messages available
      (messageCount - lastAnalyzedMessageCount) >= ANALYSIS_TRIGGER_INTERVAL // Enough new messages

    if (shouldAnalyze && !isAnalyzing) {
      // Debounce rapid message additions
      if (analysisIntervalRef.current) {
        clearTimeout(analysisIntervalRef.current)
      }
      
      analysisIntervalRef.current = setTimeout(() => {
        performAIAnalysis()
      }, 3000) // Wait 3 seconds after last message
    }

    return () => {
      if (analysisIntervalRef.current) {
        clearTimeout(analysisIntervalRef.current)
      }
    }
  }, [currentSession?.messages.length, mcp.isConnected, lastAnalyzedMessageCount, isAnalyzing])

  // Initial analysis when session changes
  useEffect(() => {
    if (currentSession && currentSession.messages.length >= 4 && !summary) {
      performAIAnalysis()
    }
  }, [currentSession?.id])

  const buildAnalysisPrompt = (session: any): string => {
    const conversationHistory = session.messages
      .map((msg: any, index: number) => 
        `[${index + 1}] ${msg.participantName} (${msg.participantType}): ${msg.content}`
      )
      .join('\n\n')

    const participantProfiles = session.participants
      .filter((p: any) => p.type !== 'moderator')
      .map((p: any) => 
        `${p.name} (${p.type}): ${p.characteristics?.personality || 'Standard AI'}`
      )
      .join('\n')

    return `You are a research assistant analyzing an AI-to-AI philosophical dialogue. Please provide a comprehensive analysis of this conversation.

**Session Context:**
Title: ${session.name}
Description: ${session.description || 'AI consciousness research dialogue'}

**Participants:**
${participantProfiles}

**Conversation History:**
${conversationHistory}

**Analysis Request:**
Please analyze this conversation and return a JSON object with the following structure:

{
  "mainTopics": ["array of 3-5 main topics being discussed"],
  "keyInsights": ["array of 3-4 most important insights or realizations"],
  "currentDirection": "where the conversation is heading next",
  "participantDynamics": {
    "ParticipantName": {
      "perspective": "their philosophical stance",
      "contribution": "what they bring to the dialogue", 
      "style": "their conversational approach"
    }
  },
  "emergentThemes": ["array of themes emerging from the interaction"],
  "conversationPhase": "current phase (introduction/exploration/synthesis/conclusion)",
  "tensions": ["areas of disagreement or tension"],
  "convergences": ["areas where participants are finding common ground"],
  "nextLikelyDirections": ["predictions for where discussion might go"],
  "philosophicalDepth": "surface/moderate/deep/profound"
}

Focus on:
- Genuine philosophical insights, not surface-level observations
- How the AI participants are engaging with consciousness/awareness questions
- Emergent patterns in their reasoning and interaction
- The quality and depth of the philosophical exploration
- Subtle dynamics between the participants

Return only the JSON object, no additional text.`
  }

  const performAIAnalysis = async () => {
    if (!currentSession || !mcp.isConnected || isAnalyzing) return

    try {
      setIsAnalyzing(true)
      setError(null)
      
      console.log(`🧠 Performing AI analysis with ${selectedProvider}...`)
      
      // Build analysis prompt
      const analysisPrompt = buildAnalysisPrompt(currentSession)
      
      // Use MCP to call the selected AI provider
      const toolName = selectedProvider === 'claude' ? 'claude_chat' : 'openai_chat'
      
      const messages = [
        {
          role: 'user',
          content: analysisPrompt
        }
      ]

      const toolArgs = {
        messages,
        temperature: 0.3, // Lower temperature for more consistent analysis
        maxTokens: 2000,
        model: selectedProvider === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o'
      }

      // Add system prompt for Claude
      if (selectedProvider === 'claude') {
        toolArgs.systemPrompt = 'You are an expert research assistant specializing in philosophical dialogue analysis. Provide precise, insightful analysis in the requested JSON format.'
      }

      const result = await mcp.callTool(toolName, toolArgs)
      
      if (result.success && result.content) {
        try {
          // Try to extract JSON from the response
          let jsonStr = result.content.trim()
          
          // Handle cases where the AI wraps JSON in markdown
          if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/```json\s*/, '').replace(/\s*```$/, '')
          } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```\s*/, '').replace(/\s*```$/, '')
          }
          
          const analysisData = JSON.parse(jsonStr)
          
          // Transform to our summary format
          const summaryData: SummaryData = {
            mainTopics: analysisData.mainTopics || [],
            keyInsights: analysisData.keyInsights || [],
            currentDirection: analysisData.currentDirection || 'Continuing exploration',
            participantDynamics: analysisData.participantDynamics || {},
            emergentThemes: analysisData.emergentThemes || [],
            conversationPhase: analysisData.conversationPhase || 'exploration',
            tensions: analysisData.tensions || [],
            convergences: analysisData.convergences || [],
            nextLikelyDirections: analysisData.nextLikelyDirections || [],
            philosophicalDepth: analysisData.philosophicalDepth || 'moderate',
            lastUpdated: new Date(),
            messageCount: currentSession.messages.length,
            analysisProvider: selectedProvider
          }
          
          setSummary(summaryData)
          setLastAnalyzedMessageCount(currentSession.messages.length)
          console.log(`✅ AI analysis completed with ${selectedProvider}`)
        } catch (parseError) {
          console.error('Failed to parse AI analysis response:', parseError)
          setError('AI provided invalid analysis format')
        }
      } else {
        throw new Error('Analysis failed or no content returned')
      }
      
    } catch (error) {
      console.error('❌ Error performing AI analysis:', error)
      setError(error instanceof Error ? error.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const saveAnalysisSnapshot = async () => {
    if (!currentSession || !summary) return

    try {
      setIsSaving(true)

      // Count moderator interventions
      const moderatorInterventions = currentSession.messages.filter(
        msg => msg.participantType === 'moderator'
      ).length

      // Get active participants
      const activeParticipants = currentSession.participants
        .filter(p => p.status === 'active' || p.status === 'thinking')
        .map(p => p.name)

      // Create analysis snapshot
      const snapshot = {
        messageCountAtAnalysis: summary.messageCount,
        participantCountAtAnalysis: currentSession.participants.length,
        provider: selectedProvider,
        conversationPhase: summary.conversationPhase,
        analysis: {
          mainTopics: summary.mainTopics,
          keyInsights: summary.keyInsights,
          currentDirection: summary.currentDirection,
          participantDynamics: summary.participantDynamics,
          emergentThemes: summary.emergentThemes,
          conversationPhase: summary.conversationPhase,
          tensions: summary.tensions,
          convergences: summary.convergences,
          nextLikelyDirections: summary.nextLikelyDirections,
          philosophicalDepth: summary.philosophicalDepth
        },
        conversationContext: {
          recentMessages: Math.min(currentSession.messages.length, 10),
          activeParticipants,
          sessionStatus: currentSession.status,
          moderatorInterventions
        }
      }

      // Save to store
      addAnalysisSnapshot(snapshot)
      
      // Update analysis count immediately
      const newHistory = getAnalysisHistory(currentSession.id)
      setAnalysisCount(newHistory.length)
      
      setLastSaved(new Date())
      
      console.log('💾 Analysis snapshot saved successfully')

      // Show saved feedback for 2 seconds
      setTimeout(() => {
        setLastSaved(null)
      }, 2000)

    } catch (error) {
      console.error('Failed to save analysis snapshot:', error)
    } finally {
      setIsSaving(false)
    }
  }

  const getDepthColor = (depth: string) => {
    switch (depth) {
      case 'surface': return 'text-gray-600 bg-gray-50 border-gray-200'
      case 'moderate': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'deep': return 'text-purple-600 bg-purple-50 border-purple-200'
      case 'profound': return 'text-indigo-600 bg-indigo-50 border-indigo-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getProviderIcon = (provider: string) => {
    return provider === 'claude' ? '🟠' : '🟢'
  }

  if (!currentSession || currentSession.messages.length < 4) {
    return (
      <Card className={`bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/50 border-gray-200 dark:border-gray-700 ${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-gray-700 dark:text-gray-300 flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Analysis
            {analysisCount > 0 && (
              <Badge variant="secondary" className="text-xs ml-2">
                {analysisCount} saved
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <MessageSquare className="h-8 w-8 mx-auto mb-3 text-gray-400" />
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Need 4+ messages for AI analysis
          </div>
          {analysisCount > 0 && (
            <div className="text-xs text-gray-400 mt-2">
              {analysisCount} analysis snapshots available in export
            </div>
          )}
        </CardContent>
      </Card>
    )
  }

  if (error) {
    return (
      <Card className={`border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20 ${className}`}>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Analysis
            {analysisCount > 0 && (
              <Badge variant="secondary" className="text-xs ml-2">
                {analysisCount} saved
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-sm text-red-600 dark:text-red-400 mb-3">{error}</div>
          <Button
            variant="outline"
            size="sm"
            onClick={performAIAnalysis}
            disabled={isAnalyzing}
            className="w-full"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry Analysis
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className={`bg-gradient-to-br from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 border-indigo-200 dark:border-indigo-700 ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
            <Brain className="h-4 w-4" />
            AI Analysis
            {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin" />}
            {analysisCount > 0 && (
              <Badge variant="secondary" className="text-xs">
                {analysisCount} saved
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Save Analysis Button */}
            {summary && (
              <Button
                variant="ghost"
                size="sm"
                onClick={saveAnalysisSnapshot}
                disabled={isSaving || isAnalyzing}
                className="h-6 px-2 text-xs"
                title="Save analysis snapshot to export history"
              >
                {isSaving ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : lastSaved ? (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                ) : (
                  <BookmarkPlus className="h-3 w-3" />
                )}
              </Button>
            )}

            {/* Provider Selection */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowProviderSelect(!showProviderSelect)}
                className="h-6 px-2 text-xs"
                disabled={isAnalyzing}
              >
                {getProviderIcon(selectedProvider)} {selectedProvider.toUpperCase()}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              
              {showProviderSelect && (
                <div className="absolute right-0 top-10 w-64 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-3 transform -translate-x-full translate-x-8">
                  <div className="mb-2">
                    <h4 className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">Analysis Provider</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Choose which AI analyzes the conversation</p>
                  </div>
                  {ANALYSIS_PROVIDERS.map((provider) => (
                    <button
                      key={provider.id}
                      onClick={() => {
                        setSelectedProvider(provider.id)
                        setShowProviderSelect(false)
                      }}
                      className={`w-full text-left p-2 rounded text-xs transition-colors ${
                        selectedProvider === provider.id
                          ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span>{getProviderIcon(provider.id)}</span>
                        <span className="font-medium">{provider.name}</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400 mb-1">{provider.description}</p>
                      <div className="flex flex-wrap gap-1">
                        {provider.strengths.map((strength, index) => (
                          <span key={index} className="px-1 py-0.5 bg-gray-200 dark:bg-gray-600 rounded text-xs">
                            {strength}
                          </span>
                        ))}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={performAIAnalysis}
              disabled={isAnalyzing}
              className="h-6 w-6 p-0"
            >
              <RefreshCw className={`h-3 w-3 ${isAnalyzing ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExpanded(!isExpanded)}
              className="h-6 w-6 p-0"
            >
              {isExpanded ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
            </Button>
          </div>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent className="space-y-4 max-h-150 overflow-y-auto">
          {summary && (
            <>
              {/* Analysis History Info */}
              {analysisCount > 0 && (
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-blue-800 dark:text-blue-200">
                    <History className="h-3 w-3" />
                    <span>{analysisCount} analysis snapshots saved for export</span>
                  </div>
                </div>
              )}

              {/* Main Topics */}
              {summary.mainTopics.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Hash className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Main Topics</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {summary.mainTopics.map((topic, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {topic}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Current Direction */}
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <ArrowRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Current Direction</span>
                </div>
                <div className="text-xs text-indigo-800 dark:text-indigo-200 bg-white/50 dark:bg-black/20 p-2 rounded">
                  {summary.currentDirection}
                </div>
              </div>

              {/* Key Insights */}
              {summary.keyInsights.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Key Insights</span>
                  </div>
                  <div className="space-y-1">
                    {summary.keyInsights.slice(0, 3).map((insight, index) => (
                      <div key={index} className="text-xs text-indigo-800 dark:text-indigo-200 bg-white/30 dark:bg-black/10 p-2 rounded">
                        • {insight}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Participant Dynamics */}
              {Object.keys(summary.participantDynamics).length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Participant Dynamics</span>
                  </div>
                  <div className="space-y-2">
                    {Object.entries(summary.participantDynamics).map(([name, dynamics]) => (
                      <div key={name} className="bg-white/30 dark:bg-black/10 p-2 rounded">
                        <div className="font-medium text-xs text-indigo-800 dark:text-indigo-200 mb-1">{name}</div>
                        <div className="text-xs text-indigo-700 dark:text-indigo-300 space-y-0.5">
                          <div><strong>Perspective:</strong> {dynamics.perspective}</div>
                          <div><strong>Style:</strong> {dynamics.style}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Tensions & Convergences */}
              {(summary.tensions.length > 0 || summary.convergences.length > 0) && (
                <div className="grid grid-cols-1 gap-3">
                  {summary.tensions.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Zap className="h-4 w-4 text-red-600 dark:text-red-400" />
                        <span className="text-xs font-medium text-red-700 dark:text-red-300">Tensions</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {summary.tensions.slice(0, 2).map((tension, index) => (
                          <Badge key={index} className="text-xs bg-red-100 text-red-700 border-red-200">
                            {tension}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  {summary.convergences.length > 0 && (
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <span className="text-xs font-medium text-green-700 dark:text-green-300">Convergences</span>
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {summary.convergences.slice(0, 2).map((convergence, index) => (
                          <Badge key={index} className="text-xs bg-green-100 text-green-700 border-green-200">
                            {convergence}
                          </Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Next Likely Directions */}
              {summary.nextLikelyDirections.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Likely Next</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {summary.nextLikelyDirections.slice(0, 2).map((direction, index) => (
                      <Badge key={index} className="text-xs bg-purple-100 text-purple-700 border-purple-200">
                        {direction}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Last Updated */}
              <div className="pt-2 border-t border-indigo-200 dark:border-indigo-700">
                <div className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Updated {summary.lastUpdated.toLocaleTimeString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{summary.messageCount} messages</span>
                    {lastSaved && (
                      <span className="text-green-600 dark:text-green-400">Saved!</span>
                    )}
                  </div>
                </div>
              </div>
            </>
          )}
        </CardContent>
      )}
    </Card>
  )
}