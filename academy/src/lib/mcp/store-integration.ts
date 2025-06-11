// src/lib/mcp/store-integration.ts - Updated for Direct API Integration
'use client'

import { useChatStore } from '../stores/chatStore'
import { setMCPStoreReference } from './server'
import { MCPClient } from './client'
import { mcpAnalysisHandler } from './analysis-handler'

// Store integration for MCP with direct API support
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
      console.log('🔧 MCP Store Integration: Starting initialization with direct API support...')
      
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
      console.log('✅ MCP Store Integration: MCP client ready with direct API support')

      // Initialize analysis handler with existing data
      if (typeof mcpAnalysisHandler !== 'undefined') {
        mcpAnalysisHandler.initializeFromChatStore(store.sessions)
        console.log('✅ MCP Store Integration: Analysis handler initialized')
      } else {
        console.warn('⚠️ MCP Store Integration: Analysis handler not available')
      }

      // Set up store change listeners
      this.setupStoreListeners()
      console.log('✅ MCP Store Integration: Store listeners active')

      // Set up periodic updates
      this.setupPeriodicUpdates()
      console.log('✅ MCP Store Integration: Periodic updates active')

      this.isInitialized = true
      console.log('🎉 MCP Store Integration: Fully initialized with direct API support!')

    } catch (error) {
      console.error('💥 MCP Store Integration: Initialization failed:', error)
      throw error
    }
  }

  private async waitForStoreHydration(): Promise<void> {
    const store = useChatStore.getState()
    
    if (store.hasHydrated) {
      console.log('✅ MCP Store Integration: Store already hydrated')
      return
    }

    console.log('⏳ MCP Store Integration: Waiting for store hydration...')
    
    return new Promise((resolve) => {
      const checkHydration = () => {
        const currentStore = useChatStore.getState()
        if (currentStore.hasHydrated) {
          console.log('✅ MCP Store Integration: Store hydration complete')
          resolve()
        } else {
          setTimeout(checkHydration, 100)
        }
      }
      checkHydration()
    })
  }

  private updateMCPStoreReference(): void {
    try {
      const store = useChatStore.getState()
      setMCPStoreReference(store)
      console.log('🔄 MCP Store Integration: Store reference updated')
    } catch (error) {
      console.error('❌ MCP Store Integration: Failed to update store reference:', error)
    }
  }

  private setupStoreListeners(): void {
    if (this.unsubscribeStore) {
      console.log('🔄 MCP Store Integration: Replacing existing store listener')
      this.unsubscribeStore()
    }

    this.unsubscribeStore = useChatStore.subscribe((newState, prevState) => {
      this.handleStoreChange(newState, prevState)
    })

    console.log('👂 MCP Store Integration: Store listener established')
  }

  private setupPeriodicUpdates(): void {
    if (this.updateInterval) {
      clearInterval(this.updateInterval)
    }

    // Update store reference every 30 seconds to ensure consistency
    this.updateInterval = setInterval(() => {
      this.updateMCPStoreReference()
    }, 30000)

    console.log('⏰ MCP Store Integration: Periodic updates scheduled')
  }

  private handleStoreChange(newState: any, prevState: any): void {
    try {
      console.log('🔄 MCP Store Integration: Store state changed')

      // Update store reference immediately
      this.updateMCPStoreReference()

      // Check for current session changes
      if (newState.currentSession?.id !== prevState.currentSession?.id) {
        console.log(`🔄 MCP Store Integration: Current session changed from ${prevState.currentSession?.id || 'none'} to ${newState.currentSession?.id || 'none'}`)
        
        // Initialize analysis for new session if handler is available
        if (typeof mcpAnalysisHandler !== 'undefined' && newState.currentSession) {
          mcpAnalysisHandler.initializeSession(newState.currentSession.id)
        }
      }

      // Check for message changes in current session
      if (newState.currentSession && prevState.currentSession && 
          newState.currentSession.id === prevState.currentSession.id &&
          newState.currentSession.messages.length !== prevState.currentSession.messages.length) {
        console.log(`🔄 MCP Store Integration: Messages changed from ${prevState.currentSession.messages.length} to ${newState.currentSession.messages.length}`)
        
        // Trigger analysis for new messages if handler is available
        if (typeof mcpAnalysisHandler !== 'undefined') {
          mcpAnalysisHandler.handleNewMessage(newState.currentSession.id, newState.currentSession.messages[newState.currentSession.messages.length - 1])
        }
      }

      // Check for participant changes
      if (newState.currentSession && prevState.currentSession &&
          newState.currentSession.id === prevState.currentSession.id &&
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

  // Test MCP server connectivity
  async testMCPConnection(): Promise<boolean> {
    if (!this.mcpClient) {
      console.warn('⚠️ MCP Store Integration: No MCP client available')
      return false
    }

    try {
      console.log('🔍 MCP Store Integration: Testing MCP connection...')
      const tools = await this.mcpClient.listTools()
      console.log(`✅ MCP Store Integration: Connection test successful - ${tools.length} tools available`)
      return true
    } catch (error) {
      console.error('❌ MCP Store Integration: Connection test failed:', error)
      return false
    }
  }

  // Test direct API functionality
  async testDirectAPI(): Promise<boolean> {
    if (!this.mcpClient) {
      console.warn('⚠️ MCP Store Integration: No MCP client available')
      return false
    }

    try {
      console.log('🔍 MCP Store Integration: Testing direct API...')
      const debugResult = await this.mcpClient.debugStoreViaMCP()
      console.log('✅ MCP Store Integration: Direct API test successful:', debugResult.success)
      return debugResult.success
    } catch (error) {
      console.error('❌ MCP Store Integration: Direct API test failed:', error)
      return false
    }
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

  get hasDirectAPISupport() {
    return true // This version has direct API support
  }

  // Debug method
  debug() {
    console.log('🔍 MCP Store Integration Debug:')
    console.log(`  - Initialized: ${this.isInitialized}`)
    console.log(`  - MCP Client: ${this.mcpClient ? 'present' : 'null'}`)
    console.log(`  - MCP Connected: ${this.mcpClient?.isConnected() || false}`)
    console.log(`  - Store Listener: ${this.unsubscribeStore ? 'active' : 'inactive'}`)
    console.log(`  - Update Interval: ${this.updateInterval ? 'active' : 'inactive'}`)
    console.log(`  - Direct API Support: ${this.hasDirectAPISupport}`)
    
    const store = useChatStore.getState()
    console.log(`  - Sessions in store: ${store.sessions.length}`)
    console.log(`  - Current session: ${store.currentSession?.id || 'none'}`)
    console.log(`  - Store hydrated: ${store.hasHydrated}`)

    if (typeof mcpAnalysisHandler !== 'undefined') {
      mcpAnalysisHandler.debug()
    } else {
      console.log(`  - Analysis Handler: not available`)
    }

    // Test the store reference
    this.updateMCPStoreReference()
  }

  // Enhanced debugging with API tests
  async debugWithTests() {
    this.debug()
    
    console.log('🔍 Running additional tests...')
    
    const connectionTest = await this.testMCPConnection()
    console.log(`  - MCP Connection Test: ${connectionTest ? 'PASS' : 'FAIL'}`)
    
    const apiTest = await this.testDirectAPI()
    console.log(`  - Direct API Test: ${apiTest ? 'PASS' : 'FAIL'}`)
    
    return {
      initialized: this.isInitialized,
      connected: this.mcpClient?.isConnected(),
      connectionTest,
      apiTest,
      directAPISupport: this.hasDirectAPISupport
    }
  }
}

// Convenience function for easy initialization
export async function initializeMCPIntegration() {
  try {
    console.log('🚀 Starting MCP integration initialization with direct API support...')
    const integration = MCPStoreIntegration.getInstance()
    await integration.initialize()
    console.log('🎉 MCP integration ready with direct API support!')
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
      console.log('🔄 Auto-initializing MCP integration with direct API support...')
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