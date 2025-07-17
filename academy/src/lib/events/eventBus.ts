// src/lib/events/eventBus.ts
'use client'

export interface EventPayload {
  type: string
  data: any
  timestamp: number
  source: 'local'
  podId: string
}

export type EventHandler = (payload: EventPayload) => void | Promise<void>

/**
 * Internal pub/sub event system for Academy pods
 * Handles event-driven updates within a single pod instance
 * Cross-pod coordination happens through the database
 */
export class EventBus {
  private static instance: EventBus
  private subscribers = new Map<string, Set<EventHandler>>()
  private readonly podId: string
  private isDestroyed = false
  
  private constructor() {
    this.podId = `pod-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    console.log(`🚀 EventBus: Initialized for pod ${this.podId}`)
  }
  
  static getInstance(): EventBus {
    if (!EventBus.instance) {
      EventBus.instance = new EventBus()
    }
    return EventBus.instance
  }

  /**
   * Subscribe to events of a specific type
   * @param eventType - The type of event to listen for
   * @param handler - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  subscribe(eventType: string, handler: EventHandler): () => void {
    if (this.isDestroyed) {
      console.warn(`⚠️ EventBus: Cannot subscribe to ${eventType} - EventBus is destroyed`)
      return () => {}
    }

    if (!this.subscribers.has(eventType)) {
      this.subscribers.set(eventType, new Set())
    }
    
    this.subscribers.get(eventType)!.add(handler)
    console.log(`📡 EventBus: Subscribed to ${eventType} (${this.subscribers.get(eventType)!.size} total subscribers)`)
    
    // Return unsubscribe function
    return () => {
      const handlers = this.subscribers.get(eventType)
      if (handlers) {
        handlers.delete(handler)
        console.log(`📡 EventBus: Unsubscribed from ${eventType} (${handlers.size} remaining subscribers)`)
        
        // Clean up empty event type
        if (handlers.size === 0) {
          this.subscribers.delete(eventType)
        }
      }
    }
  }

  /**
   * Emit an event to all subscribers
   * @param eventType - Type of event to emit
   * @param data - Event data payload
   */
  async emit(eventType: string, data: any = {}): Promise<void> {
    if (this.isDestroyed) {
      console.warn(`⚠️ EventBus: Cannot emit ${eventType} - EventBus is destroyed`)
      return
    }

    const payload: EventPayload = {
      type: eventType,
      data,
      timestamp: Date.now(),
      source: 'local',
      podId: this.podId
    }

    const handlers = this.subscribers.get(eventType)
    if (!handlers || handlers.size === 0) {
      console.log(`📡 EventBus: No subscribers for ${eventType}`)
      return
    }

    console.log(`📡 EventBus: Emitting ${eventType} to ${handlers.size} subscribers`)

    // Execute all handlers in parallel with error isolation
    const results = await Promise.allSettled(
      Array.from(handlers).map(async (handler, index) => {
        try {
          await handler(payload)
        } catch (error) {
          console.error(`❌ EventBus: Handler ${index} for ${eventType} failed:`, error)
        }
      })
    )

    // Log any failures
    const failures = results.filter(result => result.status === 'rejected').length
    if (failures > 0) {
      console.warn(`⚠️ EventBus: ${failures}/${handlers.size} handlers failed for ${eventType}`)
    }
  }

  /**
   * Get list of all event types with subscriber counts
   */
  getEventTypes(): { eventType: string; subscriberCount: number }[] {
    return Array.from(this.subscribers.entries()).map(([eventType, handlers]) => ({
      eventType,
      subscriberCount: handlers.size
    }))
  }

  /**
   * Get total number of subscribers across all events
   */
  getTotalSubscribers(): number {
    return Array.from(this.subscribers.values()).reduce((total, handlers) => total + handlers.size, 0)
  }

  /**
   * Remove all subscribers for a specific event type
   */
  clearEventType(eventType: string): void {
    const handlers = this.subscribers.get(eventType)
    if (handlers) {
      const count = handlers.size
      this.subscribers.delete(eventType)
      console.log(`🧹 EventBus: Cleared ${count} subscribers for ${eventType}`)
    }
  }

  /**
   * Remove all subscribers and clean up
   */
  destroy(): void {
    const totalSubscribers = this.getTotalSubscribers()
    this.subscribers.clear()
    this.isDestroyed = true
    console.log(`💥 EventBus: Destroyed - removed ${totalSubscribers} total subscribers`)
  }

  /**
   * Get pod ID for this EventBus instance
   */
  getPodId(): string {
    return this.podId
  }

  /**
   * Check if EventBus is destroyed
   */
  isActive(): boolean {
    return !this.isDestroyed
  }
}

// Pre-defined event types for type safety and documentation
export const EVENT_TYPES = {
  // Session events
  SESSION_CREATED: 'session:created',
  SESSION_UPDATED: 'session:updated', 
  SESSION_DELETED: 'session:deleted',
  SESSION_SWITCHED: 'session:switched',
  SESSION_DUPLICATED: 'session:duplicated',
  SESSION_IMPORTED: 'session:imported',
  SESSIONS_LIST_CHANGED: 'sessions:list_changed',
  
  // Message events
  MESSAGE_SENT: 'message:sent',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  
  // Participant events
  PARTICIPANT_ADDED: 'participant:added',
  PARTICIPANT_REMOVED: 'participant:removed',
  PARTICIPANT_UPDATED: 'participant:updated',
  
  // Conversation events
  CONVERSATION_STARTED: 'conversation:started',
  CONVERSATION_PAUSED: 'conversation:paused',
  CONVERSATION_RESUMED: 'conversation:resumed',
  CONVERSATION_STOPPED: 'conversation:stopped',
  
  // Analysis events
  ANALYSIS_SAVED: 'analysis:saved',
  ANALYSIS_TRIGGERED: 'analysis:triggered',
  ANALYSIS_CLEARED: 'analysis:cleared',
  
  // Experiment events
  EXPERIMENT_CREATED: 'experiment:created',
  EXPERIMENT_UPDATED: 'experiment:updated',
  EXPERIMENT_DELETED: 'experiment:deleted',
  EXPERIMENT_EXECUTED: 'experiment:executed',
  EXPERIMENT_STATUS_CHANGED: 'experiment:status_changed',
  
  // Error events
  API_ERROR_LOGGED: 'error:api_logged',
  API_ERRORS_CLEARED: 'error:api_cleared',
  
  // General data events
  DATA_REFRESHED: 'data:refreshed'
} as const

export type EventType = typeof EVENT_TYPES[keyof typeof EVENT_TYPES]

// Helper function to create type-safe event emitters
export function createEventEmitter(eventBus: EventBus) {
  return {
    // Session events
    sessionCreated: (sessionData: any) => eventBus.emit(EVENT_TYPES.SESSION_CREATED, sessionData),
    sessionUpdated: (sessionData: any) => eventBus.emit(EVENT_TYPES.SESSION_UPDATED, sessionData),
    sessionDeleted: (sessionId: string) => eventBus.emit(EVENT_TYPES.SESSION_DELETED, { sessionId }),
    sessionSwitched: (sessionId: string) => eventBus.emit(EVENT_TYPES.SESSION_SWITCHED, { sessionId }),
    sessionDuplicated: (originalId: string, newSessionData: any) => 
      eventBus.emit(EVENT_TYPES.SESSION_DUPLICATED, { originalId, newSessionData }),
    sessionImported: (sessionData: any) => eventBus.emit(EVENT_TYPES.SESSION_IMPORTED, sessionData),
    sessionsListChanged: () => eventBus.emit(EVENT_TYPES.SESSIONS_LIST_CHANGED),
    
    // Message events
    messageSent: (sessionId: string, messageData: any) => 
      eventBus.emit(EVENT_TYPES.MESSAGE_SENT, { sessionId, messageData }),
    messageUpdated: (sessionId: string, messageData: any) => 
      eventBus.emit(EVENT_TYPES.MESSAGE_UPDATED, { sessionId, messageData }),
    messageDeleted: (sessionId: string, messageId: string) => 
      eventBus.emit(EVENT_TYPES.MESSAGE_DELETED, { sessionId, messageId }),
    
    // Participant events
    participantAdded: (sessionId: string, participantData: any) => 
      eventBus.emit(EVENT_TYPES.PARTICIPANT_ADDED, { sessionId, participantData }),
    participantRemoved: (sessionId: string, participantId: string) => 
      eventBus.emit(EVENT_TYPES.PARTICIPANT_REMOVED, { sessionId, participantId }),
    participantUpdated: (sessionId: string, participantData: any) => 
      eventBus.emit(EVENT_TYPES.PARTICIPANT_UPDATED, { sessionId, participantData }),
    
    // Conversation events
    conversationStarted: (sessionId: string) => 
      eventBus.emit(EVENT_TYPES.CONVERSATION_STARTED, { sessionId }),
    conversationPaused: (sessionId: string) => 
      eventBus.emit(EVENT_TYPES.CONVERSATION_PAUSED, { sessionId }),
    conversationResumed: (sessionId: string) => 
      eventBus.emit(EVENT_TYPES.CONVERSATION_RESUMED, { sessionId }),
    conversationStopped: (sessionId: string) => 
      eventBus.emit(EVENT_TYPES.CONVERSATION_STOPPED, { sessionId }),
    
    // Analysis events
    analysisSaved: (sessionId: string, analysisData: any) => 
      eventBus.emit(EVENT_TYPES.ANALYSIS_SAVED, { sessionId, analysisData }),
    analysisTriggered: (sessionId: string, analysisType: string) => 
      eventBus.emit(EVENT_TYPES.ANALYSIS_TRIGGERED, { sessionId, analysisType }),
    analysisCleared: (sessionId: string) => 
      eventBus.emit(EVENT_TYPES.ANALYSIS_CLEARED, { sessionId }),
    
    // Experiment events
    experimentCreated: (experimentData: any) => 
      eventBus.emit(EVENT_TYPES.EXPERIMENT_CREATED, experimentData),
    experimentUpdated: (experimentData: any) => 
      eventBus.emit(EVENT_TYPES.EXPERIMENT_UPDATED, experimentData),
    experimentDeleted: (experimentId: string) => 
      eventBus.emit(EVENT_TYPES.EXPERIMENT_DELETED, { experimentId }),
    experimentExecuted: (experimentId: string, runData: any) => 
      eventBus.emit(EVENT_TYPES.EXPERIMENT_EXECUTED, { experimentId, runData }),
    experimentStatusChanged: (experimentId: string, status: string, runData: any) => 
      eventBus.emit(EVENT_TYPES.EXPERIMENT_STATUS_CHANGED, { experimentId, status, runData }),
    
    // Error events
    apiErrorLogged: (errorData: any) => eventBus.emit(EVENT_TYPES.API_ERROR_LOGGED, errorData),
    apiErrorsCleared: (sessionId?: string) => 
      eventBus.emit(EVENT_TYPES.API_ERRORS_CLEARED, { sessionId }),
    
    // General events
    dataRefreshed: (dataType: string) => eventBus.emit(EVENT_TYPES.DATA_REFRESHED, { dataType })
  }
}

// Export singleton instance
export const eventBus = EventBus.getInstance()
export const eventEmitter = createEventEmitter(eventBus)