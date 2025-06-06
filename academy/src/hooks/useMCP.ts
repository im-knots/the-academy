// src/hooks/useMCP.ts
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
  
  // Academy-specific methods
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
  const { currentSession } = useChatStore()

  // Initialize MCP client
  useEffect(() => {
    if (!clientRef.current) {
      clientRef.current = MCPClient.getInstance()
      
      // Set up event listeners
      const handleConnectionChange = () => {
        if (clientRef.current) {
          setState(prev => ({
            ...prev,
            isConnected: clientRef.current!.isConnected(),
            connectionStatus: clientRef.current!.getConnectionStatus(),
            lastUpdate: new Date()
          }))
        }
      }

      const handleResourcesUpdated = () => {
        refreshResources()
      }

      const handleConversationStateChanged = (data: any) => {
        console.log('Conversation state changed:', data)
        setState(prev => ({ ...prev, lastUpdate: new Date() }))
      }

      const handleError = (error: any) => {
        setState(prev => ({
          ...prev,
          error: error.message || 'Unknown MCP error',
          lastUpdate: new Date()
        }))
      }

      // Add event listeners
      clientRef.current.on('connected', handleConnectionChange)
      clientRef.current.on('disconnected', handleConnectionChange)
      clientRef.current.on('resourcesUpdated', handleResourcesUpdated)
      clientRef.current.on('conversationStateChanged', handleConversationStateChanged)
      clientRef.current.on('error', handleError)

      // Initialize connection
      initializeConnection()
    }

    return () => {
      // Cleanup event listeners
      if (clientRef.current) {
        clientRef.current.off('connected', () => {})
        clientRef.current.off('disconnected', () => {})
        clientRef.current.off('resourcesUpdated', () => {})
        clientRef.current.off('conversationStateChanged', () => {})
        clientRef.current.off('error', () => {})
      }
    }
  }, [])

  const initializeConnection = async () => {
    if (!clientRef.current) return

    try {
      setState(prev => ({
        ...prev,
        connectionStatus: 'connecting',
        error: null
      }))

      await clientRef.current.initialize()
      
      // Load initial data
      const [resources, tools, prompts] = await Promise.all([
        clientRef.current.listResources().catch(() => []),
        clientRef.current.listTools().catch(() => []),
        clientRef.current.listPrompts().catch(() => [])
      ])

      setState(prev => ({
        ...prev,
        isInitialized: true,
        isConnected: true,
        connectionStatus: 'connected',
        resources,
        tools,
        prompts,
        error: null,
        lastUpdate: new Date()
      }))

    } catch (error) {
      console.error('Failed to initialize MCP connection:', error)
      setState(prev => ({
        ...prev,
        isInitialized: false,
        isConnected: false,
        connectionStatus: 'error',
        error: error instanceof Error ? error.message : 'Failed to connect',
        lastUpdate: new Date()
      }))
    }
  }

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
      setState(prev => ({ ...prev, error: null, lastUpdate: new Date() }))
      
      // Refresh resources after state-changing operations
      if (['create_session', 'add_participant', 'send_message'].includes(name)) {
        setTimeout(refreshResources, 100)
      }
      
      return result
    } catch (error) {
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

  // Academy-specific methods
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
  }, [])

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
    
    // Academy-specific methods
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
  const { currentSession } = useChatStore()
  const activeSessionId = sessionId || currentSession?.id

  const sessionMethods = {
    // Session-specific methods that use the current session ID
    startConversation: (initialPrompt?: string) => 
      activeSessionId ? mcp.startConversation(activeSessionId, initialPrompt) : Promise.reject('No active session'),
    
    pauseConversation: () => 
      activeSessionId ? mcp.pauseConversation(activeSessionId) : Promise.reject('No active session'),
    
    resumeConversation: () => 
      activeSessionId ? mcp.resumeConversation(activeSessionId) : Promise.reject('No active session'),
    
    stopConversation: () => 
      activeSessionId ? mcp.stopConversation(activeSessionId) : Promise.reject('No active session'),
    
    injectPrompt: (prompt: string) => 
      activeSessionId ? mcp.injectPrompt(activeSessionId, prompt) : Promise.reject('No active session'),
    
    addParticipant: (participant: any) => 
      activeSessionId ? mcp.addParticipant(activeSessionId, participant) : Promise.reject('No active session'),
    
    analyzeConversation: (analysisType?: string) => 
      activeSessionId ? mcp.analyzeConversation(activeSessionId, analysisType) : Promise.reject('No active session'),
    
    exportSession: (format?: 'json' | 'csv', options?: any) => 
      activeSessionId ? mcp.exportSession(activeSessionId, format, options) : Promise.reject('No active session'),
    
    // Resource access for current session
    getMessages: () => 
      activeSessionId ? mcp.readResource(`academy://session/${activeSessionId}/messages`) : Promise.reject('No active session'),
    
    getParticipants: () => 
      activeSessionId ? mcp.readResource(`academy://session/${activeSessionId}/participants`) : Promise.reject('No active session'),
    
    getAnalysis: () => 
      activeSessionId ? mcp.readResource(`academy://session/${activeSessionId}/analysis`) : Promise.reject('No active session')
  }

  return {
    ...mcp,
    ...sessionMethods,
    activeSessionId,
    hasActiveSession: !!activeSessionId
  }
}