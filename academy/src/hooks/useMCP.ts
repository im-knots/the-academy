// src/hooks/useMCP.ts - Fixed TypeScript errors
'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { MCPClient } from '@/lib/mcp/client'
import { useChatStore } from '@/lib/stores/chatStore'

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
  
  // PHASE 1: Session Management Methods (Complete)
  createSessionViaMCP: (name: string, description?: string, template?: string, participants?: any[]) => Promise<any>
  deleteSessionViaMCP: (sessionId: string) => Promise<any>
  updateSessionViaMCP: (sessionId: string, name?: string, description?: string, metadata?: any) => Promise<any>
  switchCurrentSessionViaMCP: (sessionId: string) => Promise<any>
  duplicateSessionViaMCP: (sessionId: string, newName?: string, includeMessages?: boolean) => Promise<any>
  importSessionViaMCP: (sessionData: any, name?: string) => Promise<any>
  getSessionTemplates: () => Promise<any[]>
  createSessionFromTemplateViaMCP: (templateId: string, name: string, description?: string, customizations?: any) => Promise<any>
  
  // PHASE 1: Message Management Methods
  sendMessageViaMCP: (sessionId: string, content: string, participantId: string, participantName: string, participantType: any) => Promise<any>
  
  // PHASE 2: Participant Management Methods (Complete)
  addParticipantViaMCP: (sessionId: string, name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any) => Promise<any>
  removeParticipantViaMCP: (sessionId: string, participantId: string) => Promise<any>
  updateParticipantViaMCP: (sessionId: string, participantId: string, updates: any) => Promise<any>
  updateParticipantStatusViaMCP: (sessionId: string, participantId: string, status: string) => Promise<any>
  getAvailableModelsViaMCP: (provider?: string) => Promise<any>
  getParticipantConfigViaMCP: (sessionId: string, participantId: string) => Promise<any>
  
  // PHASE 4: Conversation Control Methods (Complete)
  startConversationViaMCP: (sessionId: string, initialPrompt?: string) => Promise<any>
  pauseConversationViaMCP: (sessionId: string) => Promise<any>
  resumeConversationViaMCP: (sessionId: string) => Promise<any>
  stopConversationViaMCP: (sessionId: string) => Promise<any>
  getConversationStatusViaMCP: (sessionId: string) => Promise<any>
  getConversationStatsViaMCP: (sessionId: string) => Promise<any>
  injectPromptViaMCP: (sessionId: string, prompt: string) => Promise<any>
  
  // PHASE 3: Message Control Methods
  updateMessageViaMCP: (sessionId: string, messageId: string, content: string) => Promise<any>
  deleteMessageViaMCP: (sessionId: string, messageId: string) => Promise<any>
  clearMessagesViaMCP: (sessionId: string) => Promise<any>
  injectModeratorPromptViaMCP: (sessionId: string, prompt: string) => Promise<any>
  
  // PHASE 5: Export Methods
  exportSessionViaMCP: (sessionId: string, format?: 'json' | 'csv', options?: any) => Promise<any>
  exportAnalysisTimelineViaMCP: (sessionId: string, format?: 'json' | 'csv') => Promise<any>
  getExportPreviewViaMCP: (sessionId: string, format?: 'json' | 'csv') => Promise<any>
  
  // PHASE 6: Live Analysis Methods
  triggerLiveAnalysisViaMCP: (sessionId: string, analysisType?: string) => Promise<any>
  setAnalysisProviderViaMCP: (provider: string) => Promise<any>
  getAnalysisProvidersViaMCP: () => Promise<any[]>
  autoAnalyzeConversationViaMCP: (sessionId: string, enabled: boolean) => Promise<any>
  
  // Analysis Management Methods
  saveAnalysisSnapshotViaMCP: (sessionId: string, analysis: any, analysisType?: string) => Promise<any>
  getAnalysisHistoryViaMCP: (sessionId: string) => Promise<any>
  clearAnalysisHistoryViaMCP: (sessionId: string) => Promise<any>
  analyzeConversationViaMCP: (sessionId: string, analysisType?: string) => Promise<any>
  
  // AI Provider Methods
  callClaudeViaMCP: (message: string, systemPrompt?: string, sessionId?: string, participantId?: string) => Promise<any>
  callOpenAIViaMCP: (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => Promise<any>
  
  // Debug Methods
  debugStoreViaMCP: () => Promise<any>
  
  // Utility methods
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

  const initializeConnection = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, connectionStatus: 'connecting', error: null }))
      
      console.log('🔧 useMCP: Initializing MCP client...')
      
      // Use singleton getInstance instead of constructor
      clientRef.current = MCPClient.getInstance()
      
      if (!clientRef.current.isConnected()) {
        await clientRef.current.initialize()
      }
      
      console.log('✅ useMCP: MCP client initialized successfully')
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        isInitialized: true,
        connectionStatus: 'connected',
        lastUpdate: new Date()
      }))
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
  }, [])

  useEffect(() => {
    initializeConnection().catch(error => {
      console.error('useMCP initialization error:', error)
    })
  }, [initializeConnection])

  // Resource methods
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

  const refreshResources = useCallback(async () => {
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

  // Tool methods
  const listTools = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    const tools = await clientRef.current.listTools()
    setState(prev => ({ ...prev, tools, lastUpdate: new Date() }))
    return tools
  }, [])

  const callTool = useCallback(async (name: string, args: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.callTool(name, args)
      
      // Refresh resources after tool calls that might change data
      const dataModifyingTools = [
        'create_session', 'delete_session', 'update_session', 'switch_current_session',
        'duplicate_session', 'import_session', 'send_message', 'add_participant',
        'remove_participant', 'update_participant', 'update_participant_status',
        'start_conversation', 'pause_conversation', 'resume_conversation', 
        'stop_conversation', 'inject_moderator_prompt'
      ]
      
      if (dataModifyingTools.includes(name)) {
        setTimeout(refreshResources, 100)
      }
      
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
  }, [refreshResources])

  // Prompt methods
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
  // PHASE 1: SESSION MANAGEMENT METHODS (COMPLETE)
  // ========================================

  const createSessionViaMCP = useCallback(async (name: string, description?: string, template?: string, participants?: any[]) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🔧 useMCP: Creating session via MCP: ${name}`)
    
    try {
      const result = await clientRef.current.createSessionViaMCP(name, description, template, participants)
      
      // Refresh resources after session creation
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const deleteSessionViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🗑️ useMCP: Deleting session via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.deleteSessionViaMCP(sessionId)
      
      // Refresh resources after session deletion
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const updateSessionViaMCP = useCallback(async (sessionId: string, name?: string, description?: string, metadata?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`✏️ useMCP: Updating session via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.updateSessionViaMCP(sessionId, name, description, metadata)
      
      // Refresh resources after session update
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const switchCurrentSessionViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🔄 useMCP: Switching current session via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.switchCurrentSessionViaMCP(sessionId)
      
      // Refresh resources after session switch
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const duplicateSessionViaMCP = useCallback(async (sessionId: string, newName?: string, includeMessages: boolean = false) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`📋 useMCP: Duplicating session via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.duplicateSessionViaMCP(sessionId, newName, includeMessages)
      
      // Refresh resources after session duplication
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const importSessionViaMCP = useCallback(async (sessionData: any, name?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`📥 useMCP: Importing session via MCP`)
    
    try {
      const result = await clientRef.current.importSessionViaMCP(sessionData, name)
      
      // Refresh resources after session import
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const getSessionTemplates = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const templates = await clientRef.current.getSessionTemplates()
      console.log(`📋 useMCP: Retrieved ${templates.length} session templates`)
      return templates
    } catch (error) {
      console.error('Failed to get session templates:', error)
      return []
    }
  }, [])

  const createSessionFromTemplateViaMCP = useCallback(async (templateId: string, name: string, description?: string, customizations?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🎨 useMCP: Creating session from template via MCP: ${templateId}`)
    
    try {
      const result = await clientRef.current.createSessionFromTemplateViaMCP(templateId, name, description, customizations)
      
      // Refresh resources after session creation
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  // ========================================
  // PHASE 1: MESSAGE MANAGEMENT METHODS
  // ========================================

  const sendMessageViaMCP = useCallback(async (sessionId: string, content: string, participantId: string, participantName: string, participantType: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`💬 useMCP: Sending message via MCP to session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.sendMessageViaMCP(sessionId, content, participantId, participantName, participantType)
      
      // Refresh resources after message
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  // ========================================
  // PHASE 2: PARTICIPANT MANAGEMENT METHODS (COMPLETE)
  // ========================================

  const addParticipantViaMCP = useCallback(async (sessionId: string, name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`👤 useMCP: Adding participant via MCP to session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.addParticipantViaMCP(sessionId, name, type, provider, model, settings, characteristics)
      
      // Refresh resources after adding participant
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const removeParticipantViaMCP = useCallback(async (sessionId: string, participantId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`❌ useMCP: Removing participant via MCP from session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.removeParticipantViaMCP(sessionId, participantId)
      
      // Refresh resources after removing participant
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const updateParticipantViaMCP = useCallback(async (sessionId: string, participantId: string, updates: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`✏️ useMCP: Updating participant via MCP: ${participantId}`)
    
    try {
      const result = await clientRef.current.updateParticipantViaMCP(sessionId, participantId, updates)
      
      // Refresh resources after updating participant
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const updateParticipantStatusViaMCP = useCallback(async (sessionId: string, participantId: string, status: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🔄 useMCP: Updating participant status via MCP: ${participantId}`)
    
    try {
      const result = await clientRef.current.updateParticipantStatusViaMCP(sessionId, participantId, status)
      
      // Refresh resources after status update
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  // Fixed method name to match MCPClient
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
  // PHASE 4: CONVERSATION CONTROL METHODS (COMPLETE)
  // ========================================

  const startConversationViaMCP = useCallback(async (sessionId: string, initialPrompt?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🚀 useMCP: Starting conversation via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.startConversationViaMCP(sessionId, initialPrompt)
      
      // Refresh resources after starting conversation
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const pauseConversationViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`⏸️ useMCP: Pausing conversation via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.pauseConversationViaMCP(sessionId)
      
      // Refresh resources after pausing conversation
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const resumeConversationViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`▶️ useMCP: Resuming conversation via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.resumeConversationViaMCP(sessionId)
      
      // Refresh resources after resuming conversation
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const stopConversationViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🛑 useMCP: Stopping conversation via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.stopConversationViaMCP(sessionId)
      
      // Refresh resources after stopping conversation
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

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

  // Fixed: Added missing injectPromptViaMCP method
  const injectPromptViaMCP = useCallback(async (sessionId: string, prompt: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`💬 useMCP: Injecting prompt via MCP: ${sessionId}`)
    
    try {
      const result = await clientRef.current.injectModeratorPromptViaMCP(sessionId, prompt)
      
      // Refresh resources after injecting prompt
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  // ========================================
  // PHASE 3: MESSAGE CONTROL METHODS
  // ========================================

  const updateMessageViaMCP = useCallback(async (sessionId: string, messageId: string, content: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.updateMessageViaMCP(sessionId, messageId, content)
      
      // Refresh resources after updating message
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const deleteMessageViaMCP = useCallback(async (sessionId: string, messageId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.deleteMessageViaMCP(sessionId, messageId)
      
      // Refresh resources after deleting message
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const clearMessagesViaMCP = useCallback(async (sessionId: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.clearMessagesViaMCP(sessionId)
      
      // Refresh resources after clearing messages
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  const injectModeratorPromptViaMCP = useCallback(async (sessionId: string, prompt: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.injectModeratorPromptViaMCP(sessionId, prompt)
      
      // Refresh resources after injecting moderator prompt
      setTimeout(refreshResources, 100)
      
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
  }, [refreshResources])

  // ========================================
  // PHASE 5: EXPORT METHODS
  // ========================================

  const exportSessionViaMCP = useCallback(async (sessionId: string, format: 'json' | 'csv' = 'json', options: any = {}) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
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
      const result = await clientRef.current.getExportPreviewViaMCP(sessionId, format)
      return result
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
  // PHASE 6: LIVE ANALYSIS METHODS
  // ========================================

  const triggerLiveAnalysisViaMCP = useCallback(async (sessionId: string, analysisType: string = 'full') => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
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

  const setAnalysisProviderViaMCP = useCallback(async (provider: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.setAnalysisProviderViaMCP(provider)
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

  const autoAnalyzeConversationViaMCP = useCallback(async (sessionId: string, enabled: boolean) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.autoAnalyzeConversationViaMCP(sessionId, enabled)
      return result
    } catch (error) {
      console.error('Failed to set auto analyze conversation via MCP:', error)
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Failed to set auto analyze conversation',
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
  // AI PROVIDER METHODS (EXISTING)
  // ========================================

  const callClaudeViaMCP = useCallback(async (message: string, systemPrompt?: string, sessionId?: string, participantId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    try {
      const result = await clientRef.current.callClaudeViaMCP(
        message, 
        systemPrompt || undefined, 
        sessionId || undefined, 
        participantId || undefined
      )
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
      const result = await clientRef.current.callOpenAIViaMCP(
        message, 
        systemPrompt || undefined, 
        model || undefined, 
        sessionId || undefined, 
        participantId || undefined
      )
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

  // ========================================
  // DEBUG METHODS (EXISTING)
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
  // UTILITY METHODS
  // ========================================

  const reconnect = useCallback(async () => {
    await initializeConnection()
  }, [initializeConnection])

  const disconnect = useCallback(() => {
    if (clientRef.current) {
      clientRef.current.disconnect()
      setState(prev => ({
        ...prev,
        isConnected: false,
        isInitialized: false,
        connectionStatus: 'disconnected',
        lastUpdate: new Date()
      }))
    }
  }, [])

  return {
    // State
    ...state,
    
    // Resource methods
    listResources,
    readResource,
    refreshResources,
    
    // Tool methods
    listTools,
    callTool,
    
    // Prompt methods
    listPrompts,
    getPrompt,
    
    // PHASE 1: Session Management (Complete)
    createSessionViaMCP,
    deleteSessionViaMCP,
    updateSessionViaMCP,
    switchCurrentSessionViaMCP,
    duplicateSessionViaMCP,
    importSessionViaMCP,
    getSessionTemplates,
    createSessionFromTemplateViaMCP,
    
    // PHASE 1: Message Management
    sendMessageViaMCP,
    
    // PHASE 2: Participant Management (Complete)
    addParticipantViaMCP,
    removeParticipantViaMCP,
    updateParticipantViaMCP,
    updateParticipantStatusViaMCP,
    getAvailableModelsViaMCP,
    getParticipantConfigViaMCP,
    
    // PHASE 4: Conversation Control (Complete)
    startConversationViaMCP,
    pauseConversationViaMCP,
    resumeConversationViaMCP,
    stopConversationViaMCP,
    getConversationStatusViaMCP,
    getConversationStatsViaMCP,
    injectPromptViaMCP,
    
    // PHASE 3: Message Control
    updateMessageViaMCP,
    deleteMessageViaMCP,
    clearMessagesViaMCP,
    injectModeratorPromptViaMCP,
    
    // PHASE 5: Export
    exportSessionViaMCP,
    exportAnalysisTimelineViaMCP,
    getExportPreviewViaMCP,
    
    // PHASE 6: Live Analysis
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
    
    // Debug Methods
    debugStoreViaMCP,
    
    // Utility methods
    reconnect,
    disconnect
  }
}

// ========================================
// ADDITIONAL HOOK: SESSION-SPECIFIC MCP OPERATIONS
// ========================================

export function useSessionMCP() {
  const mcp = useMCP()
  const { currentSession } = useChatStore()

  // Session-specific convenience methods
  const analyzeConversation = useCallback(async (analysisType: string = 'full') => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.analyzeConversationViaMCP(currentSession.id, analysisType)
  }, [mcp, currentSession])

  const saveAnalysisSnapshot = useCallback(async (analysis: any, analysisType?: string) => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.saveAnalysisSnapshotViaMCP(currentSession.id, analysis, analysisType)
  }, [mcp, currentSession])

  const getAnalysisHistory = useCallback(async () => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.getAnalysisHistoryViaMCP(currentSession.id)
  }, [mcp, currentSession])

  const clearAnalysisHistory = useCallback(async () => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.clearAnalysisHistoryViaMCP(currentSession.id)
  }, [mcp, currentSession])

  const startConversation = useCallback(async (initialPrompt?: string) => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.startConversationViaMCP(currentSession.id, initialPrompt)
  }, [mcp, currentSession])

  const pauseConversation = useCallback(async () => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.pauseConversationViaMCP(currentSession.id)
  }, [mcp, currentSession])

  const resumeConversation = useCallback(async () => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.resumeConversationViaMCP(currentSession.id)
  }, [mcp, currentSession])

  const stopConversation = useCallback(async () => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.stopConversationViaMCP(currentSession.id)
  }, [mcp, currentSession])

  const getConversationStatus = useCallback(async () => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.getConversationStatusViaMCP(currentSession.id)
  }, [mcp, currentSession])

  const getConversationStats = useCallback(async () => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.getConversationStatsViaMCP(currentSession.id)
  }, [mcp, currentSession])

  const sendMessage = useCallback(async (content: string, participantId: string, participantName: string, participantType: any) => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.sendMessageViaMCP(currentSession.id, content, participantId, participantName, participantType)
  }, [mcp, currentSession])

  const addParticipant = useCallback(async (name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any) => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.addParticipantViaMCP(currentSession.id, name, type, provider, model, settings, characteristics)
  }, [mcp, currentSession])

  const removeParticipant = useCallback(async (participantId: string) => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.removeParticipantViaMCP(currentSession.id, participantId)
  }, [mcp, currentSession])

  const updateParticipant = useCallback(async (participantId: string, updates: any) => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.updateParticipantViaMCP(currentSession.id, participantId, updates)
  }, [mcp, currentSession])

  const injectPrompt = useCallback(async (prompt: string) => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.injectPromptViaMCP(currentSession.id, prompt)
  }, [mcp, currentSession])

  const exportSession = useCallback(async (format: 'json' | 'csv' = 'json', options: any = {}) => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.exportSessionViaMCP(currentSession.id, format, options)
  }, [mcp, currentSession])

  const exportAnalysisTimeline = useCallback(async (format: 'json' | 'csv' = 'json') => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.exportAnalysisTimelineViaMCP(currentSession.id, format)
  }, [mcp, currentSession])

  const triggerLiveAnalysis = useCallback(async (analysisType: string = 'full') => {
    if (!currentSession) {
      throw new Error('No current session available')
    }
    return await mcp.triggerLiveAnalysisViaMCP(currentSession.id, analysisType)
  }, [mcp, currentSession])

  return {
    // Session info
    sessionId: currentSession?.id || null,
    hasSession: !!currentSession,
    
    // MCP state from parent hook
    isConnected: mcp.isConnected,
    isInitialized: mcp.isInitialized,
    error: mcp.error,

    // Session-specific methods
    analyzeConversation,
    saveAnalysisSnapshot,
    getAnalysisHistory,
    clearAnalysisHistory,
    startConversation,
    pauseConversation,
    resumeConversation,
    stopConversation,
    getConversationStatus,
    getConversationStats,
    sendMessage,
    addParticipant,
    removeParticipant,
    updateParticipant,
    injectPrompt,
    exportSession,
    exportAnalysisTimeline,
    triggerLiveAnalysis
  }
}