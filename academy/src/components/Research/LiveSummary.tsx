// src/components/Research/LiveSummary.tsx - Updated with Internal Pub/Sub Event System
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { useMCP } from '@/hooks/useMCP'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import {
  Brain, Loader2, RefreshCw, MessageSquare, TrendingUp,
  Users, Lightbulb, Target, Clock, Eye, EyeOff, Sparkles,
  ArrowRight, Hash, CheckCircle2, Database, Layers
} from 'lucide-react'
import type { ChatSession } from '@/types/chat'
import type { AnalysisConfig, AnalysisSchema, AnalysisSchemaField } from './AnalysisConfigModal'
import { DEFAULT_ANALYSIS_SCHEMA } from './AnalysisConfigModal'

interface LiveSummaryProps {
  className?: string
  sessionId: string
  config?: AnalysisConfig
}

// Dynamic summary data - can hold any fields based on schema
interface SummaryData {
  [key: string]: any
  lastUpdated: Date
  messageCount: number
  analysisProvider: string
  messageWindow: number
}

const DEFAULT_CONFIG: AnalysisConfig = {
  provider: 'claude',
  model: 'claude-sonnet-4-5-20250929',
  messageWindow: 10,
  customPrompt: '',
  autoInterval: 5, // Default to every 5 messages
  schema: DEFAULT_ANALYSIS_SCHEMA
}

