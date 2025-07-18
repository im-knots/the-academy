// src/components/Research/ExperimentsInterface.tsx - Updated with Single Run and Session Dropdown
'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useMCP } from '@/hooks/useMCP'
import { MCPClient } from '@/lib/mcp/client'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { ExperimentConfig, ExperimentRun } from '@/types/experiment'
import { CreateExperimentModal } from '@/components/Research/CreateExperimentModal'
import { 
  TestTubeDiagonal, Plus, Play, Pause, Square, 
  AlertCircle, CheckCircle2, Loader2, 
  Activity, Trash2, Clock,
  TrendingUp, AlertTriangle, Zap, Users, 
  BarChart3, Settings2, Database, Edit2,
  Download, RefreshCw, ChevronDown, ChevronRight,
  MessageSquare, Calendar, FileText
} from 'lucide-react'

interface ExperimentSession {
  id: string
  name: string
  messageCount: number
  participantCount: number
  status: string
  createdAt: Date
  lastActivity: Date
  messages?: Array<{
    role: string
    content: string
    participantName: string
    timestamp: Date
  }>
  analysisSnapshots?: Array<{
    id: string
    timestamp: Date
    type: string
    analysis: any
  }>
}

interface ExperimentResults {
  config: ExperimentConfig
  run: ExperimentRun
  sessions: ExperimentSession[]
  aggregateStats: {
    totalSessions: number
    totalMessages: number
    avgMessagesPerSession: number
    participantStats: Record<string, { messageCount: number, sessions: number }>
    errorRate: number
    successRate: number
  }
}

interface ExperimentsInterfaceProps {
  sessionId?: string
  experiments: ExperimentConfig[]
  selectedExperiment: ExperimentConfig | null
  onSelectExperiment: (experiment: ExperimentConfig) => void
  onCreateExperiment: (experiment: ExperimentConfig) => void
  onNewExperiment?: () => void
}

