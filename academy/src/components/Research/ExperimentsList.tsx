// src/components/Research/ExperimentsList.tsx - Updated with Internal Pub/Sub Event System
'use client'

import { useEffect, useCallback } from 'react'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { Button } from '@/components/ui/Button'
import { Badge } from '@/components/ui/Badge'
import { ExperimentConfig, ExperimentRun } from '@/types/experiment'
import { Beaker, Plus, Clock, Users, Loader2 } from 'lucide-react'


interface ExperimentsListProps {
  experiments: ExperimentConfig[]
  selectedExperiment: ExperimentConfig | null
  onSelectExperiment: (experiment: ExperimentConfig | null) => void
  onNewExperiment: () => void
  onRefreshExperiments?: () => void // Optional callback to refresh experiments list
  isLoading?: boolean // Optional loading state
}

export function ExperimentsList({ 
  experiments, 
  selectedExperiment, 
  onSelectExperiment,
  onNewExperiment,
  onRefreshExperiments,
  isLoading = false
}: ExperimentsListProps) {

  // EVENT-DRIVEN: Handle experiment events
  const handleExperimentEvent = useCallback(async (payload: any) => {
    console.log('🧪 ExperimentsList: Experiment event received:', payload.data)
    
    // Refresh experiments list when any experiment event occurs
    if (onRefreshExperiments) {
      onRefreshExperiments()
    }
  }, [onRefreshExperiments])

  // EVENT-DRIVEN: Handle experiment deletion
  const handleExperimentDeleted = useCallback(async (payload: any) => {
    console.log('🧪 ExperimentsList: Experiment deleted event received:', payload.data)
    
    // If the currently selected experiment was deleted, clear selection
    if (selectedExperiment?.id === payload.data.experimentId) {
      onSelectExperiment(null)
    }
    
    // Refresh experiments list
    if (onRefreshExperiments) {
      onRefreshExperiments()
    }
  }, [selectedExperiment?.id, onSelectExperiment, onRefreshExperiments])

  // EVENT-DRIVEN: Subscribe to relevant events via internal pub/sub
  useEffect(() => {
    console.log('🧪 ExperimentsList: Setting up internal pub/sub event subscriptions')

    // Experiment events
    const unsubscribeExperimentCreated = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_CREATED, handleExperimentEvent)
    const unsubscribeExperimentUpdated = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_UPDATED, handleExperimentEvent)
    const unsubscribeExperimentDeleted = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_DELETED, handleExperimentDeleted)
    const unsubscribeExperimentExecuted = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_EXECUTED, handleExperimentEvent)
    const unsubscribeExperimentStatusChanged = eventBus.subscribe(EVENT_TYPES.EXPERIMENT_STATUS_CHANGED, handleExperimentEvent)

    return () => {
      console.log('🧪 ExperimentsList: Cleaning up internal pub/sub event subscriptions')
      unsubscribeExperimentCreated()
      unsubscribeExperimentUpdated()
      unsubscribeExperimentDeleted()
      unsubscribeExperimentExecuted()
      unsubscribeExperimentStatusChanged()
    }
  }, [handleExperimentEvent, handleExperimentDeleted])

  // Helper function to safely get participant count
  const getParticipantCount = (exp: ExperimentConfig): number => {
    return exp.participants?.length || exp.config?.participants?.length || 0
  }

  // Helper function to safely get max message count
  const getMaxMessageCount = (exp: ExperimentConfig): number => {
    return exp.maxMessageCount || exp.config?.maxMessageCount || 0
  }

  // Helper function to safely get total sessions
  const getTotalSessions = (exp: ExperimentConfig): number => {
    return exp.totalSessions || exp.config?.totalSessions || 0
  }

  // Helper function to safely format date
  const formatDate = (date: Date | string): string => {
    try {
      const dateObj = date instanceof Date ? date : new Date(date)
      return dateObj.toLocaleDateString()
    } catch (error) {
      return 'Unknown date'
    }
  }

  return (
    <>
      <div className="p-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-gray-900 dark:text-gray-100">Experiments</h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={onNewExperiment}
            className="h-8 px-2"
            disabled={isLoading}
          >
            <Plus className="h-4 w-4 mr-1" />
            New
          </Button>
        </div>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4">
        {isLoading ? (
          <div className="text-center py-8">
            <Loader2 className="h-8 w-8 animate-spin mx-auto mb-3 text-gray-400" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Loading experiments...</p>
          </div>
        ) : experiments.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 bg-gray-100 dark:bg-gray-700 rounded-full flex items-center justify-center mx-auto mb-3">
              <Beaker className="h-6 w-6 text-gray-400" />
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">No experiments yet</p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">Create your first experiment</p>
            <Button
              variant="outline"
              size="sm"
              onClick={onNewExperiment}
              className="text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
            >
              <Plus className="h-4 w-4 mr-1" />
              Create Experiment
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {experiments.map((exp) => {
              const isActive = selectedExperiment?.id === exp.id
              const participantCount = getParticipantCount(exp)
              const maxMessages = getMaxMessageCount(exp)
              const totalSessions = getTotalSessions(exp)
              
              return (
                <button
                  key={exp.id}
                  onClick={() => onSelectExperiment(exp)}
                  className={`w-full text-left p-3 rounded-lg transition-colors ${
                    isActive
                      ? 'bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-700/50 border border-transparent'
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <h3 className={`font-medium text-sm truncate mb-1 ${
                        isActive 
                          ? 'text-blue-900 dark:text-blue-100' 
                          : 'text-gray-900 dark:text-gray-100'
                      }`}>
                        {exp.name || 'Unnamed Experiment'}
                      </h3>
                      <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-1">
                        <span className="flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {participantCount}
                        </span>
                        {maxMessages > 0 && (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {maxMessages} msgs
                          </span>
                        )}
                        {totalSessions > 0 && (
                          <span>
                            {totalSessions} sessions
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-400 dark:text-gray-500">
                        Created {formatDate(exp.createdAt)}
                      </div>
                    </div>
                    {isActive && (
                      <Badge variant="default" className="text-xs ml-2">
                        Active
                      </Badge>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </>
  )
}