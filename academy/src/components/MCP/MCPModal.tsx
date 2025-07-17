// src/components/MCP/MCPModal.tsx - Updated with Internal Pub/Sub Event System
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMCP, useSessionMCP } from '@/hooks/useMCP'
import { MCPClient } from '@/lib/mcp/client'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { 
  X, Activity, AlertCircle, CheckCircle2, Clock, Database, 
  Loader2, RefreshCw, Terminal, Zap, Brain, MessageSquare, 
  Users, BarChart3, Eye, EyeOff, Copy, Download, Sparkles, 
  BookOpen, Play, Pause, Square, Send, FileDown, Settings,
  Monitor, Wifi, WifiOff, Server, Code, Cpu
} from 'lucide-react'
import type { ChatSession } from '@/types/chat'

interface MCPModalProps {
  isOpen: boolean
  onClose: () => void
  sessionId?: string // Now passed as prop since we don't have global store
}

interface PromptArgument {
  name: string
  required?: boolean
  description?: string
  type?: string
}

interface MCPPrompt {
  name: string
  description?: string
  arguments?: PromptArgument[]
}

export function MCPModal({ isOpen, onClose, sessionId }: MCPModalProps) {
  const [activeTab, setActiveTab] = useState<'overview' | 'resources' | 'tools' | 'prompts' | 'analysis' | 'control'>('overview')
  const [selectedResource, setSelectedResource] = useState<string | null>(null)
  const [resourceContent, setResourceContent] = useState<any>(null)
  const [isLoadingResource, setIsLoadingResource] = useState(false)
  const [analysisData, setAnalysisData] = useState<any>(null)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [selectedTool, setSelectedTool] = useState<string | null>(null)
  const [toolArgs, setToolArgs] = useState<string>('')
  const [toolResult, setToolResult] = useState<any>(null)
  const [isExecutingTool, setIsExecutingTool] = useState(false)
  
  // New state for session data
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [isLoadingSession, setIsLoadingSession] = useState(false)
  
  // MCP client ref
  const mcpClient = useRef(MCPClient.getInstance())

  const mcp = useMCP()
  const sessionMCP = useSessionMCP()

  // EVENT-DRIVEN: Fetch session data from MCP
  const fetchSessionData = useCallback(async () => {
    if (!sessionId) {
      setCurrentSession(null)
      return
    }

    try {
      const sessionResult = await mcpClient.current.callTool('get_session', { sessionId })
      if (sessionResult.success && sessionResult.session) {
        setCurrentSession(sessionResult.session)
      }
    } catch (error) {
      console.error('Failed to fetch session data:', error)
      setCurrentSession(null)
    }
  }, [sessionId])

  // EVENT-DRIVEN: Handle session updates
  const handleSessionUpdated = useCallback(async (payload: any) => {
    console.log('🔧 MCPModal: Session updated event received:', payload.data)
    
    // If this is our session, refresh the data
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // EVENT-DRIVEN: Handle message events
  const handleMessageEvent = useCallback(async (payload: any) => {
    console.log('🔧 MCPModal: Message event received:', payload.data)
    
    // If this affects our session, refresh the data
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // EVENT-DRIVEN: Handle participant events
  const handleParticipantEvent = useCallback(async (payload: any) => {
    console.log('🔧 MCPModal: Participant event received:', payload.data)
    
    // If this affects our session, refresh the data
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // EVENT-DRIVEN: Handle conversation events
  const handleConversationEvent = useCallback(async (payload: any) => {
    console.log('🔧 MCPModal: Conversation event received:', payload.data)
    
    // If this affects our session, refresh the data
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // EVENT-DRIVEN: Handle analysis events
  const handleAnalysisEvent = useCallback(async (payload: any) => {
    console.log('🔧 MCPModal: Analysis event received:', payload.data)
    
    // If this affects our session and we're on the analysis tab, refresh analysis
    if (payload.data.sessionId === sessionId && activeTab === 'analysis') {
      // Reload analysis if we have existing data
      if (analysisData) {
        loadAnalysis()
      }
    }
  }, [sessionId, activeTab, analysisData])

  // EVENT-DRIVEN: Subscribe to relevant events via internal pub/sub
  useEffect(() => {
    if (!isOpen) return

    console.log('🔧 MCPModal: Setting up internal pub/sub event subscriptions')

    // Initial fetch
    setIsLoadingSession(true)
    fetchSessionData().finally(() => setIsLoadingSession(false))

    // Session events
    const unsubscribeSessionUpdated = eventBus.subscribe(EVENT_TYPES.SESSION_UPDATED, handleSessionUpdated)
    const unsubscribeSessionSwitched = eventBus.subscribe(EVENT_TYPES.SESSION_SWITCHED, handleSessionUpdated)
    
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
    
    // Analysis events
    const unsubscribeAnalysisSaved = eventBus.subscribe(EVENT_TYPES.ANALYSIS_SAVED, handleAnalysisEvent)
    const unsubscribeAnalysisTriggered = eventBus.subscribe(EVENT_TYPES.ANALYSIS_TRIGGERED, handleAnalysisEvent)
    const unsubscribeAnalysisCleared = eventBus.subscribe(EVENT_TYPES.ANALYSIS_CLEARED, handleAnalysisEvent)

    return () => {
      console.log('🔧 MCPModal: Cleaning up internal pub/sub event subscriptions')
      unsubscribeSessionUpdated()
      unsubscribeSessionSwitched()
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
      unsubscribeAnalysisSaved()
      unsubscribeAnalysisTriggered()
      unsubscribeAnalysisCleared()
    }
  }, [
    sessionId, 
    isOpen, 
    fetchSessionData,
    handleSessionUpdated,
    handleMessageEvent,
    handleParticipantEvent,
    handleConversationEvent,
    handleAnalysisEvent
  ])

  // Load analysis when switching to analysis tab
  useEffect(() => {
    if (currentSession && mcp.isConnected && activeTab === 'analysis' && !analysisData) {
      loadAnalysis()
    }
  }, [currentSession, mcp.isConnected, activeTab])

  const loadAnalysis = async () => {
    if (!currentSession) return
    
    try {
      setIsAnalyzing(true)
      const analysis = await sessionMCP.analyzeConversation('full')
      setAnalysisData(analysis)
    } catch (error) {
      console.error('Failed to load analysis:', error)
    } finally {
      setIsAnalyzing(false)
    }
  }

  const handleResourceClick = async (resourceUri: string) => {
    if (selectedResource === resourceUri) {
      setSelectedResource(null)
      setResourceContent(null)
      return
    }

    try {
      setIsLoadingResource(true)
      setSelectedResource(resourceUri)
      const content = await mcp.readResource(resourceUri)
      setResourceContent(content)
    } catch (error) {
      console.error('Failed to load resource:', error)
      setResourceContent({ error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setIsLoadingResource(false)
    }
  }

  const handleToolExecution = async () => {
    if (!selectedTool) return

    try {
      setIsExecutingTool(true)
      let args = {}
      
      if (toolArgs.trim()) {
        try {
          args = JSON.parse(toolArgs)
        } catch (error) {
          throw new Error('Invalid JSON in tool arguments')
        }
      }

      // This will trigger automatic refresh via internal pub/sub event system
      const result = await mcp.callTool(selectedTool, args)
      setToolResult(result)
    } catch (error) {
      console.error('Failed to execute tool:', error)
      setToolResult({ error: error instanceof Error ? error.message : 'Unknown error' })
    } finally {
      setIsExecutingTool(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
  }

  const getConnectionStatusIcon = () => {
    switch (mcp.connectionStatus) {
      case 'connected':
        return <CheckCircle2 className="h-4 w-4 text-green-600" />
      case 'connecting':
        return <Loader2 className="h-4 w-4 text-blue-600 animate-spin" />
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const getConnectionStatusColor = () => {
    switch (mcp.connectionStatus) {
      case 'connected': return 'text-green-600 bg-green-50 border-green-200'
      case 'connecting': return 'text-blue-600 bg-blue-50 border-blue-200'
      case 'error': return 'text-red-600 bg-red-50 border-red-200'
      default: return 'text-gray-600 bg-gray-50 border-gray-200'
    }
  }

  const getResourceIcon = (uri: string) => {
    if (uri.includes('/messages')) return <MessageSquare className="h-4 w-4" />
    if (uri.includes('/participants')) return <Users className="h-4 w-4" />
    if (uri.includes('/analysis')) return <BarChart3 className="h-4 w-4" />
    if (uri.includes('/session/')) return <Brain className="h-4 w-4" />
    if (uri.includes('templates')) return <Sparkles className="h-4 w-4" />
    if (uri.includes('stats')) return <Activity className="h-4 w-4" />
    return <Database className="h-4 w-4" />
  }

  const tabs = [
    { id: 'overview', label: 'Overview', icon: Monitor },
    { id: 'resources', label: 'Resources', icon: Database },
    { id: 'tools', label: 'Tools', icon: Terminal },
    { id: 'prompts', label: 'Prompts', icon: BookOpen },
    { id: 'analysis', label: 'Analysis', icon: BarChart3 },
    { id: 'control', label: 'Control', icon: Settings }
  ]

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-blue-600 rounded-xl flex items-center justify-center">
              <Zap className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                MCP Integration Center
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Model Context Protocol management and tools
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {mcp.isConnected ? (
                <Wifi className="h-4 w-4 text-green-600" />
              ) : (
                <WifiOff className="h-4 w-4 text-red-600" />
              )}
              <Badge className={`text-xs ${getConnectionStatusColor()}`}>
                {mcp.connectionStatus}
              </Badge>
            </div>
            <Button variant="ghost" size="sm" onClick={onClose}>
              <X className="h-5 w-5" />
            </Button>
          </div>
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
                  {tab.id === 'resources' && mcp.resources.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {mcp.resources.length}
                    </Badge>
                  )}
                  {tab.id === 'tools' && mcp.tools.length > 0 && (
                    <Badge variant="secondary" className="ml-1 text-xs">
                      {mcp.tools.length}
                    </Badge>
                  )}
                </button>
              )
            })}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-y-auto p-6">
            {/* Overview Tab */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-blue-900 dark:text-blue-100 flex items-center gap-2">
                        <Server className="h-5 w-5" />
                        Connection
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-blue-700 dark:text-blue-300">Status:</span>
                          <div className="flex items-center gap-2">
                            {getConnectionStatusIcon()}
                            <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                              {mcp.connectionStatus}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-blue-700 dark:text-blue-300">Initialized:</span>
                          <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                            {mcp.isInitialized ? 'Yes' : 'No'}
                          </span>
                        </div>
                        {!mcp.isConnected && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={mcp.reconnect}
                            className="w-full mt-3"
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Reconnect
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-green-900 dark:text-green-100 flex items-center gap-2">
                        <Database className="h-5 w-5" />
                        Resources
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="text-3xl font-bold text-green-900 dark:text-green-100">
                          {mcp.resources.length}
                        </div>
                        <div className="text-sm text-green-700 dark:text-green-300">
                          Available data sources and session information
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={mcp.refreshResources}
                          disabled={!mcp.isConnected}
                          className="w-full"
                        >
                          <RefreshCw className="h-4 w-4 mr-2" />
                          Refresh
                        </Button>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-700">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-lg text-purple-900 dark:text-purple-100 flex items-center gap-2">
                        <Terminal className="h-5 w-5" />
                        Tools
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div className="text-3xl font-bold text-purple-900 dark:text-purple-100">
                          {mcp.tools.length}
                        </div>
                        <div className="text-sm text-purple-700 dark:text-purple-300">
                          Available MCP tools and functions
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={mcp.listTools}
                          disabled={!mcp.isConnected}
                          className="w-full"
                        >
                          <Cpu className="h-4 w-4 mr-2" />
                          List Tools
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Quick Actions */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Zap className="h-5 w-5" />
                      Quick Actions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                      {currentSession && (
                        <>
                          <Button
                            variant="outline"
                            onClick={() => sessionMCP.startConversation()}
                            disabled={!mcp.isConnected}
                            className="flex flex-col h-auto p-4 text-center"
                          >
                            <Play className="h-6 w-6 mb-2" />
                            <span className="text-sm">Start Conversation</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => loadAnalysis()}
                            disabled={!mcp.isConnected || isAnalyzing}
                            className="flex flex-col h-auto p-4 text-center"
                          >
                            {isAnalyzing ? (
                              <Loader2 className="h-6 w-6 mb-2 animate-spin" />
                            ) : (
                              <BarChart3 className="h-6 w-6 mb-2" />
                            )}
                            <span className="text-sm">Analyze Session</span>
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => sessionMCP.exportSession('json')}
                            disabled={!mcp.isConnected}
                            className="flex flex-col h-auto p-4 text-center"
                          >
                            <Download className="h-6 w-6 mb-2" />
                            <span className="text-sm">Export Data</span>
                          </Button>
                        </>
                      )}
                      <Button
                        variant="outline"
                        onClick={() => setActiveTab('resources')}
                        className="flex flex-col h-auto p-4 text-center"
                      >
                        <Database className="h-6 w-6 mb-2" />
                        <span className="text-sm">Browse Resources</span>
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Error Display */}
                {mcp.error && (
                  <Card className="border-red-200 dark:border-red-700 bg-red-50 dark:bg-red-900/20">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
                        <div>
                          <h4 className="font-medium text-red-900 dark:text-red-100 mb-1">
                            MCP Error
                          </h4>
                          <p className="text-sm text-red-800 dark:text-red-200">
                            {mcp.error}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Resources Tab */}
            {activeTab === 'resources' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    MCP Resources ({mcp.resources.length})
                  </h3>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={mcp.refreshResources}
                    disabled={!mcp.isConnected}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
                
                <div className="grid gap-3">
                  {mcp.resources.map((resource) => (
                    <Card key={resource.uri} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <button
                          onClick={() => handleResourceClick(resource.uri)}
                          className="w-full text-left"
                        >
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              {getResourceIcon(resource.uri)}
                              <div>
                                <div className="font-medium text-gray-900 dark:text-gray-100">
                                  {resource.name}
                                </div>
                                <div className="text-sm text-gray-500 dark:text-gray-400">
                                  {resource.uri}
                                </div>
                                {resource.description && (
                                  <div className="text-xs text-gray-600 dark:text-gray-300 mt-1">
                                    {resource.description}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {selectedResource === resource.uri && isLoadingResource && (
                                <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                              )}
                              {selectedResource === resource.uri ? (
                                <EyeOff className="h-4 w-4 text-gray-400" />
                              ) : (
                                <Eye className="h-4 w-4 text-gray-400" />
                              )}
                            </div>
                          </div>
                        </button>
                        
                        {/* Resource Content */}
                        {selectedResource === resource.uri && resourceContent && (
                          <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
                                Content Preview
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(JSON.stringify(resourceContent, null, 2))}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                            <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded border overflow-x-auto max-h-40">
                              {JSON.stringify(resourceContent, null, 2)}
                            </pre>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Tools Tab */}
            {activeTab === 'tools' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  MCP Tools ({mcp.tools.length})
                </h3>
                
                <div className="grid gap-4">
                  {mcp.tools.map((tool) => (
                    <Card key={tool.name} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                              {tool.name}
                            </h4>
                            {tool.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {tool.description}
                              </p>
                            )}
                          </div>
                          <Badge variant="outline" className="text-xs">
                            Tool
                          </Badge>
                        </div>
                        
                        {selectedTool === tool.name && (
                          <div className="space-y-3 pt-3 border-t border-gray-200 dark:border-gray-700">
                            <div>
                              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                Arguments (JSON)
                              </label>
                              <textarea
                                value={toolArgs}
                                onChange={(e) => setToolArgs(e.target.value)}
                                placeholder='{"key": "value"}'
                                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                                rows={3}
                              />
                            </div>
                            
                            <div className="flex gap-2">
                              <Button
                                onClick={handleToolExecution}
                                disabled={!mcp.isConnected || isExecutingTool}
                                size="sm"
                              >
                                {isExecutingTool ? (
                                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                  <Play className="h-4 w-4 mr-2" />
                                )}
                                Execute
                              </Button>
                              <Button
                                variant="outline"
                                onClick={() => {
                                  setSelectedTool(null)
                                  setToolArgs('')
                                  setToolResult(null)
                                }}
                                size="sm"
                              >
                                Cancel
                              </Button>
                            </div>
                            
                            {toolResult && (
                              <div className="mt-3">
                                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                  Result
                                </label>
                                <pre className="text-xs bg-gray-100 dark:bg-gray-800 p-3 rounded border overflow-x-auto max-h-40">
                                  {JSON.stringify(toolResult, null, 2)}
                                </pre>
                              </div>
                            )}
                          </div>
                        )}
                        
                        {selectedTool !== tool.name && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setSelectedTool(tool.name)
                              setToolArgs('')
                              setToolResult(null)
                            }}
                            disabled={!mcp.isConnected}
                          >
                            <Terminal className="h-4 w-4 mr-2" />
                            Configure & Execute
                          </Button>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Prompts Tab */}
            {activeTab === 'prompts' && (
              <div className="space-y-4">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  MCP Prompts ({mcp.prompts.length})
                </h3>
                
                <div className="grid gap-3">
                  {mcp.prompts.map((prompt) => (
                    <Card key={prompt.name} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <h4 className="font-medium text-gray-900 dark:text-gray-100">
                              {prompt.name}
                            </h4>
                            {prompt.description && (
                              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                                {prompt.description}
                              </p>
                            )}
                            {prompt.arguments && prompt.arguments.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Arguments:</p>
                                <div className="flex flex-wrap gap-1">
                                  {prompt.arguments.map((arg: PromptArgument, index: number) => (
                                    <Badge key={index} variant="secondary" className="text-xs">
                                      {arg.name}
                                      {arg.required && '*'}
                                    </Badge>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-xs">
                              Prompt
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => mcp.getPrompt(prompt.name)}
                              disabled={!mcp.isConnected}
                            >
                              <BookOpen className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Analysis Tab */}
            {activeTab === 'analysis' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                    Session Analysis via MCP
                  </h3>
                  <Button
                    variant="outline"
                    onClick={loadAnalysis}
                    disabled={!currentSession || !mcp.isConnected || isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <RefreshCw className="h-4 w-4 mr-2" />
                    )}
                    Analyze
                  </Button>
                </div>

                {!currentSession ? (
                  <Card>
                    <CardContent className="text-center py-12">
                      <Brain className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-500 dark:text-gray-400">
                        {isLoadingSession ? 'Loading session...' : 'No active session to analyze'}
                      </p>
                    </CardContent>
                  </Card>
                ) : isAnalyzing ? (
                  <Card>
                    <CardContent className="text-center py-12">
                      <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-blue-600" />
                      <p className="text-gray-600 dark:text-gray-400">
                        Analyzing conversation via MCP...
                      </p>
                    </CardContent>
                  </Card>
                ) : analysisData ? (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700">
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                            {analysisData.messageCount || 0}
                          </div>
                          <div className="text-sm text-blue-700 dark:text-blue-300">Messages</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700">
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-green-900 dark:text-green-100">
                            {analysisData.participantCount || 0}
                          </div>
                          <div className="text-sm text-green-700 dark:text-green-300">Participants</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-700">
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-purple-900 dark:text-purple-100">
                            {analysisData.averageMessageLength || 0}
                          </div>
                          <div className="text-sm text-purple-700 dark:text-purple-300">Avg Length</div>
                        </CardContent>
                      </Card>
                      <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700">
                        <CardContent className="p-4 text-center">
                          <div className="text-2xl font-bold text-orange-900 dark:text-orange-100">
                            {Math.round((analysisData.conversationDuration || 0) / 60000)}
                          </div>
                          <div className="text-sm text-orange-700 dark:text-orange-300">Minutes</div>
                        </CardContent>
                      </Card>
                    </div>

                    {analysisData.topWords && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Top Discussion Topics</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {analysisData.topWords.slice(0, 15).map((item: any, index: number) => (
                              <Badge key={index} variant="outline" className="text-sm">
                                {item.word} ({item.count})
                              </Badge>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {analysisData.messagesByParticipant && (
                      <Card>
                        <CardHeader>
                          <CardTitle>Message Distribution</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-3">
                            {Object.entries(analysisData.messagesByParticipant).map(([participantId, count]) => {
                              const participant = currentSession.participants.find(p => p.id === participantId)
                              const percentage = ((count as number) / analysisData.messageCount * 100).toFixed(1)
                              return (
                                <div key={participantId} className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg flex items-center justify-center text-white text-sm font-bold">
                                      {participant?.name?.[0] || '?'}
                                    </div>
                                    <span className="font-medium text-gray-900 dark:text-gray-100">
                                      {participant?.name || participantId}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <div className="text-sm text-gray-500 dark:text-gray-400">
                                      {percentage}%
                                    </div>
                                    <Badge variant="secondary">
                                      {count as number} messages
                                    </Badge>
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="text-center py-12">
                      <BarChart3 className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                      <p className="text-gray-500 dark:text-gray-400 mb-4">
                        Click "Analyze" to generate insights via MCP
                      </p>
                      <Button onClick={loadAnalysis} disabled={!mcp.isConnected}>
                        <BarChart3 className="h-4 w-4 mr-2" />
                        Start Analysis
                      </Button>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}

            {/* Control Tab */}
            {activeTab === 'control' && (
              <div className="space-y-6">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                  MCP Control Center
                </h3>

                {currentSession && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <Settings className="h-5 w-5" />
                        Session Controls
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <Button
                          variant="outline"
                          onClick={() => sessionMCP.startConversation()}
                          disabled={!mcp.isConnected}
                          className="flex flex-col h-auto p-4"
                        >
                          <Play className="h-6 w-6 mb-2" />
                          <span className="text-sm">Start</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => sessionMCP.pauseConversation()}
                          disabled={!mcp.isConnected}
                          className="flex flex-col h-auto p-4"
                        >
                          <Pause className="h-6 w-6 mb-2" />
                          <span className="text-sm">Pause</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => sessionMCP.resumeConversation()}
                          disabled={!mcp.isConnected}
                          className="flex flex-col h-auto p-4"
                        >
                          <Play className="h-6 w-6 mb-2" />
                          <span className="text-sm">Resume</span>
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => sessionMCP.stopConversation()}
                          disabled={!mcp.isConnected}
                          className="flex flex-col h-auto p-4"
                        >
                          <Square className="h-6 w-6 mb-2" />
                          <span className="text-sm">Stop</span>
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )}

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Cpu className="h-5 w-5" />
                      System Operations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <Button
                        variant="outline"
                        onClick={mcp.refreshResources}
                        disabled={!mcp.isConnected}
                      >
                        <RefreshCw className="h-4 w-4 mr-2" />
                        Refresh Resources
                      </Button>
                      <Button
                        variant="outline"
                        onClick={mcp.listTools}
                        disabled={!mcp.isConnected}
                      >
                        <Terminal className="h-4 w-4 mr-2" />
                        Reload Tools
                      </Button>
                      <Button
                        variant="outline"
                        onClick={mcp.reconnect}
                        disabled={mcp.isConnected}
                      >
                        <Wifi className="h-4 w-4 mr-2" />
                        Reconnect MCP
                      </Button>
                      <Button
                        variant="outline"
                        onClick={mcp.disconnect}
                        disabled={!mcp.isConnected}
                      >
                        <WifiOff className="h-4 w-4 mr-2" />
                        Disconnect
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {mcp.lastUpdate && (
                  <Card className="bg-gray-50 dark:bg-gray-800/50">
                    <CardContent className="p-4">
                      <div className="text-sm text-gray-600 dark:text-gray-400">
                        Last MCP update: {mcp.lastUpdate.toLocaleString()}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-800/50">
          <div className="flex items-center justify-between text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span>MCP Protocol v2024-11-05</span>
              <span>•</span>
              <span>{mcp.resources.length} resources</span>
              <span>•</span>
              <span>{mcp.tools.length} tools</span>
            </div>
            <div className="flex items-center gap-2">
              {getConnectionStatusIcon()}
              <span className="capitalize">{mcp.connectionStatus}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}