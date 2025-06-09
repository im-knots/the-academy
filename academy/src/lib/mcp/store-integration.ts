// src/lib/mcp/store-integration.ts - Fixed MCP Store Integration
'use client'

import { useChatStore } from '../stores/chatStore'
import { setMCPStoreReference } from './server'
import { MCPClient } from './client'
import { mcpAnalysisHandler } from './analysis-handler'

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
    if (this.isInitialized) {
      console.log('🔧 MCP Store Integration: Already initialized')
      return
    }

    try {
      console.log('🔧 MCP Store Integration: Starting initialization...')
      
      // Get the current store state
      const store = useChatStore.getState()
      console.log(`🔧 MCP Store Integration: Found ${store.sessions.length} sessions in store`)

      // Set up store reference for server-side access
      setMCPStoreReference({
        sessions: store.sessions,
        currentSession: store.currentSession
      })
      console.log('✅ MCP Store Integration: Store reference set')

      // Initialize MCP client
      this.mcpClient = MCPClient.getInstance()
      if (!this.mcpClient.isConnected()) {
        console.log('🔧 MCP Store Integration: Initializing MCP client...')
        await this.mcpClient.initialize()
      }
      console.log('✅ MCP Store Integration: MCP client ready')

      // Initialize analysis handler with existing data
      mcpAnalysisHandler.initializeFromChatStore(store.sessions)
      console.log('✅ MCP Store Integration: Analysis handler initialized')

      // Set up store change listeners
      this.setupStoreListeners()
      console.log('✅ MCP Store Integration: Store listeners set up')

      this.isInitialized = true
      console.log('✅ MCP Store Integration: Initialization complete')

    } catch (error) {
      console.error('❌ MCP Store Integration: Failed to initialize:', error)
      throw error
    }
  }

  private setupStoreListeners() {
    // Subscribe to store changes and update MCP server reference
    this.unsubscribeStore = useChatStore.subscribe(
      (state) => ({
        sessions: state.sessions,
        currentSession: state.currentSession,
        hasHydrated: state.hasHydrated
      }),
      (newState, prevState) => {
        // Only update if store is hydrated to avoid initialization noise
        if (!newState.hasHydrated) return

        console.log('🔄 MCP Store Integration: Store state changed, updating MCP server reference')
        
        // Update MCP server reference with new data
        setMCPStoreReference({
          sessions: newState.sessions,
          currentSession: newState.currentSession
        })

        // Handle specific changes
        this.handleStoreChange(newState, prevState)
      }
    )
  }

  private handleStoreChange(newState: any, prevState: any) {
    try {
      // Check for session changes
      if (newState.currentSession?.id !== prevState.currentSession?.id) {
        console.log(`🔄 MCP Store Integration: Current session changed to ${newState.currentSession?.id}`)
      }

      // Check for new messages
      if (newState.currentSession && prevState.currentSession &&
          newState.currentSession.messages.length > prevState.currentSession.messages.length) {
        const newMessages = newState.currentSession.messages.slice(prevState.currentSession.messages.length)
        console.log(`🔄 MCP Store Integration: ${newMessages.length} new messages added`)
      }

      // Check for participant changes
      if (newState.currentSession && prevState.currentSession &&
          newState.currentSession.participants.length !== prevState.currentSession.participants.length) {
        console.log(`🔄 MCP Store Integration: Participants changed from ${prevState.currentSession.participants.length} to ${newState.currentSession.participants.length}`)
      }

    } catch (error) {
      console.error('❌ MCP Store Integration: Error handling store change:', error)
    }
  }

  // Manual trigger methods for external use
  async triggerResourceUpdate() {
    if (this.mcpClient) {
      console.log('🔄 MCP Store Integration: Triggering resource update')
      await this.mcpClient.refreshResources()
    }
  }

  // Cleanup
  destroy() {
    console.log('🧹 MCP Store Integration: Cleaning up...')
    
    if (this.unsubscribeStore) {
      this.unsubscribeStore()
      this.unsubscribeStore = null
    }

    if (this.mcpClient) {
      this.mcpClient.disconnect()
      this.mcpClient = null
    }

    this.isInitialized = false
    console.log('✅ MCP Store Integration: Cleanup complete')
  }

  // Getters
  get isReady() {
    return this.isInitialized && this.mcpClient?.isConnected()
  }

  get client() {
    return this.mcpClient
  }

  // Debug method
  debug() {
    console.log('🔍 MCP Store Integration Debug:')
    console.log(`  - Initialized: ${this.isInitialized}`)
    console.log(`  - MCP Client: ${this.mcpClient ? 'present' : 'null'}`)
    console.log(`  - MCP Connected: ${this.mcpClient?.isConnected() || false}`)
    console.log(`  - Store Listener: ${this.unsubscribeStore ? 'active' : 'inactive'}`)
    
    const store = useChatStore.getState()
    console.log(`  - Sessions in store: ${store.sessions.length}`)
    console.log(`  - Current session: ${store.currentSession?.id || 'none'}`)
    console.log(`  - Store hydrated: ${store.hasHydrated}`)

    mcpAnalysisHandler.debug()
  }
}

// Convenience function for easy initialization
export async function initializeMCPIntegration() {
  try {
    console.log('🚀 Starting MCP integration initialization...')
    const integration = MCPStoreIntegration.getInstance()
    await integration.initialize()
    console.log('🎉 MCP integration ready!')
    return integration
  } catch (error) {
    console.error('💥 Failed to initialize MCP integration:', error)
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
      console.log('📦 Store is hydrated, initializing MCP integration...')
      initializeMCPIntegration().catch(error => {
        console.error('💥 Auto-initialization failed:', error)
      })
    } else {
      console.log('⏳ Waiting for store to hydrate...')
      // Check again in 100ms
      setTimeout(checkStoreAndInitialize, 100)
    }
  }

  // Start the initialization check after a brief delay
  setTimeout(checkStoreAndInitialize, 500)
}