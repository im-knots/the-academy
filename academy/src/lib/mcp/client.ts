// src/lib/mcp/client.ts - Updated to work with Direct API Server
import { JSONRPCRequest, JSONRPCResponse } from './types'
import { useChatStore } from '@/lib/stores/chatStore'

export class MCPClient {
  private static instance: MCPClient
  private baseUrl: string
  private initialized = false
  private requestId = 1

  private constructor(baseUrl: string = '/api/mcp') {
    this.baseUrl = baseUrl
  }

  // CRITICAL: Singleton pattern implementation
  static getInstance(baseUrl: string = '/api/mcp'): MCPClient {
    if (!MCPClient.instance) {
      MCPClient.instance = new MCPClient(baseUrl)
    }
    return MCPClient.instance
  }

  private generateRequestId(): number {
    return this.requestId++
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      const response = await this.sendRequest('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: { subscribe: true },
          tools: { listChanged: true },
          prompts: { listChanged: true }
        },
        clientInfo: {
          name: 'academy-mcp-client',
          version: '1.0.0'
        }
      })

      console.log('✅ MCP Client initialized with direct API support:', response)
      this.initialized = true
    } catch (error) {
      console.error('❌ MCP Client initialization failed:', error)
      throw error
    }
  }

  async sendRequest(method: string, params?: any, abortSignal?: AbortSignal): Promise<any> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method,
      params
    }

    try {
      const response = await fetch(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abortSignal
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      const jsonResponse: JSONRPCResponse = await response.json()

      if ('error' in jsonResponse && jsonResponse.error) {
        throw new Error(`MCP Error: ${jsonResponse.error.message || 'Unknown error'}`)
      }

      return jsonResponse.result
    } catch (error) {
      if (error instanceof Error && (error.message.includes('aborted') || error.name === 'AbortError')) {
        console.log(`🛑 MCP request ${method} was aborted`)
        throw error
      }
      
      console.error(`❌ MCP request ${method} failed:`, error)
      throw error
    }
  }

  isConnected(): boolean {
    return this.initialized
  }

  disconnect(): void {
    this.initialized = false
    console.log('🔌 MCP Client disconnected')
  }

  // Helper method to update store reference
  private updateStoreReference(): void {
    try {
      const { setMCPStoreReference } = require('./server')
      setMCPStoreReference(useChatStore.getState())
    } catch (error) {
      console.warn('Could not update MCP store reference:', error)
    }
  }

  // Helper method to sync errors with store
  private syncErrorsWithStore(sessionId?: string): void {
    try {
      // Get errors from MCP server
      this.getAPIErrors(sessionId)
        .then((result) => {
          if (result.success && result.errors) {
            const store = useChatStore.getState();
            
            // Add new errors to store
            result.errors.forEach((error: any) => {
              // Check if error already exists in store
              const existingError = store.apiErrors.find(e => e.id === error.id);
              if (!existingError) {
                store.addAPIError({
                  id: error.id,
                  timestamp: new Date(error.timestamp),
                  provider: error.provider,
                  operation: error.operation,
                  attempt: error.attempt,
                  maxAttempts: error.maxAttempts,
                  error: error.error,
                  sessionId: error.sessionId,
                  participantId: error.participantId
                });
              }
            });
          }
        })
        .catch((error) => {
          console.warn('Failed to sync errors with store:', error);
        });
    } catch (error) {
      console.warn('Error during error sync:', error);
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
    return result.contents && result.contents[0] ? 
      result.contents[0].mimeType === 'application/json' ? 
        JSON.parse(result.contents[0].text) : result.contents[0].text 
      : null
  }

  async refreshResources(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
    try {
      await this.sendRequest('refresh_resources')
    } catch (error) {
      console.warn('Failed to refresh resources:', error)
    }
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

  // ========================================
  // ERROR MANAGEMENT METHODS (NEW)
  // ========================================

  async getAPIErrors(sessionId?: string): Promise<any> {
    const result = await this.callTool('get_api_errors', { sessionId })
    
    if (result.success) {
      console.log(`✅ API errors retrieved via MCP`)
      return result
    } else {
      throw new Error('Failed to get API errors via MCP')
    }
  }

  async clearAPIErrors(sessionId?: string): Promise<any> {
    const result = await this.callTool('clear_api_errors', { sessionId })
    
    if (result.success) {
      console.log(`✅ API errors cleared via MCP`)
      // Also clear from local store
      if (sessionId) {
        // Clear session-specific errors
        const store = useChatStore.getState()
        const remainingErrors = store.apiErrors.filter(e => e.sessionId !== sessionId)
        store.clearAPIErrors()
        remainingErrors.forEach(error => store.addAPIError(error))
      } else {
        // Clear all errors
        useChatStore.getState().clearAPIErrors()
      }
      return result
    } else {
      throw new Error('Failed to clear API errors via MCP')
    }
  }

  // ========================================
  // PHASE 1: SESSION MANAGEMENT METHODS (COMPLETE)
  // ========================================

  async createSessionViaMCP(name: string, description?: string, template?: string, participants?: any[]): Promise<any> {
    console.log(`🔧 Creating session via MCP: ${name}`)
    
    const result = await this.callTool('create_session', {
      name,
      description,
      template,
      participants
    })
    
    if (result.success) {
      console.log(`✅ Session created via MCP: ${result.sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to create session via MCP')
    }
  }

  async deleteSessionViaMCP(sessionId: string): Promise<any> {
    console.log(`🗑️ Deleting session via MCP: ${sessionId}`)
    
    const result = await this.callTool('delete_session', { sessionId })
    
    if (result.success) {
      console.log(`✅ Session deleted via MCP: ${sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to delete session via MCP')
    }
  }

  async updateSessionViaMCP(sessionId: string, name?: string, description?: string, metadata?: any): Promise<any> {
    console.log(`✏️ Updating session via MCP: ${sessionId}`)
    
    const result = await this.callTool('update_session', {
      sessionId,
      name,
      description,
      metadata
    })
    
    if (result.success) {
      console.log(`✅ Session updated via MCP: ${sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to update session via MCP')
    }
  }

  async switchCurrentSessionViaMCP(sessionId: string): Promise<any> {
    console.log(`🔄 Switching current session via MCP: ${sessionId}`)
    
    const result = await this.callTool('switch_current_session', { sessionId })
    
    if (result.success) {
      console.log(`✅ Current session switched via MCP: ${sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to switch current session via MCP')
    }
  }

  async duplicateSessionViaMCP(sessionId: string, newName?: string, includeMessages: boolean = false): Promise<any> {
    console.log(`📋 Duplicating session via MCP: ${sessionId}`)
    
    const result = await this.callTool('duplicate_session', {
      sessionId,
      newName,
      includeMessages
    })
    
    if (result.success) {
      console.log(`✅ Session duplicated via MCP: ${result.sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to duplicate session via MCP')
    }
  }

  async importSessionViaMCP(sessionData: any, name?: string): Promise<any> {
    console.log(`📥 Importing session via MCP`)
    
    const result = await this.callTool('import_session', {
      sessionData,
      name
    })
    
    if (result.success) {
      console.log(`✅ Session imported via MCP: ${result.sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to import session via MCP')
    }
  }

  async getSessionTemplates(): Promise<any[]> {
    const result = await this.callTool('list_templates', {})
    return result.templates || []
  }

  async createSessionFromTemplateViaMCP(templateId: string, name: string, description?: string, customizations?: any): Promise<any> {
    console.log(`🎨 Creating session from template via MCP: ${templateId}`)
    
    const result = await this.callTool('create_session_from_template', {
      templateId,
      name,
      description,
      customizations
    })
    
    if (result.success) {
      console.log(`✅ Session created from template via MCP: ${result.sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to create session from template via MCP')
    }
  }

  // ========================================
  // PHASE 1: MESSAGE MANAGEMENT METHODS
  // ========================================

  async sendMessageViaMCP(sessionId: string, content: string, participantId: string, participantName: string, participantType: any): Promise<any> {
    console.log(`🔧 Sending message via MCP to session: ${sessionId}`)
    
    const result = await this.callTool('send_message', {
      sessionId,
      content,
      participantId,
      participantName,
      participantType
    })
    
    if (result.success) {
      console.log(`✅ Message sent via MCP to session: ${sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to send message via MCP')
    }
  }

  // ========================================
  // PHASE 2: PARTICIPANT MANAGEMENT METHODS (COMPLETE)
  // ========================================

  async addParticipantViaMCP(sessionId: string, name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any): Promise<any> {
    console.log(`👤 Adding participant via MCP to session: ${sessionId}`)
    
    const result = await this.callTool('add_participant', {
      sessionId,
      name,
      type,
      provider,
      model,
      settings,
      characteristics
    })
    
    if (result.success) {
      console.log(`✅ Participant added via MCP: ${result.participantData?.id}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to add participant via MCP')
    }
  }

  async removeParticipantViaMCP(sessionId: string, participantId: string): Promise<any> {
    console.log(`❌ Removing participant via MCP from session: ${sessionId}`)
    
    const result = await this.callTool('remove_participant', {
      sessionId,
      participantId
    })
    
    if (result.success) {
      console.log(`✅ Participant removed via MCP: ${participantId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to remove participant via MCP')
    }
  }

  async updateParticipantViaMCP(sessionId: string, participantId: string, updates: any): Promise<any> {
    console.log(`✏️ Updating participant via MCP: ${participantId}`)
    
    const result = await this.callTool('update_participant', {
      sessionId,
      participantId,
      updates
    })
    
    if (result.success) {
      console.log(`✅ Participant updated via MCP: ${participantId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to update participant via MCP')
    }
  }

  async updateParticipantStatusViaMCP(sessionId: string, participantId: string, status: string): Promise<any> {
    console.log(`🔄 Updating participant status via MCP: ${participantId} -> ${status}`)
    
    const result = await this.callTool('update_participant_status', {
      sessionId,
      participantId,
      status
    })
    
    if (result.success) {
      console.log(`✅ Participant status updated via MCP: ${participantId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to update participant status via MCP')
    }
  }

  async listAvailableModels(): Promise<any> {
    const result = await this.callTool('list_available_models', {})
    return result.models || { claude: [], openai: [] }
  }

  async getParticipantConfig(sessionId: string, participantId: string): Promise<any> {
    const result = await this.callTool('get_participant_config', {
      sessionId,
      participantId
    })
    return result.config || result
  }

  // ========================================
  // PHASE 4: CONVERSATION CONTROL METHODS (COMPLETE)
  // ========================================

  async startConversationViaMCP(sessionId: string, initialPrompt?: string): Promise<any> {
    console.log(`🚀 Starting conversation via MCP: ${sessionId}`)
    
    const result = await this.callTool('start_conversation', {
      sessionId,
      initialPrompt
    })
    
    if (result.success) {
      console.log(`✅ Conversation started via MCP: ${sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to start conversation via MCP')
    }
  }

  async pauseConversationViaMCP(sessionId: string): Promise<any> {
    console.log(`⏸️ Pausing conversation via MCP: ${sessionId}`)
    
    const result = await this.callTool('pause_conversation', { sessionId })
    
    if (result.success) {
      console.log(`✅ Conversation paused via MCP: ${sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to pause conversation via MCP')
    }
  }

  async resumeConversationViaMCP(sessionId: string): Promise<any> {
    console.log(`▶️ Resuming conversation via MCP: ${sessionId}`)
    
    const result = await this.callTool('resume_conversation', { sessionId })
    
    if (result.success) {
      console.log(`✅ Conversation resumed via MCP: ${sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to resume conversation via MCP')
    }
  }

  async stopConversationViaMCP(sessionId: string): Promise<any> {
    console.log(`🛑 Stopping conversation via MCP: ${sessionId}`)
    
    const result = await this.callTool('stop_conversation', { sessionId })
    
    if (result.success) {
      console.log(`✅ Conversation stopped via MCP: ${sessionId}`)
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to stop conversation via MCP')
    }
  }

  async getConversationStatusViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('get_conversation_status', { sessionId })
    return result.status || {}
  }

  async getConversationStatsViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('get_conversation_stats', { sessionId })
    return result.stats || {}
  }

  // ========================================
  // PHASE 3: MESSAGE CONTROL METHODS
  // ========================================

  async updateMessageViaMCP(sessionId: string, messageId: string, content: string): Promise<any> {
    const result = await this.callTool('update_message', {
      sessionId,
      messageId,
      content
    })
    
    if (result.success) {
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to update message via MCP')
    }
  }

  async deleteMessageViaMCP(sessionId: string, messageId: string): Promise<any> {
    const result = await this.callTool('delete_message', {
      sessionId,
      messageId
    })
    
    if (result.success) {
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to delete message via MCP')
    }
  }

  async clearMessagesViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('clear_messages', { sessionId })
    
    if (result.success) {
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to clear messages via MCP')
    }
  }

  async injectModeratorPromptViaMCP(sessionId: string, prompt: string): Promise<any> {
    const result = await this.callTool('inject_moderator_prompt', {
      sessionId,
      prompt
    })
    
    if (result.success) {
      this.updateStoreReference()
      return result
    } else {
      throw new Error('Failed to inject moderator prompt via MCP')
    }
  }

  // Alias method for backward compatibility
  async injectPromptViaMCP(sessionId: string, prompt: string): Promise<any> {
    return this.injectModeratorPromptViaMCP(sessionId, prompt)
  }

  // ========================================
  // PHASE 5: EXPORT METHODS
  // ========================================

  async exportSessionViaMCP(sessionId: string, format: 'json' | 'csv' = 'json', options: any = {}): Promise<any> {
    const result = await this.callTool('export_session', {
      sessionId,
      format,
      ...options
    })
    return result.data || result
  }

  async exportAnalysisTimelineViaMCP(sessionId: string, format: 'json' | 'csv' = 'json'): Promise<any> {
    const result = await this.callTool('export_analysis_timeline', {
      sessionId,
      format
    })
    return result.data || result
  }

  async getExportPreviewViaMCP(sessionId: string, format: 'json' | 'csv' = 'json'): Promise<any> {
    const result = await this.callTool('get_export_preview', {
      sessionId,
      format
    })
    return result.preview || result
  }

  // ========================================
  // PHASE 6: LIVE ANALYSIS METHODS
  // ========================================

  async triggerLiveAnalysisViaMCP(sessionId: string, analysisType: string = 'full'): Promise<any> {
    const result = await this.callTool('trigger_live_analysis', {
      sessionId,
      analysisType
    })
    return result.analysis || result
  }

  async setAnalysisProviderViaMCP(provider: string): Promise<any> {
    const result = await this.callTool('set_analysis_provider', { provider })
    return result
  }

  async getAnalysisProvidersViaMCP(): Promise<any[]> {
    const result = await this.callTool('get_analysis_providers', {})
    return result.providers || []
  }

  async autoAnalyzeConversationViaMCP(sessionId: string, enabled: boolean): Promise<any> {
    const result = await this.callTool('auto_analyze_conversation', {
      sessionId,
      enabled
    })
    return result
  }

  // ========================================
  // ANALYSIS MANAGEMENT METHODS
  // ========================================

  async saveAnalysisSnapshotViaMCP(sessionId: string, analysis: any, analysisType?: string): Promise<any> {
    const result = await this.callTool('save_analysis_snapshot', {
      sessionId,
      analysis,
      analysisType
    })
    
    if (result.success) {
      console.log(`✅ Analysis snapshot saved via MCP for session: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to save analysis snapshot via MCP')
    }
  }

  async getAnalysisHistoryViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('get_analysis_history', { sessionId })
    
    if (result.success) {
      console.log(`✅ Analysis history retrieved via MCP for session: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to get analysis history via MCP')
    }
  }

  async clearAnalysisHistoryViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('clear_analysis_history', { sessionId })
    
    if (result.success) {
      console.log(`✅ Analysis history cleared via MCP for session: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to clear analysis history via MCP')
    }
  }

  async analyzeConversationViaMCP(sessionId: string, analysisType: string = 'full'): Promise<any> {
    const result = await this.callTool('analyze_conversation', {
      sessionId,
      analysisType
    })
    
    if (result.success) {
      console.log(`✅ Conversation analyzed via MCP for session: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to analyze conversation via MCP')
    }
  }

  // ========================================
  // AI PROVIDER METHODS (Updated for Direct API)
  // ========================================

  async callClaudeViaMCP(message: string, systemPrompt?: string, sessionId?: string, participantId?: string): Promise<any> {
    try {
      const result = await this.callTool('claude_chat', {
        message,
        systemPrompt,
        sessionId,
        participantId
      })
      
      if (result.success) {
        console.log(`✅ Claude API called via MCP (with retry support)`)
        return result
      } else {
        throw new Error('Failed to call Claude API via MCP')
      }
    } catch (error) {
      console.error('Failed to call Claude via MCP:', error)
      
      // Sync any errors that occurred during the call
      this.syncErrorsWithStore(sessionId)
      
      throw error
    }
  }

  async callOpenAIViaMCP(message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string): Promise<any> {
    try {
      const result = await this.callTool('openai_chat', {
        message,
        systemPrompt,
        model,
        sessionId,
        participantId
      })
      
      if (result.success) {
        console.log(`✅ OpenAI API called via MCP (with retry support)`)
        return result
      } else {
        throw new Error('Failed to call OpenAI API via MCP')
      }
    } catch (error) {
      console.error('Failed to call OpenAI via MCP:', error)
      
      // Sync any errors that occurred during the call
      this.syncErrorsWithStore(sessionId)
      
      throw error
    }
  }

  // Debug Methods
  async debugStoreViaMCP(): Promise<any> {
    const result = await this.callTool('debug_store', {})
    
    if (result.success) {
      console.log(`✅ Store debug info retrieved via MCP`)
      return result
    } else {
      throw new Error('Failed to get store debug info via MCP')
    }
  }
}