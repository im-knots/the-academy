// src/components/Chat/ChatInterface.tsx - Updated with Server-Side Conversation Orchestration
'use client'

import Image from 'next/image'
import { useState, useEffect, useCallback, useRef } from 'react'
import { useTemplatePrompt } from '@/hooks/useTemplatePrompt'
import { useMCP } from '@/hooks/useMCP'
import { MCPClient } from '@/lib/mcp/client'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Card, CardContent } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ParticipantAvatar } from '@/components/ui/ParticipantAvatar'
import { AddParticipant } from '@/components/Participants/AddParticipant'
import { ExportModal } from '@/components/Export/ExportModal'
import { MCPModal } from '@/components/MCP/MCPModal'
import { LiveSummary } from '@/components/Research/LiveSummary'
import { SessionsSection } from '@/components/Sessions/SessionsSection'
import { ExperimentsInterface } from '@/components/Research/ExperimentsInterface'
import { ExperimentsList } from '@/components/Research/ExperimentsList'
import {
  Users, Settings, Play, Pause, Plus, Sparkles, MessageSquare,
  Send, Hand, Square, AlertCircle, Clock, CheckCircle2, Loader2,
  Download, FileDown, ChevronLeft, History,
  Wifi, WifiOff, Terminal, Monitor
} from 'lucide-react'

interface ExperimentConfig {
  id: string
  name: string
  participants: Array<{
    type: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere'
    name: string
    model?: string
    temperature?: number
    maxTokens?: number
    personality?: string
    expertise?: string
    ollamaUrl?: string
  }>
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

export function ChatInterface() {
  const [showAddParticipant, setShowAddParticipant] = useState(false)
  const [showExportModal, setShowExportModal] = useState(false)
  const [showMCPModal, setShowMCPModal] = useState(false)
  const [moderatorInput, setModeratorInput] = useState('')
  const [isInterjecting, setIsInterjecting] = useState(false)
  const [conversationState, setConversationState] = useState<'idle' | 'starting' | 'running' | 'pausing' | 'stopping'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [wasRunningBeforeInterjection, setWasRunningBeforeInterjection] = useState(false)
  const [viewMode, setViewMode] = useState<'chat' | 'experiment'>('chat')
  const [showModeratorPanel, setShowModeratorPanel] = useState(false)
  
  // New state for MCP-based data
  const [currentSession, setCurrentSession] = useState<any>(null)
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null)
  const [, setSessions] = useState<any[]>([])
  const [isSessionPaused, setIsSessionPaused] = useState(false)
  const [loading, setLoading] = useState(true)
  
  // Experiments state
  const [experiments, setExperiments] = useState<ExperimentConfig[]>([])
  const [selectedExperiment, setSelectedExperiment] = useState<ExperimentConfig | null>(null)

  // Combined left panel state
  const [showLeftPanel, setShowLeftPanel] = useState(true)
  
  // Template prompt hook
  const { suggestedPrompt, clearSuggestedPrompt } = useTemplatePrompt()

  // MCP integration - using server-side conversation orchestration
  const mcp = useMCP()
  const mcpClient = MCPClient.getInstance()

  // Handle session switching
  const handleSessionChange = async (sessionId: string) => {
    try {
      // Only switch if it's actually a different session
      if (sessionId === currentSessionId) {
        return
      }
      
      // Switch the session via MCP - this will trigger events automatically
      await mcpClient.callTool('switch_current_session', { sessionId })
      
      // Update local state
      setCurrentSessionId(sessionId)
    } catch (error) {
      console.error('Failed to switch session:', error)
    }
  }

  // EVENT-DRIVEN: Fetch current session data
  const fetchCurrentSession = useCallback(async () => {
    if (!currentSessionId) {
      setCurrentSession(null)
      return
    }
    
    try {
      console.log('🔄 Fetching session:', currentSessionId)
      const result = await mcpClient.callTool('get_session', { sessionId: currentSessionId })
      if (result.success && result.session) {
        console.log('🔄 Session fetched:', result.session)
        console.log('🔄 Session status:', result.session.status)
        console.log('🔄 Session participants:', result.session.participants?.length || 0)
        console.log('🔄 Session messages:', result.session.messages?.length || 0)
        setCurrentSession(result.session)
        
        // Update conversation state based on session status
        // A session should only be "running" if it has messages (conversation started)
        const hasMessages = (result.session.messages?.length || 0) > 0
        
        if (result.session.status === 'active' && hasMessages) {
          console.log('🔄 Setting conversation state to running (conversation started)')
          setConversationState('running')
          setIsSessionPaused(false)
        } else if (result.session.status === 'paused') {
          console.log('🔄 Setting conversation state to idle (paused)')
          setConversationState('idle')
          setIsSessionPaused(true)
        } else {
          console.log('🔄 Setting conversation state to idle (no messages or not active)')
          setConversationState('idle')
          setIsSessionPaused(false)
        }
      } else {
        console.log('🔄 Failed to fetch session or no session found')
      }
    } catch (error) {
      console.error('Failed to fetch current session:', error)
    }
  }, [currentSessionId, mcpClient])

