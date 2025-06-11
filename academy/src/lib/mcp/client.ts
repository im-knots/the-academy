// src/lib/mcp/client.ts - Updated with complete Phase 1 & 2 MCP methods
import { JSONRPCRequest, JSONRPCResponse } from './types'
import { useChatStore } from '@/lib/stores/chatStore'

export class MCPClient {
  private baseUrl: string
  private initialized = false
  private requestId = 1

  constructor(baseUrl: string = '/api/mcp') {
    this.baseUrl = baseUrl
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

      console.log('✅ MCP Client initialized:', response)
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

      if ('error' in jsonResponse) {
        throw new Error(`MCP Error: ${jsonResponse.error.message}`)
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
    return result.contents && result.contents[0] ? JSON.parse(result.contents[0].text) : null
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
    
    if (result.success && result.sessionData) {
      // Apply the session creation to the store
      const store = useChatStore.getState()
      
      // Add the session to the store
      store.createSession(
        result.sessionData.name,
        result.sessionData.description,
        result.sessionData.metadata,
        result.sessionData.participants.map((p: any) => ({
          ...p,
          id: undefined, // Let store generate new IDs
          joinedAt: undefined,
          messageCount: undefined
        }))
      )
      
      console.log(`✅ Session created via MCP: ${result.sessionId}`)
      
      // Update MCP store reference
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
      // Apply the deletion to the store
      const store = useChatStore.getState()
      store.deleteSession(sessionId)
      
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
      // Apply the update to the store
      const store = useChatStore.getState()
      const updates: any = {}
      if (name !== undefined) updates.name = name
      if (description !== undefined) updates.description = description
      if (metadata !== undefined) updates.metadata = metadata
      
      store.updateSession(sessionId, updates)
      
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
      // Apply the switch to the store
      const store = useChatStore.getState()
      store.setCurrentSession(sessionId)
      
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
      // Apply the duplication to the store
      const store = useChatStore.getState()
      store.duplicateSession(sessionId, newName, includeMessages)
      
      console.log(`✅ Session duplicated via MCP: ${sessionId} -> ${result.newSessionId}`)
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
      // Apply the import to the store
      const store = useChatStore.getState()
      store.importSession(sessionData, name)
      
      console.log(`✅ Session imported via MCP: ${result.sessionId}`)
      this.updateStoreReference()
      
      return result
    } else {
      throw new Error('Failed to import session via MCP')
    }
  }

  async getSessionTemplates(): Promise<any[]> {
    console.log(`📋 Getting session templates via MCP`)
    
    const result = await this.callTool('list_templates', {})
    
    if (result.success) {
      console.log(`✅ Retrieved ${result.templates.length} session templates`)
      return result.templates
    } else {
      throw new Error('Failed to get session templates via MCP')
    }
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
      // Apply the creation to the store
      const store = useChatStore.getState()
      store.setCurrentSession(result.sessionId)
      
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
    
    if (result.success && result.messageData) {
      // Apply the message to the store
      const store = useChatStore.getState()
      
      // Check if this is the current session
      if (store.currentSession?.id === sessionId) {
        store.addMessage({
          content: result.messageData.content,
          participantId: result.messageData.participantId,
          participantName: result.messageData.participantName,
          participantType: result.messageData.participantType
        })
        
        console.log(`✅ Message sent via MCP to session: ${sessionId}`)
        
        // Update MCP store reference
        this.updateStoreReference()
      }
      
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
      // Apply the participant addition to the store
      const store = useChatStore.getState()
      store.addParticipant(sessionId, {
        name,
        type,
        provider,
        model,
        settings: settings || {},
        characteristics: characteristics || {}
      })
      
      console.log(`✅ Participant added via MCP: ${result.participantId}`)
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
      // Apply the participant removal to the store
      const store = useChatStore.getState()
      store.removeParticipant(sessionId, participantId)
      
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
      ...updates
    })
    
    if (result.success) {
      // Apply the participant update to the store
      const store = useChatStore.getState()
      store.updateParticipant(sessionId, participantId, updates)
      
      console.log(`✅ Participant updated via MCP: ${participantId}`)
      this.updateStoreReference()
      
      return result
    } else {
      throw new Error('Failed to update participant via MCP')
    }
  }

