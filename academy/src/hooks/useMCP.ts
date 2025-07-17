// src/hooks/useMCP.ts - Updated with Internal Pub/Sub Event System and useSessionMCP
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { eventBus, EVENT_TYPES } from '@/lib/events/eventBus'

interface MCPHookState {
  isConnected: boolean
  isInitialized: boolean
  connectionStatus: 'connected' | 'connecting' | 'disconnected' | 'error'
  error: string | null
  resources: any[]
  tools: any[]
  prompts: any[]
  lastUpdate: Date | null
}

interface MCPHookMethods {
  // Resource methods
  listResources: () => Promise<any[]>
  readResource: (uri: string) => Promise<any>
  refreshResources: () => Promise<void>
  
  // Tool methods
  listTools: () => Promise<any[]>
  callTool: (name: string, args: any) => Promise<any>
  
  // Prompt methods
  listPrompts: () => Promise<any[]>
  getPrompt: (name: string, args?: any) => Promise<any>
  
  // Error tracking methods
  getAPIErrors: (sessionId?: string) => Promise<any>
  clearAPIErrors: (sessionId?: string) => Promise<any>
  
  // Session Management Methods
  createSessionViaMCP: (name: string, description?: string, template?: string, participants?: any[]) => Promise<any>
  deleteSessionViaMCP: (sessionId: string) => Promise<any>
  updateSessionViaMCP: (sessionId: string, name?: string, description?: string, metadata?: any) => Promise<any>
  switchCurrentSessionViaMCP: (sessionId: string) => Promise<any>
  duplicateSessionViaMCP: (sessionId: string, newName?: string, includeMessages?: boolean) => Promise<any>
  importSessionViaMCP: (sessionData: any, name?: string) => Promise<any>
  getSessionTemplates: () => Promise<any[]>
  createSessionFromTemplateViaMCP: (templateId: string, name: string, description?: string, customizations?: any) => Promise<any>
  sendMessageViaMCP: (sessionId: string, content: string, participantId: string, participantName: string, participantType: any) => Promise<any>
  
  // Participant Management Methods
  addParticipantViaMCP: (sessionId: string, name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any) => Promise<any>
  removeParticipantViaMCP: (sessionId: string, participantId: string) => Promise<any>
  updateParticipantViaMCP: (sessionId: string, participantId: string, updates: any) => Promise<any>
  updateParticipantStatusViaMCP: (sessionId: string, participantId: string, status: string) => Promise<any>
  getAvailableModelsViaMCP: (provider?: string) => Promise<any>
  getParticipantConfigViaMCP: (sessionId: string, participantId: string) => Promise<any>
  
  // Conversation Control Methods
  startConversationViaMCP: (sessionId: string, initialPrompt?: string) => Promise<any>
  pauseConversationViaMCP: (sessionId: string) => Promise<any>
  resumeConversationViaMCP: (sessionId: string) => Promise<any>
  stopConversationViaMCP: (sessionId: string) => Promise<any>
  getConversationStatusViaMCP: (sessionId: string) => Promise<any>
  getConversationStatsViaMCP: (sessionId: string) => Promise<any>
  injectPromptViaMCP: (sessionId: string, prompt: string) => Promise<any>
  
  // Message Control Methods
  updateMessageViaMCP: (sessionId: string, messageId: string, updates: any) => Promise<any>
  deleteMessageViaMCP: (sessionId: string, messageId: string) => Promise<any>
  clearMessagesViaMCP: (sessionId: string) => Promise<any>
  injectModeratorPromptViaMCP: (sessionId: string, prompt: string) => Promise<any>
  
  // Export Methods
  exportSessionViaMCP: (sessionId: string, format?: 'json' | 'csv', options?: any) => Promise<any>
  exportAnalysisTimelineViaMCP: (sessionId: string, format?: 'json' | 'csv') => Promise<any>
  getExportPreviewViaMCP: (sessionId: string, format?: 'json' | 'csv') => Promise<any>
  
  // Live Analysis Methods
  triggerLiveAnalysisViaMCP: (sessionId: string, analysisType?: string) => Promise<any>
  setAnalysisProviderViaMCP: (provider: string, settings?: any) => Promise<any>
  getAnalysisProvidersViaMCP: () => Promise<any>
  autoAnalyzeConversationViaMCP: (sessionId: string, enabled: boolean, interval?: number) => Promise<any>
  
  // Analysis Management Methods
  saveAnalysisSnapshotViaMCP: (sessionId: string, analysis: any, analysisType?: string) => Promise<any>
  getAnalysisHistoryViaMCP: (sessionId: string) => Promise<any>
  clearAnalysisHistoryViaMCP: (sessionId: string) => Promise<any>
  analyzeConversationViaMCP: (sessionId: string, analysisType?: string) => Promise<any>
  
