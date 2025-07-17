// src/components/Export/ExportModal.tsx - Updated with Internal Pub/Sub Event System
'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { mcpAnalysisHandler } from '@/lib/mcp/analysis-handler'
import { ExportManager, ExportOptions } from '@/lib/utils/export'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { 
  X, Download, FileText, Database, Eye, EyeOff, Settings, 
  MessageSquare, Users, Clock, CheckCircle2, FileDown,
  Copy, Check, Brain, History, TrendingUp, Zap, AlertTriangle
} from 'lucide-react'
import type { ChatSession, APIError } from '@/types/chat'

interface ExportModalProps {
  isOpen: boolean
  onClose: () => void
  sessionId?: string // Now passed as prop since we don't have global store
}

export function ExportModal({ isOpen, onClose, sessionId }: ExportModalProps) {
  const mcpClient = useRef(MCPClient.getInstance())
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null)
  const [sessionErrors, setSessionErrors] = useState<APIError[]>([])
  const [errorStats, setErrorStats] = useState<any>({})
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'json',
    includeMetadata: true,
    includeParticipantInfo: true,
    includeSystemPrompts: false,
    includeAnalysisHistory: true,
    includeErrors: true
  })
  const [showPreview, setShowPreview] = useState(false)
  const [previewContent, setPreviewContent] = useState('')
  const [isExporting, setIsExporting] = useState(false)
  const [copied, setCopied] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  
  // MCP-powered analysis tracking
  const [analysisCount, setAnalysisCount] = useState(0)
  const [analysisTimeline, setAnalysisTimeline] = useState<any[]>([])
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // EVENT-DRIVEN: Fetch session data from MCP
  const fetchSessionData = useCallback(async () => {
    if (!sessionId) return

    try {
      // Get current session via MCP
      const sessionResult = await mcpClient.current.callTool('get_session', { sessionId })
      if (sessionResult.success && sessionResult.session) {
        setCurrentSession(sessionResult.session)
      }

      // Get session errors via MCP
      const errorsResult = await mcpClient.current.getAPIErrors(sessionId)
      if (errorsResult.success) {
        setSessionErrors(errorsResult.errors || [])
      }

      // Get all errors for stats
      const allErrorsResult = await mcpClient.current.getAPIErrors()
      if (allErrorsResult.success) {
        // Calculate error stats
        const stats = (allErrorsResult.errors || []).reduce((acc: any, error: APIError) => {
          acc[error.provider] = (acc[error.provider] || 0) + 1
          return acc
        }, {})
        setErrorStats(stats)
      }

      setIsLoading(false)
    } catch (error) {
      console.error('Failed to fetch session data:', error)
      setIsLoading(false)
    }
  }, [sessionId])

  // EVENT-DRIVEN: Fetch analysis data
  const loadAnalysisData = useCallback(async () => {
    if (!sessionId || !isOpen) return

    try {
      const snapshots = mcpAnalysisHandler.getAnalysisHistory(sessionId)
      const timeline = mcpAnalysisHandler.getAnalysisTimeline(sessionId)
      
      setAnalysisCount(snapshots.length)
      setAnalysisTimeline(timeline)
      setLastUpdate(new Date())
      
      console.log(`📊 ExportModal: Loaded ${snapshots.length} analysis snapshots and ${timeline.length} timeline entries`)
    } catch (error) {
      console.error('Failed to load analysis data:', error)
    }
  }, [sessionId, isOpen])

  // EVENT-DRIVEN: Handle session updates
  const handleSessionUpdated = useCallback(async (payload: any) => {
    console.log('📊 ExportModal: Session updated event received:', payload.data)
    
    // If this is our session, refresh the data
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // EVENT-DRIVEN: Handle message events
  const handleMessageEvent = useCallback(async (payload: any) => {
    console.log('📊 ExportModal: Message event received:', payload.data)
    
    // If this affects our session, refresh the data
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // EVENT-DRIVEN: Handle participant events
  const handleParticipantEvent = useCallback(async (payload: any) => {
    console.log('📊 ExportModal: Participant event received:', payload.data)
    
    // If this affects our session, refresh the data
    if (payload.data.sessionId === sessionId) {
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // EVENT-DRIVEN: Handle analysis events
  const handleAnalysisEvent = useCallback(async (payload: any) => {
    console.log('📊 ExportModal: Analysis event received:', payload.data)
    
    // If this affects our session, refresh analysis data
    if (payload.data.sessionId === sessionId) {
      await loadAnalysisData()
    }
  }, [sessionId, loadAnalysisData])

  // EVENT-DRIVEN: Handle error events
  const handleErrorEvent = useCallback(async (payload: any) => {
    console.log('📊 ExportModal: Error event received:', payload.data)
    
    // Refresh session data to get updated error info
    await fetchSessionData()
  }, [fetchSessionData])

  // EVENT-DRIVEN: Subscribe to relevant events via internal pub/sub
  useEffect(() => {
    if (!isOpen || !sessionId) return

    console.log(`📊 ExportModal: Setting up internal pub/sub event subscriptions for session ${sessionId}`)

    // Initial data fetch
    fetchSessionData()
    loadAnalysisData()

    // Session events
    const unsubscribeSessionUpdated = eventBus.subscribe(EVENT_TYPES.SESSION_UPDATED, handleSessionUpdated)
    
    // Message events
    const unsubscribeMessageSent = eventBus.subscribe(EVENT_TYPES.MESSAGE_SENT, handleMessageEvent)
    const unsubscribeMessageUpdated = eventBus.subscribe(EVENT_TYPES.MESSAGE_UPDATED, handleMessageEvent)
    const unsubscribeMessageDeleted = eventBus.subscribe(EVENT_TYPES.MESSAGE_DELETED, handleMessageEvent)
    
    // Participant events
    const unsubscribeParticipantAdded = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_ADDED, handleParticipantEvent)
    const unsubscribeParticipantRemoved = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_REMOVED, handleParticipantEvent)
    const unsubscribeParticipantUpdated = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_UPDATED, handleParticipantEvent)
    
    // Analysis events
    const unsubscribeAnalysisSaved = eventBus.subscribe(EVENT_TYPES.ANALYSIS_SAVED, handleAnalysisEvent)
    const unsubscribeAnalysisTriggered = eventBus.subscribe(EVENT_TYPES.ANALYSIS_TRIGGERED, handleAnalysisEvent)
    const unsubscribeAnalysisCleared = eventBus.subscribe(EVENT_TYPES.ANALYSIS_CLEARED, handleAnalysisEvent)
    
    // Error events
    const unsubscribeApiErrorLogged = eventBus.subscribe(EVENT_TYPES.API_ERROR_LOGGED, handleErrorEvent)
    const unsubscribeApiErrorsCleared = eventBus.subscribe(EVENT_TYPES.API_ERRORS_CLEARED, handleErrorEvent)

    // Subscribe to MCP analysis events for real-time updates
    const unsubscribeSaved = mcpAnalysisHandler.subscribe('analysis_snapshot_saved', (data) => {
      if (data.sessionId === sessionId) {
        console.log(`📊 ExportModal: Analysis snapshot saved event received. New count: ${data.totalSnapshots}`)
        loadAnalysisData()
      }
    })

    const unsubscribeUpdated = mcpAnalysisHandler.subscribe('analysis_history_updated', (data) => {
      if (data.sessionId === sessionId) {
        console.log(`📊 ExportModal: Analysis history updated event received. New count: ${data.count}`)
        loadAnalysisData()
      }
    })

    const unsubscribeCleared = mcpAnalysisHandler.subscribe('analysis_history_cleared', (data) => {
      if (data.sessionId === sessionId) {
        console.log(`📊 ExportModal: Analysis history cleared event received`)
        setAnalysisCount(0)
        setAnalysisTimeline([])
        setLastUpdate(new Date())
      }
    })

    return () => {
      console.log(`📊 ExportModal: Cleaning up internal pub/sub event subscriptions`)
      
      // Unsubscribe from internal pub/sub events
      unsubscribeSessionUpdated()
      unsubscribeMessageSent()
      unsubscribeMessageUpdated()
      unsubscribeMessageDeleted()
      unsubscribeParticipantAdded()
      unsubscribeParticipantRemoved()
      unsubscribeParticipantUpdated()
      unsubscribeAnalysisSaved()
      unsubscribeAnalysisTriggered()
      unsubscribeAnalysisCleared()
      unsubscribeApiErrorLogged()
      unsubscribeApiErrorsCleared()
      
      // Unsubscribe from MCP analysis events
      unsubscribeSaved()
      unsubscribeUpdated()
      unsubscribeCleared()
    }
  }, [
    sessionId, 
    isOpen, 
    fetchSessionData, 
    loadAnalysisData,
    handleSessionUpdated,
    handleMessageEvent,
    handleParticipantEvent,
    handleAnalysisEvent,
    handleErrorEvent
  ])

  // Create enhanced session object with MCP analysis data and errors for export
  const enhancedSession = useMemo(() => {
    if (!currentSession) return null

    // Get fresh analysis data from MCP
    const mcpAnalysisSnapshots = mcpAnalysisHandler.getAnalysisHistory(sessionId!)
    
    console.log(`📊 ExportModal: Creating enhanced session with ${mcpAnalysisSnapshots.length} MCP analysis snapshots and ${sessionErrors.length} errors`)

    return {
      ...currentSession,
      analysisHistory: mcpAnalysisSnapshots, // Override with MCP data
      errors: sessionErrors, // Add errors for export
      metadata: {
        ...currentSession.metadata,
        mcpAnalysisCount: mcpAnalysisSnapshots.length,
        errorCount: sessionErrors.length,
        lastMCPUpdate: lastUpdate,
        exportEnhanced: true
      }
    }
  }, [currentSession, analysisCount, lastUpdate, sessionErrors, sessionId])

  // Generate analysis timeline with MCP data
  const mcpAnalysisTimeline = useMemo(() => {
    if (!currentSession || analysisTimeline.length === 0) {
      console.log('📊 ExportModal: No MCP timeline data available')
      return []
    }
    
    console.log(`📊 ExportModal: Generated MCP timeline with ${analysisTimeline.length} entries`)
    return analysisTimeline
  }, [currentSession, analysisTimeline])

  // Debug effect to track changes
  useEffect(() => {
    if (isOpen && currentSession) {
      console.log(`📊 ExportModal MCP Debug:`)
      console.log(`   - Session ID: ${currentSession.id}`)
      console.log(`   - MCP Analysis Count: ${analysisCount}`)
      console.log(`   - MCP Timeline Entries: ${analysisTimeline.length}`)
      console.log(`   - Session Errors: ${sessionErrors.length}`)
      console.log(`   - Last Update: ${lastUpdate}`)
      console.log(`   - Enhanced Session Analysis Count: ${enhancedSession?.analysisHistory?.length || 0}`)
    }
  }, [isOpen, currentSession, analysisCount, analysisTimeline.length, sessionErrors.length, lastUpdate, enhancedSession])

  // Update preview when options change - with MCP data, errors, and full content
  useEffect(() => {
    if (enhancedSession && showPreview) {
      try {
        console.log(`📊 ExportModal: Generating preview with ${enhancedSession.analysisHistory?.length || 0} MCP analysis snapshots and ${sessionErrors.length} errors`)
        
        // Get analysis history for export
        const analysisHistory = exportOptions.includeAnalysisHistory ? enhancedSession.analysisHistory : undefined
        
        // Get errors for export
        const errors = exportOptions.includeErrors ? sessionErrors : undefined
        
        // Generate preview content
        const preview = ExportManager.generatePreview(
          enhancedSession,
          exportOptions,
          analysisHistory,
          errors
        )
        setPreviewContent(preview)
      } catch (error) {
        setPreviewContent('Error generating preview')
        console.error('Export preview error:', error)
      }
    }
  }, [enhancedSession, exportOptions, showPreview, sessionErrors])

  const handleExport = async () => {
    if (!enhancedSession) return

    try {
      setIsExporting(true)
      
      // Small delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500))
      
      console.log(`📊 ExportModal: Exporting session with ${enhancedSession.analysisHistory?.length || 0} MCP analysis snapshots and ${sessionErrors.length} errors`)
      
      // Get analysis history for export
      const analysisHistory = exportOptions.includeAnalysisHistory ? enhancedSession.analysisHistory : undefined
      
      // Get errors for export
      const errors = exportOptions.includeErrors ? sessionErrors : undefined
      
      // Export with all data - this now returns the export data
      ExportManager.exportSession(
        enhancedSession,
        exportOptions,
        analysisHistory,
        errors
      )
      
      // Show success feedback
      setTimeout(() => {
        onClose()
      }, 1000)
      
    } catch (error) {
      console.error('Export error:', error)
      alert('Failed to export conversation. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportAnalysisOnly = async () => {
    if (!enhancedSession) return

    try {
      setIsExporting(true)
      await new Promise(resolve => setTimeout(resolve, 300))
      
      if (analysisCount === 0) {
        alert('No analysis snapshots to export. Please generate some analysis first.')
        setIsExporting(false)
        return
      }
      
      console.log(`📊 ExportModal: Exporting ${analysisCount} MCP analysis snapshots only`)
      
      // Export analysis timeline only
      ExportManager.exportAnalysisTimeline(enhancedSession, enhancedSession.analysisHistory)
      
      setTimeout(() => {
        onClose()
      }, 1000)
      
    } catch (error) {
      console.error('Analysis export error:', error)
      alert('Failed to export analysis timeline. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleCopyPreview = async () => {
    if (!previewContent) return
    
    try {
      await navigator.clipboard.writeText(previewContent)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy:', error)
    }
  }

  const updateOption = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
    setExportOptions(prev => ({ ...prev, [key]: value }))
  }

  if (!isOpen || !sessionId) return null

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="animate-spin h-8 w-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto" />
          <p className="text-gray-600 dark:text-gray-400 mt-4">Loading session data...</p>
        </div>
      </div>
    )
  }

  if (!currentSession) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <p className="text-red-600 dark:text-red-400">Failed to load session data</p>
          <Button className="mt-4" onClick={onClose}>Close</Button>
        </div>
      </div>
    )
  }

  const estimatedFileSize = currentSession.messages.reduce((size, msg) => 
    size + msg.content.length + msg.participantName.length + 100, 0
  )
  const fileSizeKB = Math.round(estimatedFileSize / 1024)

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-5xl h-[85vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center">
              <FileDown className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Export Research Data
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Download conversation, analysis, and error logs
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content - Now flex-1 with proper overflow handling */}
        <div className="flex flex-1 min-h-0">
          {/* Options Panel */}
          <div className="w-1/2 p-6 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <div className="space-y-6">
              {/* Session Info */}
              <Card className="bg-gray-50 dark:bg-gray-700/50">
                <CardContent className="p-4">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                    Session Overview
                  </h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Name:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100 truncate ml-2">
                        {currentSession.name}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Messages:</span>
                      <div className="flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-blue-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {currentSession.messages.length}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Participants:</span>
                      <div className="flex items-center gap-2">
                        <Users className="h-4 w-4 text-purple-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {currentSession.participants.length}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">MCP Analysis:</span>
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-indigo-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {analysisCount}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">API Errors:</span>
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-orange-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {sessionErrors.length}
                        </span>
                        {sessionErrors.length > 0 && (
                          <Badge variant="secondary" className="text-xs">
                            {Object.entries(
                              sessionErrors.reduce((acc, error) => {
                                acc[error.provider] = (acc[error.provider] || 0) + 1
                                return acc
                              }, {} as Record<string, number>)
                            ).map(([provider, count]) => `${provider}: ${count}`).join(', ')}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Duration:</span>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-green-500" />
                        <span className="font-medium text-gray-900 dark:text-gray-100">
                          {Math.round((new Date(currentSession.updatedAt).getTime() - new Date(currentSession.createdAt).getTime()) / (1000 * 60))} min
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-gray-600 dark:text-gray-400">Est. Size:</span>
                      <span className="font-medium text-gray-900 dark:text-gray-100">
                        ~{fileSizeKB}KB
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Error Statistics */}
              {sessionErrors.length > 0 && (
                <Card className="bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700">
                  <CardContent className="p-4">
                    <h3 className="font-medium text-orange-900 dark:text-orange-100 mb-3 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      API Error Summary ({sessionErrors.length})
                    </h3>
                    <div className="space-y-2">
                      {Object.entries(
                        sessionErrors.reduce((acc, error) => {
                          acc[error.provider] = (acc[error.provider] || 0) + 1
                          return acc
                        }, {} as Record<string, number>)
                      ).map(([provider, count]) => (
                        <div key={provider} className="text-xs bg-white/50 dark:bg-black/20 p-2 rounded">
                          <div className="flex items-center justify-between">
                            <span className="font-medium text-orange-800 dark:text-orange-200 capitalize">
                              {provider} API
                            </span>
                            <span className="text-orange-600 dark:text-orange-400">
                              {count} error{count !== 1 ? 's' : ''}
                            </span>
                          </div>
                        </div>
                      ))}
                      {sessionErrors.length > 0 && (
                        <div className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                          Most recent: {new Date(sessionErrors[sessionErrors.length - 1].timestamp).toLocaleString()}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* MCP Analysis Timeline Preview */}
              <Card className={`${analysisCount > 0 ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-700' : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'}`}>
                <CardContent className="p-4">
                  <h3 className={`font-medium mb-3 flex items-center gap-2 ${analysisCount > 0 ? 'text-indigo-900 dark:text-indigo-100' : 'text-yellow-900 dark:text-yellow-100'}`}>
                    <Zap className="h-4 w-4" />
                    MCP Analysis Timeline ({analysisCount})
                    {lastUpdate && (
                      <span className="text-xs text-gray-500 ml-auto">
                        Updated {lastUpdate.toLocaleTimeString()}
                      </span>
                    )}
                  </h3>
                  {analysisCount > 0 ? (
                    <div className="space-y-2">
                      {mcpAnalysisTimeline.slice(0, 3).map((entry: any, index: number) => (
                        <div key={index} className="text-xs bg-white/50 dark:bg-black/20 p-2 rounded">
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-indigo-800 dark:text-indigo-200">
                              {String(entry.provider || 'UNKNOWN').toUpperCase()} Analysis
                            </span>
                            <span className="text-indigo-600 dark:text-indigo-400">
                              {Number(entry.messageCount || 0)} msgs
                            </span>
                          </div>
                          <p className="text-indigo-700 dark:text-indigo-300 truncate">
                            {String(entry.keyInsight || 'Analysis snapshot')}
                          </p>
                          <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                            {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : 'Unknown time'}
                          </div>
                        </div>
                      ))}
                      {mcpAnalysisTimeline.length > 3 && (
                        <p className="text-xs text-indigo-600 dark:text-indigo-400 text-center">
                          +{mcpAnalysisTimeline.length - 3} more snapshots
                        </p>
                      )}
                      <div className="mt-2 p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded">
                        <div className="flex items-center gap-2 text-xs text-green-800 dark:text-green-200">
                          <Zap className="h-3 w-3" />
                          <span>Real-time data via MCP protocol</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-4">
                      <Brain className="h-8 w-8 mx-auto mb-2 text-yellow-600 dark:text-yellow-400" />
                      <p className="text-sm text-yellow-800 dark:text-yellow-200 mb-1">
                        No MCP analysis snapshots yet
                      </p>
                      <p className="text-xs text-yellow-700 dark:text-yellow-300">
                        Use the AI Analysis panel to generate insights
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Format Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Export Format
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => updateOption('format', 'json')}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      exportOptions.format === 'json'
                        ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">JSON</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Structured data with analysis & errors
                        </p>
                      </div>
                    </div>
                  </button>
                  <button
                    onClick={() => updateOption('format', 'csv')}
                    className={`p-4 rounded-xl border-2 transition-all text-left ${
                      exportOptions.format === 'csv'
                        ? 'border-green-500 bg-green-50 dark:bg-green-900/20'
                        : 'border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="h-6 w-6 text-green-600 dark:text-green-400" />
                      <div>
                        <p className="font-medium text-gray-900 dark:text-gray-100">CSV</p>
                        <p className="text-xs text-gray-600 dark:text-gray-400">
                          Timeline with analysis & errors
                        </p>
                      </div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Export Options */}
              <div>
                <label className="block text-sm font-medium text-gray-900 dark:text-gray-100 mb-3">
                  Export Options
                </label>
                <div className="space-y-3">
                  <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeMetadata}
                      onChange={(e) => updateOption('includeMetadata', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Include Message Metadata
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Temperature, tokens, response times, etc.
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeParticipantInfo}
                      onChange={(e) => updateOption('includeParticipantInfo', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Include Participant Details
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Full participant profiles and settings
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeSystemPrompts}
                      onChange={(e) => updateOption('includeSystemPrompts', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        Include System Prompts
                      </p>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        AI instruction prompts (sensitive data)
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeAnalysisHistory}
                      onChange={(e) => updateOption('includeAnalysisHistory', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        Include MCP Analysis History
                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                          <Zap className="h-3 w-3" />
                          {analysisCount} snapshots
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        Real-time AI analysis via MCP protocol
                      </p>
                    </div>
                  </label>

                  <label className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={exportOptions.includeErrors}
                      onChange={(e) => updateOption('includeErrors', e.target.checked)}
                      className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                        Include API Error Logs
                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {sessionErrors.length} errors
                        </Badge>
                      </div>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        API failures with retry attempts and timestamps
                      </p>
                    </div>
                  </label>
                </div>
              </div>
            </div>
          </div>

          {/* Preview Panel */}
          <div className="w-1/2 flex flex-col min-h-0">
            <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  Export Preview
                </h3>
                <div className="flex items-center gap-2">
                  {previewContent && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleCopyPreview}
                      disabled={!showPreview}
                    >
                      {copied ? (
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
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowPreview(!showPreview)}
                  >
                    {showPreview ? (
                      <>
                        <EyeOff className="h-4 w-4 mr-2" />
                        Hide
                      </>
                    ) : (
                      <>
                        <Eye className="h-4 w-4 mr-2" />
                        Preview
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              {showPreview ? (
                <div className="h-full p-6 overflow-y-auto">
                  <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-gray-900 dark:text-gray-100 font-mono leading-relaxed whitespace-pre-wrap">
                    {previewContent || 'Generating preview...'}
                  </pre>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-center p-6">
                  <div>
                    <div className="w-16 h-16 bg-gray-100 dark:bg-gray-700 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Eye className="h-8 w-8 text-gray-400" />
                    </div>
                    <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-2">
                      Preview Your Export
                    </h4>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                      Click "Preview" to see how your exported data will look
                    </p>
                    <div className="space-y-1 text-xs text-gray-500 mb-4">
                      {analysisCount > 0 && (
                        <div className="flex items-center justify-center gap-1">
                          <Zap className="h-3 w-3" />
                          <span>{analysisCount} MCP analysis snapshots will be included</span>
                        </div>
                      )}
                      {sessionErrors.length > 0 && exportOptions.includeErrors && (
                        <div className="flex items-center justify-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          <span>{sessionErrors.length} API errors will be included</span>
                        </div>
                      )}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPreview(true)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Show Preview
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer - Now flex-shrink-0 */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant={exportOptions.format === 'json' ? 'default' : 'secondary'}>
                {exportOptions.format.toUpperCase()}
              </Badge>
              <span className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-3">
                {currentSession.messages.length} messages • {currentSession.participants.length} participants
                {analysisCount > 0 && (
                  <span className="flex items-center gap-1">
                    <Zap className="h-3 w-3" />
                    {analysisCount} analyses
                  </span>
                )}
                {sessionErrors.length > 0 && exportOptions.includeErrors && (
                  <span className="flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    {sessionErrors.length} errors
                  </span>
                )}
              </span>
            </div>
            
            <div className="flex gap-3">
              {/* MCP Analysis-only export button */}
              {analysisCount > 0 && (
                <Button
                  variant="outline"
                  onClick={handleExportAnalysisOnly}
                  disabled={isExporting}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  MCP Analysis Only
                </Button>
              )}
              
              <Button variant="outline" onClick={onClose} disabled={isExporting}>
                Cancel
              </Button>
              <Button 
                onClick={handleExport}
                disabled={isExporting || currentSession.messages.length === 0}
                className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
              >
                {isExporting ? (
                  <>
                    <div className="animate-spin h-4 w-4 mr-2 border-2 border-white border-t-transparent rounded-full" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export & Download
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}