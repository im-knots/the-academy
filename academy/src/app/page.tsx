// src/app/page.tsx - Updated with Internal Pub/Sub Event System
'use client'

import { useEffect, useState, useCallback } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'
import { ChatInterface } from '@/components/Chat/ChatInterface'

export default function Home() {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [mcpClient] = useState(() => MCPClient.getInstance())

  // EVENT-DRIVEN: Handle initialization errors or reconnection needs
  const handleConnectionEvent = useCallback(async (payload: any) => {
    console.log('🏠 Home: Connection event received:', payload.data)
    
    // If connection is lost and restored, we might need to re-initialize
    if (payload.type === 'connection_restored' && !isInitialized) {
      console.log('🏠 Home: Connection restored, re-initializing...')
      await initializeApp()
    }
  }, [isInitialized])

  // EVENT-DRIVEN: Handle session events that might affect initialization
  const handleSessionEvent = useCallback(async (payload: any) => {
    console.log('🏠 Home: Session event received during initialization:', payload.data)
    
    // If we're still initializing and sessions are created/updated, we might be done
    if (!isInitialized && payload.data.sessionId) {
      console.log('🏠 Home: Session event during initialization, checking if we can complete setup')
    }
  }, [isInitialized])

  const initializeApp = useCallback(async () => {
    try {
      setIsLoading(true)
      console.log('🏠 Home: Initializing app...')
      
      // Initialize MCP client if not already initialized
      if (!mcpClient.isConnected()) {
        console.log('🏠 Home: MCP client not connected, initializing...')
        await mcpClient.initialize()
      }

      // Check for existing sessions
      console.log('🏠 Home: Checking for existing sessions...')
      const sessionsResult = await mcpClient.callTool('get_sessions', {})
      
      if (sessionsResult.success) {
        const sessions = sessionsResult.sessions || []
        console.log(`🏠 Home: Found ${sessions.length} existing sessions`)

        // Handle initial session creation for brand new users
        if (sessions.length === 0) {
          console.log('🏠 Home: No sessions found, creating initial blank session')
          
          // Create a blank session for new users
          // This will automatically emit SESSION_CREATED event via internal pub/sub
          const createResult = await mcpClient.createSessionViaMCP(
            "New Session",
            "Start your research dialogue",
            'blank' // template
          )

          if (createResult.success && createResult.sessionId) {
            // Switch to the newly created session
            // This will automatically emit SESSION_SWITCHED event via internal pub/sub
            await mcpClient.switchCurrentSessionViaMCP(createResult.sessionId)
            console.log('🏠 Home: Initial session created and set as current:', createResult.sessionId)
          } else {
            throw new Error('Failed to create initial session')
          }
        } else {
          // For existing users, check if we have a current session
          console.log('🏠 Home: Existing sessions found, checking current session')
          const currentResult = await mcpClient.callTool('get_current_session_id', {})
          
          if (!currentResult.success || !currentResult.sessionId) {
            // No current session, set the first one as current
            console.log('🏠 Home: No current session, setting first session as current')
            // This will automatically emit SESSION_SWITCHED event via internal pub/sub
            await mcpClient.switchCurrentSessionViaMCP(sessions[0].id)
          } else {
            console.log('🏠 Home: Current session already set:', currentResult.sessionId)
          }
        }

        console.log('🏠 Home: App initialization completed successfully')
        setIsInitialized(true)
      } else {
        throw new Error(`Failed to get sessions: ${sessionsResult.error}`)
      }
    } catch (error) {
      console.error('🏠 Home: Failed to initialize app:', error)
      // Could implement retry logic here if needed
      setIsInitialized(false)
    } finally {
      setIsLoading(false)
    }
  }, [mcpClient])

  // EVENT-DRIVEN: Subscribe to relevant events via internal pub/sub
  useEffect(() => {
    console.log('🏠 Home: Setting up internal pub/sub event subscriptions')

    // Initial app initialization
    initializeApp()

    // Subscribe to connection-related events (if they exist)
    // This is for future-proofing in case we add connection monitoring
    
    // Subscribe to session events that might affect initialization state
    const unsubscribeSessionCreated = eventBus.subscribe(EVENT_TYPES.SESSION_CREATED, handleSessionEvent)
    const unsubscribeSessionDeleted = eventBus.subscribe(EVENT_TYPES.SESSION_DELETED, handleSessionEvent)
    const unsubscribeSessionSwitched = eventBus.subscribe(EVENT_TYPES.SESSION_SWITCHED, handleSessionEvent)

    return () => {
      console.log('🏠 Home: Cleaning up internal pub/sub event subscriptions')
      unsubscribeSessionCreated()
      unsubscribeSessionDeleted()
      unsubscribeSessionSwitched()
    }
  }, [initializeApp, handleSessionEvent]) // Only run once on mount, but depend on stable functions

  // Show loading state until initialized
  if (isLoading || !isInitialized) {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">
            {isLoading ? 'Loading Academy...' : 'Initializing...'}
          </p>
          {!isInitialized && !isLoading && (
            <button
              onClick={initializeApp}
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Retry Initialization
            </button>
          )}
        </div>
      </main>
    )
  }

  return (
    <main className="h-screen w-screen overflow-hidden">
      <ChatInterface />
    </main>
  )
}