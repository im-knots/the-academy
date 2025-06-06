// src/lib/mcp/store-integration.ts
'use client'

import { useChatStore } from '../stores/chatStore'
import { setMCPStoreReference } from './server'
import { MCPClient } from './client'
import { broadcastAcademyUpdate } from '../../app/api/mcp/ws/route'

// Store integration for MCP
export class MCPStoreIntegration {
  private static instance: MCPStoreIntegration
  private mcpClient: MCPClient | null = null
  private isInitialized = false
  private unsubscribeStore: (() => void) | null = null

  private constructor() {}

  static getInstance(): MCPStoreIntegration {
    if (!MCPStoreIntegration.instance) {
      MCPStoreIntegration.instance = new MCPStoreIntegration()
    }
    return MCPStoreIntegration.instance
  }

  async initialize() {
    if (this.isInitialized) return

    try {
      // Set up store reference for server-side access
      const store = useChatStore.getState()
      setMCPStoreReference(store)

      // Initialize MCP client
      this.mcpClient = MCPClient.getInstance()
      await this.mcpClient.initialize()

      // Set up store change listeners
      this.setupStoreListeners()

      this.isInitialized = true
      console.log('MCP Store Integration initialized successfully')

    } catch (error) {
      console.error('Failed to initialize MCP Store Integration:', error)
      throw error
    }
  }

  private setupStoreListeners() {
    // Subscribe to store changes and broadcast them via MCP
    this.unsubscribeStore = useChatStore.subscribe(
      (state) => state,
      (newState, prevState) => {
        this.handleStoreChange(newState, prevState)
      }
    )
  }

  private handleStoreChange(newState: any, prevState: any) {
    if (!this.mcpClient) return

    try {
      // Check for session changes
      if (newState.currentSession?.id !== prevState.currentSession?.id) {
        this.broadcastSessionChange(newState.currentSession)
      }

      // Check for new messages
      if (newState.currentSession && prevState.currentSession &&
          newState.currentSession.messages.length > prevState.currentSession.messages.length) {
        const newMessages = newState.currentSession.messages.slice(prevState.currentSession.messages.length)
        newMessages.forEach(message => this.broadcastMessageAdded(message))
      }

      // Check for participant changes
      if (newState.currentSession && prevState.currentSession &&
          newState.currentSession.participants.length !== prevState.currentSession.participants.length) {
        this.broadcastParticipantChange(newState.currentSession)
      }

      // Check for session status changes
      if (newState.currentSession && prevState.currentSession &&
          newState.currentSession.status !== prevState.currentSession.status) {
        this.broadcastSessionStatusChange(newState.currentSession)
      }

    } catch (error) {
      console.error('Error handling store change in MCP integration:', error)
    }
  }

  private broadcastSessionChange(session: any) {
    if (typeof broadcastAcademyUpdate === 'function') {
      broadcastAcademyUpdate('session_changed', {
        sessionId: session?.id,
        sessionName: session?.name,
        timestamp: new Date().toISOString()
      })
    }
  }

  private broadcastMessageAdded(message: any) {
    if (typeof broadcastAcademyUpdate === 'function') {
      broadcastAcademyUpdate('message_added', {
        sessionId: useChatStore.getState().currentSession?.id,
        message: {
          id: message.id,
          content: message.content,
          participantId: message.participantId,
          participantName: message.participantName,
          participantType: message.participantType,
          timestamp: message.timestamp
        },
        timestamp: new Date().toISOString()
      })
    }
  }

  private broadcastParticipantChange(session: any) {
    if (typeof broadcastAcademyUpdate === 'function') {
      broadcastAcademyUpdate('participants_changed', {
        sessionId: session.id,
        participantCount: session.participants.length,
        participants: session.participants.map((p: any) => ({
          id: p.id,
          name: p.name,
          type: p.type,
          status: p.status
        })),
        timestamp: new Date().toISOString()
      })
    }
  }

  private broadcastSessionStatusChange(session: any) {
    if (typeof broadcastAcademyUpdate === 'function') {
      broadcastAcademyUpdate('session_status_changed', {
        sessionId: session.id,
        status: session.status,
        timestamp: new Date().toISOString()
      })
    }
  }

  // Manual trigger methods for external use
  async triggerResourceUpdate() {
    if (this.mcpClient) {
      await this.mcpClient.refreshResources()
    }
  }

  async triggerAnalysisUpdate(sessionId: string) {
    if (this.mcpClient) {
      try {
        const analysis = await this.mcpClient.analyzeConversation(sessionId)
        
        if (typeof broadcastAcademyUpdate === 'function') {
          broadcastAcademyUpdate('analysis_updated', {
            sessionId,
            analysis,
            timestamp: new Date().toISOString()
          })
        }
      } catch (error) {
        console.error('Failed to trigger analysis update:', error)
      }
    }
  }

  // Cleanup
  destroy() {
    if (this.unsubscribeStore) {
      this.unsubscribeStore()
      this.unsubscribeStore = null
    }

    if (this.mcpClient) {
      this.mcpClient.disconnect()
      this.mcpClient = null
    }

    this.isInitialized = false
  }

  // Getters
  get isReady() {
    return this.isInitialized && this.mcpClient?.isConnected()
  }

  get client() {
    return this.mcpClient
  }
}

// Convenience function for easy initialization
export async function initializeMCPIntegration() {
  try {
    const integration = MCPStoreIntegration.getInstance()
    await integration.initialize()
    return integration
  } catch (error) {
    console.error('Failed to initialize MCP integration:', error)
    throw error
  }
}

// Export singleton instance
export const mcpIntegration = MCPStoreIntegration.getInstance()

// Auto-initialize when in browser environment
if (typeof window !== 'undefined') {
  // Wait for store to be hydrated before initializing MCP
  const checkStoreAndInitialize = () => {
    const store = useChatStore.getState()
    if (store.hasHydrated) {
      initializeMCPIntegration().catch(console.error)
    } else {
      // Check again in 100ms
      setTimeout(checkStoreAndInitialize, 100)
    }
  }

  // Start the initialization check
  setTimeout(checkStoreAndInitialize, 1000) // Give some time for app to load
}