  async updateParticipantStatusViaMCP(sessionId: string, participantId: string, status: string): Promise<any> {
    console.log(`📊 Updating participant status via MCP: ${participantId} -> ${status}`)
    
    const result = await this.callTool('update_participant_status', {
      sessionId,
      participantId,
      status
    })
    
    if (result.success) {
      // Apply the status update to the store
      const store = useChatStore.getState()
      store.updateParticipant(sessionId, participantId, { status })
      
      console.log(`✅ Participant status updated via MCP: ${participantId}`)
      this.updateStoreReference()
      
      return result
    } else {
      throw new Error('Failed to update participant status via MCP')
    }
  }

  async getAvailableModelsViaMCP(provider?: string): Promise<any> {
    console.log(`🤖 Getting available models via MCP`)
    
    const result = await this.callTool('list_available_models', { provider })
    
    if (result.success) {
      console.log(`✅ Retrieved ${result.models.length} available models`)
      return result
    } else {
      throw new Error('Failed to get available models via MCP')
    }
  }

  async getParticipantConfigViaMCP(sessionId: string, participantId: string): Promise<any> {
    console.log(`⚙️ Getting participant config via MCP: ${participantId}`)
    
    const result = await this.callTool('get_participant_config', {
      sessionId,
      participantId
    })
    
    if (result.success) {
      console.log(`✅ Retrieved participant config via MCP: ${participantId}`)
      return result
    } else {
      throw new Error('Failed to get participant config via MCP')
    }
  }

  // ========================================
  // PHASE 1: CONVERSATION CONTROL METHODS (COMPLETE)
  // ========================================

  async startConversationViaMCP(sessionId: string, initialPrompt?: string): Promise<any> {
    console.log(`🔧 Starting conversation via MCP for session: ${sessionId}`)
    
    const result = await this.callTool('start_conversation', {
      sessionId,
      initialPrompt
    })
    
    if (result.success) {
      console.log(`✅ Conversation start instruction received via MCP for session: ${sessionId}`)
      
      // The result contains instructions for the client to execute
      // Import and execute the conversation manager
      try {
        const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
        const conversationManager = MCPConversationManager.getInstance()
        
        // Execute the conversation start
        await conversationManager.startConversation(sessionId, initialPrompt)
        
        return result
      } catch (error) {
        console.error('Failed to start conversation via manager:', error)
        throw new Error('Failed to execute conversation start instruction')
      }
    } else {
      throw new Error('Failed to get conversation start instruction from MCP')
    }
  }

  async pauseConversationViaMCP(sessionId: string): Promise<any> {
    console.log(`🔧 Pausing conversation via MCP for session: ${sessionId}`)
    
    const result = await this.callTool('pause_conversation', {
      sessionId
    })
    
    if (result.success) {
      console.log(`✅ Conversation pause instruction received via MCP for session: ${sessionId}`)
      
      // Execute the conversation pause
      try {
        const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
        const conversationManager = MCPConversationManager.getInstance()
        
        // Execute the conversation pause
        conversationManager.pauseConversation(sessionId)
        
        return result
      } catch (error) {
        console.error('Failed to pause conversation via manager:', error)
        throw new Error('Failed to execute conversation pause instruction')
      }
    } else {
      throw new Error('Failed to get conversation pause instruction from MCP')
    }
  }

  async resumeConversationViaMCP(sessionId: string): Promise<any> {
    console.log(`▶️ Resuming conversation via MCP for session: ${sessionId}`)
    
    const result = await this.callTool('resume_conversation', {
      sessionId
    })
    
    if (result.success) {
      console.log(`✅ Conversation resume instruction received via MCP for session: ${sessionId}`)
      
      // Execute the conversation resume
      try {
        const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
        const conversationManager = MCPConversationManager.getInstance()
        
        // Execute the conversation resume
        conversationManager.resumeConversation(sessionId)
        
        return result
      } catch (error) {
        console.error('Failed to resume conversation via manager:', error)
        throw new Error('Failed to execute conversation resume instruction')
      }
    } else {
      throw new Error('Failed to get conversation resume instruction from MCP')
    }
  }