export function ExperimentsInterface({ 
  sessionId, 
  experiments, 
  selectedExperiment, 
  onSelectExperiment, 
  onCreateExperiment,
  onNewExperiment
}: ExperimentsInterfaceProps) {
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [activeRun, setActiveRun] = useState<ExperimentRun | null>(null)
  const [experimentResults, setExperimentResults] = useState<ExperimentResults | null>(null)
  const [isLoadingStatus, setIsLoadingStatus] = useState(false)
  const [expandedSessions, setExpandedSessions] = useState<Set<string>>(new Set())
  const [showSessionsDropdown, setShowSessionsDropdown] = useState(false)
  
  // MCP client ref for API calls
  const mcpClient = useRef(MCPClient.getInstance())
  
  // Track if we're currently loading to prevent duplicate requests
  const loadingRef = useRef(false)
  
  const {
    executeExperimentViaMCP,
    getExperimentStatusViaMCP,
    pauseExperimentViaMCP,
    resumeExperimentViaMCP,
    stopExperimentViaMCP,
    getExperimentResultsViaMCP,
    deleteExperimentViaMCP,
    updateExperimentViaMCP
  } = useMCP()

  // EVENT-DRIVEN: Load experiment results
  const loadExperimentResults = useCallback(async () => {
    if (!selectedExperiment) return

    try {
      const results = await getExperimentResultsViaMCP(selectedExperiment.id)
      console.log('🧪 Loaded experiment results:', results)
      setExperimentResults(results.results)
    } catch (error) {
      console.error('Failed to load experiment results:', error)
    }
  }, [selectedExperiment, getExperimentResultsViaMCP])

  // EVENT-DRIVEN: Load experiment status function
  const loadExperimentStatus = useCallback(async () => {
    if (!selectedExperiment || loadingRef.current) return

    console.log(`🧪 Loading experiment status for ${selectedExperiment.id}`)
    loadingRef.current = true
    setIsLoadingStatus(true)
    
    try {
      const status = await getExperimentStatusViaMCP(selectedExperiment.id)
      console.log('🧪 Received experiment status:', status)
      
      if (status.run || status.currentRun) {
        const run = status.run || status.currentRun
        // Ensure run has all required properties with defaults
        const normalizedRun = {
          ...run,
          errors: run.errors || [],
          sessionIds: run.sessionIds || [],
          errorRate: run.errorRate || 0,
          // Convert date strings to Date objects
          startedAt: run.startedAt ? new Date(run.startedAt) : new Date(),
          pausedAt: run.pausedAt ? new Date(run.pausedAt) : undefined,
          resumedAt: run.resumedAt ? new Date(run.resumedAt) : undefined,
          completedAt: run.completedAt ? new Date(run.completedAt) : undefined
        }
        setActiveRun(normalizedRun)
        console.log('🧪 Updated active run:', normalizedRun)
        
        // Load results if experiment is completed
        if (normalizedRun.status === 'completed' || normalizedRun.status === 'failed') {
          await loadExperimentResults()
        }
      } else if (status.success === false) {
        console.log('🧪 Failed to get status:', status)
      } else {
        console.log('🧪 No run found in status')
        setActiveRun(null)
        setExperimentResults(null)
      }
    } catch (error) {
      console.error('Failed to load experiment status:', error)
      setActiveRun(null)
    } finally {
      setIsLoadingStatus(false)
      loadingRef.current = false
    }
  }, [selectedExperiment, getExperimentStatusViaMCP, loadExperimentResults])

  // EVENT-DRIVEN: Handle experiment events
  const handleExperimentEvent = useCallback(async (payload: any) => {
    console.log('🧪 ExperimentsInterface: Experiment event received:', payload)
    
    // Check various payload structures since events might have different formats
    const experimentId = payload?.data?.experimentId || 
                        payload?.data?.configId || 
                        payload?.experimentId || 
                        payload?.configId ||
                        payload?.data?.experiment?.id ||
                        payload?.data?.experiment?.configId

    console.log('🧪 Checking if event is for our experiment:', {
      eventExperimentId: experimentId,
      selectedExperimentId: selectedExperiment?.id,
      matches: experimentId === selectedExperiment?.id
    })
    
    // If this affects our selected experiment, refresh the status
    if (experimentId === selectedExperiment?.id) {
      console.log('🧪 Event matches our experiment, refreshing status...')
      await loadExperimentStatus()
    }
  }, [selectedExperiment?.id, loadExperimentStatus])

  // EVENT-DRIVEN: Handle any event that might affect experiment status
  const handleAnyExperimentRelatedEvent = useCallback(async (payload: any) => {
    console.log('🧪 ExperimentsInterface: Event received that might affect experiment:', payload)
    
    // For any event, just refresh the status if we have an active experiment
    if (selectedExperiment && !loadingRef.current) {
      console.log('🧪 Refreshing experiment status due to event')
      await loadExperimentStatus()
    }
  }, [selectedExperiment, loadExperimentStatus])

  // EVENT-DRIVEN: Subscribe to relevant events via internal pub/sub
  useEffect(() => {
    if (!selectedExperiment) return

    console.log(`🧪 ExperimentsInterface: Setting up internal pub/sub event subscriptions for experiment ${selectedExperiment.id}`)

    // Initial load
    loadExperimentStatus()

    // Experiment events - use specific handler
    const unsubscribeExperimentCreated = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_CREATED, handleExperimentEvent)
    const unsubscribeExperimentUpdated = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_UPDATED, handleExperimentEvent)
    const unsubscribeExperimentDeleted = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_DELETED, handleExperimentEvent)
    const unsubscribeExperimentExecuted = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_EXECUTED, handleExperimentEvent)
    const unsubscribeExperimentStatusChanged = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_STATUS_CHANGED, handleExperimentEvent)
    
    // Session events - use generic handler since they might be part of experiment
    const unsubscribeSessionCreated = eventBus.subscribe(EVENT_TYPES.SESSION_CREATED, handleAnyExperimentRelatedEvent)
    const unsubscribeSessionUpdated = eventBus.subscribe(EVENT_TYPES.SESSION_UPDATED, handleAnyExperimentRelatedEvent)
    const unsubscribeSessionDeleted = eventBus.subscribe(EVENT_TYPES.SESSION_DELETED, handleAnyExperimentRelatedEvent)
    
    // Message events - also refresh on new messages
    const unsubscribeMessageCreated = eventBus.subscribe(EVENT_TYPES.MESSAGE_CREATED, handleAnyExperimentRelatedEvent)

    return () => {
      console.log(`🧪 ExperimentsInterface: Cleaning up internal pub/sub event subscriptions for experiment ${selectedExperiment.id}`)
      unsubscribeExperimentCreated()
      unsubscribeExperimentUpdated()
      unsubscribeExperimentDeleted()
      unsubscribeExperimentExecuted()
      unsubscribeExperimentStatusChanged()
      unsubscribeSessionCreated()
      unsubscribeSessionUpdated()
      unsubscribeSessionDeleted()
      unsubscribeMessageCreated()
    }
  }, [selectedExperiment?.id, loadExperimentStatus, handleExperimentEvent, handleAnyExperimentRelatedEvent])

  // EVENT-DRIVEN: Set up periodic status checking only for running experiments
  useEffect(() => {
    if (!selectedExperiment || !activeRun || 
        (activeRun.status !== 'running' && activeRun.status !== 'pending')) {
      console.log('🧪 No periodic polling needed:', {
        hasExperiment: !!selectedExperiment,
        hasActiveRun: !!activeRun,
        status: activeRun?.status
      })
      return
    }

    console.log(`🧪 ExperimentsInterface: Setting up periodic status check for running experiment ${selectedExperiment.id}`)

    // For running experiments, we still need periodic checks since experiment status
    // updates happen externally and may not trigger MCP tool calls
    const pollStatus = async () => {
      console.log('🧪 Polling experiment status...')
      try {
        const status = await getExperimentStatusViaMCP(selectedExperiment.id)
        console.log('🧪 Polled status:', status)
        
        if (status.run || status.currentRun) {
          const run = status.run || status.currentRun
          // Ensure run has all required properties with defaults
          const normalizedRun = {
            ...run,
            errors: run.errors || [],
            sessionIds: run.sessionIds || [],
            errorRate: run.errorRate || 0,
            // Convert date strings to Date objects
            startedAt: run.startedAt ? new Date(run.startedAt) : new Date(),
            pausedAt: run.pausedAt ? new Date(run.pausedAt) : undefined,
            resumedAt: run.resumedAt ? new Date(run.resumedAt) : undefined,
            completedAt: run.completedAt ? new Date(run.completedAt) : undefined
          }
          setActiveRun(prevRun => {
            console.log('🧪 Updating run from:', prevRun, 'to:', normalizedRun)
            return normalizedRun
          })
          
          // Load results if experiment completed or failed
          if (normalizedRun.status === 'completed' || normalizedRun.status === 'failed') {
            await loadExperimentResults()
          }
        }
      } catch (error) {
        console.error('Failed to poll experiment status:', error)
      }
    }

    // Poll every 3 seconds for running experiments
    const interval = setInterval(pollStatus, 3000)

    return () => {
      console.log(`🧪 ExperimentsInterface: Cleaning up periodic status check for experiment ${selectedExperiment.id}`)
      clearInterval(interval)
    }
  }, [selectedExperiment?.id, activeRun?.status, getExperimentStatusViaMCP, loadExperimentResults])

  const handleNewExperiment = () => {
    if (onNewExperiment) {
      onNewExperiment()
    } else {
      setShowCreateModal(true)
    }
  }

  const handleStartExperiment = async () => {
    if (!selectedExperiment) return

    try {
      console.log('🧪 ExperimentsInterface: Starting experiment, will emit events automatically via internal pub/sub')
      
      // This will emit events automatically via internal pub/sub
      const result = await executeExperimentViaMCP(selectedExperiment.id, selectedExperiment)
      console.log('🧪 Experiment start result:', result)
      
      if (result.success) {
        // Set initial status - event-driven system will update with real status
        const initialRun = {
          id: result.runId,
          configId: selectedExperiment.id,
          status: 'pending' as const,
          startedAt: new Date(),
          totalSessions: selectedExperiment.totalSessions,
          completedSessions: 0,
          failedSessions: 0,
          activeSessions: 0,
          sessionIds: [],
          errorRate: 0,
          errors: [],
          progress: 0
        }
        console.log('🧪 Setting initial run state:', initialRun)
        setActiveRun(initialRun)
        
        // Force a status check after a short delay
        setTimeout(() => {
          console.log('🧪 Force loading experiment status after start')
          loadExperimentStatus()
        }, 1000)
      }
    } catch (error) {
      console.error('Failed to start experiment:', error)
      alert('Failed to start experiment. Please try again.')
    }
  }

  const handlePauseExperiment = async () => {
    if (!selectedExperiment || !activeRun) return

    try {
      console.log('🧪 ExperimentsInterface: Pausing experiment, will emit events automatically via internal pub/sub')
      
      // This will emit events automatically via internal pub/sub
      await pauseExperimentViaMCP(selectedExperiment.id)
      setActiveRun({ ...activeRun, status: 'paused', pausedAt: new Date() })
    } catch (error) {
      console.error('Failed to pause experiment:', error)
      alert('Failed to pause experiment. Please try again.')
    }
  }

  const handleResumeExperiment = async () => {
    if (!selectedExperiment || !activeRun) return

    try {
      console.log('🧪 ExperimentsInterface: Resuming experiment, will emit events automatically via internal pub/sub')
      
      // This will emit events automatically via internal pub/sub
      await resumeExperimentViaMCP(selectedExperiment.id)
      setActiveRun({ ...activeRun, status: 'running', resumedAt: new Date() })
    } catch (error) {
      console.error('Failed to resume experiment:', error)
      alert('Failed to resume experiment. Please try again.')
    }
  }

  const handleStopExperiment = async () => {
    if (!selectedExperiment || !activeRun) return

    if (!confirm('Are you sure you want to stop this experiment? This cannot be undone.')) {
      return
    }

    try {
      console.log('🧪 ExperimentsInterface: Stopping experiment, will emit events automatically via internal pub/sub')
      
      // This will emit events automatically via internal pub/sub
      await stopExperimentViaMCP(selectedExperiment.id)
      setActiveRun({ ...activeRun, status: 'failed', completedAt: new Date() })
    } catch (error) {
      console.error('Failed to stop experiment:', error)
      alert('Failed to stop experiment. Please try again.')
    }
  }

  const handleDeleteExperiment = async () => {
    if (!selectedExperiment) return

    if (!confirm(`Are you sure you want to delete "${selectedExperiment.name}"? This cannot be undone.`)) {
      return
    }

    try {
      console.log('🧪 ExperimentsInterface: Deleting experiment, will emit events automatically via internal pub/sub')
      
      // This will emit events automatically via internal pub/sub
      await deleteExperimentViaMCP(selectedExperiment.id)
      // Clear selection and let parent component handle the update via events
      onSelectExperiment(null as any)
    } catch (error) {
      console.error('Failed to delete experiment:', error)
      alert('Failed to delete experiment. Please try again.')
    }
  }

  const handleExportResults = () => {
    if (!experimentResults) return

    try {
      const exportData = {
        experiment: selectedExperiment,
        run: activeRun,
        results: experimentResults,
        exportedAt: new Date().toISOString()
      }

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `experiment-${selectedExperiment?.name.replace(/\s+/g, '-').toLowerCase()}-results.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Failed to export results:', error)
      alert('Failed to export results. Please try again.')
    }
  }

  const toggleSessionExpanded = (sessionId: string) => {
    setExpandedSessions(prev => {
      const next = new Set(prev)
      if (next.has(sessionId)) {
        next.delete(sessionId)
      } else {
        next.add(sessionId)
      }
      return next
    })
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': 
        return <Loader2 className="h-4 w-4 animate-spin" />
      case 'completed': 
        return <CheckCircle2 className="h-4 w-4" />
      case 'failed': 
        return <AlertCircle className="h-4 w-4" />
      case 'paused': 
        return <Pause className="h-4 w-4" />
      case 'stopped':
        return <Square className="h-4 w-4" />
      case 'pending':
        return <Clock className="h-4 w-4" />
      default: 
        return <Clock className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': 
        return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
      case 'completed': 
        return 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
      case 'failed': 
        return 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
      case 'paused': 
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
      case 'stopped':
        return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700'
      case 'pending':
        return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-700'
      default: 
        return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700'
    }
  }

  const formatDuration = (start?: Date | string, end?: Date | string) => {
    if (!start) return 'N/A'
    
    // Convert to Date objects if they're strings
    const startTime = start instanceof Date ? start : new Date(start)
    const endTime = end ? (end instanceof Date ? end : new Date(end)) : new Date()
    
    const duration = endTime.getTime() - startTime.getTime()
    const minutes = Math.floor(duration / 60000)
    const seconds = Math.floor((duration % 60000) / 1000)
    return `${minutes}m ${seconds}s`
  }

  return (
    <>
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div>
                <h1 className="font-semibold text-gray-900 dark:text-gray-100">Bulk Experiments</h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">Create and run AI conversation experiments at scale</p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleNewExperiment}
                className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
              >
                <Plus className="h-4 w-4 mr-1" />
                New Experiment
              </Button>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {selectedExperiment ? (
            /* Selected Experiment View */
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-6xl mx-auto space-y-6">
                {/* Experiment Header */}
                <Card className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 shadow-xl border-0">
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-2xl flex items-center gap-3">
                          {selectedExperiment.name}
                          <Button variant="ghost" size="sm" className="h-8 w-8" onClick={() => {}}>
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </CardTitle>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Created {new Date(selectedExperiment.createdAt).toLocaleDateString()} • {selectedExperiment.totalSessions} sessions
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {!activeRun || activeRun.status === 'completed' || activeRun.status === 'failed' ? (
                          <>
                            <Button 
                              onClick={handleStartExperiment}
                              className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg"
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Start Experiment
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={handleDeleteExperiment}
                              className="text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        ) : activeRun.status === 'running' ? (
                          <>
                            <Button
                              variant="outline"
                              onClick={handlePauseExperiment}
                              className="text-yellow-600 hover:text-yellow-700"
                            >
                              <Pause className="h-4 w-4 mr-1" />
                              Pause
                            </Button>
                            <Button
                              variant="outline"
                              onClick={handleStopExperiment}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Square className="h-4 w-4 mr-1" />
                              Stop
                            </Button>
                          </>
                        ) : activeRun.status === 'paused' ? (
                          <>
                            <Button
                              onClick={handleResumeExperiment}
                              className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                            >
                              <Play className="h-4 w-4 mr-1" />
                              Resume
                            </Button>
                            <Button
                              variant="outline"
                              onClick={handleStopExperiment}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Square className="h-4 w-4 mr-1" />
                              Stop
                            </Button>
                          </>
                        ) : null}
                        
                        {experimentResults && (
                          <Button
                            variant="outline"
                            onClick={handleExportResults}
                            className="text-gray-600 hover:text-gray-900"
                          >
                            <Download className="h-4 w-4 mr-1" />
                            Export Results
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Run Status */}
                {(activeRun || isLoadingStatus) && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center gap-2">
                        <Activity className="h-5 w-5" />
                        Experiment Run Status
                        {activeRun?.status === 'running' && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            <RefreshCw className="h-3 w-3 mr-1" />
                            Auto-updating
                          </Badge>
                        )}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {isLoadingStatus ? (
                        <div className="flex items-center justify-center py-8">
                          <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
                        </div>
                      ) : activeRun && (
                        <div className="space-y-4">
                          {/* Status Badge */}
                          <div className="flex items-center justify-between">
                            <Badge 
                              variant="outline" 
                              className={`px-3 py-1 flex items-center gap-2 ${getStatusColor(activeRun.status)}`}
                            >
                              {getStatusIcon(activeRun.status)}
                              {activeRun.status.charAt(0).toUpperCase() + activeRun.status.slice(1)}
                            </Badge>
                            
                            <div className="text-sm text-gray-600 dark:text-gray-400">
                              Duration: {formatDuration(activeRun.startedAt, activeRun.completedAt)}
                            </div>
                          </div>

                          {/* Progress Bar */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm font-medium">Progress</span>
                              <span className="text-sm text-gray-600 dark:text-gray-400">
                                {activeRun.completedSessions + activeRun.failedSessions} / {activeRun.totalSessions} sessions
                              </span>
                            </div>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div 
                                className="bg-gradient-to-r from-blue-500 to-green-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${activeRun.progress}%` }}
                              />
                            </div>
                          </div>

                          {/* Stats Grid */}
                          <div className="grid grid-cols-4 gap-4">
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                              <div className="text-2xl font-bold text-green-600">{activeRun.completedSessions}</div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">Completed</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                              <div className="text-2xl font-bold text-blue-600">{activeRun.activeSessions}</div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">Active</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                              <div className="text-2xl font-bold text-red-600">{activeRun.failedSessions}</div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">Failed</div>
                            </div>
                            <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                              <div className="text-2xl font-bold text-orange-600">
                                {(activeRun.errorRate * 100).toFixed(1)}%
                              </div>
                              <div className="text-xs text-gray-600 dark:text-gray-400">Error Rate</div>
                            </div>
                          </div>

                          {/* Errors */}
                          {activeRun.errors.length > 0 && (
                            <div className="mt-4">
                              <h4 className="text-sm font-medium mb-2 flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-orange-600" />
                                Recent Errors
                              </h4>
                              <div className="space-y-2 max-h-32 overflow-y-auto">
                                {activeRun.errors.slice(0, 3).map((error, idx) => (
                                  <div key={idx} className="bg-red-50 dark:bg-red-900/20 rounded p-2 text-xs">
                                    <div className="flex items-center justify-between">
                                      <span className="font-medium text-red-700 dark:text-red-400">
                                        {error.type} ({error.count}x)
                                      </span>
                                      <span className="text-red-600 dark:text-red-500">
                                        {new Date(error.lastOccurred).toLocaleTimeString()}
                                      </span>
                                    </div>
                                    <p className="text-red-600 dark:text-red-400 mt-1">{error.message}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {/* Session Results - Collapsible */}
                {experimentResults && (
                  <Card>
                    <CardHeader 
                      className="cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50"
                      onClick={() => setShowSessionsDropdown(!showSessionsDropdown)}
                    >
                      <CardTitle className="text-lg flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          {showSessionsDropdown ? (
                            <ChevronDown className="h-5 w-5" />
                          ) : (
                            <ChevronRight className="h-5 w-5" />
                          )}
                          <MessageSquare className="h-5 w-5" />
                          Session Details & Analysis
                        </div>
                        <div className="text-sm font-normal text-gray-600 dark:text-gray-400">
                          {experimentResults.sessions.length} sessions • {experimentResults.aggregateStats.totalMessages} messages
                        </div>
                      </CardTitle>
                    </CardHeader>
                    {showSessionsDropdown && (
                      <CardContent>
                        <div className="space-y-6">
                          {/* Aggregate Stats */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                              Aggregate Statistics
                            </h4>
                            <div className="grid grid-cols-3 gap-4">
                              <div className="bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-4">
                                <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                                  {experimentResults.aggregateStats.totalMessages}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">Total Messages</div>
                              </div>
                              <div className="bg-gradient-to-br from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg p-4">
                                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                                  {experimentResults.aggregateStats.avgMessagesPerSession.toFixed(1)}
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">Avg Messages/Session</div>
                              </div>
                              <div className="bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-900/20 dark:to-blue-900/20 rounded-lg p-4">
                                <div className="text-3xl font-bold text-green-600 dark:text-green-400">
                                  {(experimentResults.aggregateStats.successRate * 100).toFixed(1)}%
                                </div>
                                <div className="text-sm text-gray-600 dark:text-gray-400">Success Rate</div>
                              </div>
                            </div>
                          </div>

                          {/* Participant Performance */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                              Participant Performance
                            </h4>
                            <div className="space-y-2">
                              {Object.entries(experimentResults.aggregateStats.participantStats).map(([key, stats]) => (
                                <div key={key} className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 rounded-lg p-3">
                                  <div className="flex items-center gap-3">
                                    <Badge variant="outline" className="capitalize">
                                      {key.split('-')[0]}
                                    </Badge>
                                    <span className="text-sm text-gray-600 dark:text-gray-400">
                                      {key.split('-')[1]}
                                    </span>
                                  </div>
                                  <div className="text-sm text-gray-600 dark:text-gray-400">
                                    {stats.messageCount} messages across {stats.sessions} sessions
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Session List */}
                          <div>
                            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">
                              Sessions ({experimentResults.sessions.length})
                            </h4>
                            <div className="max-h-96 overflow-y-auto space-y-2">
                              {experimentResults.sessions.map((session) => (
                                <div key={session.id} className="bg-gray-50 dark:bg-gray-800 rounded-lg">
                                  <div 
                                    className="p-3 cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700/50"
                                    onClick={() => toggleSessionExpanded(session.id)}
                                  >
                                    <div className="flex items-center justify-between">
                                      <div className="flex items-center gap-2">
                                        {expandedSessions.has(session.id) ? (
                                          <ChevronDown className="h-3 w-3 text-gray-500" />
                                        ) : (
                                          <ChevronRight className="h-3 w-3 text-gray-500" />
                                        )}
                                        <div>
                                          <span className="font-medium text-sm">{session.name}</span>
                                          <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                                            <span>{session.messageCount} messages</span>
                                            <span>{session.participantCount} participants</span>
                                            <span>{new Date(session.createdAt).toLocaleDateString()}</span>
                                          </div>
                                        </div>
                                      </div>
                                      <Badge variant="outline" className="text-xs">
                                        {session.status}
                                      </Badge>
                                    </div>
                                  </div>
                                  
                                  {/* Session Details (Collapsible) */}
                                  {expandedSessions.has(session.id) && (
                                    <div className="border-t border-gray-200 dark:border-gray-700 p-3">
                                      {/* Messages */}
                                      {session.messages && session.messages.length > 0 && (
                                        <div className="mb-4">
                                          <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                                            <MessageSquare className="h-3 w-3" />
                                            Conversation History
                                          </h5>
                                          <div className="space-y-2 max-h-48 overflow-y-auto">
                                            {session.messages.map((msg, idx) => (
                                              <div key={idx} className="text-xs">
                                                <div className="flex items-center gap-2 mb-1">
                                                  <Badge variant="outline" className="text-xs py-0">
                                                    {msg.participantName}
                                                  </Badge>
                                                  <span className="text-gray-500">
                                                    {new Date(msg.timestamp).toLocaleTimeString()}
                                                  </span>
                                                </div>
                                                <p className="text-gray-600 dark:text-gray-400 ml-2">
                                                  {msg.content}
                                                </p>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                      
                                      {/* Analysis Snapshots */}
                                      {session.analysisSnapshots && session.analysisSnapshots.length > 0 && (
                                        <div>
                                          <h5 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2 flex items-center gap-1">
                                            <FileText className="h-3 w-3" />
                                            Analysis Snapshots
                                          </h5>
                                          <div className="space-y-2">
                                            {session.analysisSnapshots.map((snapshot, idx) => (
                                              <div key={idx} className="bg-gray-100 dark:bg-gray-900 rounded p-2">
                                                <div className="flex items-center justify-between mb-1">
                                                  <Badge variant="outline" className="text-xs">
                                                    {snapshot.type}
                                                  </Badge>
                                                  <span className="text-xs text-gray-500">
                                                    {new Date(snapshot.timestamp).toLocaleTimeString()}
                                                  </span>
                                                </div>
                                                <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                                                  {JSON.stringify(snapshot.analysis, null, 2)}
                                                </pre>
                                              </div>
                                            ))}
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    )}
                  </Card>
                )}

                {/* Experiment Configuration */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Settings2 className="h-5 w-5" />
                      Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Participants ({selectedExperiment.participants?.length || selectedExperiment.config?.participants?.length || 0})
                          </h4>
                          <div className="space-y-2">
                            {(selectedExperiment.participants || selectedExperiment.config?.participants || []).map((p, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm">
                                <Badge variant="outline" className="capitalize">
                                  {p.type}
                                </Badge>
                                <span className="text-gray-600 dark:text-gray-400">{p.name}</span>
                                {p.model && (
                                  <span className="text-xs text-gray-500">({p.model})</span>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Session Settings
                          </h4>
                          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            <div>Total Sessions: {selectedExperiment.totalSessions}</div>
                            <div>Concurrent Sessions: {selectedExperiment.concurrentSessions}</div>
                            <div>Max Messages per Session: {selectedExperiment.maxMessageCount}</div>
                            <div>Session Name Pattern: {selectedExperiment.sessionNamePattern}</div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-4">
                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Analysis Settings
                          </h4>
                          <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400">
                            <div>Provider: {selectedExperiment.analysisProvider.toUpperCase()}</div>
                            <div>Context Size: {selectedExperiment.analysisContextSize} messages</div>
                          </div>
                        </div>

                        <div>
                          <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Moderator Starting Prompt
                          </h4>
                          <div className="bg-gray-50 dark:bg-gray-800 rounded p-3 text-sm text-gray-600 dark:text-gray-400 max-h-32 overflow-y-auto">
                            {selectedExperiment.startingPrompt}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          ) : (
            /* No Experiment Selected */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="relative mb-8">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 bg-gradient-to-br from-green-400/20 to-blue-600/20 rounded-full animate-pulse"></div>
                  </div>
                  <div className="relative w-20 h-20 bg-gradient-to-br from-green-500 to-blue-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                    <TestTubeDiagonal className="h-10 w-10 text-white" />
                  </div>
                </div>
                <h3 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-3">
                  No Experiment Selected
                </h3>
                <p className="text-gray-600 dark:text-gray-400 mb-6 max-w-md mx-auto">
                  Select an experiment from the sidebar or create a new one to begin running bulk AI conversations
                </p>
                <Button
                  onClick={handleNewExperiment}
                  className="bg-gradient-to-r from-green-500 to-blue-600 hover:from-green-600 hover:to-blue-700 shadow-lg"
                >
                  <Plus className="h-5 w-5 mr-2" />
                  Create New Experiment
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create Experiment Modal */}
      <CreateExperimentModal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        onSave={onCreateExperiment}
      />
    </>
  )
}