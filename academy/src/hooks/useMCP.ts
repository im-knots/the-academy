// src/hooks/useMCP.ts - Updated with complete Phase 1 & 2 MCP tools support
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
  
  // PHASE 1: Conversation Control Methods (Complete)
  startConversationViaMCP: (sessionId: string, initialPrompt?: string) => Promise<any>
  pauseConversationViaMCP: (sessionId: string) => Promise<any>
  resumeConversationViaMCP: (sessionId: string) => Promise<any>
  stopConversationViaMCP: (sessionId: string) => Promise<any>
  injectPromptViaMCP: (sessionId: string, prompt: string) => Promise<any>
  getConversationStatusViaMCP: (sessionId?: string) => Promise<any>
  
  // PHASE 1: Export Methods
  exportSessionViaMCP: (sessionId: string, format?: 'json' | 'csv', options?: any) => Promise<any>
  
  // Analysis Methods (existing)
  saveAnalysisSnapshotViaMCP: (sessionId: string, analysis: any, analysisType?: string) => Promise<any>
  getAnalysisHistoryViaMCP: (sessionId: string) => Promise<any>
  clearAnalysisHistoryViaMCP: (sessionId: string) => Promise<any>
  analyzeConversationViaMCP: (sessionId: string, analysisType?: string) => Promise<any>
  
  // AI Provider Methods (existing)
  callClaudeViaMCP: (message: string, systemPrompt?: string, sessionId?: string, participantId?: string) => Promise<any>
  callOpenAIViaMCP: (message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string) => Promise<any>
  
  // Debug Methods (existing)
  debugStoreViaMCP: () => Promise<any>
  
  // Academy-specific methods (existing - backwards compatibility)
  createSession: (name: string, description?: string, template?: string) => Promise<string>
  addParticipant: (sessionId: string, participant: any) => Promise<string>
  startConversation: (sessionId: string, initialPrompt?: string) => Promise<void>
  pauseConversation: (sessionId: string) => Promise<void>
  resumeConversation: (sessionId: string) => Promise<void>
  stopConversation: (sessionId: string) => Promise<void>
  injectPrompt: (sessionId: string, prompt: string) => Promise<void>
  analyzeConversation: (sessionId: string, analysisType?: string) => Promise<any>
  exportSession: (sessionId: string, format?: 'json' | 'csv', options?: any) => Promise<any>
  
  // Utility methods
  reconnect: () => Promise<void>
  disconnect: () => void
}

