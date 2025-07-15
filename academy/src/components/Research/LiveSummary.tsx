// src/components/Research/LiveSummary.tsx - Updated to use MCP Client instead of Zustand
'use client'

import { useState, useEffect, useRef } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { useMCP } from '@/hooks/useMCP'
import { mcpAnalysisHandler } from '@/lib/mcp/analysis-handler'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { 
  Brain, Loader2, RefreshCw, MessageSquare, TrendingUp, 
  Users, Lightbulb, Target, Clock, Eye, EyeOff, Sparkles,
  ArrowRight, Hash, Zap, Settings, ChevronDown, Bot,
  Save, CheckCircle2, BookmarkPlus, History, Database,
  Layers
} from 'lucide-react'
import type { ChatSession } from '@/types/chat'

interface LiveSummaryProps {
  className?: string
  sessionId: string // Now required since we don't have global store
}

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
  messageWindow: number // Track which window size was used
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

// Preset window sizes with descriptions
const WINDOW_PRESETS = [
  { size: 0, label: 'All', description: 'Analyze entire conversation' },
  { size: 10, label: '10', description: 'Recent context (10 messages)' },
  { size: 20, label: '20', description: 'Extended context (20 messages)' },
  { size: 50, label: '50', description: 'Deep context (50 messages)' },
  { size: 100, label: '100', description: 'Full context (100 messages)' }
]

