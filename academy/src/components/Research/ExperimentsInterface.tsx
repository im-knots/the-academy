// src/components/Research/ExperimentsInterface.tsx
'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { Button } from '@/components/ui/Button'
import { CreateExperimentModal } from '@/components/Research/CreateExperimentModal'
import { 
  Beaker, Plus, Play, Pause, Square, 
  AlertCircle, CheckCircle2, Loader2, 
  Activity, Trash2, Clock,
  TrendingUp, AlertTriangle, Zap, Users, 
  BarChart3, Settings2, Database, Edit2
} from 'lucide-react'

interface ExperimentConfig {
  id: string
  name: string
  participants: Array<{
    type: 'claude' | 'gpt' | 'grok' | 'gemini' | 'ollama' | 'deepseek' | 'mistral' | 'cohere'
    name: string
    model?: string
  }>
  systemPrompt: string
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

interface ExperimentRun {
  id: string
  configId: string
  status: 'pending' | 'running' | 'paused' | 'completed' | 'failed'
  startedAt?: Date
  completedAt?: Date
  totalSessions: number
  completedSessions: number
  failedSessions: number
  activeSessions: number
  errorRate: number
  errors: Array<{
    type: string
    count: number
    lastOccurred: Date
  }>
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

  const handleNewExperiment = () => {
    if (onNewExperiment) {
      onNewExperiment()
    } else {
      setShowCreateModal(true)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'running': return <Loader2 className="h-4 w-4 animate-spin" />
      case 'completed': return <CheckCircle2 className="h-4 w-4" />
      case 'failed': return <AlertCircle className="h-4 w-4" />
      case 'paused': return <Clock className="h-4 w-4" />
      default: return <Clock className="h-4 w-4" />
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running': return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-700'
      case 'completed': return 'text-green-600 bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-700'
      case 'failed': return 'text-red-600 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-700'
      case 'paused': return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-700'
      default: return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20 border-gray-200 dark:border-gray-700'
    }
  }