export function useMCP(): MCPHookState & MCPHookMethods {
  const clientRef = useRef<MCPClient | null>(null)
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

  const initializeConnection = useCallback(async () => {
    try {
      setState(prev => ({ ...prev, connectionStatus: 'connecting', error: null }))
      
      if (!clientRef.current) {
        clientRef.current = new MCPClient()
      }

      await clientRef.current.initialize()
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        isInitialized: true,
        connectionStatus: 'connected',
        lastUpdate: new Date()
      }))
      
      console.log('✅ MCP Hook: Connection established')
      
      // Load initial data
      await refreshResources()
      await listTools()
      
    } catch (error) {
      console.error('❌ MCP Hook: Connection failed:', error)
      setState(prev => ({
        ...prev,
        isConnected: false,
        isInitialized: false,
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Connection failed',
        lastUpdate: new Date()
      }))
    }
  }, [])

  useEffect(() => {
    initializeConnection()
  }, [initializeConnection])

  // Resource methods
  const listResources = useCallback(async () => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    const resources = await clientRef.current.listResources()
    setState(prev => ({ ...prev, resources, lastUpdate: new Date() }))
    return resources
  }, [])

  const readResource = useCallback(async (uri: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    return await clientRef.current.readResource(uri)
  }, [])

  const refreshResources = useCallback(async () => {
    try {
      await listResources()
    } catch (error) {
      console.error('Failed to refresh resources:', error)
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
        'stop_conversation', 'inject_prompt'
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
    
    console.log(`📊 useMCP: Updating participant status via MCP: ${participantId} -> ${status}`)
    
    try {
      const result = await clientRef.current.updateParticipantStatusViaMCP(sessionId, participantId, status)
      
      // Refresh resources after updating status
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

  const getAvailableModelsViaMCP = useCallback(async (provider?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🤖 useMCP: Getting available models via MCP`)
    
    try {
      const result = await clientRef.current.getAvailableModelsViaMCP(provider)
      console.log(`✅ useMCP: Retrieved ${result.models.length} available models`)
      return result
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
    
    console.log(`⚙️ useMCP: Getting participant config via MCP: ${participantId}`)
    
    try {
      const result = await clientRef.current.getParticipantConfigViaMCP(sessionId, participantId)
      console.log(`✅ useMCP: Retrieved participant config for: ${participantId}`)
      return result
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
  // PHASE 1: CONVERSATION CONTROL METHODS (COMPLETE)
  // ========================================

  const startConversationViaMCP = useCallback(async (sessionId: string, initialPrompt?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`🚀 useMCP: Starting conversation via MCP for session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.startConversationViaMCP(sessionId, initialPrompt)
      
      // Update state to reflect conversation started
      setState(prev => ({ ...prev, lastUpdate: new Date() }))
      
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
    
    console.log(`⏸️ useMCP: Pausing conversation via MCP for session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.pauseConversationViaMCP(sessionId)
      
      // Update state to reflect conversation paused
      setState(prev => ({ ...prev, lastUpdate: new Date() }))
      
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
    
    console.log(`▶️ useMCP: Resuming conversation via MCP for session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.resumeConversationViaMCP(sessionId)
      
      // Update state to reflect conversation resumed
      setState(prev => ({ ...prev, lastUpdate: new Date() }))
      
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
    
    console.log(`🛑 useMCP: Stopping conversation via MCP for session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.stopConversationViaMCP(sessionId)
      
      // Update state to reflect conversation stopped
      setState(prev => ({ ...prev, lastUpdate: new Date() }))
      
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

  const injectPromptViaMCP = useCallback(async (sessionId: string, prompt: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`💉 useMCP: Injecting prompt via MCP for session: ${sessionId}`)
    
    try {
      const result = await clientRef.current.injectPromptViaMCP(sessionId, prompt)
      
      // Update state to reflect prompt injected
      setState(prev => ({ ...prev, lastUpdate: new Date() }))
      
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

  const getConversationStatusViaMCP = useCallback(async (sessionId?: string) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`📊 useMCP: Getting conversation status via MCP`)
    
    try {
      const result = await clientRef.current.getConversationStatusViaMCP(sessionId)
      console.log(`✅ useMCP: Retrieved conversation status`)
      return result
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

  // ========================================
  // PHASE 1: EXPORT METHODS
  // ========================================

  const exportSessionViaMCP = useCallback(async (sessionId: string, format: 'json' | 'csv' = 'json', options?: any) => {
    if (!clientRef.current) throw new Error('MCP client not initialized')
    
    console.log(`📤 useMCP: Exporting session via MCP: ${sessionId} (${format})`)
    
    try {
      const result = await clientRef.current.exportSessionViaMCP(sessionId, format, options)
      console.log(`✅ useMCP: Session exported successfully`)
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

  // ========================================
  // ANALYSIS METHODS (EXISTING)
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
  // ACADEMY-SPECIFIC METHODS (BACKWARDS COMPATIBILITY)
  // ========================================

  const createSession = useCallback(async (name: string, description?: string, template?: string) => {
    return await callTool('create_session', { name, description, template })
  }, [callTool])

  const addParticipant = useCallback(async (sessionId: string, participant: any) => {
    return await callTool('add_participant', { sessionId, ...participant })
  }, [callTool])

  const startConversation = useCallback(async (sessionId: string, initialPrompt?: string) => {
    await callTool('start_conversation', { sessionId, initialPrompt })
  }, [callTool])

  const pauseConversation = useCallback(async (sessionId: string) => {
    await callTool('pause_conversation', { sessionId })
  }, [callTool])

  const resumeConversation = useCallback(async (sessionId: string) => {
    await callTool('resume_conversation', { sessionId })
  }, [callTool])

  const stopConversation = useCallback(async (sessionId: string) => {
    await callTool('stop_conversation', { sessionId })
  }, [callTool])

  const injectPrompt = useCallback(async (sessionId: string, prompt: string) => {
    await callTool('inject_prompt', { sessionId, prompt })
  }, [callTool])

  const analyzeConversation = useCallback(async (sessionId: string, analysisType: string = 'full') => {
    const result = await callTool('analyze_conversation', { sessionId, analysisType })
    return result.analysis
  }, [callTool])

  const exportSession = useCallback(async (sessionId: string, format: 'json' | 'csv' = 'json', options: any = {}) => {
    const result = await callTool('export_session', { sessionId, format, ...options })
    return result.data
  }, [callTool])

  // Utility methods
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
    
    // PHASE 1: Conversation Control (Complete)
    startConversationViaMCP,
    pauseConversationViaMCP,
    resumeConversationViaMCP,
    stopConversationViaMCP,
    injectPromptViaMCP,
    getConversationStatusViaMCP,
    
    // PHASE 1: Export Methods
    exportSessionViaMCP,
    
    // Analysis Methods (existing)
    saveAnalysisSnapshotViaMCP,
    getAnalysisHistoryViaMCP,
    clearAnalysisHistoryViaMCP,
    analyzeConversationViaMCP,
    
    // AI Provider Methods (existing)
    callClaudeViaMCP,
    callOpenAIViaMCP,
    
    // Debug Methods (existing)
    debugStoreViaMCP,
    
    // Academy-specific methods (backwards compatibility)
    createSession,
    addParticipant,
    startConversation,
    pauseConversation,
    resumeConversation,
    stopConversation,
    injectPrompt,
    analyzeConversation,
    exportSession,
    
    // Utility methods
    reconnect,
    disconnect
  }
}

// Convenience hook for current session MCP operations
export function useSessionMCP(sessionId?: string) {
  const mcp = useMCP()
  
  return {
    ...mcp,
    
    // Session-specific convenience methods
    sendMessage: (content: string, participantId: string, participantName: string, participantType: any) => 
      sessionId ? mcp.sendMessageViaMCP(sessionId, content, participantId, participantName, participantType) : Promise.reject('No session ID'),
    
    addParticipant: (name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any) =>
      sessionId ? mcp.addParticipantViaMCP(sessionId, name, type, provider, model, settings, characteristics) : Promise.reject('No session ID'),
    
    removeParticipant: (participantId: string) =>
      sessionId ? mcp.removeParticipantViaMCP(sessionId, participantId) : Promise.reject('No session ID'),
    
    updateParticipant: (participantId: string, updates: any) =>
      sessionId ? mcp.updateParticipantViaMCP(sessionId, participantId, updates) : Promise.reject('No session ID'),
    
    updateParticipantStatus: (participantId: string, status: string) =>
      sessionId ? mcp.updateParticipantStatusViaMCP(sessionId, participantId, status) : Promise.reject('No session ID'),
    
    getParticipantConfig: (participantId: string) =>
      sessionId ? mcp.getParticipantConfigViaMCP(sessionId, participantId) : Promise.reject('No session ID'),
    
    startConversation: (initialPrompt?: string) =>
      sessionId ? mcp.startConversationViaMCP(sessionId, initialPrompt) : Promise.reject('No session ID'),
    
    pauseConversation: () =>
      sessionId ? mcp.pauseConversationViaMCP(sessionId) : Promise.reject('No session ID'),
    
    resumeConversation: () =>
      sessionId ? mcp.resumeConversationViaMCP(sessionId) : Promise.reject('No session ID'),
    
    stopConversation: () =>
      sessionId ? mcp.stopConversationViaMCP(sessionId) : Promise.reject('No session ID'),
    
    injectPrompt: (prompt: string) =>
      sessionId ? mcp.injectPromptViaMCP(sessionId, prompt) : Promise.reject('No session ID'),
    
    exportSession: (format?: 'json' | 'csv', options?: any) =>
      sessionId ? mcp.exportSessionViaMCP(sessionId, format, options) : Promise.reject('No session ID'),
    
    analyzeConversation: (analysisType?: string) =>
      sessionId ? mcp.analyzeConversationViaMCP(sessionId, analysisType) : Promise.reject('No session ID'),
    
    getConversationStatus: () =>
      sessionId ? mcp.getConversationStatusViaMCP(sessionId) : Promise.reject('No session ID')
  }
}