  // EVENT-DRIVEN: Fetch all sessions
  const fetchSessions = useCallback(async () => {
    try {
      const result = await mcpClient.callTool('get_sessions', {})
      if (result.success && result.sessions) {
        setSessions(result.sessions)
      }
    } catch (error) {
      console.error('Failed to fetch sessions:', error)
    }
  }, [mcpClient])

  // EVENT-DRIVEN: Handle session-specific updates
  const handleSessionUpdated = useCallback(async (payload: any) => {
    console.log('🔄 ChatInterface: Session updated event received:', payload.data)

    // If this is the current session, refresh it
    // Note: SessionsSection handles its own sessions list refresh
    if (payload.data.sessionId === currentSessionId) {
      await fetchCurrentSession()
    }
  }, [currentSessionId, fetchCurrentSession])

  // EVENT-DRIVEN: Handle session switching
  const handleSessionSwitched = useCallback(async (payload: any) => {
    console.log('🔄 ChatInterface: Session switched event received:', payload.data)
    
    const newSessionId = payload.data.sessionId
    if (newSessionId !== currentSessionId) {
      setCurrentSessionId(newSessionId)
      // fetchCurrentSession will be called automatically when currentSessionId changes
    }
  }, [currentSessionId])

  // EVENT-DRIVEN: Handle messages
  const handleMessageEvent = useCallback(async (payload: any) => {
    console.log('🔄 ChatInterface: Message event received:', payload.data)
    
    // If this message affects the current session, refresh it
    if (payload.data.sessionId === currentSessionId) {
      await fetchCurrentSession()
    }
  }, [currentSessionId, fetchCurrentSession])

  // EVENT-DRIVEN: Handle participant events
  const handleParticipantEvent = useCallback(async (payload: any) => {
    console.log('🔄 ChatInterface: Participant event received:', payload.data)
    
    // If this participant event affects the current session, refresh it
    if (payload.data.sessionId === currentSessionId) {
      await fetchCurrentSession()
    }
  }, [currentSessionId, fetchCurrentSession])

  // EVENT-DRIVEN: Handle conversation state changes
  const handleConversationEvent = useCallback(async (payload: any) => {
    console.log('🔄 ChatInterface: Conversation event received:', payload.data)
    
    // If this conversation event affects the current session, refresh it
    if (payload.data.sessionId === currentSessionId) {
      await fetchCurrentSession()
    }
  }, [currentSessionId, fetchCurrentSession])

