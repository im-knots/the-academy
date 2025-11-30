// src/lib/events/serverEvents.ts
// Server-side event emitter for pushing events to connected SSE clients

export interface ServerEvent {
  type: string
  data: Record<string, unknown>
  timestamp: number
  sessionId?: string
}

type EventCallback = (event: ServerEvent) => void

class ServerEventEmitter {
  private static instance: ServerEventEmitter
  private subscribers: Set<EventCallback> = new Set()
  
  static getInstance(): ServerEventEmitter {
    if (!ServerEventEmitter.instance) {
      ServerEventEmitter.instance = new ServerEventEmitter()
    }
    return ServerEventEmitter.instance
  }

  subscribe(callback: EventCallback): () => void {
    this.subscribers.add(callback)
    console.log(`📡 ServerEvents: New subscriber (total: ${this.subscribers.size})`)
    
    return () => {
      this.subscribers.delete(callback)
      console.log(`📡 ServerEvents: Subscriber removed (total: ${this.subscribers.size})`)
    }
  }

  emit(type: string, data: Record<string, unknown> = {}, sessionId?: string): void {
    const event: ServerEvent = {
      type,
      data,
      timestamp: Date.now(),
      sessionId
    }

    console.log(`📡 ServerEvents: Emitting ${type} to ${this.subscribers.size} subscribers`)
    
    for (const callback of this.subscribers) {
      try {
        callback(event)
      } catch (error) {
        console.error('📡 ServerEvents: Error in subscriber callback:', error)
      }
    }
  }

  getSubscriberCount(): number {
    return this.subscribers.size
  }
}

export const serverEvents = ServerEventEmitter.getInstance()

// Event type constants matching client eventBus
export const SERVER_EVENT_TYPES = {
  // Message events
  MESSAGE_ADDED: 'message:added',
  
  // Participant events
  PARTICIPANT_STATUS_CHANGED: 'participant:status_changed',
  
  // Session events
  SESSION_UPDATED: 'session:updated',
  
  // Conversation events
  CONVERSATION_TURN_COMPLETE: 'conversation:turn_complete',
} as const

