// src/app/page.tsx
'use client'

import { useEffect, useState } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { ChatInterface } from '@/components/Chat/ChatInterface'

export default function Home() {
  const [isInitialized, setIsInitialized] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const mcpClient = MCPClient.getInstance()

  useEffect(() => {
    const initializeApp = async () => {
      try {
        setIsLoading(true)
        console.log('Initializing app...')
        
        // Initialize MCP client if not already initialized
        if (!mcpClient.isConnected()) {
          await mcpClient.initialize()
        }
        
        // Check for existing sessions
        const sessionsResult = await mcpClient.callTool('get_sessions', {})
        
        if (sessionsResult.success) {
          const sessions = sessionsResult.sessions || []
          console.log('Sessions found:', sessions.length)
          
          // Handle initial session creation for brand new users
          if (sessions.length === 0) {
            console.log('No sessions found, creating initial blank session')
            
            // Create a blank session for new users
            const createResult = await mcpClient.createSessionViaMCP(
              "New Session",
              "Start your research dialogue",
              'blank' // template
            )
            
            if (createResult.success && createResult.sessionId) {
              // Switch to the newly created session
              await mcpClient.switchCurrentSessionViaMCP(createResult.sessionId)
              console.log('Initial session created and set as current:', createResult.sessionId)
            }
          } else {
            // For existing users, check if we have a current session
            console.log('Existing sessions found, checking current session')
            
            const currentResult = await mcpClient.callTool('get_current_session_id', {})
            
            if (!currentResult.success || !currentResult.sessionId) {
              // No current session, set the first one as current
              console.log('No current session, setting first session as current')
              await mcpClient.switchCurrentSessionViaMCP(sessions[0].id)
            } else {
              console.log('Current session already set:', currentResult.sessionId)
            }
          }
          
          setIsInitialized(true)
        } else {
          console.error('Failed to get sessions:', sessionsResult.error)
        }
      } catch (error) {
        console.error('Failed to initialize app:', error)
      } finally {
        setIsLoading(false)
      }
    }

    initializeApp()
  }, []) // Only run once on mount

  // Show loading state until initialized
  if (isLoading || !isInitialized) {
    return (
      <main className="h-screen w-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading...</p>
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