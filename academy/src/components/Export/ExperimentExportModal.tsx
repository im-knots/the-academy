// src/components/Export/ExperimentExportModal.tsx
'use client'

import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { ExportManager, ExportOptions } from '@/lib/utils/export'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Button } from '@/components/ui/Button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { 
  X, Download, FileText, Database, Eye, EyeOff, Settings, 
  MessageSquare, Users, Clock, CheckCircle2, FileDown,
  Copy, Check, Brain, History, TrendingUp, Zap, AlertTriangle,
  TestTubeDiagonal, Square, CheckSquare, BarChart3, Package,
  Loader2, AlertCircle, Calendar, FileArchive, ChevronDown, ChevronRight
} from 'lucide-react'
import type { ChatSession, APIError } from '@/types/chat'
import type { ExperimentConfig, ExperimentRun } from '@/types/experiment'

interface SessionWithAnalysis extends ChatSession {
  analysisHistory?: any[]
  errors?: APIError[]
  selected?: boolean
  loading?: boolean
  analysisCount?: number
  errorCount?: number
  fileSize?: number
}

interface ExperimentExportModalProps {
  isOpen: boolean
  onClose: () => void
  experiment: ExperimentConfig
  experimentRun?: ExperimentRun
  sessionIds: string[]
}

