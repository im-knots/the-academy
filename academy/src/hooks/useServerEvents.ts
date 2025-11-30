'use client'

// src/hooks/useServerEvents.ts
// Hook to connect to SSE endpoint and bridge server events to client eventBus

import { useEffect, useRef, useCallback } from 'react'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'

interface UseServerEventsOptions {
  sessionId?: string
  enabled?: boolean
}

export function useServerEvents({ sessionId, enabled = true }: UseServerEventsOptions = {}) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const reconnectAttempts = useRef(0)
  const maxReconnectAttempts = 5
  const baseReconnectDelay = 1000

  const connect = useCallback(() => {
    if (!enabled) return

    // Build URL with optional sessionId filter
    const url = sessionId 
      ? `/api/events?sessionId=${encodeURIComponent(sessionId)}`
      : '/api/events'

    console.log(`📡 SSE Client: Connecting to ${url}`)

    const eventSource = new EventSource(url)
    eventSourceRef.current = eventSource

    eventSource.onopen = () => {
      console.log('📡 SSE Client: Connected')
      reconnectAttempts.current = 0
    }

    eventSource.onmessage = async (event) => {
      try {
        const data = JSON.parse(event.data)
        
        // Handle different event types
        switch (data.type) {
          case 'connected':
            console.log('📡 SSE Client: Connection confirmed')
            break
            
          case 'ping':
            // Keep-alive, no action needed
            break
            
          case 'message:added':
            console.log('📡 SSE Client: Message added event received')
            await eventBus.emit(EVENT_TYPES.MESSAGE_SENT, data.data)
            break
            
          case 'participant:status_changed':
            console.log('📡 SSE Client: Participant status changed event received')
            await eventBus.emit(EVENT_TYPES.PARTICIPANT_UPDATED, data.data)
            break
            
          case 'session:updated':
            console.log('📡 SSE Client: Session updated event received')
            await eventBus.emit(EVENT_TYPES.SESSION_UPDATED, data.data)
            break
            
          case 'conversation:turn_complete':
            console.log('📡 SSE Client: Conversation turn complete event received')
            await eventBus.emit(EVENT_TYPES.SESSION_UPDATED, data.data)
            break
            
          default:
            console.log(`📡 SSE Client: Unknown event type: ${data.type}`)
        }
      } catch (error) {
        console.error('📡 SSE Client: Error processing event:', error)
      }
    }

    eventSource.onerror = (error) => {
      console.error('📡 SSE Client: Connection error:', error)
      eventSource.close()
      eventSourceRef.current = null

      // Attempt reconnection with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = baseReconnectDelay * Math.pow(2, reconnectAttempts.current)
        console.log(`📡 SSE Client: Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current + 1}/${maxReconnectAttempts})`)
        
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectAttempts.current++
          connect()
        }, delay)
      } else {
        console.error('📡 SSE Client: Max reconnection attempts reached')
      }
    }
  }, [enabled, sessionId])

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current)
      reconnectTimeoutRef.current = null
    }
    
    if (eventSourceRef.current) {
      console.log('📡 SSE Client: Disconnecting')
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    connect()
    
    return () => {
      disconnect()
    }
  }, [connect, disconnect])

  return {
    isConnected: eventSourceRef.current?.readyState === EventSource.OPEN,
    reconnect: () => {
      disconnect()
      reconnectAttempts.current = 0
      connect()
    },
    disconnect
  }
}