  return (
    <>
      <div className="flex-1 flex flex-col bg-gray-50 dark:bg-gray-900">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                <Beaker className="h-6 w-6 text-white" />
              </div>
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
                          <Button variant="ghost" size="sm" className="h-8 w-8">
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </CardTitle>
                        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                          Created {selectedExperiment.createdAt.toLocaleDateString()} • {selectedExperiment.totalSessions} sessions
                        </p>
                      </div>
                      <div className="flex gap-2">
                        {!activeRun ? (
                          <Button className="bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 shadow-lg">
                            <Play className="h-4 w-4 mr-1" />
                            Start Experiment
                          </Button>
                        ) : activeRun.status === 'running' ? (
                          <>
                            <Button variant="outline" className="shadow-md">
                              <Pause className="h-4 w-4 mr-1" />
                              Pause
                            </Button>
                            <Button variant="destructive" className="shadow-md">
                              <Square className="h-4 w-4 mr-1" />
                              Stop
                            </Button>
                          </>
                        ) : (
                          <Button className="shadow-md">
                            <Play className="h-4 w-4 mr-1" />
                            Resume
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                </Card>

                {/* Status Overview */}
                {activeRun && (
                  <div className="grid grid-cols-4 gap-4">
                    <Card className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 shadow-lg border-0">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                              {activeRun.status.charAt(0).toUpperCase() + activeRun.status.slice(1)}
                            </p>
                          </div>
                          <div className={`p-3 rounded-xl ${getStatusColor(activeRun.status)}`}>
                            {getStatusIcon(activeRun.status)}
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-white to-blue-50 dark:from-gray-800 dark:to-blue-900/20 shadow-lg border-0">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Progress</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                              {activeRun.completedSessions}/{activeRun.totalSessions}
                            </p>
                            <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mt-2">
                              <div 
                                className="bg-gradient-to-r from-blue-500 to-blue-600 h-2 rounded-full transition-all duration-300"
                                style={{ width: `${(activeRun.completedSessions / activeRun.totalSessions) * 100}%` }}
                              />
                            </div>
                          </div>
                          <div className="p-3 rounded-xl bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400">
                            <TrendingUp className="h-5 w-5" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="bg-gradient-to-br from-white to-green-50 dark:from-gray-800 dark:to-green-900/20 shadow-lg border-0">
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Active Sessions</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                              {activeRun.activeSessions}
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              of {selectedExperiment.concurrentSessions} max
                            </p>
                          </div>
                          <div className="p-3 rounded-xl bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400">
                            <Activity className="h-5 w-5" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card className={`bg-gradient-to-br shadow-lg border-0 ${
                      activeRun.errorRate > selectedExperiment.errorRateThreshold 
                        ? 'from-white to-red-50 dark:from-gray-800 dark:to-red-900/20' 
                        : 'from-white to-green-50 dark:from-gray-800 dark:to-green-900/20'
                    }`}>
                      <CardContent className="p-6">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Error Rate</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                              {(activeRun.errorRate * 100).toFixed(1)}%
                            </p>
                            <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                              Threshold: {(selectedExperiment.errorRateThreshold * 100).toFixed(1)}%
                            </p>
                          </div>
                          <div className={`p-3 rounded-xl ${
                            activeRun.errorRate > selectedExperiment.errorRateThreshold 
                              ? 'bg-red-100 text-red-600 dark:bg-red-900/50 dark:text-red-400' 
                              : 'bg-green-100 text-green-600 dark:bg-green-900/50 dark:text-green-400'
                          }`}>
                            <AlertTriangle className="h-5 w-5" />
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                {/* Configuration Details */}
                <Card className="bg-gradient-to-br from-white to-gray-50 dark:from-gray-800 dark:to-gray-900 shadow-lg border-0">
                  <CardHeader className="bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-900 rounded-t-lg">
                    <CardTitle className="flex items-center gap-2">
                      <Settings2 className="h-5 w-5" />
                      Configuration
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="grid grid-cols-2 gap-8">
                      <div className="space-y-4">
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">System Prompt</p>
                          <p className="text-sm text-gray-900 dark:text-gray-100 mt-2 p-3 bg-gray-100 dark:bg-gray-800 rounded-lg whitespace-pre-wrap">
                            {selectedExperiment.systemPrompt}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Participants</p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {selectedExperiment.participants.map((p, idx) => (
                              <Badge key={idx} variant={p.type as any} className="py-1 px-3">
                                {p.name}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <div className="flex-1">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Analysis Provider</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1 flex items-center gap-2">
                              <Zap className="h-4 w-4" />
                              {selectedExperiment.analysisProvider.toUpperCase()}
                            </p>
                          </div>
                          <div className="flex-1">
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Analysis Context</p>
                            <p className="text-sm font-semibold text-gray-900 dark:text-gray-100 mt-1">
                              {selectedExperiment.analysisContextSize} messages
                            </p>
                          </div>
                        </div>
                      </div>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Total Sessions</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                              {selectedExperiment.totalSessions}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Concurrent</p>
                            <p className="text-2xl font-bold text-gray-900 dark:text-gray-100 mt-1">
                              {selectedExperiment.concurrentSessions}
                            </p>
                          </div>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Max Messages per Session</p>
                          <p className="text-lg font-semibold text-gray-900 dark:text-gray-100 mt-1">
                            {selectedExperiment.maxMessageCount}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Session Name Pattern</p>
                          <p className="text-sm font-mono bg-gray-100 dark:bg-gray-800 p-2 rounded mt-1">
                            {selectedExperiment.sessionNamePattern}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Error Threshold</p>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                              <div 
                                className="bg-gradient-to-r from-yellow-500 to-red-500 h-2 rounded-full"
                                style={{ width: `${selectedExperiment.errorRateThreshold * 100}%` }}
                              />
                            </div>
                            <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                              {(selectedExperiment.errorRateThreshold * 100).toFixed(1)}%
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Error Details */}
                {activeRun && activeRun.errors.length > 0 && (
                  <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 shadow-lg border-0">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-red-800 dark:text-red-200">
                        <AlertCircle className="h-5 w-5" />
                        Error Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {activeRun.errors.map((error, idx) => (
                          <div key={idx} className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-lg shadow">
                            <div className="flex items-center gap-3">
                              <div className="p-2 bg-red-100 dark:bg-red-900/50 rounded-lg">
                                <AlertCircle className="h-5 w-5 text-red-600 dark:text-red-400" />
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 dark:text-gray-100">
                                  {error.type}
                                </p>
                                <p className="text-sm text-gray-600 dark:text-gray-400">
                                  Last occurred: {error.lastOccurred.toLocaleTimeString()}
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <p className="text-2xl font-bold text-red-600 dark:text-red-400">
                                  {error.count}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">occurrences</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}
              </div>
            </div>
          ) : (
            /* No Experiment Selected */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="relative mb-8">
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="w-32 h-32 bg-gradient-to-br from-purple-400/20 to-pink-600/20 rounded-full animate-pulse"></div>
                  </div>
                  <div className="relative w-20 h-20 bg-gradient-to-br from-purple-500 to-pink-600 rounded-2xl flex items-center justify-center mx-auto shadow-xl">
                    <Beaker className="h-10 w-10 text-white" />
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
                  className="bg-gradient-to-r from-purple-500 to-pink-600 hover:from-purple-600 hover:to-pink-700 shadow-lg"
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