  async stopConversationViaMCP(sessionId: string): Promise<any> {
    console.log(`🛑 Stopping conversation via MCP for session: ${sessionId}`)
    
    const result = await this.callTool('stop_conversation', {
      sessionId
    })
    
    if (result.success) {
      console.log(`✅ Conversation stop instruction received via MCP for session: ${sessionId}`)
      
      // Execute the conversation stop
      try {
        const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
        const conversationManager = MCPConversationManager.getInstance()
        
        // Execute the conversation stop
        conversationManager.stopConversation(sessionId)
        
        return result
      } catch (error) {
        console.error('Failed to stop conversation via manager:', error)
        throw new Error('Failed to execute conversation stop instruction')
      }
    } else {
      throw new Error('Failed to get conversation stop instruction from MCP')
    }
  }

  async injectPromptViaMCP(sessionId: string, prompt: string): Promise<any> {
    console.log(`💉 Injecting prompt via MCP for session: ${sessionId}`)
    
    const result = await this.callTool('inject_prompt', {
      sessionId,
      prompt
    })
    
    if (result.success) {
      console.log(`✅ Prompt injection instruction received via MCP for session: ${sessionId}`)
      
      // Execute the prompt injection
      try {
        const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
        const conversationManager = MCPConversationManager.getInstance()
        
        // Execute the prompt injection
        await conversationManager.injectPrompt(sessionId, prompt)
        
        return result
      } catch (error) {
        console.error('Failed to inject prompt via manager:', error)
        throw new Error('Failed to execute prompt injection instruction')
      }
    } else {
      throw new Error('Failed to get prompt injection instruction from MCP')
    }
  }

  async getConversationStatusViaMCP(sessionId?: string): Promise<any> {
    console.log(`📊 Getting conversation status via MCP`)
    
    const result = await this.callTool('get_conversation_status', {
      sessionId
    })
    
    if (result.success) {
      console.log(`✅ Conversation status retrieved via MCP`)
      return result
    } else {
      throw new Error('Failed to get conversation status via MCP')
    }
  }

  // ========================================
  // PHASE 1: EXPORT METHODS
  // ========================================

  async exportSessionViaMCP(sessionId: string, format: 'json' | 'csv' = 'json', options?: any): Promise<any> {
    console.log(`📤 Exporting session via MCP: ${sessionId} (${format})`)
    
    const result = await this.callTool('export_session', {
      sessionId,
      format,
      includeAnalysis: options?.includeAnalysis !== false,
      includeMetadata: options?.includeMetadata !== false,
      ...options
    })
    
    if (result.success) {
      console.log(`✅ Session exported via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to export session via MCP')
    }
  }

  // ========================================
  // EXISTING CONVENIENCE METHODS (unchanged)
  // ========================================

  private updateStoreReference(): void {
    // Helper method to trigger store updates
    // This ensures the store is synchronized with MCP operations
    const store = useChatStore.getState()
    store.setLastUpdate()
  }

  // Analysis Methods (existing)
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

  // AI Provider Methods (existing)
  async callClaudeViaMCP(message: string, systemPrompt?: string, sessionId?: string, participantId?: string): Promise<any> {
    const result = await this.callTool('claude_chat', {
      message,
      systemPrompt,
      sessionId,
      participantId
    })
    
    if (result.success) {
      console.log(`✅ Claude API called via MCP`)
      return result
    } else {
      throw new Error('Failed to call Claude API via MCP')
    }
  }

  async callOpenAIViaMCP(message: string, systemPrompt?: string, model?: string, sessionId?: string, participantId?: string): Promise<any> {
    const result = await this.callTool('openai_chat', {
      message,
      systemPrompt,
      model,
      sessionId,
      participantId
    })
    
    if (result.success) {
      console.log(`✅ OpenAI API called via MCP`)
      return result
    } else {
      throw new Error('Failed to call OpenAI API via MCP')
    }
  }

  // Debug Methods (existing)
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