export function ExperimentExportModal({ 
  isOpen, 
  onClose, 
  experiment,
  experimentRun,
  sessionIds 
}: ExperimentExportModalProps) {
  const mcpClient = useRef(MCPClient.getInstance())
  const [sessions, setSessions] = useState<SessionWithAnalysis[]>([])
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set())
  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: 'json',
    includeMetadata: true,
    includeParticipantInfo: true,
    includeSystemPrompts: false,
    includeAnalysisHistory: true,
    includeErrors: true
  })
  const [isLoading, setIsLoading] = useState(true)
  const [isExporting, setIsExporting] = useState(false)
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null)
  const [showPreview, setShowPreview] = useState(false)
  const [previewSessionId, setPreviewSessionId] = useState<string | null>(null)
  const [previewContent, setPreviewContent] = useState('')
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  
  // Aggregate stats
  const [totalMessages, setTotalMessages] = useState(0)
  const [totalAnalysis, setTotalAnalysis] = useState(0)
  const [totalErrors, setTotalErrors] = useState(0)
  const [totalFileSize, setTotalFileSize] = useState(0)

  // Fetch all session data
  const fetchAllSessionData = useCallback(async () => {
    if (!sessionIds || sessionIds.length === 0) return

    setIsLoading(true)
    console.log(`📊 ExperimentExportModal: Fetching data for ${sessionIds.length} sessions`)

    try {
      const sessionPromises = sessionIds.map(async (sessionId) => {
        try {
          // Get session data
          const sessionResult = await mcpClient.current.callTool('get_session', { sessionId })
          if (!sessionResult.success || !sessionResult.session) {
            console.warn(`Failed to fetch session ${sessionId}`)
            return null
          }

          const session = sessionResult.session

          // Get analysis history
          let analysisHistory: any[] = []
          let analysisCount = 0
          try {
            const analysisResult = await mcpClient.current.getAnalysisHistoryViaMCP(sessionId)
            if (analysisResult.success && analysisResult.snapshots) {
              analysisHistory = analysisResult.snapshots
              analysisCount = analysisHistory.length
            }
          } catch (error) {
            console.warn(`Failed to fetch analysis for session ${sessionId}:`, error)
          }

          // Get errors
          let errors: APIError[] = []
          let errorCount = 0
          try {
            const errorsResult = await mcpClient.current.getAPIErrors(sessionId)
            if (errorsResult) {
              errors = errorsResult
              errorCount = errors.length
            }
          } catch (error) {
            console.warn(`Failed to fetch errors for session ${sessionId}:`, error)
          }

          // Calculate file size estimate
          const fileSize = session.messages.reduce((size: number, msg: any) => 
            size + msg.content.length + msg.participantName.length + 100, 0
          )

          return {
            ...session,
            analysisHistory,
            errors,
            analysisCount,
            errorCount,
            fileSize,
            selected: true // Default to selected
          } as SessionWithAnalysis
        } catch (error) {
          console.error(`Failed to fetch session ${sessionId}:`, error)
          return null
        }
      })

      const results = await Promise.all(sessionPromises)
      const validSessions = results.filter(s => s !== null) as SessionWithAnalysis[]
      
      setSessions(validSessions)
      setSelectedSessionIds(new Set(validSessions.map(s => s.id)))
      
      // Calculate totals
      const totals = validSessions.reduce((acc, session) => ({
        messages: acc.messages + (session.messages?.length || 0),
        analysis: acc.analysis + (session.analysisCount || 0),
        errors: acc.errors + (session.errorCount || 0),
        fileSize: acc.fileSize + (session.fileSize || 0)
      }), { messages: 0, analysis: 0, errors: 0, fileSize: 0 })

      setTotalMessages(totals.messages)
      setTotalAnalysis(totals.analysis)
      setTotalErrors(totals.errors)
      setTotalFileSize(totals.fileSize)

      console.log(`📊 ExperimentExportModal: Loaded ${validSessions.length} sessions`)
    } catch (error) {
      console.error('Failed to fetch session data:', error)
    } finally {
      setIsLoading(false)
    }
  }, [sessionIds])

  // Initial load
  useEffect(() => {
    if (isOpen && sessionIds.length > 0) {
      fetchAllSessionData()
    }
  }, [isOpen, sessionIds, fetchAllSessionData])

  // Toggle session selection
  const toggleSessionSelection = (sessionId: string) => {
    setSelectedSessionIds(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId)
      } else {
        newSet.add(sessionId)
      }
      return newSet
    })

    setSessions(prev => prev.map(s => 
      s.id === sessionId ? { ...s, selected: !s.selected } : s
    ))
  }

  // Toggle all sessions
  const toggleAllSessions = () => {
    if (selectedSessionIds.size === sessions.length) {
      setSelectedSessionIds(new Set())
      setSessions(prev => prev.map(s => ({ ...s, selected: false })))
    } else {
      setSelectedSessionIds(new Set(sessions.map(s => s.id)))
      setSessions(prev => prev.map(s => ({ ...s, selected: true })))
    }
  }

  // Toggle expanded session
  const toggleSessionExpanded = (sessionId: string) => {
    setExpandedSessions(prev => {
      const newSet = new Set(prev)
      if (newSet.has(sessionId)) {
        newSet.delete(sessionId)
      } else {
        newSet.add(sessionId)
      }
      return newSet
    })
  }

  // Update preview when session or options change
  useEffect(() => {
    if (showPreview && previewSessionId) {
      const session = sessions.find(s => s.id === previewSessionId)
      if (session) {
        try {
          const preview = ExportManager.generatePreview(
            session,
            exportOptions,
            exportOptions.includeAnalysisHistory ? session.analysisHistory : undefined,
            exportOptions.includeErrors ? session.errors : undefined
          )
          setPreviewContent(preview)
        } catch (error) {
          setPreviewContent('Error generating preview')
          console.error('Export preview error:', error)
        }
      }
    }
  }, [sessions, previewSessionId, exportOptions, showPreview])

  // Export selected sessions
  const handleExport = async () => {
    const selectedSessions = sessions.filter(s => selectedSessionIds.has(s.id))
    if (selectedSessions.length === 0) {
      alert('Please select at least one session to export')
      return
    }

    setIsExporting(true)
    console.log(`📊 ExperimentExportModal: Exporting ${selectedSessions.length} sessions`)

    try {
      // Export each session as a separate file
      for (const session of selectedSessions) {
        // Add experiment metadata to session
        const enhancedSession = {
          ...session,
          metadata: {
            ...session.metadata,
            experimentId: experiment.id,
            experimentName: experiment.name,
            experimentRunId: experimentRun?.id,
            exportedAt: new Date().toISOString()
          }
        }

        // Generate filename with experiment and session info
        const filename = `experiment-${experiment.name.replace(/\s+/g, '-').toLowerCase()}-session-${session.name.replace(/\s+/g, '-').toLowerCase()}-${session.id.slice(0, 8)}.json`

        // Export session
        const analysisHistory = exportOptions.includeAnalysisHistory ? session.analysisHistory : undefined
        const errors = exportOptions.includeErrors ? session.errors : undefined

        // Create export data
        const exportData = {
          session: enhancedSession,
          analysisHistory,
          errors,
          exportOptions,
          exportedAt: new Date().toISOString()
        }

        // Create and download file
        const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = filename
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        URL.revokeObjectURL(url)

        // Small delay between downloads to prevent browser issues
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      // Show success and close after delay
      setTimeout(() => {
        onClose()
      }, 1000)

    } catch (error) {
      console.error('Export error:', error)
      alert('Failed to export sessions. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  // Export all analysis snapshots across sessions
  const handleExportAllAnalysis = async () => {
    const sessionsWithAnalysis = sessions.filter(s => 
      selectedSessionIds.has(s.id) && s.analysisCount && s.analysisCount > 0
    )

    if (sessionsWithAnalysis.length === 0) {
      alert('No analysis snapshots found in selected sessions')
      return
    }

    setIsExporting(true)

    try {
      // Combine all analysis snapshots
      const allAnalysis = sessionsWithAnalysis.flatMap(session => 
        (session.analysisHistory || []).map(snapshot => ({
          ...snapshot,
          sessionId: session.id,
          sessionName: session.name,
          experimentId: experiment.id,
          experimentName: experiment.name
        }))
      )

      // Sort by timestamp
      allAnalysis.sort((a, b) => 
        new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      )

      const exportData = {
        experimentId: experiment.id,
        experimentName: experiment.name,
        totalSnapshots: allAnalysis.length,
        sessions: sessionsWithAnalysis.length,
        analysisTimeline: allAnalysis,
        exportedAt: new Date().toISOString()
      }

      const filename = `experiment-${experiment.name.replace(/\s+/g, '-').toLowerCase()}-all-analysis.json`

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)

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

  const updateOption = <K extends keyof ExportOptions>(key: K, value: ExportOptions[K]) => {
    setExportOptions(prev => ({ ...prev, [key]: value }))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes}B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)}KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)}MB`
  }

  const getSessionStatusColor = (status?: string) => {
    const normalizedStatus = (status || 'completed').toLowerCase()
    switch (normalizedStatus) {
      case 'completed':
      case 'complete':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20'
      case 'running':
      case 'active':
        return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20'
      case 'failed':
      case 'error':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20'
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20'
    }
  }

  if (!isOpen) return null

  if (isLoading) {
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-8">
          <div className="flex flex-col items-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mb-4" />
            <p className="text-gray-600 dark:text-gray-400">Loading experiment sessions...</p>
            <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
              Fetching {sessionIds.length} sessions
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-6xl h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-green-600 rounded-xl flex items-center justify-center">
              <TestTubeDiagonal className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-gray-100">
                Export Experiment Results
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {experiment.name} • {sessions.length} sessions
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex flex-1 min-h-0">
          {/* Sessions List */}
          <div className="w-3/5 p-6 border-r border-gray-200 dark:border-gray-700 overflow-y-auto">
            <div className="space-y-4">
              {/* Aggregate Stats */}
              <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20">
                <CardContent className="p-4">
                  <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-3 flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Aggregate Statistics
                  </h3>
                  <div className="grid grid-cols-4 gap-4">
                    <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3">
                      <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                        {selectedSessionIds.size}/{sessions.length}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Sessions Selected</div>
                    </div>
                    <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3">
                      <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                        {sessions.filter(s => selectedSessionIds.has(s.id)).reduce((sum, s) => sum + (s.messages?.length || 0), 0)}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Total Messages</div>
                    </div>
                    <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3">
                      <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                        {sessions.filter(s => selectedSessionIds.has(s.id)).reduce((sum, s) => sum + (s.analysisCount || 0), 0)}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Analysis Snapshots</div>
                    </div>
                    <div className="bg-white/60 dark:bg-black/20 rounded-lg p-3">
                      <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">
                        {formatFileSize(sessions.filter(s => selectedSessionIds.has(s.id)).reduce((sum, s) => sum + (s.fileSize || 0), 0))}
                      </div>
                      <div className="text-xs text-gray-600 dark:text-gray-400">Est. Total Size</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Selection Controls */}
              <div className="flex items-center justify-between">
                <h3 className="font-medium text-gray-900 dark:text-gray-100">
                  Select Sessions to Export
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={toggleAllSessions}
                >
                  {selectedSessionIds.size === sessions.length ? (
                    <>
                      <Square className="h-4 w-4 mr-2" />
                      Deselect All
                    </>
                  ) : (
                    <>
                      <CheckSquare className="h-4 w-4 mr-2" />
                      Select All
                    </>
                  )}
                </Button>
              </div>

              {/* Sessions List */}
              <div className="space-y-3">
                {sessions.map((session) => (
                  <Card 
                    key={session.id}
                    className={`transition-all ${
                      selectedSessionIds.has(session.id) 
                        ? 'ring-2 ring-emerald-500 dark:ring-emerald-400' 
                        : ''
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={selectedSessionIds.has(session.id)}
                          onChange={() => toggleSessionSelection(session.id)}
                          className="w-5 h-5 text-emerald-600 rounded focus:ring-emerald-500 mt-0.5"
                        />
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
                                {session.name}
                              </h4>
                              <Badge 
                                variant="outline" 
                                className={`text-xs ${getSessionStatusColor(session.status)}`}
                              >
                                {session.status || 'completed'}
                              </Badge>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => toggleSessionExpanded(session.id)}
                            >
                              {expandedSessions.has(session.id) ? (
                                <ChevronDown className="h-4 w-4" />
                              ) : (
                                <ChevronRight className="h-4 w-4" />
                              )}
                            </Button>
                          </div>

                          <div className="grid grid-cols-5 gap-4 text-xs text-gray-600 dark:text-gray-400">
                            <div className="flex items-center gap-1">
                              <MessageSquare className="h-3 w-3" />
                              <span>{session.messages?.length || 0} msgs</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Users className="h-3 w-3" />
                              <span>{session.participants?.length || 0} participants</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <Zap className="h-3 w-3" />
                              <span>{session.analysisCount || 0} analyses</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <AlertTriangle className="h-3 w-3" />
                              <span>{session.errorCount || 0} errors</span>
                            </div>
                            <div className="flex items-center gap-1">
                              <FileArchive className="h-3 w-3" />
                              <span>~{formatFileSize(session.fileSize || 0)}</span>
                            </div>
                          </div>

                          {expandedSessions.has(session.id) && (
                            <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 space-y-2">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-600 dark:text-gray-400">Created:</span>
                                <span>{new Date(session.createdAt).toLocaleString()}</span>
                              </div>
                              {session.description && (
                                <div className="text-xs">
                                  <span className="text-gray-600 dark:text-gray-400">Description:</span>
                                  <p className="mt-1 text-gray-700 dark:text-gray-300">{session.description}</p>
                                </div>
                              )}
                              <div className="flex gap-2 mt-2">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => {
                                    setPreviewSessionId(session.id)
                                    setShowPreview(true)
                                  }}
                                  className="text-xs"
                                >
                                  <Eye className="h-3 w-3 mr-1" />
                                  Preview
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          </div>

          {/* Options & Preview Panel */}
          <div className="w-2/5 flex flex-col min-h-0">
            {showPreview && previewSessionId ? (
              /* Preview Mode */
              <div className="flex flex-col h-full">
                <div className="p-6 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                  <div className="flex items-center justify-between">
                    <h3 className="font-medium text-gray-900 dark:text-gray-100">
                      Preview: {sessions.find(s => s.id === previewSessionId)?.name}
                    </h3>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setShowPreview(false)
                        setPreviewSessionId(null)
                      }}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="flex-1 p-6 overflow-y-auto">
                  <pre className="text-xs bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto text-gray-900 dark:text-gray-100 font-mono leading-relaxed whitespace-pre-wrap">
                    {previewContent || 'Generating preview...'}
                  </pre>
                </div>
              </div>
            ) : (
              /* Options Mode */
              <div className="p-6 overflow-y-auto">
                <div className="space-y-6">
                  {/* Export Options */}
                  <div>
                    <h3 className="font-medium text-gray-900 dark:text-gray-100 mb-4">
                      Export Options
                    </h3>
                    
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
                          checked={exportOptions.includeAnalysisHistory}
                          onChange={(e) => updateOption('includeAnalysisHistory', e.target.checked)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                        />
                        <div className="flex-1">
                          <div className="text-sm font-medium text-gray-900 dark:text-gray-100 flex items-center gap-2">
                            Include MCP Analysis History
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
                          </div>
                          <p className="text-xs text-gray-600 dark:text-gray-400">
                            API failures with retry attempts and timestamps
                          </p>
                        </div>
                      </label>
                    </div>
                  </div>

                  {/* Summary */}
                  <Card className="bg-gray-50 dark:bg-gray-700/50">
                    <CardContent className="p-4">
                      <h4 className="font-medium text-gray-900 dark:text-gray-100 mb-3">
                        Export Summary
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Sessions:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            {selectedSessionIds.size} selected
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Format:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            Individual JSON files
                          </span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">Total Size:</span>
                          <span className="font-medium text-gray-900 dark:text-gray-100">
                            ~{formatFileSize(sessions.filter(s => selectedSessionIds.has(s.id)).reduce((sum, s) => sum + (s.fileSize || 0), 0))}
                          </span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Instructions */}
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-4">
                    <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                      <FileArchive className="h-4 w-4" />
                      Export Instructions
                    </h4>
                    <ul className="space-y-1 text-xs text-blue-800 dark:text-blue-200">
                      <li>• Each session will be exported as a separate JSON file</li>
                      <li>• Files include experiment metadata for tracking</li>
                      <li>• Analysis snapshots preserve the timeline of insights</li>
                      <li>• Use the preview button to inspect data before export</li>
                    </ul>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-800/50 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="default">
                {selectedSessionIds.size} sessions selected
              </Badge>
              <span className="text-sm text-gray-600 dark:text-gray-400">
                {experiment.name}
              </span>
            </div>
            
            <div className="flex gap-3">
              {/* Export all analysis button */}
              {sessions.some(s => selectedSessionIds.has(s.id) && s.analysisCount && s.analysisCount > 0) && (
                <Button
                  variant="outline"
                  onClick={handleExportAllAnalysis}
                  disabled={isExporting}
                  className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border-indigo-200"
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Export All Analysis
                </Button>
              )}
              
              <Button variant="outline" onClick={onClose} disabled={isExporting}>
                Cancel
              </Button>
              <Button 
                onClick={handleExport}
                disabled={isExporting || selectedSessionIds.size === 0}
                className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4 mr-2" />
                    Export {selectedSessionIds.size} Session{selectedSessionIds.size !== 1 ? 's' : ''}
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