  // EVENT-DRIVEN: Subscribe to relevant events via internal pub/sub
  useEffect(() => {
    console.log('🔄 ChatInterface: Setting up internal pub/sub event subscriptions')
    
    // Session events
    const unsubscribeSessionCreated = eventBus.subscribe(EVENT_TYPES.SESSION_CREATED, fetchSessions)
    const unsubscribeSessionUpdated = eventBus.subscribe(EVENT_TYPES.SESSION_UPDATED, handleSessionUpdated)
    const unsubscribeSessionDeleted = eventBus.subscribe(EVENT_TYPES.SESSION_DELETED, fetchSessions)
    const unsubscribeSessionSwitched = eventBus.subscribe(EVENT_TYPES.SESSION_SWITCHED, handleSessionSwitched)
    const unsubscribeSessionDuplicated = eventBus.subscribe(EVENT_TYPES.SESSION_DUPLICATED, fetchSessions)
    const unsubscribeSessionImported = eventBus.subscribe(EVENT_TYPES.SESSION_IMPORTED, fetchSessions)
    const unsubscribeSessionsListChanged = eventBus.subscribe(EVENT_TYPES.SESSIONS_LIST_CHANGED, fetchSessions)
    
    // Message events
    const unsubscribeMessageSent = eventBus.subscribe(EVENT_TYPES.MESSAGE_SENT, handleMessageEvent)
    const unsubscribeMessageUpdated = eventBus.subscribe(EVENT_TYPES.MESSAGE_UPDATED, handleMessageEvent)
    const unsubscribeMessageDeleted = eventBus.subscribe(EVENT_TYPES.MESSAGE_DELETED, handleMessageEvent)
    
    // Participant events
    const unsubscribeParticipantAdded = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_ADDED, handleParticipantEvent)
    const unsubscribeParticipantRemoved = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_REMOVED, handleParticipantEvent)
    const unsubscribeParticipantUpdated = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_UPDATED, handleParticipantEvent)
    
    // Conversation events
    const unsubscribeConversationStarted = eventBus.subscribe(EVENT_TYPES.CONVERSATION_STARTED, handleConversationEvent)
    const unsubscribeConversationPaused = eventBus.subscribe(EVENT_TYPES.CONVERSATION_PAUSED, handleConversationEvent)
    const unsubscribeConversationResumed = eventBus.subscribe(EVENT_TYPES.CONVERSATION_RESUMED, handleConversationEvent)
    const unsubscribeConversationStopped = eventBus.subscribe(EVENT_TYPES.CONVERSATION_STOPPED, handleConversationEvent)
    
    return () => {
      console.log('🔄 ChatInterface: Cleaning up internal pub/sub event subscriptions')
      unsubscribeSessionCreated()
      unsubscribeSessionUpdated()
      unsubscribeSessionDeleted()
      unsubscribeSessionSwitched()
      unsubscribeSessionDuplicated()
      unsubscribeSessionImported()
      unsubscribeSessionsListChanged()
      unsubscribeMessageSent()
      unsubscribeMessageUpdated()
      unsubscribeMessageDeleted()
      unsubscribeParticipantAdded()
      unsubscribeParticipantRemoved()
      unsubscribeParticipantUpdated()
      unsubscribeConversationStarted()
      unsubscribeConversationPaused()
      unsubscribeConversationResumed()
      unsubscribeConversationStopped()
    }
  }, [
    fetchSessions, 
    handleSessionUpdated, 
    handleSessionSwitched, 
    handleMessageEvent, 
    handleParticipantEvent, 
    handleConversationEvent
  ])

  // Initialize data on mount
  useEffect(() => {
    const initialize = async () => {
      setLoading(true)
      
      try {
        // Initial data fetch
        await fetchSessions()
        
        // Get current session ID from MCP
        const result = await mcpClient.callTool('get_current_session_id', {})
        if (result.success && result.sessionId) {
          setCurrentSessionId(result.sessionId)
        }
      } catch (error) {
        console.error('Failed to initialize ChatInterface:', error)
      } finally {
        setLoading(false)
      }
    }
    
    initialize()
  }, [fetchSessions, mcpClient])

  // Fetch current session when currentSessionId changes
  useEffect(() => {
    if (currentSessionId) {
      fetchCurrentSession()
    }
  }, [currentSessionId, fetchCurrentSession])

  // Lightweight polling for the current session only when conversation is running
  // This is necessary because server-side conversation updates don't trigger client events
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    // Only poll when conversation is running and we have a session
    if (conversationState !== 'running' || !currentSessionId) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
      return
    }

    // Poll current session only (not sessions list) at reasonable interval
    pollingIntervalRef.current = setInterval(async () => {
      try {
        await fetchCurrentSession()
      } catch (error) {
        console.error('Session polling error:', error)
      }
    }, 2000) // Poll every 2 seconds while running

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [conversationState, currentSessionId, fetchCurrentSession])

  // Load experiments on mount
  useEffect(() => {
    loadExperiments()
  }, [])

  const loadExperiments = async () => {
    try {
      const result = await mcp.getExperimentsViaMCP()
      if (result.success && result.experiments) {
        // Convert date strings to Date objects
        const experimentsWithDates = result.experiments.map((exp: any) => ({
          ...exp,
          createdAt: new Date(exp.createdAt),
          lastModified: new Date(exp.lastModified)
        }))
        setExperiments(experimentsWithDates)
      }
    } catch (error) {
      console.error('Failed to load experiments:', error)
    }
  }

  const handleCreateExperiment = async (config: ExperimentConfig) => {
    try {
      const result = await mcp.createExperimentViaMCP(config)
      
      if (result.success) {
        // FIX: Access experiment data from result.experiment, not result.config
        const experimentData = result.experiment
        
        // Reload experiments to get the new one
        await loadExperiments()
        
        // Select the newly created experiment with proper date conversion
        const newExperiment = {
          ...experimentData,
          // Convert date strings to Date objects if they're strings
          createdAt: experimentData.createdAt instanceof Date 
            ? experimentData.createdAt 
            : new Date(experimentData.createdAt),
          lastModified: experimentData.lastModified instanceof Date 
            ? experimentData.lastModified 
            : new Date(experimentData.lastModified)
        }
        
        setSelectedExperiment(newExperiment)
        
        // Optional: Add success notification here if you have a notification system
        console.log(`✅ Experiment "${experimentData.name}" created successfully with ID: ${experimentData.id}`)
        
      } else {
        throw new Error(result.message || 'Failed to create experiment')
      }
    } catch (error) {
      console.error('Failed to create experiment:', error)
      alert('Failed to create experiment. Please try again.')
    }
  }

  const handleSelectExperiment = (experiment: ExperimentConfig | null) => {
    setSelectedExperiment(experiment)
  }



  const toggleModeratorPanel = () => {
    setShowModeratorPanel(!showModeratorPanel)
  }

  // Auto-populate moderator input from template prompt
  const messageCount = currentSession?.messages?.length || 0
  useEffect(() => {
    if (suggestedPrompt && messageCount === 0) {
      setModeratorInput(suggestedPrompt)
    }
  }, [suggestedPrompt, messageCount])

  // Clear error after 5 seconds
  useEffect(() => {
    if (error) {
      const timer = setTimeout(() => setError(null), 5000)
      return () => clearTimeout(timer)
    }
  }, [error])

  const hasMessages = currentSession?.messages && currentSession.messages.length > 0
  const hasParticipants = currentSession?.participants && currentSession.participants.length > 0
  const hasAIParticipants = (currentSession?.participants || []).filter((p: { type: string }) => p.type !== 'moderator').length >= 2

  const handleStartConversation = async () => {
    if (!currentSession || !hasAIParticipants || !moderatorInput.trim()) return

    try {
      setConversationState('starting')
      setError(null)

      // Start the AI-to-AI conversation using server-side orchestration
      // This calls the MCP start_conversation tool which uses ServerConversationManager
      await mcpClient.startConversationViaMCP(currentSession.id, moderatorInput.trim())

      setModeratorInput('')
      setConversationState('running')

    } catch (error) {
      console.error('Failed to start conversation:', error)
      setError(error instanceof Error ? error.message : 'Failed to start conversation')
      setConversationState('idle')
    }
  }

  const handlePauseConversation = async () => {
    if (!currentSession) return

    try {
      setConversationState('pausing')
      setError(null)

      // Pause conversation using server-side orchestration
      // This calls the MCP pause_conversation tool which uses ServerConversationManager
      await mcpClient.pauseConversationViaMCP(currentSession.id)
      setConversationState('idle')
      setIsSessionPaused(true)

    } catch (error) {
      console.error('Failed to pause conversation:', error)
      setError(error instanceof Error ? error.message : 'Failed to pause conversation')
      setConversationState('running')
    }
  }

  const handleResumeConversation = async () => {
    if (!currentSession) return

    try {
      setConversationState('starting')
      setError(null)

      // Resume conversation using server-side orchestration
      // This calls the MCP resume_conversation tool which uses ServerConversationManager
      await mcpClient.resumeConversationViaMCP(currentSession.id)
      setConversationState('running')
      setIsSessionPaused(false)

    } catch (error) {
      console.error('Failed to resume conversation:', error)
      setError(error instanceof Error ? error.message : 'Failed to resume conversation')
      setConversationState('idle')
    }
  }

  const handleStopConversation = async () => {
    if (!currentSession) return

    try {
      setConversationState('stopping')
      setError(null)

      // Stop conversation using server-side orchestration
      // This calls the MCP stop_conversation tool which uses ServerConversationManager
      await mcpClient.stopConversationViaMCP(currentSession.id)
      setConversationState('idle')

    } catch (error) {
      console.error('Failed to stop conversation:', error)
      setError(error instanceof Error ? error.message : 'Failed to stop conversation')
    }
  }

  const handleInterject = async () => {
    if (!currentSession) return
    
    if (isInterjecting) {
      // Send the interjection
      if (moderatorInput.trim()) {
        // This will emit events automatically via internal pub/sub
        await mcpClient.injectPromptViaMCP(currentSession.id, moderatorInput.trim())
        setModeratorInput('')
      }
      setIsInterjecting(false)
      
      // Resume conversation if it was running before interjection
      if (wasRunningBeforeInterjection) {
        await handleResumeConversation()
        setWasRunningBeforeInterjection(false)
      }
    } else {
      // Start interjecting
      const wasRunning = conversationState === 'running'
      setWasRunningBeforeInterjection(wasRunning)
      
      if (wasRunning) {
        await handlePauseConversation()
      }
      setIsInterjecting(true)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (hasMessages && (conversationState === 'running' || isInterjecting)) {
        handleInterject()
      } else if (!hasMessages && hasAIParticipants) {
        handleStartConversation()
      }
    }
  }

  const getConversationStatus = () => {
    // If we're interjecting, show that status
    if (isInterjecting) {
      return { text: 'Interjecting', icon: Hand, variant: 'moderator' as const, animate: false }
    }
    
    switch (conversationState) {
      case 'starting':
        return { text: 'Starting...', icon: Loader2, variant: 'thinking' as const, animate: true }
      case 'running':
        return { text: 'Active', icon: CheckCircle2, variant: 'active' as const, animate: false }
      case 'pausing':
        return { text: 'Pausing...', icon: Loader2, variant: 'thinking' as const, animate: true }
      case 'stopping':
        return { text: 'Stopping...', icon: Loader2, variant: 'thinking' as const, animate: true }
      default:
        return isSessionPaused 
          ? { text: 'Paused', icon: Clock, variant: 'paused' as const, animate: false }
          : { text: 'Ready', icon: Play, variant: 'idle' as const, animate: false }
    }
  }

  const getMCPStatusIcon = () => {
    if (!mcp.isInitialized) return <Monitor className="h-4 w-4 text-gray-400" />
    if (mcp.isConnected) return <Wifi className="h-4 w-4 text-green-600" />
    return <WifiOff className="h-4 w-4 text-red-600" />
  }

  const getMCPStatusColor = () => {
    if (!mcp.isInitialized) return 'text-gray-600 bg-gray-50 border-gray-200'
    if (mcp.isConnected) return 'text-green-600 bg-green-50 border-green-200'
    return 'text-red-600 bg-red-50 border-red-200'
  }

  // Show loading state while initializing
  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin text-blue-500 mx-auto mb-4" />
          <p className="text-gray-600 dark:text-gray-400">Loading The Academy...</p>
        </div>
      </div>
    )
  }

  // Store viewMode in a variable that won't be narrowed for use in UI components
  const currentViewMode = viewMode

  // Render experiments interface if in experiment mode
  if (viewMode === 'experiment') {
    return (
      <div className="h-screen w-screen flex bg-gray-50 dark:bg-gray-900">
        {/* Combined Left Panel */}
        <div className={`${showLeftPanel ? 'w-80' : 'w-0'} transition-all duration-300 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden`}>
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-black-500 to-black-600 rounded-xl flex items-center justify-center p-1">
                <Image
                  src="/icons/logo.png"
                  alt="The Academy"
                  width={32}
                  height={32}
                  className="object-contain"
                />
              </div>
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-gray-100">The Academy</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Socratic Dialogue Engine</p>
              </div>
            </div>
          </div>

          {/* View Mode Switcher */}
          <div className="p-4">
            <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-md">
              <Button
                variant={currentViewMode === 'chat' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('chat')}
                className="rounded-r-none border-r flex-1"
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Chat
              </Button>
              <Button
                variant={currentViewMode === 'experiment' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('experiment')}
                className="rounded-l-none flex-1"
              >
                <Terminal className="h-4 w-4 mr-1" />
                Experiments
              </Button>
            </div>
          </div>
          
          {/* Experiments List */}
          <div className="flex-1 overflow-hidden flex flex-col">
            <ExperimentsList
              experiments={experiments}
              selectedExperiment={selectedExperiment}
              onSelectExperiment={handleSelectExperiment}
              onNewExperiment={() => setSelectedExperiment(null)}
            />
          </div>
        </div>

        {/* Experiments Interface */}
        <ExperimentsInterface 
          sessionId={currentSession?.id}
          experiments={experiments}
          selectedExperiment={selectedExperiment}
          onSelectExperiment={handleSelectExperiment}
          onCreateExperiment={handleCreateExperiment}
        />
      </div>
    )
  }

  // Original chat interface code continues unchanged below...
  if (!currentSession) {
    return (
      <div className="h-screen w-screen flex bg-gray-50 dark:bg-gray-900">
        {/* Combined Left Panel */}
        <div className="w-80 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-black-500 to-black-600 rounded-xl flex items-center justify-center p-1">
                <Image
                  src="/icons/logo.png"
                  alt="The Academy"
                  width={32}
                  height={32}
                  className="object-contain"
                />
              </div>
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-gray-100">The Academy</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Socratic Dialogue Engine</p>
              </div>
            </div>
          </div>
          
          {/* View Mode Switcher */}
          <div className="p-4">
            <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-md">
              <Button
                variant={currentViewMode === 'chat' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('chat')}
                className="rounded-r-none border-r flex-1"
              >
                <MessageSquare className="h-4 w-4 mr-1" />
                Chat
              </Button>
              <Button
                variant={currentViewMode === 'experiment' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('experiment')}
                className="rounded-l-none flex-1"
              >
                <Terminal className="h-4 w-4 mr-1" />
                Experiments
              </Button>
            </div>
          </div>

          {currentViewMode === 'chat' ? (
            <SessionsSection
              currentSessionId={currentSessionId}
              onSessionChange={handleSessionChange}
            />
          ) : (
            <div className="flex-1 overflow-hidden flex flex-col">
              <ExperimentsList
                experiments={experiments}
                selectedExperiment={selectedExperiment}
                onSelectExperiment={handleSelectExperiment}
                onNewExperiment={() => setSelectedExperiment(null)}
              />
            </div>
          )}
        </div>

        {/* Main Area - No Session Selected */}
        <div className="flex-1 flex items-center justify-center">
          {viewMode === 'chat' ? (
            <div className="text-center">
              <div className="relative mb-8">
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-32 h-32 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full animate-pulse"></div>
                </div>
                <div className="relative w-20 h-20 bg-gradient-to-br from-black-500 to-black-600 rounded-2xl flex items-center justify-center mx-auto">
                  <Image
                    src="/icons/logo.png"
                    alt="The Academy"
                    width={64}
                    height={64}
                    className="object-contain"
                  />
                </div>
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-2">Welcome to The Academy</h1>
              <p className="text-gray-600 dark:text-gray-400 mb-6">
                Select a session from the sidebar or create a new one to begin
              </p>
            </div>
          ) : (
            <ExperimentsInterface 
              sessionId={undefined}
              experiments={experiments}
              selectedExperiment={selectedExperiment}
              onSelectExperiment={handleSelectExperiment}
              onCreateExperiment={handleCreateExperiment}
            />
          )}
        </div>
      </div>
    )
  }

  const statusInfo = getConversationStatus()

  return (
    <div className="h-screen w-screen flex bg-gray-50 dark:bg-gray-900">
      {/* Combined Left Panel - Academy + Participants + Sessions */}
      <div className={`${showLeftPanel ? 'w-80' : 'w-0'} transition-all duration-300 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col overflow-hidden`}>
        {/* Academy Header */}
        <div className="p-6 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-black-500 to-black-600 rounded-xl flex items-center justify-center p-1">
              <Image
                src="/icons/logo.png"
                alt="The Academy"
                width={32}
                height={32}
                className="object-contain"
              />
            </div>
            <div>
              <h1 className="font-semibold text-gray-900 dark:text-gray-100">The Academy</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">Socratic Dialogue Engine</p>
            </div>
          </div>
        </div>

        {/* View Mode Switcher */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-md">
            <Button
              variant={currentViewMode === 'chat' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('chat')}
              className="rounded-r-none border-r flex-1"
            >
              <MessageSquare className="h-4 w-4 mr-1" />
              Chat
            </Button>
            <Button
              variant={currentViewMode === 'experiment' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('experiment')}
              className="rounded-l-none flex-1"
            >
              <Terminal className="h-4 w-4 mr-1" />
              Experiments
            </Button>
          </div>
        </div>

        {/* Participants Section */}
        <div className="border-b border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-medium text-gray-900 dark:text-gray-100">Participants</h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  console.log('🔄 Add Participant button clicked!')
                  console.log('🔄 currentSession:', currentSession?.id)
                  console.log('🔄 conversationState:', conversationState)
                  console.log('🔄 showAddParticipant before:', showAddParticipant)
                  setShowAddParticipant(true)
                  console.log('🔄 setShowAddParticipant(true) called')
                }}
                className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-gray-700 dark:hover:bg-gray-600"
                disabled={conversationState === 'running'}
                title={`Add Participant (State: ${conversationState}, Session: ${currentSession?.id || 'none'})`}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
            
            <div className="space-y-3 max-h-60 overflow-y-auto">
              {currentSession.participants.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Users className="h-6 w-6 text-gray-400" />
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">No participants yet</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500">Add AI agents to begin</p>
                </div>
              ) : (
                currentSession.participants.map((participant: any) => (
                  <div key={participant.id} className="group relative">
                    <div className="flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                      <ParticipantAvatar 
                        participantType={participant.type} 
                        size="md"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-gray-900 dark:text-gray-100 truncate">
                            {participant.name}
                          </p>
                          <Badge variant={participant.status} className="text-xs">
                            {participant.status === 'thinking' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                            {participant.status}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {participant.messageCount} messages • {participant.type.toUpperCase()}
                        </p>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            {!hasAIParticipants && hasParticipants && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-800 dark:text-amber-200">
                    <p className="font-medium mb-1">Need AI Participants</p>
                    <p>Add at least 2 AI agents to start an autonomous conversation.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sessions Section */}
        <div className="flex-1 overflow-hidden flex flex-col">
          <SessionsSection 
            currentSessionId={currentSessionId}
            onSessionChange={handleSessionChange}
          />
        </div>

        {/* Controls at Bottom */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-700">
          <div className="flex gap-2 mb-3">
            {conversationState === 'idle' || isSessionPaused ? (
              <Button
                variant="default"
                size="sm"
                onClick={isSessionPaused ? handleResumeConversation : () => {}}
                disabled={!hasAIParticipants || conversationState !== 'idle'}
                className="flex-1"
              >
                {conversationState === 'starting' ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    {isSessionPaused ? 'Resume' : 'Ready'}
                  </>
                )}
              </Button>
            ) : (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePauseConversation}
                  disabled={conversationState !== 'running'}
                  className="flex-1"
                >
                  {conversationState === 'pausing' ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Pausing...
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleStopConversation}
                  disabled={conversationState === 'stopping'}
                >
                  {conversationState === 'stopping' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Square className="h-4 w-4" />
                  )}
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleModeratorPanel}
              className={showModeratorPanel ? 'bg-gray-100 dark:bg-gray-700' : ''}
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>
          
          {error && (
            <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-md">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-red-800 dark:text-red-200">{error}</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {/* Left Panel Toggle */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowLeftPanel(!showLeftPanel)}
                className="hover:bg-gray-100 dark:hover:bg-gray-700"
              >
                {showLeftPanel ? <ChevronLeft className="h-4 w-4" /> : <History className="h-4 w-4" />}
              </Button>
              
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-gray-100">{currentSession.name}</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {currentSession.participants.length} participants • {currentSession.messages.length} messages
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              {hasMessages && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowExportModal(true)}
                  disabled={conversationState === 'running'}
                  className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  <FileDown className="h-4 w-4" />
                </Button>
              )}

              {/* MCP Button */}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowMCPModal(true)}
                className={`text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 ${
                  mcp.isConnected ? 'bg-green-50 dark:bg-green-900/20' : ''
                }`}
                title="MCP Integration"
              >
                {getMCPStatusIcon()}
              </Button>
            </div>
          </div>
        </div>

        {/* Chat Messages */}
        <div className="flex-1 overflow-y-auto">
          {currentSession.messages.length === 0 ? (
            <div className="h-full flex items-center justify-center p-8">
              <div className="text-center max-w-md">
                <div className="relative mb-8">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-24 h-24 bg-gradient-to-br from-blue-400/20 to-purple-600/20 rounded-full animate-pulse"></div>
                  </div>
                  <div className="relative w-16 h-16 bg-gradient-to-br from-black-500 to-black-600 rounded-2xl flex items-center justify-center mx-auto">
                    <Image
                      src="/icons/logo.png"
                      alt="The Academy"
                      width={48}
                      height={48}
                      className="object-contain"
                    />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-3">
                  Ready to Explore
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 leading-relaxed">
                  {hasAIParticipants 
                    ? "Send an opening prompt below to begin the AI-to-AI conversation."
                    : "Add AI participants and then send an opening prompt to begin the dialogue."
                  }
                </p>
              </div>
            </div>
          ) : (
            <div className="max-w-4xl mx-auto p-6 space-y-6">
              {currentSession.messages.map((message: any) => (
                <div key={message.id} className="message-appear">
                  <div className="flex gap-4">
                    <ParticipantAvatar 
                      participantType={message.participantType} 
                      size="md"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {message.participantName}
                        </span>
                        <Badge variant={message.participantType} className="text-xs">
                          {message.participantType}
                        </Badge>
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          {new Date(message.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                      <div className="prose prose-gray dark:prose-invert max-w-none">
                        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm border border-gray-200 dark:border-gray-700">
                          <p className="text-gray-900 dark:text-gray-100 leading-relaxed m-0 whitespace-pre-wrap">
                            {message.content}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Moderator Input Area */}
        <div className="bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="w-full max-w-6xl mx-auto">
            {/* Template suggestion banner */}
            {suggestedPrompt && !hasMessages && (
              <div className="mb-4 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg">
                <div className="flex items-start gap-3">
                  <Sparkles className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-sm font-medium text-blue-900 dark:text-blue-100 mb-1">
                      Template Prompt Suggested
                    </p>
                    <p className="text-xs text-blue-700 dark:text-blue-300">
                      This session includes a curated conversation starter. You can edit or replace it below.
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setModeratorInput('')
                      clearSuggestedPrompt()
                    }}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  >
                    Clear
                  </Button>
                </div>
              </div>
            )}
            
            {isInterjecting && (
              <div className="mb-4 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg">
                <div className="flex items-center gap-2 text-amber-800 dark:text-amber-200">
                  <Hand className="h-4 w-4" />
                  <span className="text-sm font-medium">
                    Conversation paused for moderation. Send your interjection below.
                  </span>
                </div>
              </div>
            )}
            
            <div className="flex gap-4">
              <div className="flex-1">
                <textarea
                  value={moderatorInput}
                  onChange={(e) => setModeratorInput(e.target.value)}
                  onKeyDown={handleKeyPress}
                  placeholder={
                    !hasAIParticipants 
                      ? "Add at least 2 AI participants first..."
                      : hasMessages 
                        ? (isInterjecting ? "Enter your interjection..." : "Interject with guidance...")
                        : "Enter an opening prompt to begin the AI conversation..."
                  }
                  disabled={!hasAIParticipants || conversationState === 'starting' || conversationState === 'stopping'}
                  className="w-full px-4 py-3 border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none min-h-[60px] max-h-[200px] disabled:opacity-50"
                  rows={3}
                />
              </div>
              
              <div className="flex flex-col gap-2 flex-shrink-0">
                {hasMessages ? (
                  <Button
                    onClick={handleInterject}
                    disabled={!hasAIParticipants || (!moderatorInput.trim() && isInterjecting) || conversationState === 'starting' || conversationState === 'stopping'}
                    variant={isInterjecting ? "default" : "outline"}
                    className="min-h-[60px] px-6"
                  >
                    {isInterjecting ? (
                      <>
                        <Send className="h-5 w-5 mr-2" />
                        Send
                      </>
                    ) : (
                      <>
                        <Hand className="h-5 w-5 mr-2" />
                        Interject
                      </>
                    )}
                  </Button>
                ) : (
                  <Button
                    onClick={handleStartConversation}
                    disabled={!hasAIParticipants || !moderatorInput.trim() || conversationState !== 'idle'}
                    className="min-h-[60px] px-6 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50"
                  >
                    {conversationState === 'starting' ? (
                      <>
                        <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                        Starting...
                      </>
                    ) : (
                      <>
                        <Send className="h-5 w-5 mr-2" />
                        Begin
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
            
            <div className="mt-3 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
              <span>
                {hasMessages ? "Press Enter to interject, Shift+Enter for new line" : "Press Enter to begin conversation, Shift+Enter for new line"}
              </span>
              <div className="flex items-center gap-4">
                <span>
                  {moderatorInput.length} characters
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Moderator Panel with Live Summary */}
      {showModeratorPanel && (
        <div className="w-80 bg-white dark:bg-gray-800 border-l border-gray-200 dark:border-gray-700 flex flex-col">
          <div className="p-6 border-b border-gray-200 dark:border-gray-700">
            <h2 className="font-semibold text-gray-900 dark:text-gray-100">Research Center</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Monitor and analyze dialogue patterns</p>
          </div>
          
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border-blue-200 dark:border-blue-700">
              <CardContent className="p-4">
                <h3 className="font-medium text-blue-900 dark:text-blue-100 mb-3">Session Metrics</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Status:</span>
                    <Badge variant={statusInfo.variant} className="text-xs">
                      <statusInfo.icon className={`h-3 w-3 mr-1 ${statusInfo.animate ? 'animate-spin' : ''}`} />
                      {statusInfo.text}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Messages:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">{currentSession.messages.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">AI Agents:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">
                      {currentSession.participants.filter((p: any) => p.type !== 'moderator').length}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-blue-700 dark:text-blue-300">Mode:</span>
                    <span className="font-medium text-blue-900 dark:text-blue-100">
                      {isInterjecting ? 'Interjecting' : conversationState === 'running' ? 'Autonomous' : 'Manual'}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>
            
            {/* MCP Status Card */}
            {mcp.isInitialized && (
              <Card className="bg-gradient-to-br from-purple-50 to-violet-50 dark:from-purple-900/20 dark:to-violet-900/20 border-purple-200 dark:border-purple-700">
                <CardContent className="p-4">
                  <h3 className="font-medium text-purple-900 dark:text-purple-100 mb-3 flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    MCP Status
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-purple-700 dark:text-purple-300">Connection:</span>
                      <Badge className={`text-xs ${getMCPStatusColor()}`}>
                        {mcp.connectionStatus}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-700 dark:text-purple-300">Resources:</span>
                      <span className="font-medium text-purple-900 dark:text-purple-100">{mcp.resources.length}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-purple-700 dark:text-purple-300">Tools:</span>
                      <span className="font-medium text-purple-900 dark:text-purple-100">{mcp.tools.length}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            )}
            
            <Card>
              <CardContent className="p-4">
                <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">Quick Actions</h3>
                <div className="space-y-2">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => setShowExportModal(true)}
                    disabled={!hasMessages}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    Export Chat Data
                  </Button>
                  
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => setShowMCPModal(true)}
                  >
                    {getMCPStatusIcon()}
                    <span className="ml-2">MCP Integration</span>
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Live AI Analysis */}
            <LiveSummary sessionId={currentSession.id} />
          </div>
        </div>
      )}

      {/* Modals */}
      {currentSession && (
        <>
          {console.log('🔄 Rendering modals. showAddParticipant:', showAddParticipant, 'currentSession.id:', currentSession.id)}
          <AddParticipant 
            isOpen={showAddParticipant} 
            onClose={() => setShowAddParticipant(false)} 
            sessionId={currentSession.id}
          />
          
          <ExportModal
            isOpen={showExportModal}
            onClose={() => setShowExportModal(false)}
            sessionId={currentSession.id}
          />

          <MCPModal
            isOpen={showMCPModal}
            onClose={() => setShowMCPModal(false)}
            sessionId={currentSession.id}
          />
        </>
      )}
    </div>
  )
}