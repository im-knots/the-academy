// src/lib/mcp/client.ts - Updated with abort signal support
'use client'

import { useChatStore } from '../stores/chatStore'
import { setMCPStoreReference } from './server'

interface MCPRequest {
  jsonrpc: '2.0'
  id: string | number
  method: string
  params?: any
}

interface MCPResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

interface MCPNotification {
  jsonrpc: '2.0'
  method: string
  params?: any
}

export class MCPClient {
  private static instance: MCPClient
  private initialized = false
  private requestId = 0
  private eventListeners = new Map<string, Array<(data: any) => void>>()
  private activeRequests = new Map<string | number, AbortController>()

  private constructor() {}

  static getInstance(): MCPClient {
    if (!MCPClient.instance) {
      MCPClient.instance = new MCPClient()
    }
    return MCPClient.instance
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      console.log('🔌 Initializing MCP client...')

      // Set up store reference for server-side access
      if (typeof window !== 'undefined') {
        const store = useChatStore.getState()
        setMCPStoreReference({
          sessions: store.sessions,
          currentSession: store.currentSession
        })
      }

      const result = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        clientInfo: {
          name: 'The Academy',
          version: '1.0.0'
        },
        capabilities: {
          experimental: {
            subscriptions: true
          }
        }
      })

      console.log('✅ MCP initialized:', result)
      this.initialized = true
      
    } catch (error) {
      console.error('❌ Failed to initialize MCP:', error)
      throw error
    }
  }

  private async sendRequest(method: string, params?: any, abortSignal?: AbortSignal): Promise<any> {
    const id = ++this.requestId
    
    const request: MCPRequest = {
      jsonrpc: '2.0',
      id,
      method,
      params
    }

    return this.sendHttpRequest(request, abortSignal)
  }

  private async sendHttpRequest(request: MCPRequest, abortSignal?: AbortSignal): Promise<any> {
    // Create a request-specific abort controller if none provided
    const requestAbortController = new AbortController()
    let effectiveSignal = requestAbortController.signal

    // If an external signal is provided, combine them
    if (abortSignal) {
      // If the external signal is already aborted, abort immediately
      if (abortSignal.aborted) {
        throw new Error('Request aborted before sending')
      }

      // Listen for external abort and forward it
      const abortHandler = () => {
        requestAbortController.abort()
      }
      abortSignal.addEventListener('abort', abortHandler, { once: true })

      // Clean up listener when request completes
      effectiveSignal = requestAbortController.signal
    }

    // Track active request
    this.activeRequests.set(request.id, requestAbortController)

    try {
      console.log('📡 Sending MCP request:', request.method, request.id)

      const response = await fetch('/api/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: effectiveSignal
      })

      // Check for abort before processing
      if (effectiveSignal.aborted) {
        throw new Error('Request was aborted')
      }

      if (!response.ok) {
        const errorText = await response.text()
        console.error('MCP HTTP Error:', response.status, errorText)
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const data: MCPResponse = await response.json()
      
      if (data.error) {
        console.error('MCP Response Error:', data.error)
        throw new Error(`MCP Error ${data.error.code}: ${data.error.message}`)
      }

      console.log('✅ MCP request successful:', request.method, request.id)
      return data.result
    } catch (error) {
      if (error instanceof Error) {
        if (error.name === 'AbortError' || error.message.includes('aborted')) {
          console.log('🛑 MCP request aborted:', request.method, request.id)
          throw new Error('Request was aborted')
        }
      }
      console.error('❌ MCP HTTP request failed:', error)
      throw error
    } finally {
      // Clean up tracking
      this.activeRequests.delete(request.id)
    }
  }

  // Resource methods
  async listResources(): Promise<any[]> {
    if (!this.initialized) {
      await this.initialize()
    }
    const result = await this.sendRequest('list_resources')
    return result.resources || []
  }

  async readResource(uri: string): Promise<any> {
    if (!this.initialized) {
      await this.initialize()
    }
    const result = await this.sendRequest('read_resource', { uri })
    return result.contents?.[0] ? JSON.parse(result.contents[0].text) : null
  }

  // Tool methods
  async listTools(): Promise<any[]> {
    if (!this.initialized) {
      await this.initialize()
    }
    const result = await this.sendRequest('list_tools')
    return result.tools || []
  }

  async callTool(name: string, args: any): Promise<any> {
    return this.callToolWithAbort(name, args)
  }

  async callToolWithAbort(name: string, args: any, abortSignal?: AbortSignal): Promise<any> {
    if (!this.initialized) {
      await this.initialize()
    }
    
    console.log(`🔧 Calling MCP tool: ${name}`)
    
    try {
      const result = await this.sendRequest('call_tool', {
        name,
        arguments: args
      }, abortSignal)
      
      // Parse the result content if it's a string
      let parsedResult = result
      if (result.content?.[0]?.text) {
        try {
          parsedResult = JSON.parse(result.content[0].text)
        } catch (error) {
          console.warn('Failed to parse tool result as JSON:', error)
          parsedResult = { success: false, content: result.content[0].text }
        }
      }
      
      console.log(`✅ MCP tool ${name} completed:`, parsedResult.success ? '✓' : '✗')
      return parsedResult
    } catch (error) {
      if (error instanceof Error && (error.message.includes('aborted') || error.name === 'AbortError')) {
        console.log(`🛑 MCP tool ${name} was aborted`)
        throw error
      }
      
      console.error(`❌ MCP tool ${name} failed:`, error)
      throw error
    }
  }

  // Prompt methods
  async listPrompts(): Promise<any[]> {
    if (!this.initialized) {
      await this.initialize()
    }
    const result = await this.sendRequest('list_prompts')
    return result.prompts || []
  }

  async getPrompt(name: string, args?: any): Promise<any> {
    if (!this.initialized) {
      await this.initialize()
    }
    const result = await this.sendRequest('get_prompt', {
      name,
      arguments: args
    })
    return result
  }

  // Academy-specific convenience methods
  async createSession(name: string, description?: string, template?: string): Promise<string> {
    const result = await this.callTool('create_session', {
      name,
      description,
      template
    })
    return result.sessionId
  }

  async addParticipant(sessionId: string, participant: any): Promise<string> {
    const result = await this.callTool('add_participant', {
      sessionId,
      ...participant
    })
    return result.participantId
  }

  async analyzeConversation(sessionId: string, analysisType: string = 'full'): Promise<any> {
    const result = await this.callTool('analyze_conversation', {
      sessionId,
      analysisType
    })
    return result.analysis
  }

  // AI Provider Methods with abort support
  async callClaude(messages: any[], systemPrompt?: string, settings?: any, abortSignal?: AbortSignal): Promise<any> {
    return this.callToolWithAbort('claude_chat', {
      messages,
      systemPrompt,
      temperature: settings?.temperature || 0.7,
      maxTokens: settings?.maxTokens || 1500,
      model: settings?.model || 'claude-3-5-sonnet-20241022'
    }, abortSignal)
  }

  async callOpenAI(messages: any[], settings?: any, abortSignal?: AbortSignal): Promise<any> {
    return this.callToolWithAbort('openai_chat', {
      messages,
      temperature: settings?.temperature || 0.7,
      maxTokens: settings?.maxTokens || 1500,
      model: settings?.model || 'gpt-4o'
    }, abortSignal)
  }

  // Cancel all active requests
  cancelAllRequests(): void {
    console.log(`🛑 Cancelling ${this.activeRequests.size} active MCP requests`)
    
    this.activeRequests.forEach((controller, requestId) => {
      controller.abort()
      console.log(`🛑 Cancelled MCP request: ${requestId}`)
    })
    
    this.activeRequests.clear()
  }

  // Cancel specific request by ID
  cancelRequest(requestId: string | number): boolean {
    const controller = this.activeRequests.get(requestId)
    if (controller) {
      controller.abort()
      this.activeRequests.delete(requestId)
      console.log(`🛑 Cancelled MCP request: ${requestId}`)
      return true
    }
    return false
  }

  // Event handling
  on(event: string, listener: (data: any) => void): void {
    if (!this.eventListeners.has(event)) {
      this.eventListeners.set(event, [])
    }
    this.eventListeners.get(event)!.push(listener)
  }

  off(event: string, listener: (data: any) => void): void {
    const listeners = this.eventListeners.get(event)
    if (listeners) {
      const index = listeners.indexOf(listener)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }

  private emit(event: string, data: any): void {
    const listeners = this.eventListeners.get(event) || []
    listeners.forEach(listener => {
      try {
        listener(data)
      } catch (error) {
        console.error(`Error in event listener for ${event}:`, error)
      }
    })
  }

  // State management
  async refreshResources(): Promise<void> {
    try {
      await this.listResources()
      this.emit('resourcesUpdated', {})
    } catch (error) {
      console.error('Failed to refresh resources:', error)
    }
  }

  // Connection management
  async reconnect(): Promise<void> {
    // Cancel all active requests first
    this.cancelAllRequests()
    
    this.initialized = false
    await this.initialize()
  }

  disconnect(): void {
    // Cancel all active requests
    this.cancelAllRequests()
    
    this.initialized = false
    this.eventListeners.clear()
  }

  // Utility methods
  isConnected(): boolean {
    return this.initialized
  }

  getConnectionStatus(): 'connected' | 'connecting' | 'disconnected' | 'error' {
    if (this.initialized) return 'connected'
    return 'disconnected'
  }

  get isInitialized(): boolean {
    return this.initialized
  }

  get activeRequestCount(): number {
    return this.activeRequests.size
  }
}