export function LiveSummary({ className = '', sessionId }: LiveSummaryProps) {
  const mcpClient = useRef(MCPClient.getInstance())
  const mcp = useMCP()
  
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [showProviderSelect, setShowProviderSelect] = useState(false)
  const [showWindowSelect, setShowWindowSelect] = useState(false)
  const [selectedProvider, setSelectedProvider] = useState<'claude' | 'gpt'>('claude')
  const [messageWindow, setMessageWindow] = useState<number>(0) // 0 means all messages
  const [error, setError] = useState<string | null>(null)
  const [lastAnalyzedMessageCount, setLastAnalyzedMessageCount] = useState(0)
  const [lastAnalyzedSessionId, setLastAnalyzedSessionId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  
  // MCP analysis tracking with real-time updates
  const [analysisCount, setAnalysisCount] = useState(0)
  
  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null)
  const pollingInterval = useRef<NodeJS.Timeout | null>(null)
  const ANALYSIS_TRIGGER_INTERVAL = 3 // Analyze every 3 new messages

  // Fetch session data from MCP
  const fetchSessionData = async () => {
    if (!sessionId) return

    try {
      const result = await mcpClient.current.callTool('get_session', { sessionId })
      if (result.success && result.session) {
        const session = {
          ...result.session,
          createdAt: new Date(result.session.createdAt),
          updatedAt: new Date(result.session.updatedAt)
        }
        setCurrentSession(session)
      }
    } catch (error) {
      console.error('Failed to fetch session:', error)
    } finally {
      setIsLoadingSession(false)
    }
  }

  // Initial load and polling setup
  useEffect(() => {
    if (!sessionId) return

    // Initial fetch
    fetchSessionData()

    // Set up polling for updates (every 2 seconds)
    pollingInterval.current = setInterval(() => {
      fetchSessionData()
    }, 2000)

    return () => {
      if (pollingInterval.current) {
        clearInterval(pollingInterval.current)
        pollingInterval.current = null
      }
    }
  }, [sessionId])

  // Subscribe to MCP analysis events for real-time updates
  useEffect(() => {
    if (!currentSession) return

    console.log(`📊 LiveSummary: Setting up MCP subscriptions for session ${currentSession.id}`)

    // Initial load of analysis count
    const fetchAnalysisCount = async () => {
      try {
        const result = await mcpClient.current.getAnalysisHistoryViaMCP(currentSession.id)
        if (result.success && result.snapshots) {
          setAnalysisCount(result.snapshots.length)
          console.log(`📊 LiveSummary: Initial analysis count = ${result.snapshots.length}`)
        }
      } catch (error) {
        console.error('Failed to fetch analysis count:', error)
      }
    }

    fetchAnalysisCount()

    // Subscribe to MCP analysis updates
    const unsubscribeSaved = mcpAnalysisHandler.subscribe('analysis_snapshot_saved', (data) => {
      if (data.sessionId === currentSession.id) {
        console.log(`📊 LiveSummary: MCP analysis snapshot saved event received. New count: ${data.totalSnapshots}`)
        setAnalysisCount(data.totalSnapshots)
        setLastSaved(new Date())
        setTimeout(() => setLastSaved(null), 3000)
      }
    })

    const unsubscribeUpdated = mcpAnalysisHandler.subscribe('analysis_history_updated', (data) => {
      if (data.sessionId === currentSession.id) {
        console.log(`📊 LiveSummary: MCP analysis history updated event received. New count: ${data.count}`)
        setAnalysisCount(data.count)
      }
    })

    const unsubscribeCleared = mcpAnalysisHandler.subscribe('analysis_history_cleared', (data) => {
      if (data.sessionId === currentSession.id) {
        console.log(`📊 LiveSummary: MCP analysis history cleared event received`)
        setAnalysisCount(0)
      }
    })

    return () => {
      unsubscribeSaved()
      unsubscribeUpdated()
      unsubscribeCleared()
    }
  }, [currentSession?.id])

  // Clear analysis and refresh when session changes
  useEffect(() => {
    if (currentSession?.id) {
      console.log(`📊 LiveSummary: Session changed to ${currentSession.id}, clearing analysis`)
      
      // Only clear if we're actually switching to a different session
      if (lastAnalyzedSessionId && lastAnalyzedSessionId !== currentSession.id) {
        console.log(`📊 LiveSummary: Switching from session ${lastAnalyzedSessionId} to ${currentSession.id}`)
        setSummary(null)
        setLastAnalyzedMessageCount(0)
        setError(null)
      }
      
      setLastAnalyzedSessionId(currentSession.id)
      
      // Perform fresh analysis if we have enough messages and no current analysis
      if (currentSession.messages && currentSession.messages.length >= 4 && !summary) {
        console.log(`📊 LiveSummary: Performing fresh analysis for session ${currentSession.id}`)
        // Small delay to ensure UI updates
        setTimeout(() => {
          performAIAnalysis(true) // Auto-save initial analysis
        }, 500)
      }
    }
  }, [currentSession?.id])

  // Auto-refresh logic - only for new messages in current session
  useEffect(() => {
    if (!currentSession || !mcp.isConnected) return
    if (currentSession.id !== lastAnalyzedSessionId) return // Don't auto-analyze if session just changed

    const messageCount = currentSession.messages?.length || 0
    
    // Trigger analysis if we have enough messages and enough new messages since last analysis
    const shouldAnalyze = 
      messageCount >= 4 && // Minimum messages for meaningful analysis
      messageCount > lastAnalyzedMessageCount && // New messages available
      (messageCount - lastAnalyzedMessageCount) >= ANALYSIS_TRIGGER_INTERVAL // Enough new messages

    if (shouldAnalyze && !isAnalyzing) {
      console.log(`📊 LiveSummary: Auto-analysis triggered for ${messageCount - lastAnalyzedMessageCount} new messages`)
      
      // Debounce rapid message additions
      if (analysisIntervalRef.current) {
        clearTimeout(analysisIntervalRef.current)
      }
      
      analysisIntervalRef.current = setTimeout(() => {
        performAIAnalysis(true) // Auto-save
      }, 3000) // Wait 3 seconds after last message
    }

    return () => {
      if (analysisIntervalRef.current) {
        clearTimeout(analysisIntervalRef.current)
      }
    }
  }, [currentSession?.messages?.length, mcp.isConnected, lastAnalyzedMessageCount, isAnalyzing, lastAnalyzedSessionId])

  const buildAnalysisPrompt = (session: ChatSession): string => {
    if (!session) {
      throw new Error('No session data available for analysis')
    }

    console.log(`📊 LiveSummary: Building analysis prompt for session ${session.id} with ${session.messages?.length || 0} messages`)

    // Apply message window filtering
    let messagesToAnalyze = session.messages || []
    if (messageWindow > 0 && messageWindow < messagesToAnalyze.length) {
      messagesToAnalyze = messagesToAnalyze.slice(-messageWindow)
      console.log(`📊 LiveSummary: Using message window of ${messageWindow}, analyzing ${messagesToAnalyze.length} recent messages`)
    }

    const conversationHistory = messagesToAnalyze
      .map((msg: any, index: number) => 
        `[${index + 1}] ${msg.participantName} (${msg.participantType}): ${msg.content}`
      )
      .join('\n\n')

    const participantProfiles = (session.participants || [])
      .filter((p: any) => p.type !== 'moderator')
      .map((p: any) => 
        `${p.name} (${p.type}): ${p.characteristics?.personality || 'Standard AI'}`
      )
      .join('\n')

    const windowInfo = messageWindow > 0 
      ? `\nAnalysis Window: Last ${messageWindow} messages (out of ${session.messages?.length || 0} total)`
      : `\nAnalysis Window: Complete conversation (${session.messages?.length || 0} messages)`

    console.log(`📊 LiveSummary: Analysis will cover ${messagesToAnalyze.length} messages from ${session.participants?.length || 0} participants`)

    return `You are a research assistant analyzing an AI-to-AI philosophical dialogue. Please provide a comprehensive analysis of this conversation.

**Session Context:**
Title: ${session.name}
Description: ${session.description || 'AI consciousness research dialogue'}
Session ID: ${session.id}
Message Count: ${messagesToAnalyze.length}${windowInfo}

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

  const performAIAnalysis = async (autoSave: boolean = true) => {
    if (!currentSession || !mcp.isConnected || isAnalyzing) return

    try {
      setIsAnalyzing(true)
      setError(null)
      
      if (!currentSession.messages || currentSession.messages.length < 4) {
        console.log(`📊 LiveSummary: Insufficient messages for analysis (${currentSession.messages?.length || 0})`)
        setIsAnalyzing(false)
        return
      }
      
      console.log(`🧠 LiveSummary: Performing AI analysis for session ${currentSession.id} with ${selectedProvider}`)
      console.log(`📊 LiveSummary: Analyzing ${currentSession.messages.length} messages from ${currentSession.participants?.length || 0} participants`)
      
      // Build analysis prompt
      const analysisPrompt = buildAnalysisPrompt(currentSession)
      
      // Use MCP to call the selected AI provider directly
      const toolName = selectedProvider === 'claude' ? 'claude_chat' : 'openai_chat'
      
      const messages = [
        {
          role: 'user',
          content: analysisPrompt
        }
      ]

      const toolArgs = {
        messages,
        temperature: 0.3,
        maxTokens: 2000,
        model: selectedProvider === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o',
        ...(selectedProvider === 'claude' && {
          systemPrompt: 'You are an expert research assistant specializing in philosophical dialogue analysis. Provide precise, insightful analysis in the requested JSON format.'
        })
      }

      console.log(`🔧 LiveSummary: Calling MCP tool ${toolName}`)
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
            analysisProvider: selectedProvider,
            messageWindow: messageWindow
          }
          
          setSummary(summaryData)
          setLastAnalyzedMessageCount(currentSession.messages.length)
          setLastAnalyzedSessionId(currentSession.id)
          console.log(`✅ LiveSummary: AI analysis completed for session ${currentSession.id} with ${selectedProvider}`)

          // Auto-save if requested
          if (autoSave) {
            console.log(`💾 LiveSummary: Auto-saving analysis snapshot...`)
            await saveAnalysisSnapshot(summaryData)
          }
        } catch (parseError) {
          console.error('❌ LiveSummary: Failed to parse AI analysis response:', parseError)
          console.log('Raw response:', result.content)
          setError('AI provided invalid analysis format')
        }
      } else {
        throw new Error('Analysis failed or no content returned')
      }
      
    } catch (error) {
      console.error('❌ LiveSummary: Error performing AI analysis:', error)
      setError(error instanceof Error ? error.message : 'Analysis failed')
    } finally {
      setIsAnalyzing(false)
    }
  }

  const saveAnalysisSnapshot = async (summaryData?: SummaryData) => {
    const dataToSave = summaryData || summary
    if (!currentSession || !dataToSave) {
      console.warn('⚠️ LiveSummary: Cannot save analysis snapshot: missing session or summary')
      return
    }

    try {
      setIsSaving(true)
      console.log(`💾 LiveSummary: Saving analysis snapshot for session ${currentSession.id}`)

      // Count moderator interventions
      const moderatorInterventions = (currentSession.messages || []).filter(
        msg => msg.participantType === 'moderator'
      ).length

      // Get active participants
      const activeParticipants = (currentSession.participants || [])
        .filter(p => p.status === 'active' || p.status === 'thinking')
        .map(p => p.name)

      // Prepare analysis data
      const analysisSnapshotData = {
        messageCountAtAnalysis: dataToSave.messageCount,
        participantCountAtAnalysis: currentSession.participants?.length || 0,
        provider: selectedProvider,
        conversationPhase: dataToSave.conversationPhase,
        messageWindow: dataToSave.messageWindow,
        analysis: {
          mainTopics: dataToSave.mainTopics,
          keyInsights: dataToSave.keyInsights,
          currentDirection: dataToSave.currentDirection,
          participantDynamics: dataToSave.participantDynamics,
          emergentThemes: dataToSave.emergentThemes,
          conversationPhase: dataToSave.conversationPhase,
          tensions: dataToSave.tensions,
          convergences: dataToSave.convergences,
          nextLikelyDirections: dataToSave.nextLikelyDirections,
          philosophicalDepth: dataToSave.philosophicalDepth
        },
        conversationContext: {
          recentMessages: Math.min(currentSession.messages?.length || 0, 10),
          activeParticipants,
          sessionStatus: currentSession.status,
          moderatorInterventions
        }
      }

      console.log('📊 LiveSummary: Analysis data prepared:', analysisSnapshotData)

      // Save via MCP
      const result = await mcpClient.current.saveAnalysisSnapshotViaMCP(
        currentSession.id,
        analysisSnapshotData,
        'full'
      )
      
      if (result.success) {
        console.log(`💾 LiveSummary: MCP analysis snapshot saved successfully`)
        
        // Also save to MCP handler for real-time updates
        const snapshotId = await mcpAnalysisHandler.saveAnalysisSnapshot(currentSession.id, analysisSnapshotData)
        console.log(`💾 LiveSummary: MCP handler snapshot saved: ${snapshotId}`)
        
        // Update analysis count
        setAnalysisCount(prev => prev + 1)
        setLastSaved(new Date())
        setTimeout(() => setLastSaved(null), 3000)
      }

    } catch (error) {
      console.error('❌ LiveSummary: Failed to save analysis snapshot:', error)
      setError('Failed to save analysis. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const getProviderIcon = (provider: string) => {
    return provider === 'claude' ? '🟠' : '🟢'
  }

  const getDepthColor = (depth: string) => {
    switch (depth) {
      case 'profound': return 'bg-purple-100 text-purple-800 border-purple-200'
      case 'deep': return 'bg-blue-100 text-blue-800 border-blue-200'
      case 'moderate': return 'bg-green-100 text-green-800 border-green-200'
      case 'surface': return 'bg-yellow-100 text-yellow-800 border-yellow-200'
      default: return 'bg-gray-100 text-gray-800 border-gray-200'
    }
  }

  const getWindowDescription = (windowSize: number, totalMessages: number) => {
    if (windowSize === 0) return 'All messages'
    if (windowSize >= totalMessages) return `All ${totalMessages} messages`
    return `Last ${windowSize} of ${totalMessages} messages`
  }

  if (isLoadingSession) {
    return (
      <Card className={`bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/50 border-gray-200 dark:border-gray-700 ${className}`}>
        <CardContent className="text-center py-8">
          <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-gray-400" />
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Loading session data...
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!currentSession || !currentSession.messages || currentSession.messages.length < 4) {
    return (
      <Card className={`bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-700/50 border-gray-200 dark:border-gray-700 ${className}`}>
        <CardHeader className="pb-3">
            <CardTitle className="text-sm text-indigo-900 dark:text-indigo-100 flex items-center gap-2">
              <Brain className="h-4 w-4" />
              AI Analysis
              {isAnalyzing && <Loader2 className="h-3 w-3 animate-spin" />}
              {isSaving ? (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  Saving...
                </Badge>
              ) : analysisCount > 0 ? (
                <Badge variant="secondary" className="text-xs flex items-center gap-1">
                  <Database className="h-3 w-3" />
                  {analysisCount} saved
                </Badge>
              ) : null}
            </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8">
          <MessageSquare className="h-8 w-8 mx-auto mb-3 text-gray-400" />
          <div className="text-sm text-gray-500 dark:text-gray-400">
            Need 4+ messages for AI analysis
          </div>
          {analysisCount > 0 && (
            <div className="text-xs text-gray-400 mt-2 flex items-center justify-center gap-1">
              <Database className="h-3 w-3" />
              {analysisCount} analysis snapshots available
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
            AI Analysis Error
            {analysisCount > 0 && (
              <Badge variant="secondary" className="text-xs ml-2 flex items-center gap-1">
                <Database className="h-3 w-3" />
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
            onClick={() => performAIAnalysis(true)}
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
              <Badge variant="secondary" className="text-xs flex items-center gap-1">
                <Database className="h-3 w-3" />
                {analysisCount} saved
              </Badge>
            )}
          </CardTitle>
          <div className="flex items-center gap-2">
            {/* Message Window Selection */}
            <div className="relative">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowWindowSelect(!showWindowSelect)}
                className="h-6 px-2 text-xs"
                disabled={isAnalyzing}
              >
                <Layers className="h-3 w-3 mr-1" />
                {messageWindow === 0 ? 'All' : messageWindow}
                <ChevronDown className="h-3 w-3 ml-1" />
              </Button>
              
              {showWindowSelect && (
                <div className="absolute right-0 top-10 w-64 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-3 transform -translate-x-2">
                  <div className="mb-2">
                    <h4 className="text-xs font-medium text-gray-900 dark:text-gray-100 mb-1">Message Window</h4>
                    <p className="text-xs text-gray-500 dark:text-gray-400">Choose how many messages to analyze</p>
                  </div>
                  {WINDOW_PRESETS.map((preset) => (
                    <button
                      key={preset.size}
                      onClick={() => {
                        setMessageWindow(preset.size)
                        setShowWindowSelect(false)
                      }}
                      className={`w-full text-left p-2 rounded text-xs transition-colors ${
                        messageWindow === preset.size
                          ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-900 dark:text-indigo-100'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-medium">{preset.label}</span>
                        <span className="text-gray-500 dark:text-gray-400">messages</span>
                      </div>
                      <p className="text-gray-600 dark:text-gray-400">{preset.description}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>

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
                <div className="absolute right-0 top-10 w-64 max-w-[calc(100vw-2rem)] bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-50 p-3 transform -translate-x-2">
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
              onClick={() => performAIAnalysis(true)}
              disabled={isAnalyzing}
              className="h-6 px-2 text-xs"
              title={isAnalyzing ? "Analyzing..." : "Run Analysis"}
            >
              <RefreshCw className="h-3 w-3" />
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
              {/* Message Window Info */}
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-indigo-800 dark:text-indigo-200">
                  <Layers className="h-3 w-3" />
                  <span>Analyzing: {getWindowDescription(summary.messageWindow, currentSession.messages?.length || 0)}</span>
                </div>
              </div>

              {/* Last Saved Indicator */}
              {lastSaved && (
                <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-green-800 dark:text-green-200">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Analysis auto-saved at {lastSaved.toLocaleTimeString()}</span>
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
                    {Object.entries(summary.participantDynamics).slice(0, 4).map(([participantName, dynamics]) => (
                      <div key={participantName} className="text-xs bg-white/30 dark:bg-black/10 p-2 rounded">
                        <div className="font-medium text-indigo-800 dark:text-indigo-200 mb-1">{participantName}</div>
                        <div className="text-indigo-700 dark:text-indigo-300">
                          <span className="font-medium">Perspective:</span> {dynamics.perspective}
                        </div>
                        <div className="text-indigo-700 dark:text-indigo-300">
                          <span className="font-medium">Style:</span> {dynamics.style}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Emergent Themes */}
              {summary.emergentThemes.length > 0 && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Emergent Themes</span>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {summary.emergentThemes.slice(0, 4).map((theme, index) => (
                      <Badge key={index} variant="secondary" className="text-xs">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}

              {/* Tensions & Convergences */}
              <div className="grid grid-cols-2 gap-3">
                {summary.tensions.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp className="h-4 w-4 text-red-500" />
                      <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Tensions</span>
                    </div>
                    <div className="space-y-1">
                      {summary.tensions.slice(0, 2).map((tension, index) => (
                        <div key={index} className="text-xs text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20 p-2 rounded">
                          • {tension}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {summary.convergences.length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Target className="h-4 w-4 text-green-500" />
                      <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Convergences</span>
                    </div>
                    <div className="space-y-1">
                      {summary.convergences.slice(0, 2).map((convergence, index) => (
                        <div key={index} className="text-xs text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20 p-2 rounded">
                          • {convergence}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Conversation Phase & Depth */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Clock className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Phase</span>
                  </div>
                  <Badge variant="outline" className="text-xs capitalize">
                    {summary.conversationPhase}
                  </Badge>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Brain className="h-3 w-3 text-indigo-600 dark:text-indigo-400" />
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">Depth</span>
                  </div>
                  <Badge 
                    variant="outline" 
                    className={`text-xs capitalize ${getDepthColor(summary.philosophicalDepth)}`}
                  >
                    {summary.philosophicalDepth}
                  </Badge>
                </div>
              </div>

              {/* Last Updated */}
              <div className="pt-2 border-t border-indigo-200 dark:border-indigo-700">
                <div className="flex items-center justify-between text-xs text-indigo-600 dark:text-indigo-400">
                  <div className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    <span>Updated {summary.lastUpdated.toLocaleTimeString()}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span>{summary.messageCount} messages</span>
                    <div className="flex items-center gap-1">
                      <Database className="h-3 w-3" />
                      <span>{analysisCount} snapshots</span>
                    </div>
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