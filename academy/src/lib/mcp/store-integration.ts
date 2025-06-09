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
  private updateInterval: NodeJS.Timeout | null = null

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
      
      // Wait for store to be properly hydrated
      await this.waitForStoreHydration()
      
      // Get the current store state
      const store = useChatStore.getState()
      console.log(`🔧 MCP Store Integration: Found ${store.sessions.length} sessions in store`)

      // Set up initial store reference for server-side access
      this.updateMCPStoreReference()
      console.log('✅ MCP Store Integration: Initial store reference set')

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

      // Set up periodic updates to ensure data stays fresh
      this.setupPeriodicUpdates()
      console.log('✅ MCP Store Integration: Periodic updates enabled')

      this.isInitialized = true
      console.log('✅ MCP Store Integration: Initialization complete')

      // Force an immediate resource refresh
      setTimeout(() => {
        this.triggerResourceUpdate()
      }, 1000)

    } catch (error) {
      console.error('❌ MCP Store Integration: Failed to initialize:', error)
      throw error
    }
  }

  private async waitForStoreHydration(maxWait = 10000): Promise<void> {
    const startTime = Date.now()
    
    return new Promise((resolve, reject) => {
      const checkHydration = () => {
        const store = useChatStore.getState()
        
        if (store.hasHydrated) {
          console.log('✅ MCP Store Integration: Store is hydrated')
          resolve()
          return
        }
        
        if (Date.now() - startTime > maxWait) {
          console.warn('⚠️ MCP Store Integration: Store hydration timeout, proceeding anyway')
          resolve()
          return
        }
        
        console.log('⏳ MCP Store Integration: Waiting for store hydration...')
        setTimeout(checkHydration, 100)
      }
      
      checkHydration()
    })
  }

  private updateMCPStoreReference() {
    const store = useChatStore.getState()
    
    // Create a comprehensive store reference
    const storeReference = {
      sessions: store.sessions,
      currentSession: store.currentSession,
      hasHydrated: store.hasHydrated,
      lastUpdate: new Date(),
      // Add debug info
      debug: {
        totalSessions: store.sessions.length,
        currentSessionId: store.currentSession?.id || null,
        totalMessages: store.sessions.reduce((sum, s) => sum + s.messages.length, 0),
        totalParticipants: store.sessions.reduce((sum, s) => sum + s.participants.length, 0)
      }
    }
    
    console.log('🔄 MCP Store Integration: Updating store reference:', storeReference.debug)
    setMCPStoreReference(storeReference)
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
        this.updateMCPStoreReference()

        // Handle specific changes
        this.handleStoreChange(newState, prevState)

        // Trigger resource update in MCP client
        this.triggerResourceUpdate()
      }
    )
  }

  private setupPeriodicUpdates() {
    // Update store reference every 30 seconds to ensure freshness
    this.updateInterval = setInterval(() => {
      if (this.isInitialized) {
        console.log('🔄 MCP Store Integration: Periodic store reference update')
        this.updateMCPStoreReference()
        this.triggerResourceUpdate()
      }
    }, 30000)
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

      // Check for session count changes
      if (newState.sessions.length !== prevState.sessions.length) {
        console.log(`🔄 MCP Store Integration: Session count changed from ${prevState.sessions.length} to ${newState.sessions.length}`)
      }

    } catch (error) {
      console.error('❌ MCP Store Integration: Error handling store change:', error)
    }
  }

  // Manual trigger methods for external use
  async triggerResourceUpdate() {
    if (this.mcpClient && this.mcpClient.isConnected()) {
      try {
        console.log('🔄 MCP Store Integration: Triggering resource update')
        await this.mcpClient.refreshResources()
      } catch (error) {
        console.error('❌ MCP Store Integration: Failed to refresh resources:', error)
      }
    } else {
      console.warn('⚠️ MCP Store Integration: Cannot trigger resource update - MCP client not connected')
    }
  }

  // Force a complete refresh
  async forceRefresh() {
    console.log('🔄 MCP Store Integration: Forcing complete refresh')
    this.updateMCPStoreReference()
    await this.triggerResourceUpdate()
  }

  // Cleanup
  destroy() {
    console.log('🧹 MCP Store Integration: Cleaning up...')
    
    if (this.unsubscribeStore) {
      this.unsubscribeStore()
      this.unsubscribeStore = null
    }

    if (this.updateInterval) {
      clearInterval(this.updateInterval)
      this.updateInterval = null
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
    console.log(`  - Update Interval: ${this.updateInterval ? 'active' : 'inactive'}`)
    
    const store = useChatStore.getState()
    console.log(`  - Sessions in store: ${store.sessions.length}`)
    console.log(`  - Current session: ${store.currentSession?.id || 'none'}`)
    console.log(`  - Store hydrated: ${store.hasHydrated}`)

    mcpAnalysisHandler.debug()

    // Test the store reference
    this.updateMCPStoreReference()
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
  // Initialize after a brief delay to ensure everything is loaded
  setTimeout(async () => {
    try {
      console.log('🔄 Auto-initializing MCP integration...')
      await initializeMCPIntegration()
    } catch (error) {
      console.error('💥 Auto-initialization failed:', error)
      // Retry once after 5 seconds
      setTimeout(async () => {
        try {
          console.log('🔄 Retrying MCP integration initialization...')
          await initializeMCPIntegration()
        } catch (retryError) {
          console.error('💥 Retry failed:', retryError)
        }
      }, 5000)
    }
  }, 1000)
}