  // AI Provider Methods
  callClaudeViaMCP: (message: string, systemPrompt?: string, sessionId?: string, participantId?: string) => Promise<any>
  callOpenAIViaMCP: (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => Promise<any>
  callGrokViaMCP: (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => Promise<any>
  callGeminiViaMCP: (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => Promise<any>
  callOllamaViaMCP: (message: string, systemPrompt?: string, model?: string, ollamaUrl?: string, sessionId?: string, participantId?: string) => Promise<any>
  callDeepseekViaMCP: (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => Promise<any>
  callMistralViaMCP: (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => Promise<any>
  
  // Experiment Methods
  createExperimentViaMCP: (config: any) => Promise<any>
  getExperimentsViaMCP: () => Promise<any>
  getExperimentViaMCP: (experimentId: string) => Promise<any>
  updateExperimentViaMCP: (experimentId: string, updates: any) => Promise<any>
  deleteExperimentViaMCP: (experimentId: string) => Promise<any>
  executeExperimentViaMCP: (experimentId: string, experimentConfig: any) => Promise<any>
  getExperimentStatusViaMCP: (experimentId: string) => Promise<any>
  pauseExperimentViaMCP: (experimentId: string) => Promise<any>
  resumeExperimentViaMCP: (experimentId: string) => Promise<any>
  stopExperimentViaMCP: (experimentId: string) => Promise<any>
  getExperimentResultsViaMCP: (experimentId: string) => Promise<any>
  
  // Debug Methods
  debugStoreViaMCP: () => Promise<any>
  
  // Utility methods
  syncStateWithClient: () => Promise<void>
  reconnect: () => Promise<void>
  disconnect: () => void
}

type MCPHook = MCPHookState & MCPHookMethods

export function useMCP(): MCPHook {
  const [state, setState] = useState<MCPHookState>({
    isConnected: false,
    isInitialized: false,
    connectionStatus: 'disconnected',
    error: null,
    resources: [],
    tools: [],
    prompts: [],
    lastUpdate: null
  })

  const clientRef = useRef<MCPClient | null>(null)

  // ========================================
  // EVENT-DRIVEN DATA REFRESH FUNCTIONS
  // ========================================

  const refreshResources = useCallback(async () => {
    if (!clientRef.current) return
    
    try {
      const resources = await clientRef.current.listResources()
      setState(prev => ({ ...prev, resources, lastUpdate: new Date() }))
      console.log(`📄 useMCP: Refreshed ${resources.length} resources`)
    } catch (error) {
      console.warn('⚠️ useMCP: Failed to refresh resources:', error)
    }
  }, [])

  const refreshTools = useCallback(async () => {
    if (!clientRef.current) return
    
    try {
      const tools = await clientRef.current.listTools()
      setState(prev => ({ ...prev, tools, lastUpdate: new Date() }))
      console.log(`🔧 useMCP: Refreshed ${tools.length} tools`)
    } catch (error) {
      console.warn('⚠️ useMCP: Failed to refresh tools:', error)
    }
  }, [])

  const refreshPrompts = useCallback(async () => {
    if (!clientRef.current) return
    
    try {
      const prompts = await clientRef.current.listPrompts()
      setState(prev => ({ ...prev, prompts, lastUpdate: new Date() }))
      console.log(`💭 useMCP: Refreshed ${prompts.length} prompts`)
    } catch (error) {
      console.warn('⚠️ useMCP: Failed to refresh prompts:', error)
    }
  }, [])

  const handleGeneralDataRefresh = useCallback(async () => {
    console.log('🔄 useMCP: Handling general data refresh')
    await Promise.allSettled([
      refreshResources(),
      refreshTools(),
      refreshPrompts()
    ])
  }, [refreshResources, refreshTools, refreshPrompts])

  // ========================================
  // EVENT SUBSCRIPTIONS SETUP
  // ========================================

  useEffect(() => {
    console.log('📡 useMCP: Setting up event subscriptions')

    // Subscribe to general data refresh events
    const unsubscribeDataRefresh = eventBus.subscribe(EVENT_TYPES.DATA_REFRESHED, handleGeneralDataRefresh)

    // Subscribe to specific events that might affect our cached data
    const unsubscribeSessionCreated = eventBus.subscribe(EVENT_TYPES.SESSION_CREATED, handleGeneralDataRefresh)
    const unsubscribeSessionDeleted = eventBus.subscribe(EVENT_TYPES.SESSION_DELETED, handleGeneralDataRefresh)

    return () => {
      console.log('📡 useMCP: Cleaning up event subscriptions')
      unsubscribeDataRefresh()
      unsubscribeSessionCreated()
      unsubscribeSessionDeleted()
    }
  }, [handleGeneralDataRefresh])

  // ========================================
  // CORE CONNECTION MANAGEMENT
  // ========================================

  const syncStateWithClient = useCallback(async () => {
    if (!clientRef.current) {
      setState(prev => ({
        ...prev,
        isConnected: false,
        isInitialized: false,
        connectionStatus: 'disconnected'
      }))
      return
    }

    try {
      // Test actual connection with a simple request
      await clientRef.current.sendRequest('list_tools', {})
      
      // If we get here, it's connected
      setState(prev => ({
        ...prev,
        isConnected: true,
        isInitialized: true,
        connectionStatus: 'connected',
        error: null,
        lastUpdate: new Date()
      }))
      
      console.log('✅ useMCP: State synced - MCP is connected!')
    } catch (error) {
      setState(prev => ({
        ...prev,
        isConnected: false,
        isInitialized: false,
        connectionStatus: 'error',
        error: 'Connection test failed',
        lastUpdate: new Date()
      }))
      console.error('❌ useMCP: Connection test failed:', error)
    }
  }, [])

  const initializeConnection = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, connectionStatus: 'connecting', error: null }))
      
      console.log('🔧 useMCP: Initializing MCP client...')
      
      // Get the singleton instance
      clientRef.current = MCPClient.getInstance()
      
      // Check actual connection status
      let actuallyConnected = false
      try {
        // Try to make a simple call to test if it's really connected
        await clientRef.current.sendRequest('list_tools', {})
        actuallyConnected = true
        console.log('✅ useMCP: MCP client is already connected!')
      } catch (error) {
        console.log('🔧 useMCP: MCP client needs initialization...')
        await clientRef.current.initialize()
        actuallyConnected = true
        console.log('✅ useMCP: MCP client initialized successfully')
      }
      
      // Update state to reflect actual connection
      setState(prev => ({
        ...prev,
        isConnected: actuallyConnected,
        isInitialized: actuallyConnected,
        connectionStatus: actuallyConnected ? 'connected' : 'error',
        lastUpdate: new Date()
      }))

      // Load initial data if connected
      if (actuallyConnected) {
        setTimeout(async () => {
          await handleGeneralDataRefresh()
        }, 100)
      }
      
    } catch (error) {
      console.error('❌ useMCP: Failed to initialize MCP client:', error)
      setState(prev => ({
        ...prev,
        isConnected: false,
        isInitialized: false,
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Unknown initialization error',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [handleGeneralDataRefresh])

  const reconnect = useCallback(async () => {
    console.log('🔄 useMCP: Reconnecting and syncing state...')
    setState(prev => ({ 
      ...prev, 
      connectionStatus: 'connecting',
      error: null,
      tools: [],
      resources: [],
      prompts: []
    }))
    
    try {
      if (clientRef.current) {
        clientRef.current = null // Reset client
      }
      await initializeConnection()
      await syncStateWithClient()
    } catch (error) {
      console.error('❌ useMCP: Reconnection failed:', error)
      throw error
    }
  }, [initializeConnection, syncStateWithClient])

  const disconnect = useCallback(() => {
    console.log('🔌 useMCP: Disconnecting...')
    clientRef.current = null
    setState({
      isConnected: false,
      isInitialized: false,
      connectionStatus: 'disconnected',
      error: null,
      resources: [],
      tools: [],
      prompts: [],
      lastUpdate: new Date()
    })
  }, [])

  useEffect(() => {
    initializeConnection().catch(error => {
      console.error('useMCP initialization error:', error)
    })
  }, [initializeConnection])

  // ========================================
  // BASIC MCP OPERATIONS
  // ========================================

  const listResources = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const resources = await clientRef.current.listResources()
      setState(prev => ({ ...prev, resources, lastUpdate: new Date() }))
      return resources
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to list resources',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const readResource = useCallback(async (uri: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    return await clientRef.current.readResource(uri)
  }, [])

  const refreshResourcesManual = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      await clientRef.current.refreshResources()
      await listResources() // Refresh local state
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to refresh resources',
        lastUpdate: new Date()
      }))
    }
  }, [listResources])

  const listTools = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    const tools = await clientRef.current.listTools()
    setState(prev => ({ ...prev, tools, lastUpdate: new Date() }))
    return tools
  }, [])

  const callTool = useCallback(async (name: string, args: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      // The MCP client will automatically emit events after successful operations
      const result = await clientRef.current.callTool(name, args)
      return result
    } catch (error) {
      console.error(`Failed to call tool ${name}:`, error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Tool execution failed',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const listPrompts = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    const prompts = await clientRef.current.listPrompts()
    setState(prev => ({ ...prev, prompts, lastUpdate: new Date() }))
    return prompts
  }, [])

  const getPrompt = useCallback(async (name: string, args?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    return await clientRef.current.getPrompt(name, args)
  }, [])

  // ========================================
  // ERROR TRACKING METHODS
  // ========================================

  const getAPIErrors = useCallback(async (sessionId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🔍 useMCP: Getting API errors${sessionId ? ` for session ${sessionId}` : ''}`)
    
    try {
      const result = await clientRef.current.getAPIErrors(sessionId)
      return result
    } catch (error) {
      console.error('Failed to get API errors via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get API errors',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const clearAPIErrors = useCallback(async (sessionId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🧹 useMCP: Clearing API errors${sessionId ? ` for session ${sessionId}` : ''}`)
    
    try {
      const result = await clientRef.current.clearAPIErrors(sessionId)
      return result
    } catch (error) {
      console.error('Failed to clear API errors via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to clear API errors',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // SESSION MANAGEMENT METHODS
  // ========================================

  const createSessionViaMCP = useCallback(async (name: string, description?: string, template?: string, participants?: any[]) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🆕 useMCP: Creating session via MCP: ${name}`)
    
    try {
      const result = await clientRef.current.createSessionViaMCP(name, description, template, participants)
      return result
    } catch (error) {
      console.error('Failed to create session via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create session',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const deleteSessionViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🗑️ useMCP: Deleting session via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.deleteSessionViaMCP(sessionId)
      return result
    } catch (error) {
      console.error('Failed to delete session via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to delete session',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const updateSessionViaMCP = useCallback(async (sessionId: string, name?: string, description?: string, metadata?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`✏️ useMCP: Updating session via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.updateSessionViaMCP(sessionId, name, description, metadata)
      return result
    } catch (error) {
      console.error('Failed to update session via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to update session',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const switchCurrentSessionViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🔄 useMCP: Switching current session via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.switchCurrentSessionViaMCP(sessionId)
      return result
    } catch (error) {
      console.error('Failed to switch current session via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to switch session',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const duplicateSessionViaMCP = useCallback(async (sessionId: string, newName?: string, includeMessages: boolean = false) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`📋 useMCP: Duplicating session via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.duplicateSessionViaMCP(sessionId, newName, includeMessages)
      return result
    } catch (error) {
      console.error('Failed to duplicate session via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to duplicate session',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const importSessionViaMCP = useCallback(async (sessionData: any, name?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`📥 useMCP: Importing session via MCP`)
    
    try {
      const result = await clientRef.current.importSessionViaMCP(sessionData, name)
      return result
    } catch (error) {
      console.error('Failed to import session via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to import session',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getSessionTemplates = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const templates = await clientRef.current.getSessionTemplates()
      return templates
    } catch (error) {
      console.error('Failed to get session templates via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get session templates',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const createSessionFromTemplateViaMCP = useCallback(async (templateId: string, name: string, description?: string, customizations?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`📋 useMCP: Creating session from template via MCP: ${templateId}`)
    
    try {
      const result = await clientRef.current.createSessionFromTemplateViaMCP(templateId, name, description, customizations)
      return result
    } catch (error) {
      console.error('Failed to create session from template via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create session from template',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const sendMessageViaMCP = useCallback(async (sessionId: string, content: string, participantId: string, participantName: string, participantType: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`💬 useMCP: Sending message via MCP to session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.sendMessageViaMCP(sessionId, content, participantId, participantName, participantType)
      return result
    } catch (error) {
      console.error('Failed to send message via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to send message',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // PARTICIPANT MANAGEMENT METHODS
  // ========================================

  const addParticipantViaMCP = useCallback(async (sessionId: string, name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`👤 useMCP: Adding participant via MCP to session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.addParticipantViaMCP(sessionId, name, type, provider, model, settings, characteristics)
      return result
    } catch (error) {
      console.error('Failed to add participant via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to add participant',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const removeParticipantViaMCP = useCallback(async (sessionId: string, participantId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`❌ useMCP: Removing participant via MCP from session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.removeParticipantViaMCP(sessionId, participantId)
      return result
    } catch (error) {
      console.error('Failed to remove participant via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to remove participant',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const updateParticipantViaMCP = useCallback(async (sessionId: string, participantId: string, updates: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`✏️ useMCP: Updating participant via MCP: ${participantId}`)
    
    try {
      const result = await clientRef.current.updateParticipantViaMCP(sessionId, participantId, updates)
      return result
    } catch (error) {
      console.error('Failed to update participant via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to update participant',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const updateParticipantStatusViaMCP = useCallback(async (sessionId: string, participantId: string, status: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🔄 useMCP: Updating participant status via MCP: ${participantId}`)
    
    try {
      const result = await clientRef.current.updateParticipantStatusViaMCP(sessionId, participantId, status)
      return result
    } catch (error) {
      console.error('Failed to update participant status via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to update participant status',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getAvailableModelsViaMCP = useCallback(async (provider?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const models = await clientRef.current.listAvailableModels()
      return provider ? { [provider]: (models as any)[provider] || [] } : models
    } catch (error) {
      console.error('Failed to get available models via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get available models',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getParticipantConfigViaMCP = useCallback(async (sessionId: string, participantId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const config = await clientRef.current.getParticipantConfig(sessionId, participantId)
      return config
    } catch (error) {
      console.error('Failed to get participant config via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get participant config',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // CONVERSATION CONTROL METHODS
  // ========================================

  const startConversationViaMCP = useCallback(async (sessionId: string, initialPrompt?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`▶️ useMCP: Starting conversation via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.startConversationViaMCP(sessionId, initialPrompt)
      return result
    } catch (error) {
      console.error('Failed to start conversation via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to start conversation',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const pauseConversationViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`⏸️ useMCP: Pausing conversation via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.pauseConversationViaMCP(sessionId)
      return result
    } catch (error) {
      console.error('Failed to pause conversation via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to pause conversation',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const resumeConversationViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`▶️ useMCP: Resuming conversation via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.resumeConversationViaMCP(sessionId)
      return result
    } catch (error) {
      console.error('Failed to resume conversation via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to resume conversation',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const stopConversationViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`⏹️ useMCP: Stopping conversation via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.stopConversationViaMCP(sessionId)
      return result
    } catch (error) {
      console.error('Failed to stop conversation via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to stop conversation',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getConversationStatusViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const status = await clientRef.current.getConversationStatusViaMCP(sessionId)
      return status
    } catch (error) {
      console.error('Failed to get conversation status via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get conversation status',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getConversationStatsViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const stats = await clientRef.current.getConversationStatsViaMCP(sessionId)
      return stats
    } catch (error) {
      console.error('Failed to get conversation stats via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get conversation stats',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const injectPromptViaMCP = useCallback(async (sessionId: string, prompt: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`💉 useMCP: Injecting prompt via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.injectPromptViaMCP(sessionId, prompt)
      return result
    } catch (error) {
      console.error('Failed to inject prompt via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to inject prompt',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // MESSAGE CONTROL METHODS
  // ========================================

  const updateMessageViaMCP = useCallback(async (sessionId: string, messageId: string, updates: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`✏️ useMCP: Updating message via MCP: ${messageId}`)
    
    try {
      const result = await clientRef.current.updateMessageViaMCP(sessionId, messageId, updates)
      return result
    } catch (error) {
      console.error('Failed to update message via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to update message',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const deleteMessageViaMCP = useCallback(async (sessionId: string, messageId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🗑️ useMCP: Deleting message via MCP: ${messageId}`)
    
    try {
      const result = await clientRef.current.deleteMessageViaMCP(sessionId, messageId)
      return result
    } catch (error) {
      console.error('Failed to delete message via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to delete message',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const clearMessagesViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🧹 useMCP: Clearing messages via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.clearMessagesViaMCP(sessionId)
      return result
    } catch (error) {
      console.error('Failed to clear messages via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to clear messages',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const injectModeratorPromptViaMCP = useCallback(async (sessionId: string, prompt: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`👤 useMCP: Injecting moderator prompt via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.injectModeratorPromptViaMCP(sessionId, prompt)
      return result
    } catch (error) {
      console.error('Failed to inject moderator prompt via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to inject moderator prompt',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // EXPORT METHODS
  // ========================================

  const exportSessionViaMCP = useCallback(async (sessionId: string, format: 'json' | 'csv' = 'json', options?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`📤 useMCP: Exporting session via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.exportSessionViaMCP(sessionId, format, options)
      return result
    } catch (error) {
      console.error('Failed to export session via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to export session',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const exportAnalysisTimelineViaMCP = useCallback(async (sessionId: string, format: 'json' | 'csv' = 'json') => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`📊 useMCP: Exporting analysis timeline via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.exportAnalysisTimelineViaMCP(sessionId, format)
      return result
    } catch (error) {
      console.error('Failed to export analysis timeline via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to export analysis timeline',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getExportPreviewViaMCP = useCallback(async (sessionId: string, format: 'json' | 'csv' = 'json') => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const preview = await clientRef.current.getExportPreviewViaMCP(sessionId, format)
      return preview
    } catch (error) {
      console.error('Failed to get export preview via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get export preview',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // LIVE ANALYSIS METHODS
  // ========================================

  const triggerLiveAnalysisViaMCP = useCallback(async (sessionId: string, analysisType?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🔍 useMCP: Triggering live analysis via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.triggerLiveAnalysisViaMCP(sessionId, analysisType)
      return result
    } catch (error) {
      console.error('Failed to trigger live analysis via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to trigger live analysis',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const setAnalysisProviderViaMCP = useCallback(async (provider: string, settings?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🔧 useMCP: Setting analysis provider via MCP: ${provider}`)
    
    try {
      const result = await clientRef.current.setAnalysisProviderViaMCP(provider, settings)
      return result
    } catch (error) {
      console.error('Failed to set analysis provider via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to set analysis provider',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getAnalysisProvidersViaMCP = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const providers = await clientRef.current.getAnalysisProvidersViaMCP()
      return providers
    } catch (error) {
      console.error('Failed to get analysis providers via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get analysis providers',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const autoAnalyzeConversationViaMCP = useCallback(async (sessionId: string, enabled: boolean, interval?: number) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🤖 useMCP: Setting auto-analysis via MCP: ${sessionId} -> ${enabled}`)
    
    try {
      const result = await clientRef.current.autoAnalyzeConversationViaMCP(sessionId, enabled, interval)
      return result
    } catch (error) {
      console.error('Failed to set auto-analysis via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to set auto-analysis',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // ANALYSIS MANAGEMENT METHODS
  // ========================================

  const saveAnalysisSnapshotViaMCP = useCallback(async (sessionId: string, analysis: any, analysisType?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.saveAnalysisSnapshotViaMCP(sessionId, analysis, analysisType)
      return result
    } catch (error) {
      console.error('Failed to save analysis snapshot via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to save analysis snapshot',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getAnalysisHistoryViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.getAnalysisHistoryViaMCP(sessionId)
      return result
    } catch (error) {
      console.error('Failed to get analysis history via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get analysis history',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const clearAnalysisHistoryViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.clearAnalysisHistoryViaMCP(sessionId)
      return result
    } catch (error) {
      console.error('Failed to clear analysis history via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to clear analysis history',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const analyzeConversationViaMCP = useCallback(async (sessionId: string, analysisType: string = 'full') => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.analyzeConversationViaMCP(sessionId, analysisType)
      return result
    } catch (error) {
      console.error('Failed to analyze conversation via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to analyze conversation',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // AI PROVIDER METHODS
  // ========================================

  const callClaudeViaMCP = useCallback(async (message: string, systemPrompt?: string, sessionId?: string, participantId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.callClaudeViaMCP(message, systemPrompt, sessionId, participantId)
      return result
    } catch (error) {
      console.error('Failed to call Claude via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to call Claude',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const callOpenAIViaMCP = useCallback(async (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.callOpenAIViaMCP(message, systemPrompt, model, sessionId, participantId)
      return result
    } catch (error) {
      console.error('Failed to call OpenAI via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to call OpenAI',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const callGrokViaMCP = useCallback(async (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.callGrokViaMCP(message, systemPrompt, model, sessionId, participantId)
      return result
    } catch (error) {
      console.error('Failed to call Grok via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to call Grok',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const callGeminiViaMCP = useCallback(async (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.callGeminiViaMCP(message, systemPrompt, model, sessionId, participantId)
      return result
    } catch (error) {
      console.error('Failed to call Gemini via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to call Gemini',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const callOllamaViaMCP = useCallback(async (message: string, systemPrompt?: string, model?: string, ollamaUrl?: string, sessionId?: string, participantId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.callOllamaViaMCP(message, systemPrompt, model, ollamaUrl, sessionId, participantId)
      return result
    } catch (error) {
      console.error('Failed to call Ollama via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to call Ollama',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const callDeepseekViaMCP = useCallback(async (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.callDeepseekViaMCP(message, systemPrompt, model, sessionId, participantId)
      return result
    } catch (error) {
      console.error('Failed to call Deepseek via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to call Deepseek',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const callMistralViaMCP = useCallback(async (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.callMistralViaMCP(message, systemPrompt, model, sessionId, participantId)
      return result
    } catch (error) {
      console.error('Failed to call Mistral via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to call Mistral',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // EXPERIMENT MANAGEMENT METHODS
  // ========================================

  const createExperimentViaMCP = useCallback(async (config: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🧪 useMCP: Creating experiment via MCP`)
    
    try {
      const result = await clientRef.current.createExperimentViaMCP(config)
      return result
    } catch (error) {
      console.error('Failed to create experiment via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to create experiment',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getExperimentsViaMCP = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.getExperimentsViaMCP()
      return result
    } catch (error) {
      console.error('Failed to get experiments via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get experiments',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getExperimentViaMCP = useCallback(async (experimentId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.getExperimentViaMCP(experimentId)
      return result
    } catch (error) {
      console.error('Failed to get experiment via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get experiment',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const updateExperimentViaMCP = useCallback(async (experimentId: string, updates: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`✏️ useMCP: Updating experiment via MCP: ${experimentId}`)
    
    try {
      const result = await clientRef.current.updateExperimentViaMCP(experimentId, updates)
      return result
    } catch (error) {
      console.error('Failed to update experiment via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to update experiment',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const deleteExperimentViaMCP = useCallback(async (experimentId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🗑️ useMCP: Deleting experiment via MCP: ${experimentId}`)
    
    try {
      const result = await clientRef.current.deleteExperimentViaMCP(experimentId)
      return result
    } catch (error) {
      console.error('Failed to delete experiment via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to delete experiment',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const executeExperimentViaMCP = useCallback(async (experimentId: string, experimentConfig: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🚀 useMCP: Executing experiment via MCP: ${experimentId}`)
    
    try {
      const result = await clientRef.current.executeExperimentViaMCP(experimentId, experimentConfig)
      return result
    } catch (error) {
      console.error('Failed to execute experiment via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to execute experiment',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getExperimentStatusViaMCP = useCallback(async (experimentId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const status = await clientRef.current.getExperimentStatusViaMCP(experimentId)
      return status
    } catch (error) {
      console.error('Failed to get experiment status via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get experiment status',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const pauseExperimentViaMCP = useCallback(async (experimentId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`⏸️ useMCP: Pausing experiment via MCP: ${experimentId}`)
    
    try {
      const result = await clientRef.current.pauseExperimentViaMCP(experimentId)
      return result
    } catch (error) {
      console.error('Failed to pause experiment via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to pause experiment',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const resumeExperimentViaMCP = useCallback(async (experimentId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`▶️ useMCP: Resuming experiment via MCP: ${experimentId}`)
    
    try {
      const result = await clientRef.current.resumeExperimentViaMCP(experimentId)
      return result
    } catch (error) {
      console.error('Failed to resume experiment via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to resume experiment',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const stopExperimentViaMCP = useCallback(async (experimentId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`⏹️ useMCP: Stopping experiment via MCP: ${experimentId}`)
    
    try {
      const result = await clientRef.current.stopExperimentViaMCP(experimentId)
      return result
    } catch (error) {
      console.error('Failed to stop experiment via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to stop experiment',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  const getExperimentResultsViaMCP = useCallback(async (experimentId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const results = await clientRef.current.getExperimentResultsViaMCP(experimentId)
      return results
    } catch (error) {
      console.error('Failed to get experiment results via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to get experiment results',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // DEBUG METHODS
  // ========================================

  const debugStoreViaMCP = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.debugStoreViaMCP()
      return result
    } catch (error) {
      console.error('Failed to debug store via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to debug store',
        lastUpdate: new Date()
      }))
      throw error
    }
  }, [])

  // ========================================
  // RETURN ALL METHODS AND STATE
  // ========================================

  return {
    ...state,
    
    // Resource methods
    listResources,
    readResource,
    refreshResources: refreshResourcesManual,
    
    // Tool methods
    listTools,
    callTool,
    
    // Prompt methods
    listPrompts,
    getPrompt,

    // Error tracking methods
    getAPIErrors,
    clearAPIErrors,
    
    // Session Management Methods
    createSessionViaMCP,
    deleteSessionViaMCP,
    updateSessionViaMCP,
    switchCurrentSessionViaMCP,
    duplicateSessionViaMCP,
    importSessionViaMCP,
    getSessionTemplates,
    createSessionFromTemplateViaMCP,
    sendMessageViaMCP,
    
    // Participant Management Methods
    addParticipantViaMCP,
    removeParticipantViaMCP,
    updateParticipantViaMCP,
    updateParticipantStatusViaMCP,
    getAvailableModelsViaMCP,
    getParticipantConfigViaMCP,
    
    // Conversation Control Methods
    startConversationViaMCP,
    pauseConversationViaMCP,
    resumeConversationViaMCP,
    stopConversationViaMCP,
    getConversationStatusViaMCP,
    getConversationStatsViaMCP,
    injectPromptViaMCP,
    
    // Message Control Methods
    updateMessageViaMCP,
    deleteMessageViaMCP,
    clearMessagesViaMCP,
    injectModeratorPromptViaMCP,
    
    // Export Methods
    exportSessionViaMCP,
    exportAnalysisTimelineViaMCP,
    getExportPreviewViaMCP,
    
    // Live Analysis Methods
    triggerLiveAnalysisViaMCP,
    setAnalysisProviderViaMCP,
    getAnalysisProvidersViaMCP,
    autoAnalyzeConversationViaMCP,
    
    // Analysis Management
    saveAnalysisSnapshotViaMCP,
    getAnalysisHistoryViaMCP,
    clearAnalysisHistoryViaMCP,
    analyzeConversationViaMCP,
    
    // AI Provider Methods
    callClaudeViaMCP,
    callOpenAIViaMCP,
    callGrokViaMCP,
    callGeminiViaMCP,
    callOllamaViaMCP,
    callDeepseekViaMCP,
    callMistralViaMCP,

    // Experiment Methods
    createExperimentViaMCP,
    getExperimentsViaMCP,
    getExperimentViaMCP,
    updateExperimentViaMCP,
    deleteExperimentViaMCP,
    executeExperimentViaMCP,
    getExperimentStatusViaMCP,
    pauseExperimentViaMCP,
    resumeExperimentViaMCP,
    stopExperimentViaMCP,
    getExperimentResultsViaMCP,
    
    // Debug Methods
    debugStoreViaMCP,
    
    // Utility methods
    syncStateWithClient,
    reconnect,
    disconnect
  }
}

// ========================================
// SESSION-SPECIFIC HOOK
// ========================================

interface SessionMCPHookState {
  sessionId: string | null
  sessionData: any | null
  isLoadingSession: boolean
  sessionError: string | null
  lastSessionUpdate: Date | null
}

interface SessionMCPHookMethods {
  // Session-specific operations
  getSession: () => Promise<any>
  refreshSession: () => Promise<void>
  analyzeConversation: (analysisType?: string) => Promise<any>
  
  // Session-scoped message operations
  sendMessage: (content: string, participantId: string, participantName: string, participantType: any) => Promise<any>
  updateMessage: (messageId: string, updates: any) => Promise<any>
  deleteMessage: (messageId: string) => Promise<any>
  clearMessages: () => Promise<any>
  
  // Session-scoped participant operations
  addParticipant: (name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any) => Promise<any>
  removeParticipant: (participantId: string) => Promise<any>
  updateParticipant: (participantId: string, updates: any) => Promise<any>
  updateParticipantStatus: (participantId: string, status: string) => Promise<any>
  
  // Session-scoped conversation control
  startConversation: (initialPrompt?: string) => Promise<any>
  pauseConversation: () => Promise<any>
  resumeConversation: () => Promise<any>
  stopConversation: () => Promise<any>
  getConversationStatus: () => Promise<any>
  getConversationStats: () => Promise<any>
  injectPrompt: (prompt: string) => Promise<any>
  injectModeratorPrompt: (prompt: string) => Promise<any>
  
  // Session-scoped analysis operations
  triggerLiveAnalysis: (analysisType?: string) => Promise<any>
  saveAnalysisSnapshot: (analysis: any, analysisType?: string) => Promise<any>
  getAnalysisHistory: () => Promise<any>
  clearAnalysisHistory: () => Promise<any>
  
  // Session-scoped export operations
  exportSession: (format?: 'json' | 'csv', options?: any) => Promise<any>
  exportAnalysisTimeline: (format?: 'json' | 'csv') => Promise<any>
  getExportPreview: (format?: 'json' | 'csv') => Promise<any>
}

type SessionMCPHook = SessionMCPHookState & SessionMCPHookMethods

export function useSessionMCP(sessionId?: string | null): SessionMCPHook {
  const [state, setState] = useState<SessionMCPHookState>({
    sessionId: sessionId || null,
    sessionData: null,
    isLoadingSession: false,
    sessionError: null,
    lastSessionUpdate: null
  })

  const clientRef = useRef<MCPClient | null>(null)
  const globalMCP = useMCP() // Use the global MCP hook for connection status

  // Update sessionId when prop changes
  useEffect(() => {
    setState(prev => ({ ...prev, sessionId: sessionId || null }))
  }, [sessionId])

  // Initialize client reference
  useEffect(() => {
    clientRef.current = MCPClient.getInstance()
  }, [])

  // ========================================
  // SESSION DATA MANAGEMENT
  // ========================================

  const fetchSessionData = useCallback(async () => {
    if (!sessionId || !clientRef.current) {
      setState(prev => ({ ...prev, sessionData: null, isLoadingSession: false }))
      return null
    }

    try {
      setState(prev => ({ ...prev, isLoadingSession: true, sessionError: null }))
      
      const result = await clientRef.current.callTool('get_session', { sessionId })
      
      if (result.success && result.session) {
        const sessionData = {
          ...result.session,
          createdAt: new Date(result.session.createdAt),
          updatedAt: new Date(result.session.updatedAt)
        }
        
        setState(prev => ({
          ...prev,
          sessionData,
          isLoadingSession: false,
          lastSessionUpdate: new Date()
        }))
        
        console.log(`📄 useSessionMCP: Session data refreshed for ${sessionId}`)
        return sessionData
      } else {
        throw new Error('Failed to fetch session data')
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to fetch session'
      setState(prev => ({
        ...prev,
        sessionData: null,
        isLoadingSession: false,
        sessionError: errorMessage,
        lastSessionUpdate: new Date()
      }))
      console.error('❌ useSessionMCP: Failed to fetch session data:', error)
      return null
    }
  }, [sessionId])

  // ========================================
  // EVENT SUBSCRIPTIONS
  // ========================================

  // Handle session-specific events
  const handleSessionEvent = useCallback(async (payload: any) => {
    if (payload.data.sessionId === sessionId) {
      console.log(`📄 useSessionMCP: Session event received for ${sessionId}:`, payload.type)
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // Handle message events for this session
  const handleMessageEvent = useCallback(async (payload: any) => {
    if (payload.data.sessionId === sessionId) {
      console.log(`💬 useSessionMCP: Message event received for ${sessionId}:`, payload.type)
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // Handle participant events for this session
  const handleParticipantEvent = useCallback(async (payload: any) => {
    if (payload.data.sessionId === sessionId) {
      console.log(`👥 useSessionMCP: Participant event received for ${sessionId}:`, payload.type)
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // Handle conversation events for this session
  const handleConversationEvent = useCallback(async (payload: any) => {
    if (payload.data.sessionId === sessionId) {
      console.log(`🗣️ useSessionMCP: Conversation event received for ${sessionId}:`, payload.type)
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // Handle analysis events for this session
  const handleAnalysisEvent = useCallback(async (payload: any) => {
    if (payload.data.sessionId === sessionId) {
      console.log(`🔍 useSessionMCP: Analysis event received for ${sessionId}:`, payload.type)
      await fetchSessionData()
    }
  }, [sessionId, fetchSessionData])

  // Subscribe to relevant events
  useEffect(() => {
    if (!sessionId) return

    console.log(`📡 useSessionMCP: Setting up event subscriptions for session ${sessionId}`)

    // Initial data fetch
    fetchSessionData()

    // Session events
    const unsubscribeSessionUpdated = eventBus.subscribe(EVENT_TYPES.SESSION_UPDATED, handleSessionEvent)
    const unsubscribeSessionSwitched = eventBus.subscribe(EVENT_TYPES.SESSION_SWITCHED, handleSessionEvent)
    
    // Message events
    const unsubscribeMessageSent = eventBus.subscribe(EVENT_TYPES.MESSAGE_SENT, handleMessageEvent)
    const unsubscribeMessageUpdated = eventBus.subscribe(EVENT_TYPES.MESSAGE_UPDATED, handleMessageEvent)
    const unsubscribeMessageDeleted = eventBus.subscribe(EVENT_TYPES.MESSAGE_DELETED, handleMessageEvent)
    
    // Participant events
    const unsubscribeParticipantAdded = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_ADDED, handleParticipantEvent)
    const unsubscribeParticipantRemoved = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_REMOVED, handleParticipantEvent)
    const unsubscribeParticipantUpdated = eventBus.subscribe(EVENT_TYPES.PARTICIPANT_UPDATED, handleParticipantEvent)
    
    // Conversation events
    const unsubscribeConversationStarted = eventBus.subscribe(EVENT_TYPES.CONVERSATION_STARTED, handleConversationEvent)
    const unsubscribeConversationPaused = eventBus.subscribe(EVENT_TYPES.CONVERSATION_PAUSED, handleConversationEvent)
    const unsubscribeConversationResumed = eventBus.subscribe(EVENT_TYPES.CONVERSATION_RESUMED, handleConversationEvent)
    const unsubscribeConversationStopped = eventBus.subscribe(EVENT_TYPES.CONVERSATION_STOPPED, handleConversationEvent)
    
    // Analysis events
    const unsubscribeAnalysisSaved = eventBus.subscribe(EVENT_TYPES.ANALYSIS_SAVED, handleAnalysisEvent)
    const unsubscribeAnalysisTriggered = eventBus.subscribe(EVENT_TYPES.ANALYSIS_TRIGGERED, handleAnalysisEvent)
    const unsubscribeAnalysisCleared = eventBus.subscribe(EVENT_TYPES.ANALYSIS_CLEARED, handleAnalysisEvent)

    return () => {
      console.log(`📡 useSessionMCP: Cleaning up event subscriptions for session ${sessionId}`)
      unsubscribeSessionUpdated()
      unsubscribeSessionSwitched()
      unsubscribeMessageSent()
      unsubscribeMessageUpdated()
      unsubscribeMessageDeleted()
      unsubscribeParticipantAdded()
      unsubscribeParticipantRemoved()
      unsubscribeParticipantUpdated()
      unsubscribeConversationStarted()
      unsubscribeConversationPaused()
      unsubscribeConversationResumed()
      unsubscribeConversationStopped()
      unsubscribeAnalysisSaved()
      unsubscribeAnalysisTriggered()
      unsubscribeAnalysisCleared()
    }
  }, [
    sessionId,
    fetchSessionData,
    handleSessionEvent,
    handleMessageEvent,
    handleParticipantEvent,
    handleConversationEvent,
    handleAnalysisEvent
  ])

  // ========================================
  // SESSION-SCOPED METHODS
  // ========================================

  const getSession = useCallback(async () => {
    if (!sessionId) throw new Error('No session ID provided')
    return await fetchSessionData()
  }, [sessionId, fetchSessionData])

  const refreshSession = useCallback(async () => {
    await fetchSessionData()
  }, [fetchSessionData])

  const analyzeConversation = useCallback(async (analysisType: string = 'full') => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.analyzeConversationViaMCP(sessionId, analysisType)
  }, [sessionId, globalMCP])

  // Message operations
  const sendMessage = useCallback(async (content: string, participantId: string, participantName: string, participantType: any) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.sendMessageViaMCP(sessionId, content, participantId, participantName, participantType)
  }, [sessionId, globalMCP])

  const updateMessage = useCallback(async (messageId: string, updates: any) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.updateMessageViaMCP(sessionId, messageId, updates)
  }, [sessionId, globalMCP])

  const deleteMessage = useCallback(async (messageId: string) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.deleteMessageViaMCP(sessionId, messageId)
  }, [sessionId, globalMCP])

  const clearMessages = useCallback(async () => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.clearMessagesViaMCP(sessionId)
  }, [sessionId, globalMCP])

  // Participant operations
  const addParticipant = useCallback(async (name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.addParticipantViaMCP(sessionId, name, type, provider, model, settings, characteristics)
  }, [sessionId, globalMCP])

  const removeParticipant = useCallback(async (participantId: string) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.removeParticipantViaMCP(sessionId, participantId)
  }, [sessionId, globalMCP])

  const updateParticipant = useCallback(async (participantId: string, updates: any) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.updateParticipantViaMCP(sessionId, participantId, updates)
  }, [sessionId, globalMCP])

  const updateParticipantStatus = useCallback(async (participantId: string, status: string) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.updateParticipantStatusViaMCP(sessionId, participantId, status)
  }, [sessionId, globalMCP])

  // Conversation control
  const startConversation = useCallback(async (initialPrompt?: string) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.startConversationViaMCP(sessionId, initialPrompt)
  }, [sessionId, globalMCP])

  const pauseConversation = useCallback(async () => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.pauseConversationViaMCP(sessionId)
  }, [sessionId, globalMCP])

  const resumeConversation = useCallback(async () => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.resumeConversationViaMCP(sessionId)
  }, [sessionId, globalMCP])

  const stopConversation = useCallback(async () => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.stopConversationViaMCP(sessionId)
  }, [sessionId, globalMCP])

  const getConversationStatus = useCallback(async () => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.getConversationStatusViaMCP(sessionId)
  }, [sessionId, globalMCP])

  const getConversationStats = useCallback(async () => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.getConversationStatsViaMCP(sessionId)
  }, [sessionId, globalMCP])

  const injectPrompt = useCallback(async (prompt: string) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.injectPromptViaMCP(sessionId, prompt)
  }, [sessionId, globalMCP])

  const injectModeratorPrompt = useCallback(async (prompt: string) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.injectModeratorPromptViaMCP(sessionId, prompt)
  }, [sessionId, globalMCP])

  // Analysis operations
  const triggerLiveAnalysis = useCallback(async (analysisType?: string) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.triggerLiveAnalysisViaMCP(sessionId, analysisType)
  }, [sessionId, globalMCP])

  const saveAnalysisSnapshot = useCallback(async (analysis: any, analysisType?: string) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.saveAnalysisSnapshotViaMCP(sessionId, analysis, analysisType)
  }, [sessionId, globalMCP])

  const getAnalysisHistory = useCallback(async () => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.getAnalysisHistoryViaMCP(sessionId)
  }, [sessionId, globalMCP])

  const clearAnalysisHistory = useCallback(async () => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.clearAnalysisHistoryViaMCP(sessionId)
  }, [sessionId, globalMCP])

  // Export operations
  const exportSession = useCallback(async (format: 'json' | 'csv' = 'json', options?: any) => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.exportSessionViaMCP(sessionId, format, options)
  }, [sessionId, globalMCP])

  const exportAnalysisTimeline = useCallback(async (format: 'json' | 'csv' = 'json') => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.exportAnalysisTimelineViaMCP(sessionId, format)
  }, [sessionId, globalMCP])

  const getExportPreview = useCallback(async (format: 'json' | 'csv' = 'json') => {
    if (!sessionId || !clientRef.current) throw new Error('Session ID required')
    return await globalMCP.getExportPreviewViaMCP(sessionId, format)
  }, [sessionId, globalMCP])

  // ========================================
  // RETURN COMPLETE SESSION MCP INTERFACE
  // ========================================

  return {
    ...state,
    
    // Session-specific operations
    getSession,
    refreshSession,
    analyzeConversation,
    
    // Session-scoped message operations
    sendMessage,
    updateMessage,
    deleteMessage,
    clearMessages,
    
    // Session-scoped participant operations
    addParticipant,
    removeParticipant,
    updateParticipant,
    updateParticipantStatus,
    
    // Session-scoped conversation control
    startConversation,
    pauseConversation,
    resumeConversation,
    stopConversation,
    getConversationStatus,
    getConversationStats,
    injectPrompt,
    injectModeratorPrompt,
    
    // Session-scoped analysis operations
    triggerLiveAnalysis,
    saveAnalysisSnapshot,
    getAnalysisHistory,
    clearAnalysisHistory,
    
    // Session-scoped export operations
    exportSession,
    exportAnalysisTimeline,
    getExportPreview
  }
}