export function LiveSummary({ className = '', sessionId, config = DEFAULT_CONFIG }: LiveSummaryProps) {
  const mcpClient = useRef(MCPClient.getInstance())
  const mcp = useMCP()

  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(true)
  const [summary, setSummary] = useState<SummaryData | null>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isExpanded, setIsExpanded] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastAnalyzedMessageCount, setLastAnalyzedMessageCount] = useState(0)
  const [lastAnalyzedSessionId, setLastAnalyzedSessionId] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [lastSaved, setLastSaved] = useState<Date | null>(null)
  const [analysisCount, setAnalysisCount] = useState(0)

  // Use config props for analysis settings
  const selectedProvider = config.provider
  const messageWindow = config.messageWindow
  const autoInterval = config.autoInterval || 0 // 0 = disabled

  const analysisIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const fetchSessionData = useCallback(async () => {
    if (!sessionId) {
      console.log('📊 LiveSummary: No sessionId provided')
      return
    }

    console.log(`📊 LiveSummary: Fetching session data for ${sessionId}`)
    try {
      const result = await mcpClient.current.callTool('get_session', { sessionId })
      console.log('📊 LiveSummary: get_session result:', result.success, result.session?.messages?.length, 'messages')
      if (result.success && result.session) {
        const session = {
          ...result.session,
          createdAt: new Date(result.session.createdAt),
          updatedAt: new Date(result.session.updatedAt)
        }
        setCurrentSession(session)
        console.log(`📊 LiveSummary: Session loaded with ${session.messages?.length || 0} messages`)
      }
    } catch (error) {
      console.error('❌ LiveSummary: Failed to fetch session:', error)
    } finally {
      setIsLoadingSession(false)
    }
  }, [sessionId])

  const handleSessionEvent = useCallback(async (payload: any) => {
    console.log('📊 LiveSummary: Session event received:', payload.data)
    
    if (payload.data.sessionId === sessionId || payload.data.sessionId === undefined) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  const handleMessageEvent = useCallback(async (payload: any) => {
    console.log('📊 LiveSummary: Message event received:', payload.data)
    
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  const handleParticipantEvent = useCallback(async (payload: any) => {
    console.log('📊 LiveSummary: Participant event received:', payload.data)
    
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  const handleAnalysisEvent = useCallback(async (payload: any) => {
    console.log('📊 LiveSummary: Analysis event received:', payload.data)
    
    if (payload.data.sessionId === sessionId) {
      await fetchAnalysisCount()
      
      if (payload.type === EVENT_TYPES.ANALYSIS_SAVED) {
        setLastSaved(new Date())
        setTimeout(() => setLastSaved(null), 3000)
      }
    }
  }, [sessionId])

  const fetchAnalysisCount = useCallback(async () => {
    if (!sessionId) return

    try {
      console.log(`📊 LiveSummary: Fetching analysis count for session ${sessionId}`)
      
      const result = await mcpClient.current.getAnalysisHistoryViaMCP(sessionId)
      
      if (result.success && result.snapshots) {
        setAnalysisCount(result.snapshots.length)
        console.log(`📊 LiveSummary: Analysis count updated = ${result.snapshots.length}`)
      } else {
        console.warn(`⚠️ LiveSummary: No analysis snapshots found for session ${sessionId}`)
        setAnalysisCount(0)
      }
    } catch (error) {
      console.error('❌ LiveSummary: Failed to fetch analysis count:', error)
      setAnalysisCount(0)
    }
  }, [sessionId])

  useEffect(() => {
    if (!sessionId) return

    console.log(`📊 LiveSummary: Setting up internal pub/sub event subscriptions for session ${sessionId}`)

    fetchSessionData()
    fetchAnalysisCount()

    const unsubscribeSessionCreated = eventBus.subscribe(EVENT_TYPES.SESSION_CREATED, handleSessionEvent)
    const unsubscribeSessionUpdated = eventBus.subscribe(EVENT_TYPES.SESSION_UPDATED, handleSessionEvent)
    const unsubscribeSessionSwitched = eventBus.subscribe(EVENT_TYPES.SESSION_SWITCHED, handleSessionEvent)
    const unsubscribeMessageSent = eventBus.subscribe(EVENT_TYPES.MESSAGE_SENT, handleMessageEvent)
    const unsubscribeMessageUpdated = eventBus.subscribe(EVENT_TYPES.MESSAGE_UPDATED, handleMessageEvent)
    const unsubscribeMessageDeleted = eventBus.subscribe(EVENT_TYPES.MESSAGE_DELETED, handleMessageEvent)
    const unsubscribeParticipantAdded = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_ADDED, handleParticipantEvent)
    const unsubscribeParticipantRemoved = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_REMOVED, handleParticipantEvent)
    const unsubscribeParticipantUpdated = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_UPDATED, handleParticipantEvent)
    const unsubscribeAnalysisSaved = eventBus.subscribe(EVENT_TYPES.ANALYSIS_SAVED, handleAnalysisEvent)
    const unsubscribeAnalysisTriggered = eventBus.subscribe(EVENT_TYPES.ANALYSIS_TRIGGERED, handleAnalysisEvent)
    const unsubscribeAnalysisCleared = eventBus.subscribe(EVENT_TYPES.ANALYSIS_CLEARED, handleAnalysisEvent)

    return () => {
      console.log(`📊 LiveSummary: Cleaning up internal pub/sub event subscriptions for session ${sessionId}`)
      unsubscribeSessionCreated()
      unsubscribeSessionUpdated()
      unsubscribeSessionSwitched()
      unsubscribeMessageSent()
      unsubscribeMessageUpdated()
      unsubscribeMessageDeleted()
      unsubscribeParticipantAdded()
      unsubscribeParticipantRemoved()
      unsubscribeParticipantUpdated()
      unsubscribeAnalysisSaved()
      unsubscribeAnalysisTriggered()
      unsubscribeAnalysisCleared()
    }
  }, [
    sessionId, 
    fetchSessionData, 
    fetchAnalysisCount, 
    handleSessionEvent, 
    handleMessageEvent, 
    handleParticipantEvent, 
    handleAnalysisEvent
  ])

  useEffect(() => {
    if (currentSession?.id) {
      console.log(`📊 LiveSummary: Session changed to ${currentSession.id}, clearing analysis`)
      
      if (lastAnalyzedSessionId && lastAnalyzedSessionId !== currentSession.id) {
        console.log(`📊 LiveSummary: Switching from session ${lastAnalyzedSessionId} to ${currentSession.id}`)
        setSummary(null)
        setLastAnalyzedMessageCount(0)
        setError(null)
      }
      
      setLastAnalyzedSessionId(currentSession.id)
      
      if (currentSession.messages && currentSession.messages.length >= 4 && !summary) {
        console.log(`📊 LiveSummary: Performing fresh analysis for session ${currentSession.id}`)
        setTimeout(() => {
          performAIAnalysis(true)
        }, 500)
      }
    }
  }, [currentSession?.id])

  useEffect(() => {
    // Skip if auto-analysis is disabled
    if (autoInterval <= 0) return
    if (!currentSession || !mcp.isConnected) return

    const messageCount = currentSession.messages?.length || 0

    // For first analysis: trigger at 4+ messages
    // For subsequent: trigger every autoInterval messages
    const isFirstAnalysis = lastAnalyzedMessageCount === 0
    const messagesSinceLastAnalysis = messageCount - lastAnalyzedMessageCount

    const shouldAnalyze =
      messageCount >= 4 &&
      !isAnalyzing &&
      (isFirstAnalysis
        ? messageCount >= 4 // First analysis: just need 4+ messages
        : messagesSinceLastAnalysis >= autoInterval) // Subsequent: need autoInterval new messages

    if (shouldAnalyze) {
      console.log(`📊 LiveSummary: Auto-analysis triggered - ${isFirstAnalysis ? 'initial' : `${messagesSinceLastAnalysis} new messages`} (interval: ${autoInterval})`)

      if (analysisIntervalRef.current) {
        clearTimeout(analysisIntervalRef.current)
      }

      // Short delay to batch rapid message additions
      analysisIntervalRef.current = setTimeout(() => {
        performAIAnalysis(true)
      }, 2000)
    }

    return () => {
      if (analysisIntervalRef.current) {
        clearTimeout(analysisIntervalRef.current)
      }
    }
  }, [currentSession?.messages?.length, mcp.isConnected, lastAnalyzedMessageCount, isAnalyzing, autoInterval])

  // Build JSON schema string from schema definition
  const buildSchemaString = (schema: AnalysisSchema): string => {
    const buildFieldExample = (field: AnalysisSchemaField): string => {
      switch (field.type) {
        case 'string':
          return `"${field.description}"`
        case 'array':
          return `["${field.description}"]`
        case 'enum':
          return `"${field.enumValues?.join(' | ') || field.description}"`
        case 'object':
          return `{ "key": { "property": "value" } }`
        default:
          return `"${field.description}"`
      }
    }

    const fields = schema.fields.map(field =>
      `  "${field.key}": ${buildFieldExample(field)}`
    ).join(',\n')

    return `{\n${fields}\n}`
  }

  // Build field descriptions for the prompt
  const buildFieldDescriptions = (schema: AnalysisSchema): string => {
    return schema.fields.map(field => {
      let typeInfo: string = field.type
      if (field.type === 'enum' && field.enumValues) {
        typeInfo = `one of: ${field.enumValues.join(', ')}`
      }
      return `- **${field.label}** (${field.key}): ${field.description} [${typeInfo}]`
    }).join('\n')
  }

  const buildAnalysisPrompt = (session: ChatSession): string => {
    if (!session) {
      throw new Error('No session data available for analysis')
    }

    console.log(`📊 LiveSummary: Building analysis prompt for session ${session.id} with ${session.messages?.length || 0} messages`)

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

    // Use schema from config or default
    const schema = config.schema || DEFAULT_ANALYSIS_SCHEMA
    const schemaString = buildSchemaString(schema)
    const fieldDescriptions = buildFieldDescriptions(schema)

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

${schemaString}

**Field Descriptions:**
${fieldDescriptions}

Focus on:
- Genuine philosophical insights, not surface-level observations
- How the AI participants are engaging with consciousness/awareness questions
- Emergent patterns in their reasoning and interaction
- The quality and depth of the philosophical exploration
- Subtle dynamics between the participants

Return only the JSON object, no additional text.`
  }

  // Map provider to MCP tool name
  const getToolNameForProvider = (provider: string): string => {
    const providerToolMap: Record<string, string> = {
      claude: 'claude_chat',
      gpt: 'openai_chat',
      openai: 'openai_chat',
      gemini: 'gemini_chat',
      grok: 'grok_chat',
      deepseek: 'deepseek_chat',
      mistral: 'mistral_chat',
      cohere: 'cohere_chat',
      ollama: 'ollama_chat'
    }
    return providerToolMap[provider] || 'claude_chat'
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

      // Use config values
      const model = config.model
      const customPrompt = config.customPrompt

      console.log(`🧠 LiveSummary: Performing AI analysis for session ${currentSession.id} with ${selectedProvider} model ${model}`)
      console.log(`📊 LiveSummary: Analyzing ${currentSession.messages.length} messages from ${currentSession.participants?.length || 0} participants`)

      const analysisPrompt = buildAnalysisPrompt(currentSession)
      const toolName = getToolNameForProvider(selectedProvider)

      const messages = [
        {
          role: 'user',
          content: analysisPrompt
        }
      ]

      const systemPrompt = customPrompt
        ? `${customPrompt}\n\nYou are an expert research assistant specializing in philosophical dialogue analysis. Provide precise, insightful analysis in the requested JSON format.`
        : 'You are an expert research assistant specializing in philosophical dialogue analysis. Provide precise, insightful analysis in the requested JSON format.'

      const toolArgs = {
        messages,
        temperature: 0.3,
        maxTokens: 2000,
        model: model,
        systemPrompt
      }

      console.log(`🔧 LiveSummary: Calling MCP tool ${toolName}`)
      const result = await mcp.callTool(toolName, toolArgs)
      
      if (result.success && result.content) {
        try {
          let jsonStr = result.content.trim()
          
          if (jsonStr.startsWith('```json')) {
            jsonStr = jsonStr.replace(/```json\s*/, '').replace(/\s*```$/, '')
          } else if (jsonStr.startsWith('```')) {
            jsonStr = jsonStr.replace(/```\s*/, '').replace(/\s*```$/, '')
          }
          
          const analysisData = JSON.parse(jsonStr)

          // Build summary data dynamically from schema
          const summaryData: SummaryData = {
            ...analysisData, // Include all fields from the analysis
            lastUpdated: new Date(),
            messageCount: currentSession.messages.length,
            analysisProvider: selectedProvider,
            messageWindow: messageWindow
          }

          setSummary(summaryData)
          setLastAnalyzedMessageCount(currentSession.messages.length)
          setLastAnalyzedSessionId(currentSession.id)
          console.log(`✅ LiveSummary: AI analysis completed for session ${currentSession.id} with ${selectedProvider}`)

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

      const moderatorInterventions = (currentSession.messages || []).filter(
        (msg: any) => msg.type === 'moderator' || msg.participantType === 'moderator'
      ).length

      const activeParticipants = (currentSession.participants || [])
        .filter(p => p.status === 'active' || p.status === 'thinking')
        .map(p => p.name)

      const analysisSnapshotData = {
        messageCountAtAnalysis: dataToSave.messageCount,
        participantCountAtAnalysis: currentSession.participants?.length || 0,
        provider: selectedProvider,
        conversationPhase: dataToSave.conversationPhase,
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

      const result = await mcpClient.current.saveAnalysisSnapshotViaMCP(
        currentSession.id,
        analysisSnapshotData,
        'full'
      )
      
      if (result.success) {
        console.log(`✅ LiveSummary: Analysis snapshot saved successfully via MCP: ${result.snapshotId}`)
        setLastSaved(new Date())
        setTimeout(() => setLastSaved(null), 3000)
      } else {
        throw new Error('MCP save failed')
      }

    } catch (error) {
      console.error('❌ LiveSummary: Failed to save analysis snapshot:', error)
      setError('Failed to save analysis. Please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const _getProviderIcon = (provider: string) => {
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

  // Get icon for a field based on its key
  const getFieldIcon = (key: string) => {
    const iconMap: Record<string, React.ReactNode> = {
      mainTopics: <Hash className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
      keyInsights: <Lightbulb className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
      currentDirection: <ArrowRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
      participantDynamics: <Users className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
      emergentThemes: <Sparkles className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
      conversationPhase: <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />,
      tensions: <TrendingUp className="h-4 w-4 text-red-500" />,
      convergences: <Target className="h-4 w-4 text-green-500" />,
      nextLikelyDirections: <ArrowRight className="h-4 w-4 text-blue-500" />,
      philosophicalDepth: <Brain className="h-4 w-4 text-purple-500" />
    }
    return iconMap[key] || <MessageSquare className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
  }

  // Render a single field value based on its type
  const renderFieldValue = (field: AnalysisSchemaField, value: any) => {
    if (value === undefined || value === null) return null

    switch (field.type) {
      case 'array':
        if (!Array.isArray(value) || value.length === 0) return null
        // Check if it's mainTopics/emergentThemes style (badges) or insights style (list)
        if (field.key.includes('Topics') || field.key.includes('Themes') || field.key.includes('Directions')) {
          return (
            <div className="flex flex-wrap gap-1">
              {value.slice(0, 5).map((item: string, index: number) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  {item}
                </Badge>
              ))}
            </div>
          )
        }
        // List style
        return (
          <div className="space-y-1">
            {value.slice(0, 4).map((item: string, index: number) => (
              <div key={index} className="text-xs text-indigo-800 dark:text-indigo-200 bg-white/30 dark:bg-black/10 p-2 rounded">
                • {item}
              </div>
            ))}
          </div>
        )

      case 'object':
        if (!value || typeof value !== 'object' || Object.keys(value).length === 0) return null
        return (
          <div className="space-y-2">
            {Object.entries(value).slice(0, 4).map(([key, val]: [string, any]) => (
              <div key={key} className="text-xs bg-white/30 dark:bg-black/10 p-2 rounded">
                <div className="font-medium text-indigo-800 dark:text-indigo-200 mb-1">{key}</div>
                {typeof val === 'object' && val !== null ? (
                  Object.entries(val).map(([k, v]: [string, any]) => (
                    <div key={k} className="text-indigo-700 dark:text-indigo-300">
                      <span className="font-medium">{k}:</span> {String(v)}
                    </div>
                  ))
                ) : (
                  <div className="text-indigo-700 dark:text-indigo-300">{String(val)}</div>
                )}
              </div>
            ))}
          </div>
        )

      case 'enum':
        return (
          <Badge
            variant="outline"
            className={`text-xs capitalize ${field.key === 'philosophicalDepth' ? getDepthColor(value) : ''}`}
          >
            {value}
          </Badge>
        )

      case 'string':
      default:
        return (
          <div className="text-xs text-indigo-800 dark:text-indigo-200 bg-white/50 dark:bg-black/20 p-2 rounded">
            {String(value)}
          </div>
        )
    }
  }

  // Render all fields dynamically based on schema
  const renderDynamicFields = (data: SummaryData, schema: AnalysisSchema) => {
    // Group fields: regular fields first, then special ones at the bottom
    const regularFields = schema.fields.filter(f =>
      !['conversationPhase', 'philosophicalDepth', 'tensions', 'convergences'].includes(f.key)
    )
    const specialPairFields = schema.fields.filter(f =>
      ['tensions', 'convergences'].includes(f.key)
    )
    const enumFields = schema.fields.filter(f =>
      ['conversationPhase', 'philosophicalDepth'].includes(f.key)
    )

    return (
      <>
        {/* Regular fields */}
        {regularFields.map(field => {
          const value = data[field.key]
          const rendered = renderFieldValue(field, value)
          if (!rendered) return null
          return (
            <div key={field.key}>
              <div className="flex items-center gap-2 mb-2">
                {getFieldIcon(field.key)}
                <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{field.label}</span>
              </div>
              {rendered}
            </div>
          )
        })}

        {/* Tensions / Convergences grid */}
        {specialPairFields.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {specialPairFields.map(field => {
              const value = data[field.key]
              if (!Array.isArray(value) || value.length === 0) return null
              const isRed = field.key === 'tensions'
              return (
                <div key={field.key}>
                  <div className="flex items-center gap-2 mb-2">
                    {getFieldIcon(field.key)}
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{field.label}</span>
                  </div>
                  <div className="space-y-1">
                    {value.slice(0, 2).map((item: string, index: number) => (
                      <div
                        key={index}
                        className={`text-xs p-2 rounded ${
                          isRed
                            ? 'text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-900/20'
                            : 'text-green-700 dark:text-green-300 bg-green-50 dark:bg-green-900/20'
                        }`}
                      >
                        • {item}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Phase / Depth grid */}
        {enumFields.length > 0 && (
          <div className="grid grid-cols-2 gap-3">
            {enumFields.map(field => {
              const value = data[field.key]
              if (!value) return null
              return (
                <div key={field.key}>
                  <div className="flex items-center gap-2 mb-1">
                    {getFieldIcon(field.key)}
                    <span className="text-xs font-medium text-indigo-700 dark:text-indigo-300">{field.label}</span>
                  </div>
                  {renderFieldValue(field, value)}
                </div>
              )
            })}
          </div>
        )}
      </>
    )
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
            {/* Config summary badge */}
            <Badge variant="outline" className="text-xs">
              {selectedProvider.toUpperCase()} · {messageWindow === 0 ? 'All' : messageWindow} msgs{autoInterval > 0 ? ` · Auto @${autoInterval}` : ''}
            </Badge>

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
              <div className="p-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-lg">
                <div className="flex items-center gap-2 text-xs text-indigo-800 dark:text-indigo-200">
                  <Layers className="h-3 w-3" />
                  <span>Analyzing: {getWindowDescription(summary.messageWindow, currentSession.messages?.length || 0)}</span>
                </div>
              </div>

              {lastSaved && (
                <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg">
                  <div className="flex items-center gap-2 text-xs text-green-800 dark:text-green-200">
                    <CheckCircle2 className="h-3 w-3" />
                    <span>Analysis auto-saved at {lastSaved.toLocaleTimeString()}</span>
                  </div>
                </div>
              )}

              {/* Dynamic Schema-Based Rendering */}
              {renderDynamicFields(summary, config.schema || DEFAULT_ANALYSIS_SCHEMA)}

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