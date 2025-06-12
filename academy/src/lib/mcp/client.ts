// src/lib/mcp/client.ts - Fixed with Proper Retry Logic and Error Tracking
import { JSONRPCRequest, JSONRPCResponse, APIError, RetryConfig } from './types'
import { useChatStore } from '@/lib/stores/chatStore'

export class MCPClient {
  private static instance: MCPClient
  private baseUrl: string
  private initialized = false
  private requestId = 1

  // Retry configuration for network errors
  private defaultRetryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1 second
    maxDelay: 8000,  // 8 seconds max
    retryCondition: (error: any) => {
      // Never retry if request was aborted by user
      if (error?.name === 'AbortError' || 
          error?.message?.includes('aborted') || 
          error?.message?.includes('Request was aborted')) {
        console.log(`🛑 MCP Client: Request was aborted by user - no retry`);
        return false;
      }

      // Retry on network errors, timeouts, but not on auth/quota errors
      const errorStr = error?.message?.toLowerCase() || '';
      const isNetworkError = (
        errorStr.includes('network') ||
        errorStr.includes('timeout') ||
        errorStr.includes('econnreset') ||
        errorStr.includes('enotfound') ||
        errorStr.includes('socket') ||
        errorStr.includes('fetch') ||
        errorStr.includes('failed to fetch') ||
        errorStr.includes('connection') ||
        error?.code === 'ECONNRESET' ||
        error?.code === 'ENOTFOUND' ||
        error?.code === 'ECONNREFUSED' ||
        error?.name === 'NetworkError' ||
        error?.name === 'TypeError' && errorStr.includes('fetch')
      );
      
      // Also retry on HTTP 5xx server errors
      const isServerError = error?.status >= 500 && error?.status < 600;
      
      // Don't retry on 4xx errors (client errors like auth failures)
      const isClientError = error?.status >= 400 && error?.status < 500;
      
      const shouldRetry = (isNetworkError || isServerError) && !isClientError;
      
      console.log(`🔍 MCP Client: Checking if error is retryable: "${errorStr}" (status: ${error?.status}) -> ${shouldRetry}`);
      return shouldRetry;
    }
  };
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

  // Enhanced method to get current session context
  private getCurrentSessionContext(): { sessionId?: string; participantId?: string } {
    try {
      const store = useChatStore.getState();
      const currentSession = store.currentSession;
      
      return {
        sessionId: currentSession?.id,
        participantId: undefined // Will be set by specific operations if needed
      };
    } catch (error) {
      console.warn('⚠️ MCP Client: Failed to get session context:', error);
      return {};
    }
  }

  // Log errors to the error tracking system - only log final failures
  private logError(error: any, context: {
    operation: string;
    attempt: number;
    maxAttempts: number;
    sessionId?: string;
    participantId?: string;
    isFinalFailure?: boolean;
  }): void {
    // Only log final failures or single attempts to avoid spam
    if (!context.isFinalFailure && context.attempt < context.maxAttempts) {
      return;
    }

    try {
      const store = useChatStore.getState();
      const apiError: APIError = {
        id: `mcp-client-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        timestamp: new Date(),
        provider: 'claude', // Default to claude since it's the most common
        operation: context.operation,
        attempt: context.attempt,
        maxAttempts: context.maxAttempts,
        error: error instanceof Error ? error.message : String(error),
        sessionId: context.sessionId,
        participantId: context.participantId
      };
      
      store.addAPIError(apiError);
      console.log(`🚨 MCP Client: Error logged for export:`, apiError);
    } catch (logError) {
      console.warn('⚠️ MCP Client: Failed to log error:', logError);
    }
  }

  // Retry logic with exponential backoff - enhanced with better context handling
  private async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: {
      operationName: string;
      sessionId?: string;
      participantId?: string;
    },
    config: Partial<RetryConfig> = {}
  ): Promise<T> {
    const finalConfig = { ...this.defaultRetryConfig, ...config };
    const sessionContext = this.getCurrentSessionContext();
    const fullContext = {
      ...sessionContext,
      ...context
    };
    
    let lastError: any;

    for (let attempt = 1; attempt <= finalConfig.maxRetries + 1; attempt++) {
      try {
        if (attempt > 1) {
          console.log(`🔄 MCP Client: Retry attempt ${attempt}/${finalConfig.maxRetries + 1} for ${fullContext.operationName}`);
        }
        return await operation();
      } catch (error) {
        lastError = error;
        console.error(`❌ MCP Client: Attempt ${attempt} failed for ${fullContext.operationName}:`, error);

        const isLastAttempt = attempt >= finalConfig.maxRetries + 1;
        const isRetryable = finalConfig.retryCondition?.(error);

        // Log error for export (only final failures)
        this.logError(error, {
          operation: fullContext.operationName,
          attempt,
          maxAttempts: finalConfig.maxRetries + 1,
          sessionId: fullContext.sessionId,
          participantId: fullContext.participantId,
          isFinalFailure: isLastAttempt || !isRetryable
        });

        // Check if we should retry
        if (!isLastAttempt && isRetryable) {
          const delay = Math.min(
            finalConfig.baseDelay * Math.pow(2, attempt - 1),
            finalConfig.maxDelay
          );
          console.log(`⏳ MCP Client: Retrying ${fullContext.operationName} in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }

        // No more retries or not retryable
        if (isLastAttempt) {
          console.error(`💥 MCP Client: ${fullContext.operationName} failed after ${finalConfig.maxRetries + 1} attempts`);
        } else {
          console.error(`💥 MCP Client: ${fullContext.operationName} error not retryable:`, error);
        }
        break;
      }
    }

    throw lastError;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      const response = await this.retryWithBackoff(
        () => this.sendRequestInternal('initialize', {
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
        }),
        { operationName: 'initialize' }
      )

      console.log('✅ MCP Client initialized with direct API support:', response)
      this.initialized = true
    } catch (error) {
      console.error('❌ MCP Client initialization failed:', error)
      throw error
    }
  }

  // Internal sendRequest without retry (used by retryWithBackoff)
  private async sendRequestInternal(method: string, params?: any, abortSignal?: AbortSignal): Promise<any> {
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: this.generateRequestId(),
      method,
      params
    }

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
  }

  async sendRequest(method: string, params?: any, abortSignal?: AbortSignal): Promise<any> {
    // Only skip retry if signal is ALREADY aborted
    if (abortSignal?.aborted) {
      throw new Error('Request was aborted')
    }

    // ALWAYS use retry logic - let retryCondition decide what's retryable
    return this.retryWithBackoff(
      () => this.sendRequestInternal(method, params, abortSignal),
      { 
        operationName: method,
        sessionId: this.getCurrentSessionContext().sessionId
      }
    )
  }

  // Enhanced sendRequest that accepts additional context
  async sendRequestWithContext(method: string, params?: any, abortSignal?: AbortSignal, additionalContext?: { sessionId?: string; participantId?: string }): Promise<any> {
    // Only skip retry if signal is ALREADY aborted
    if (abortSignal?.aborted) {
      throw new Error('Request was aborted')
    }

    const sessionContext = this.getCurrentSessionContext();
    const fullContext = {
      ...sessionContext,
      ...additionalContext
    };

    // Use retry logic for ALL requests, let retryCondition handle abort detection
    return this.retryWithBackoff(
      () => this.sendRequestInternal(method, params, abortSignal),
      { 
        operationName: method,
        sessionId: fullContext.sessionId,
        participantId: fullContext.participantId
      }
    )
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
    
    // Extract context from args if available
    const toolContext = {
      sessionId: args?.sessionId,
      participantId: args?.participantId
    };
    
    try {
      // Use enhanced sendRequest that includes context
      const result = await this.sendRequestWithContext('call_tool', {
        name,
        arguments: args
      }, abortSignal, toolContext)
      
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
      
      // Sync any errors that occurred during the call
      this.syncErrorsWithStore(toolContext.sessionId)
      
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
    const result = await this.callTool('create_session', {
      name,
      description,
      template,
      participants
    })
    
    if (result.success) {
      console.log(`✅ Session created via MCP: ${result.sessionId}`)
      return result
    } else {
      throw new Error('Failed to create session via MCP')
    }
  }

  async deleteSessionViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('delete_session', { sessionId })
    
    if (result.success) {
      console.log(`✅ Session deleted via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to delete session via MCP')
    }
  }

  async updateSessionViaMCP(sessionId: string, name?: string, description?: string, metadata?: any): Promise<any> {
    const result = await this.callTool('update_session', {
      sessionId,
      name,
      description,
      metadata
    })
    
    if (result.success) {
      console.log(`✅ Session updated via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to update session via MCP')
    }
  }

  async switchCurrentSessionViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('switch_current_session', { sessionId })
    
    if (result.success) {
      console.log(`✅ Current session switched via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to switch current session via MCP')
    }
  }

  async duplicateSessionViaMCP(sessionId: string, newName?: string, includeMessages: boolean = false): Promise<any> {
    const result = await this.callTool('duplicate_session', {
      sessionId,
      newName,
      includeMessages
    })
    
    if (result.success) {
      console.log(`✅ Session duplicated via MCP: ${sessionId} -> ${result.newSessionId}`)
      return result
    } else {
      throw new Error('Failed to duplicate session via MCP')
    }
  }

  async importSessionViaMCP(sessionData: any, name?: string): Promise<any> {
    const result = await this.callTool('import_session', {
      sessionData,
      name
    })
    
    if (result.success) {
      console.log(`✅ Session imported via MCP: ${result.sessionId}`)
      return result
    } else {
      throw new Error('Failed to import session via MCP')
    }
  }

  async getSessionTemplates(): Promise<any[]> {
    const result = await this.callTool('get_session_templates', {})
    
    if (result.success) {
      console.log(`✅ Session templates retrieved via MCP: ${result.templates?.length || 0} templates`)
      return result.templates || []
    } else {
      throw new Error('Failed to get session templates via MCP')
    }
  }

  async createSessionFromTemplateViaMCP(templateId: string, name: string, description?: string, customizations?: any): Promise<any> {
    const result = await this.callTool('create_session_from_template', {
      templateId,
      name,
      description,
      customizations
    })
    
    if (result.success) {
      console.log(`✅ Session created from template via MCP: ${result.sessionId}`)
      return result
    } else {
      throw new Error('Failed to create session from template via MCP')
    }
  }

  async sendMessageViaMCP(sessionId: string, content: string, participantId: string, participantName: string, participantType: any): Promise<any> {
    const result = await this.callTool('send_message', {
      sessionId,
      content,
      participantId,
      participantName,
      participantType
    })
    
    if (result.success) {
      console.log(`✅ Message sent via MCP to session: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to send message via MCP')
    }
  }

  // ========================================
  // PHASE 2: PARTICIPANT MANAGEMENT METHODS (COMPLETE)
  // ========================================

  async addParticipantViaMCP(sessionId: string, name: string, type: any, provider?: string, model?: string, settings?: any, characteristics?: any): Promise<any> {
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
      console.log(`✅ Participant added via MCP: ${result.participantId}`)
      return result
    } else {
      throw new Error('Failed to add participant via MCP')
    }
  }

  async removeParticipantViaMCP(sessionId: string, participantId: string): Promise<any> {
    const result = await this.callTool('remove_participant', {
      sessionId,
      participantId
    })
    
    if (result.success) {
      console.log(`✅ Participant removed via MCP: ${participantId}`)
      return result
    } else {
      throw new Error('Failed to remove participant via MCP')
    }
  }

  async updateParticipantViaMCP(sessionId: string, participantId: string, updates: any): Promise<any> {
    const result = await this.callTool('update_participant', {
      sessionId,
      participantId,
      updates
    })
    
    if (result.success) {
      console.log(`✅ Participant updated via MCP: ${participantId}`)
      return result
    } else {
      throw new Error('Failed to update participant via MCP')
    }
  }

  async updateParticipantStatusViaMCP(sessionId: string, participantId: string, status: string): Promise<any> {
    const result = await this.callTool('update_participant_status', {
      sessionId,
      participantId,
      status
    })
    
    if (result.success) {
      console.log(`✅ Participant status updated via MCP: ${participantId} -> ${status}`)
      return result
    } else {
      throw new Error('Failed to update participant status via MCP')
    }
  }

  async listAvailableModels(): Promise<any> {
    const result = await this.callTool('get_available_models', {})
    
    if (result.success) {
      console.log(`✅ Available models retrieved via MCP`)
      return result.models || {}
    } else {
      throw new Error('Failed to get available models via MCP')
    }
  }

  async getParticipantConfig(sessionId: string, participantId: string): Promise<any> {
    const result = await this.callTool('get_participant_config', {
      sessionId,
      participantId
    })
    
    if (result.success) {
      console.log(`✅ Participant config retrieved via MCP: ${participantId}`)
      return result.config
    } else {
      throw new Error('Failed to get participant config via MCP')
    }
  }

  // ========================================
  // PHASE 4: CONVERSATION CONTROL METHODS (COMPLETE)
  // ========================================

  async startConversationViaMCP(sessionId: string, initialPrompt?: string): Promise<any> {
    const result = await this.callTool('start_conversation', {
      sessionId,
      initialPrompt
    })
    
    if (result.success) {
      console.log(`✅ Conversation started via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to start conversation via MCP')
    }
  }

  async pauseConversationViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('pause_conversation', { sessionId })
    
    if (result.success) {
      console.log(`✅ Conversation paused via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to pause conversation via MCP')
    }
  }

  async resumeConversationViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('resume_conversation', { sessionId })
    
    if (result.success) {
      console.log(`✅ Conversation resumed via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to resume conversation via MCP')
    }
  }

  async stopConversationViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('stop_conversation', { sessionId })
    
    if (result.success) {
      console.log(`✅ Conversation stopped via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to stop conversation via MCP')
    }
  }

  async getConversationStatusViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('get_conversation_status', { sessionId })
    
    if (result.success) {
      return result.status
    } else {
      throw new Error('Failed to get conversation status via MCP')
    }
  }

  async getConversationStatsViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('get_conversation_stats', { sessionId })
    
    if (result.success) {
      return result.stats
    } else {
      throw new Error('Failed to get conversation stats via MCP')
    }
  }

  async injectPromptViaMCP(sessionId: string, prompt: string, participantId?: string): Promise<any> {
    const result = await this.callTool('inject_prompt', {
      sessionId,
      prompt,
      participantId
    })
    
    if (result.success) {
      console.log(`✅ Prompt injected via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to inject prompt via MCP')
    }
  }

  // ========================================
  // PHASE 3: MESSAGE CONTROL METHODS (COMPLETE)
  // ========================================

  async updateMessageViaMCP(sessionId: string, messageId: string, updates: any): Promise<any> {
    const result = await this.callTool('update_message', {
      sessionId,
      messageId,
      updates
    })
    
    if (result.success) {
      console.log(`✅ Message updated via MCP: ${messageId}`)
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
      console.log(`✅ Message deleted via MCP: ${messageId}`)
      return result
    } else {
      throw new Error('Failed to delete message via MCP')
    }
  }

  async clearMessagesViaMCP(sessionId: string): Promise<any> {
    const result = await this.callTool('clear_messages', { sessionId })
    
    if (result.success) {
      console.log(`✅ Messages cleared via MCP: ${sessionId}`)
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
      console.log(`✅ Moderator prompt injected via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to inject moderator prompt via MCP')
    }
  }

  // ========================================
  // PHASE 5: EXPORT METHODS (COMPLETE)
  // ========================================

  async exportSessionViaMCP(sessionId: string, format: 'json' | 'csv' = 'json', options?: any): Promise<any> {
    const result = await this.callTool('export_session', {
      sessionId,
      format,
      includeAnalysis: options?.includeAnalysis || false,
      includeMetadata: options?.includeMetadata !== false,
      includeErrors: options?.includeErrors !== false
    })
    
    if (result.success) {
      console.log(`✅ Session exported via MCP: ${sessionId} (${format.toUpperCase()})`)
      return result
    } else {
      throw new Error('Failed to export session via MCP')
    }
  }

  async exportAnalysisTimelineViaMCP(sessionId: string, format: 'json' | 'csv' = 'json'): Promise<any> {
    const result = await this.callTool('export_analysis_timeline', {
      sessionId,
      format
    })
    
    if (result.success) {
      console.log(`✅ Analysis timeline exported via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to export analysis timeline via MCP')
    }
  }

  async getExportPreviewViaMCP(sessionId: string, format: 'json' | 'csv' = 'json'): Promise<any> {
    const result = await this.callTool('get_export_preview', {
      sessionId,
      format
    })
    
    if (result.success) {
      return result.preview
    } else {
      throw new Error('Failed to get export preview via MCP')
    }
  }

  // ========================================
  // PHASE 6: LIVE ANALYSIS METHODS (COMPLETE)
  // ========================================

  async triggerLiveAnalysisViaMCP(sessionId: string, analysisType?: string): Promise<any> {
    const result = await this.callTool('trigger_live_analysis', {
      sessionId,
      analysisType
    })
    
    if (result.success) {
      console.log(`✅ Live analysis triggered via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to trigger live analysis via MCP')
    }
  }

  async setAnalysisProviderViaMCP(provider: string, settings?: any): Promise<any> {
    const result = await this.callTool('set_analysis_provider', {
      provider,
      settings
    })
    
    if (result.success) {
      console.log(`✅ Analysis provider set via MCP: ${provider}`)
      return result
    } else {
      throw new Error('Failed to set analysis provider via MCP')
    }
  }

  async getAnalysisProvidersViaMCP(): Promise<any> {
    const result = await this.callTool('get_analysis_providers', {})
    
    if (result.success) {
      return result.providers
    } else {
      throw new Error('Failed to get analysis providers via MCP')
    }
  }

  async autoAnalyzeConversationViaMCP(sessionId: string, enabled: boolean, interval?: number): Promise<any> {
    const result = await this.callTool('auto_analyze_conversation', {
      sessionId,
      enabled,
      interval
    })
    
    if (result.success) {
      console.log(`✅ Auto-analysis ${enabled ? 'enabled' : 'disabled'} via MCP: ${sessionId}`)
      return result
    } else {
      throw new Error('Failed to set auto-analysis via MCP')
    }
  }

  // ========================================
  // ANALYSIS MANAGEMENT METHODS (COMPLETE)
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
      // Extract context for proper error tracking
      const context = {
        sessionId: sessionId || this.getCurrentSessionContext().sessionId,
        participantId
      };

      const result = await this.callTool('claude_chat', {
        message,
        systemPrompt,
        sessionId: context.sessionId,
        participantId: context.participantId
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
      // Extract context for proper error tracking
      const context = {
        sessionId: sessionId || this.getCurrentSessionContext().sessionId,
        participantId
      };

      const result = await this.callTool('openai_chat', {
        message,
        systemPrompt,
        model,
        sessionId: context.sessionId,
        participantId: context.participantId
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

  // Helper method to sync errors with store - enhanced with better error handling
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

  // Enhanced connection status with diagnostics
  getConnectionStatus(): { connected: boolean; lastError?: string; errorCount: number } {
    try {
      const store = useChatStore.getState();
      const errors = store.apiErrors.filter(error => error.operation.startsWith('mcp') || error.provider === 'claude');
      
      return {
        connected: this.initialized,
        errorCount: errors.length,
        lastError: errors.length > 0 ? errors[errors.length - 1].error : undefined
      };
    } catch (error) {
      return {
        connected: false,
        errorCount: 0,
        lastError: 'Failed to get connection status'
      };
    }
  }

  // Enhanced shutdown with cleanup
  async shutdown(): Promise<void> {
    try {
      console.log('🔄 MCP Client: Shutting down...')
      this.initialized = false
      console.log('✅ MCP Client shutdown complete')
    } catch (error) {
      console.error('❌ MCP Client shutdown failed:', error)
    }
  }
}