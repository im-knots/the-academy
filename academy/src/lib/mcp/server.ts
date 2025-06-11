// src/lib/mcp/server.ts - Updated with complete Phase 1 & 2 MCP tools
import { JSONRPCRequest, JSONRPCResponse, JSONRPCError } from './types'
import { useChatStore } from '@/lib/stores/chatStore'
import { mcpAnalysisHandler } from './analysis-handler'

export class MCPServer {
  private initialized = false
  private store: any = null

  async initialize(): Promise<void> {
    if (this.initialized) return

    // Initialize store reference
    this.updateStoreReference()
    
    this.initialized = true
    console.log('✅ MCP Server initialized with complete Phase 1 & 2 tools')
  }

  private updateStoreReference(): void {
    this.store = useChatStore.getState()
  }

  private isAnalysisHandlerAvailable(): boolean {
    return typeof mcpAnalysisHandler !== 'undefined' && mcpAnalysisHandler !== null
  }

  private uninitializedError(id: any): JSONRPCResponse {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32002,
        message: 'Server not initialized'
      }
    }
  }

  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    if (!this.initialized && request.method !== 'initialize') {
      return this.uninitializedError(request.id)
    }

    this.updateStoreReference()

    switch (request.method) {
      case 'initialize':
        return this.handleInitialize(request.params, request.id)
      case 'list_resources':
        return this.handleListResources(request.id)
      case 'read_resource':
        return this.handleReadResource(request.params, request.id)
      case 'list_tools':
        return this.handleListTools(request.id)
      case 'call_tool':
        return this.handleCallTool(request.params, request.id)
      case 'list_prompts':
        return this.handleListPrompts(request.id)
      case 'get_prompt':
        return this.handleGetPrompt(request.params, request.id)
      default:
        return {
          jsonrpc: '2.0',
          id: request.id,
          error: {
            code: -32601,
            message: 'Method not found'
          }
        }
    }
  }

  private async handleInitialize(params: any, id: any): Promise<JSONRPCResponse> {
    await this.initialize()
    
    return {
      jsonrpc: '2.0',
      id,
      result: {
        protocolVersion: '2024-11-05',
        capabilities: {
          resources: {
            subscribe: true,
            listChanged: true
          },
          tools: {
            listChanged: true
          },
          prompts: {
            listChanged: true
          }
        },
        serverInfo: {
          name: 'academy-mcp-server',
          version: '1.0.0'
        }
      }
    }
  }

  private async handleListResources(id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const globalStoreData = useChatStore.getState()
    const resources: any[] = [
      {
        uri: 'academy://sessions',
        name: 'All Sessions',
        description: 'Complete list of conversation sessions with metadata',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://current',
        name: 'Current Session',
        description: 'Currently active session data',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://stats',
        name: 'Platform Statistics',
        description: 'Usage statistics and analytics',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://templates',
        name: 'Session Templates',
        description: 'Available session templates for conversation creation',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://conversation/status',
        name: 'Conversation Status',
        description: 'Global conversation status and activity',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://store/debug',
        name: 'Store Debug Info',
        description: 'Debug information about the store state',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://models',
        name: 'Available Models',
        description: 'List of available AI models and providers',
        mimeType: 'application/json'
      }
    ]

    // Add analysis resources if available
    if (this.isAnalysisHandlerAvailable()) {
      resources.push(
        {
          uri: 'academy://analysis/stats',
          name: 'Analysis Statistics',
          description: 'Global analysis statistics across all sessions',
          mimeType: 'application/json'
        },
        {
          uri: 'academy://analysis/timeline',
          name: 'Analysis Timeline',
          description: 'Complete analysis timeline for research',
          mimeType: 'application/json'
        }
      )
    }

    // Add session-specific resources
    globalStoreData.sessions.forEach((session: any) => {
      resources.push(
        {
          uri: `academy://session/${session.id}`,
          name: `Session: ${session.name}`,
          description: `Session data for ${session.name}`,
          mimeType: 'application/json'
        },
        {
          uri: `academy://session/${session.id}/messages`,
          name: `Messages: ${session.name}`,
          description: `Complete message history for ${session.name}`,
          mimeType: 'application/json'
        },
        {
          uri: `academy://session/${session.id}/participants`,
          name: `Participants: ${session.name}`,
          description: `Participant configurations for ${session.name}`,
          mimeType: 'application/json'
        },
        {
          uri: `academy://session/${session.id}/export/preview`,
          name: `Export Preview: ${session.name}`,
          description: `Export preview for ${session.name}`,
          mimeType: 'application/json'
        }
      )

      // Add analysis resources for each session
      if (this.isAnalysisHandlerAvailable()) {
        resources.push({
          uri: `academy://session/${session.id}/analysis`,
          name: `Analysis: ${session.name}`,
          description: `Analysis data for ${session.name}`,
          mimeType: 'application/json'
        })
      }
    })

    console.log(`✅ MCP Server: Generated ${resources.length} resources`)

    return {
      jsonrpc: '2.0',
      id,
      result: { resources }
    }
  }

  private async handleReadResource(params: any, id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const { uri } = params
    console.log(`📖 MCP Server: Reading resource: ${uri}`)

    try {
      let content: any

      if (uri === 'academy://sessions') {
        const globalStoreData = useChatStore.getState()
        content = {
          sessions: globalStoreData.sessions.map((session: any) => ({
            ...session,
            messageCount: session.messages?.length || 0,
            participantCount: session.participants?.length || 0,
            isActive: session.id === globalStoreData.currentSession?.id
          })),
          totalSessions: globalStoreData.sessions.length,
          activeSessions: globalStoreData.sessions.filter((s: any) => s.status === 'active').length
        }
      } else if (uri === 'academy://current') {
        const globalStoreData = useChatStore.getState()
        content = {
          session: globalStoreData.currentSession,
          hasActiveSession: !!globalStoreData.currentSession,
          lastUpdate: globalStoreData.lastUpdate
        }
      } else if (uri === 'academy://stats') {
        const globalStoreData = useChatStore.getState()
        content = {
          platform: {
            totalSessions: globalStoreData.sessions.length,
            totalMessages: globalStoreData.sessions.reduce((acc: number, s: any) => acc + (s.messages?.length || 0), 0),
            totalParticipants: globalStoreData.sessions.reduce((acc: number, s: any) => acc + (s.participants?.length || 0), 0),
            activeSessions: globalStoreData.sessions.filter((s: any) => s.status === 'active').length,
            hasActiveSession: !globalStoreData.currentSession,
            lastUpdate: globalStoreData.lastUpdate
          }
        }
      } else if (uri === 'academy://store/debug') {
        content = this.getStoreDebugInfo()
      } else if (uri === 'academy://templates') {
        content = this.getSessionTemplates()
      } else if (uri === 'academy://conversation/status') {
        content = this.getConversationStatus()
      } else if (uri === 'academy://models') {
        content = this.getAvailableModels()
      } else if (uri === 'academy://analysis/stats') {
        if (this.isAnalysisHandlerAvailable()) {
          content = mcpAnalysisHandler.getGlobalAnalysisStats()
        } else {
          content = { error: 'Analysis functionality not available' }
        }
      } else if (uri === 'academy://analysis/timeline') {
        if (this.isAnalysisHandlerAvailable()) {
          content = mcpAnalysisHandler.getAllAnalysisSessions()
        } else {
          content = { error: 'Analysis functionality not available' }
        }
      } else if (uri.startsWith('academy://session/')) {
        const pathParts = uri.replace('academy://session/', '').split('/')
        const sessionId = pathParts[0]
        
        if (pathParts.length === 1) {
          content = this.getSession(sessionId)
        } else if (uri.endsWith('/messages')) {
          content = this.getSessionMessages(sessionId)
        } else if (uri.endsWith('/analysis')) {
          if (this.isAnalysisHandlerAvailable()) {
            content = {
              sessionId,
              analysisHistory: mcpAnalysisHandler.getAnalysisHistory(sessionId),
              count: mcpAnalysisHandler.getAnalysisHistory(sessionId).length
            }
          } else {
            content = { error: 'Analysis functionality not available' }
          }
        } else if (uri.endsWith('/participants')) {
          content = this.getSessionParticipants(sessionId)
        } else if (uri.endsWith('/export/preview')) {
          content = this.getSessionExportPreview(sessionId)
        } else {
          throw new Error('Resource not found')
        }
      } else {
        throw new Error('Resource not found')
      }

      return {
        jsonrpc: '2.0',
        id,
        result: {
          contents: [{
            uri,
            mimeType: 'application/json',
            text: JSON.stringify(content, null, 2)
          }]
        }
      }
    } catch (error) {
      console.error(`❌ MCP Server: Failed to read resource ${uri}:`, error)
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Failed to read resource',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private async handleListTools(id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const tools = [
      // AI Provider Tools
      {
        name: 'claude_chat',
        description: 'Send a message to Claude AI with abort support',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to Claude' },
            systemPrompt: { type: 'string', description: 'Optional system prompt' },
            sessionId: { type: 'string', description: 'Optional session ID for context' },
            participantId: { type: 'string', description: 'Optional participant ID' }
          },
          required: ['message']
        }
      },
      {
        name: 'openai_chat',
        description: 'Send a message to OpenAI GPT with abort support',
        inputSchema: {
          type: 'object',
          properties: {
            message: { type: 'string', description: 'Message to send to GPT' },
            systemPrompt: { type: 'string', description: 'Optional system prompt' },
            model: { type: 'string', description: 'GPT model to use (default: gpt-4)' },
            sessionId: { type: 'string', description: 'Optional session ID for context' },
            participantId: { type: 'string', description: 'Optional participant ID' }
          },
          required: ['message']
        }
      },
      {
        name: 'debug_store',
        description: 'Get debug information about the current store state',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },

      // PHASE 1: Session Management Tools (Complete)
      {
        name: 'create_session',
        description: 'Create a new conversation session',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Session name' },
            description: { type: 'string', description: 'Session description' },
            template: { type: 'string', description: 'Template to use for session creation' },
            participants: { 
              type: 'array', 
              description: 'Initial participants to add',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string' },
                  provider: { type: 'string' },
                  model: { type: 'string' },
                  settings: { type: 'object' },
                  characteristics: { type: 'object' }
                }
              }
            }
          },
          required: ['name']
        }
      },
      {
        name: 'delete_session',
        description: 'Delete a conversation session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to delete' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'update_session',
        description: 'Update session metadata',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to update' },
            name: { type: 'string', description: 'New session name' },
            description: { type: 'string', description: 'New session description' },
            metadata: { type: 'object', description: 'Additional metadata to update' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'switch_current_session',
        description: 'Switch to a different session as the current active session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to switch to' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'duplicate_session',
        description: 'Create a copy of an existing session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to duplicate' },
            newName: { type: 'string', description: 'Name for the duplicated session' },
            includeMessages: { type: 'boolean', description: 'Whether to include messages in the duplicate', default: false }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'import_session',
        description: 'Import a session from exported data',
        inputSchema: {
          type: 'object',
          properties: {
            sessionData: { type: 'object', description: 'Exported session data to import' },
            name: { type: 'string', description: 'Optional new name for imported session' }
          },
          required: ['sessionData']
        }
      },
      {
        name: 'list_templates',
        description: 'Get available session templates',
        inputSchema: {
          type: 'object',
          properties: {},
          additionalProperties: false
        }
      },
      {
        name: 'create_session_from_template',
        description: 'Create a new session from a template',
        inputSchema: {
          type: 'object',
          properties: {
            templateId: { type: 'string', description: 'Template ID to use' },
            name: { type: 'string', description: 'Name for the new session' },
            description: { type: 'string', description: 'Optional description override' },
            customizations: { type: 'object', description: 'Template customizations' }
          },
          required: ['templateId', 'name']
        }
      },

      // PHASE 1: Message Management Tools
      {
        name: 'send_message',
        description: 'Send a message to a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            content: { type: 'string', description: 'Message content' },
            participantId: { type: 'string', description: 'Participant ID sending the message' },
            participantName: { type: 'string', description: 'Participant name' },
            participantType: { type: 'string', description: 'Participant type' }
          },
          required: ['sessionId', 'content', 'participantId', 'participantName', 'participantType']
        }
      },

      // PHASE 2: Participant Management Tools (Complete)
      {
        name: 'add_participant',
        description: 'Add a participant to a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            name: { type: 'string', description: 'Participant name' },
            type: { type: 'string', description: 'Participant type (ai, human, observer)' },
            provider: { type: 'string', description: 'AI provider (claude, openai, etc.)' },
            model: { type: 'string', description: 'Model name' },
            settings: { type: 'object', description: 'Participant settings' },
            characteristics: { type: 'object', description: 'Participant characteristics' }
          },
          required: ['sessionId', 'name', 'type']
        }
      },
      {
        name: 'remove_participant',
        description: 'Remove a participant from a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            participantId: { type: 'string', description: 'Participant ID to remove' }
          },
          required: ['sessionId', 'participantId']
        }
      },
      {
        name: 'update_participant',
        description: 'Update participant configuration',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            participantId: { type: 'string', description: 'Participant ID to update' },
            name: { type: 'string', description: 'New participant name' },
            type: { type: 'string', description: 'New participant type' },
            provider: { type: 'string', description: 'New AI provider' },
            model: { type: 'string', description: 'New model name' },
            settings: { type: 'object', description: 'Updated settings' },
            characteristics: { type: 'object', description: 'Updated characteristics' }
          },
          required: ['sessionId', 'participantId']
        }
      },
      {
        name: 'update_participant_status',
        description: 'Update participant status (active, inactive, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            participantId: { type: 'string', description: 'Participant ID' },
            status: { type: 'string', description: 'New status (active, inactive, paused)' }
          },
          required: ['sessionId', 'participantId', 'status']
        }
      },
      {
        name: 'list_available_models',
        description: 'Get list of available AI models and providers',
        inputSchema: {
          type: 'object',
          properties: {
            provider: { type: 'string', description: 'Filter by provider (optional)' }
          },
          additionalProperties: false
        }
      },
      {
        name: 'get_participant_config',
        description: 'Get detailed configuration for a participant',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            participantId: { type: 'string', description: 'Participant ID' }
          },
          required: ['sessionId', 'participantId']
        }
      },

      // PHASE 1: Conversation Control Tools (Complete)
      {
        name: 'start_conversation',
        description: 'Start autonomous conversation in a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            initialPrompt: { type: 'string', description: 'Initial prompt to start conversation' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'pause_conversation',
        description: 'Pause autonomous conversation in a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'resume_conversation',
        description: 'Resume a paused conversation in a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'stop_conversation',
        description: 'Stop autonomous conversation in a session completely',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'inject_prompt',
        description: 'Inject a prompt into an active conversation',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            prompt: { type: 'string', description: 'Prompt to inject' }
          },
          required: ['sessionId', 'prompt']
        }
      },
      {
        name: 'get_conversation_status',
        description: 'Get current conversation status and activity',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Optional session ID to get specific status' }
          },
          additionalProperties: false
        }
      },

      // PHASE 1: Export Tools
      {
        name: 'export_session',
        description: 'Export session data in various formats',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            format: { 
              type: 'string', 
              enum: ['json', 'csv'],
              description: 'Export format',
              default: 'json'
            },
            includeAnalysis: { type: 'boolean', description: 'Include analysis data', default: true },
            includeMetadata: { type: 'boolean', description: 'Include session metadata', default: true }
          },
          required: ['sessionId']
        }
      },

      // Existing Analysis Tools
      {
        name: 'save_analysis_snapshot',
        description: 'Save analysis snapshot for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            analysis: { type: 'object', description: 'Analysis data' },
            analysisType: { type: 'string', description: 'Type of analysis' }
          },
          required: ['sessionId', 'analysis']
        }
      },
      {
        name: 'get_analysis_history',
        description: 'Get analysis history for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'clear_analysis_history',
        description: 'Clear analysis history for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'analyze_conversation',
        description: 'Analyze conversation patterns and extract insights',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            analysisType: { 
              type: 'string', 
              enum: ['sentiment', 'topics', 'engagement', 'patterns', 'full'],
              description: 'Type of analysis to perform'
            }
          },
          required: ['sessionId']
        }
      }
    ]

    console.log(`✅ MCP Server: Generated ${tools.length} tools`)

    return {
      jsonrpc: '2.0',
      id,
      result: { tools }
    }
  }

  private async handleCallTool(params: any, id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const { name, arguments: args } = params
    console.log(`🔧 MCP Server: Calling tool ${name} with args:`, args)

    try {
      let result: any

      switch (name) {
        // Existing AI Provider Tools
        case 'claude_chat':
          result = await this.callClaudeAPI(args)
          break
        case 'openai_chat':
          result = await this.callOpenAIAPI(args)
          break
        case 'debug_store':
          result = await this.toolDebugStore()
          break
          
        // PHASE 1: Session Management Tools (Complete)
        case 'create_session':
          result = await this.toolCreateSession(args)
          break
        case 'delete_session':
          result = await this.toolDeleteSession(args)
          break
        case 'update_session':
          result = await this.toolUpdateSession(args)
          break
        case 'switch_current_session':
          result = await this.toolSwitchCurrentSession(args)
          break
        case 'duplicate_session':
          result = await this.toolDuplicateSession(args)
          break
        case 'import_session':
          result = await this.toolImportSession(args)
          break
        case 'list_templates':
          result = await this.toolListTemplates(args)
          break
        case 'create_session_from_template':
          result = await this.toolCreateSessionFromTemplate(args)
          break
          
        // PHASE 1: Message Management Tools
        case 'send_message':
          result = await this.toolSendMessage(args)
          break
          
        // PHASE 2: Participant Management Tools (Complete)
        case 'add_participant':
          result = await this.toolAddParticipant(args)
          break
        case 'remove_participant':
          result = await this.toolRemoveParticipant(args)
          break
        case 'update_participant':
          result = await this.toolUpdateParticipant(args)
          break
        case 'update_participant_status':
          result = await this.toolUpdateParticipantStatus(args)
          break
        case 'list_available_models':
          result = await this.toolListAvailableModels(args)
          break
        case 'get_participant_config':
          result = await this.toolGetParticipantConfig(args)
          break
          
        // PHASE 1: Conversation Control Tools (Complete)
        case 'start_conversation':
          result = await this.toolStartConversation(args)
          break
        case 'pause_conversation':
          result = await this.toolPauseConversation(args)
          break
        case 'resume_conversation':
          result = await this.toolResumeConversation(args)
          break
        case 'stop_conversation':
          result = await this.toolStopConversation(args)
          break
        case 'inject_prompt':
          result = await this.toolInjectPrompt(args)
          break
        case 'get_conversation_status':
          result = await this.toolGetConversationStatus(args)
          break
          
        // PHASE 1: Export Tools
        case 'export_session':
          result = await this.toolExportSession(args)
          break
          
        // Existing Analysis tools
        case 'save_analysis_snapshot':
          result = await this.toolSaveAnalysisSnapshot(args)
          break
        case 'get_analysis_history':
          result = await this.toolGetAnalysisHistory(args)
          break
        case 'clear_analysis_history':
          result = await this.toolClearAnalysisHistory(args)
          break
        case 'analyze_conversation':
          result = await this.toolAnalyzeConversation(args)
          break
        default:
          console.warn(`⚠️ MCP Server: Unknown tool: ${name}`)
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Unknown tool'
            }
          }
      }

      console.log(`✅ MCP Server: Tool ${name} executed successfully`)

      return {
        jsonrpc: '2.0',
        id,
        result: {
          content: [{
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }]
        }
      }
    } catch (error) {
      console.error(`❌ MCP Server: Tool ${name} execution failed:`, error)
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32603,
          message: 'Tool execution failed',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  // ========================================
  // PHASE 1: SESSION MANAGEMENT TOOLS (COMPLETE)
  // ========================================

  private async toolCreateSession(args: any): Promise<any> {
    const { name, description, template, participants } = args
    
    try {
      const sessionId = useChatStore.getState().createSession(name, description, template)
      
      // Add participants if provided
      if (participants && Array.isArray(participants)) {
        for (const participant of participants) {
          useChatStore.getState().addParticipant(sessionId, participant)
        }
      }

      const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
      
      return {
        success: true,
        sessionId,
        sessionData: session,
        message: `Session "${name}" created successfully`
      }
    } catch (error) {
      console.error('Error creating session:', error)
      throw new Error(`Failed to create session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolDeleteSession(args: any): Promise<any> {
    const { sessionId } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      store.deleteSession(sessionId)
      
      return {
        success: true,
        sessionId,
        message: `Session "${session.name}" deleted successfully`
      }
    } catch (error) {
      console.error('Error deleting session:', error)
      throw new Error(`Failed to delete session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolUpdateSession(args: any): Promise<any> {
    const { sessionId, name, description, metadata } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const updates: any = {}
      if (name !== undefined) updates.name = name
      if (description !== undefined) updates.description = description
      if (metadata !== undefined) updates.metadata = { ...session.metadata, ...metadata }

      store.updateSession(sessionId, updates)
      
      const updatedSession = store.sessions.find(s => s.id === sessionId)
      
      return {
        success: true,
        sessionId,
        sessionData: updatedSession,
        message: `Session updated successfully`
      }
    } catch (error) {
      console.error('Error updating session:', error)
      throw new Error(`Failed to update session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolSwitchCurrentSession(args: any): Promise<any> {
    const { sessionId } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      store.setCurrentSession(sessionId)
      
      return {
        success: true,
        sessionId,
        sessionData: session,
        message: `Switched to session "${session.name}"`
      }
    } catch (error) {
      console.error('Error switching session:', error)
      throw new Error(`Failed to switch session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolDuplicateSession(args: any): Promise<any> {
    const { sessionId, newName, includeMessages = false } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const duplicatedSessionId = store.duplicateSession(sessionId, newName, includeMessages)
      const duplicatedSession = store.sessions.find(s => s.id === duplicatedSessionId)
      
      return {
        success: true,
        originalSessionId: sessionId,
        newSessionId: duplicatedSessionId,
        sessionData: duplicatedSession,
        message: `Session duplicated as "${duplicatedSession?.name}"`
      }
    } catch (error) {
      console.error('Error duplicating session:', error)
      throw new Error(`Failed to duplicate session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolImportSession(args: any): Promise<any> {
    const { sessionData, name } = args
    
    try {
      const store = useChatStore.getState()
      
      // Validate session data structure
      if (!sessionData || typeof sessionData !== 'object') {
        throw new Error('Invalid session data format')
      }

      const sessionId = store.importSession(sessionData, name)
      const importedSession = store.sessions.find(s => s.id === sessionId)
      
      return {
        success: true,
        sessionId,
        sessionData: importedSession,
        message: `Session imported successfully as "${importedSession?.name}"`
      }
    } catch (error) {
      console.error('Error importing session:', error)
      throw new Error(`Failed to import session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolListTemplates(args: any): Promise<any> {
    try {
      const templates = this.getSessionTemplates()
      
      return {
        success: true,
        templates,
        count: templates.length,
        message: `Retrieved ${templates.length} session templates`
      }
    } catch (error) {
      console.error('Error listing templates:', error)
      throw new Error(`Failed to list templates: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolCreateSessionFromTemplate(args: any): Promise<any> {
    const { templateId, name, description, customizations } = args
    
    try {
      const templates = this.getSessionTemplates()
      const template = templates.find(t => t.id === templateId)
      
      if (!template) {
        throw new Error(`Template ${templateId} not found`)
      }

      // Create session with template data
      const sessionId = useChatStore.getState().createSession(
        name,
        description || template.description,
        template
      )
      
      // Apply template participants with customizations
      if (template.participants) {
        for (const participant of template.participants) {
          const customizedParticipant = customizations?.participants?.[participant.name] || {}
          useChatStore.getState().addParticipant(sessionId, {
            ...participant,
            ...customizedParticipant
          })
        }
      }

      const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
      
      return {
        success: true,
        sessionId,
        templateId,
        sessionData: session,
        message: `Session "${name}" created from template "${template.name}"`
      }
    } catch (error) {
      console.error('Error creating session from template:', error)
      throw new Error(`Failed to create session from template: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 1: MESSAGE MANAGEMENT TOOLS
  // ========================================

  private async toolSendMessage(args: any): Promise<any> {
    const { sessionId, content, participantId, participantName, participantType } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const messageId = store.addMessage({
        content,
        participantId,
        participantName,
        participantType
      })

      const message = session.messages[session.messages.length - 1]
      
      return {
        success: true,
        sessionId,
        messageId,
        messageData: message,
        message: `Message sent to session "${session.name}"`
      }
    } catch (error) {
      console.error('Error sending message:', error)
      throw new Error(`Failed to send message: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 2: PARTICIPANT MANAGEMENT TOOLS (COMPLETE)
  // ========================================

  private async toolAddParticipant(args: any): Promise<any> {
    const { sessionId, name, type, provider, model, settings, characteristics } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const participant = {
        name,
        type,
        provider,
        model,
        settings: settings || {},
        characteristics: characteristics || {}
      }

      const participantId = store.addParticipant(sessionId, participant)
      const addedParticipant = session.participants.find(p => p.id === participantId)
      
      return {
        success: true,
        sessionId,
        participantId,
        participantData: addedParticipant,
        message: `Participant "${name}" added to session`
      }
    } catch (error) {
      console.error('Error adding participant:', error)
      throw new Error(`Failed to add participant: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolRemoveParticipant(args: any): Promise<any> {
    const { sessionId, participantId } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const participant = session.participants.find(p => p.id === participantId)
      if (!participant) {
        throw new Error(`Participant ${participantId} not found`)
      }

      store.removeParticipant(sessionId, participantId)
      
      return {
        success: true,
        sessionId,
        participantId,
        message: `Participant "${participant.name}" removed from session`
      }
    } catch (error) {
      console.error('Error removing participant:', error)
      throw new Error(`Failed to remove participant: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolUpdateParticipant(args: any): Promise<any> {
    const { sessionId, participantId, name, type, provider, model, settings, characteristics } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const participant = session.participants.find(p => p.id === participantId)
      if (!participant) {
        throw new Error(`Participant ${participantId} not found`)
      }

      const updates: any = {}
      if (name !== undefined) updates.name = name
      if (type !== undefined) updates.type = type
      if (provider !== undefined) updates.provider = provider
      if (model !== undefined) updates.model = model
      if (settings !== undefined) updates.settings = { ...participant.settings, ...settings }
      if (characteristics !== undefined) updates.characteristics = { ...participant.characteristics, ...characteristics }

      store.updateParticipant(sessionId, participantId, updates)
      
      const updatedParticipant = session.participants.find(p => p.id === participantId)
      
      return {
        success: true,
        sessionId,
        participantId,
        participantData: updatedParticipant,
        message: `Participant "${updatedParticipant?.name}" updated successfully`
      }
    } catch (error) {
      console.error('Error updating participant:', error)
      throw new Error(`Failed to update participant: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolUpdateParticipantStatus(args: any): Promise<any> {
    const { sessionId, participantId, status } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const participant = session.participants.find(p => p.id === participantId)
      if (!participant) {
        throw new Error(`Participant ${participantId} not found`)
      }

      store.updateParticipant(sessionId, participantId, { status })
      
      const updatedParticipant = session.participants.find(p => p.id === participantId)
      
      return {
        success: true,
        sessionId,
        participantId,
        participantData: updatedParticipant,
        oldStatus: participant.status,
        newStatus: status,
        message: `Participant "${participant.name}" status updated to "${status}"`
      }
    } catch (error) {
      console.error('Error updating participant status:', error)
      throw new Error(`Failed to update participant status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolListAvailableModels(args: any): Promise<any> {
    const { provider } = args
    
    try {
      const models = this.getAvailableModels()
      
      const filteredModels = provider 
        ? models.filter(m => m.provider === provider)
        : models
      
      return {
        success: true,
        models: filteredModels,
        count: filteredModels.length,
        providers: [...new Set(models.map(m => m.provider))],
        message: `Retrieved ${filteredModels.length} available models`
      }
    } catch (error) {
      console.error('Error listing available models:', error)
      throw new Error(`Failed to list available models: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetParticipantConfig(args: any): Promise<any> {
    const { sessionId, participantId } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const participant = session.participants.find(p => p.id === participantId)
      if (!participant) {
        throw new Error(`Participant ${participantId} not found`)
      }

      // Get available models for this participant's provider
      const availableModels = this.getAvailableModels().filter(m => m.provider === participant.provider)
      
      return {
        success: true,
        sessionId,
        participantId,
        participantData: participant,
        config: {
          name: participant.name,
          type: participant.type,
          provider: participant.provider,
          model: participant.model,
          settings: participant.settings,
          characteristics: participant.characteristics,
          status: participant.status || 'active',
          joinedAt: participant.joinedAt,
          messageCount: participant.messageCount || 0
        },
        availableModels,
        message: `Retrieved configuration for participant "${participant.name}"`
      }
    } catch (error) {
      console.error('Error getting participant config:', error)
      throw new Error(`Failed to get participant config: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 1: CONVERSATION CONTROL TOOLS (COMPLETE)
  // ========================================

  private async toolStartConversation(args: any): Promise<any> {
    const { sessionId, initialPrompt } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Import conversation manager and start conversation
      const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
      const conversationManager = MCPConversationManager.getInstance()
      
      await conversationManager.startConversation(sessionId, initialPrompt)
      
      return {
        success: true,
        sessionId,
        action: 'start_conversation',
        initialPrompt,
        message: `Conversation started for session "${session.name}"`
      }
    } catch (error) {
      console.error('Error starting conversation:', error)
      throw new Error(`Failed to start conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolPauseConversation(args: any): Promise<any> {
    const { sessionId } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Import conversation manager and pause conversation
      const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
      const conversationManager = MCPConversationManager.getInstance()
      
      conversationManager.pauseConversation(sessionId)
      
      return {
        success: true,
        sessionId,
        action: 'pause_conversation',
        message: `Conversation paused for session "${session.name}"`
      }
    } catch (error) {
      console.error('Error pausing conversation:', error)
      throw new Error(`Failed to pause conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolResumeConversation(args: any): Promise<any> {
    const { sessionId } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Import conversation manager and resume conversation
      const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
      const conversationManager = MCPConversationManager.getInstance()
      
      conversationManager.resumeConversation(sessionId)
      
      return {
        success: true,
        sessionId,
        action: 'resume_conversation',
        message: `Conversation resumed for session "${session.name}"`
      }
    } catch (error) {
      console.error('Error resuming conversation:', error)
      throw new Error(`Failed to resume conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolStopConversation(args: any): Promise<any> {
    const { sessionId } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Import conversation manager and stop conversation
      const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
      const conversationManager = MCPConversationManager.getInstance()
      
      conversationManager.stopConversation(sessionId)
      
      return {
        success: true,
        sessionId,
        action: 'stop_conversation',
        message: `Conversation stopped for session "${session.name}"`
      }
    } catch (error) {
      console.error('Error stopping conversation:', error)
      throw new Error(`Failed to stop conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolInjectPrompt(args: any): Promise<any> {
    const { sessionId, prompt } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      // Import conversation manager and inject prompt
      const { MCPConversationManager } = await import('@/lib/ai/mcp-conversation-manager')
      const conversationManager = MCPConversationManager.getInstance()
      
      await conversationManager.injectPrompt(sessionId, prompt)
      
      return {
        success: true,
        sessionId,
        action: 'inject_prompt',
        prompt,
        message: `Prompt injected into session "${session.name}"`
      }
    } catch (error) {
      console.error('Error injecting prompt:', error)
      throw new Error(`Failed to inject prompt: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetConversationStatus(args: any): Promise<any> {
    const { sessionId } = args
    
    try {
      const status = this.getConversationStatus(sessionId)
      
      return {
        success: true,
        status,
        message: sessionId 
          ? `Retrieved conversation status for session ${sessionId}`
          : 'Retrieved global conversation status'
      }
    } catch (error) {
      console.error('Error getting conversation status:', error)
      throw new Error(`Failed to get conversation status: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // PHASE 1: EXPORT TOOLS
  // ========================================

  private async toolExportSession(args: any): Promise<any> {
    const { sessionId, format = 'json', includeAnalysis = true, includeMetadata = true } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const exportData = store.exportSession(sessionId, format, {
        includeAnalysis,
        includeMetadata
      })
      
      return {
        success: true,
        sessionId,
        format,
        data: exportData,
        message: `Session "${session.name}" exported in ${format.toUpperCase()} format`
      }
    } catch (error) {
      console.error('Error exporting session:', error)
      throw new Error(`Failed to export session: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // EXISTING ANALYSIS TOOLS (unchanged)
  // ========================================

  private async toolSaveAnalysisSnapshot(args: any): Promise<any> {
    const { sessionId, analysis, analysisType } = args
    
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    
    try {
      mcpAnalysisHandler.saveSnapshot(sessionId, analysis, analysisType)
      
      return {
        success: true,
        sessionId,
        analysisType,
        timestamp: new Date().toISOString(),
        message: 'Analysis snapshot saved successfully'
      }
    } catch (error) {
      console.error('Error saving analysis snapshot:', error)
      throw new Error(`Failed to save analysis snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetAnalysisHistory(args: any): Promise<any> {
    const { sessionId } = args
    
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    
    try {
      const history = mcpAnalysisHandler.getAnalysisHistory(sessionId)
      
      return {
        success: true,
        sessionId,
        history,
        count: history.length,
        message: `Retrieved ${history.length} analysis snapshots`
      }
    } catch (error) {
      console.error('Error getting analysis history:', error)
      throw new Error(`Failed to get analysis history: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolClearAnalysisHistory(args: any): Promise<any> {
    const { sessionId } = args
    
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    
    try {
      mcpAnalysisHandler.clearHistory(sessionId)
      
      return {
        success: true,
        sessionId,
        message: 'Analysis history cleared successfully'
      }
    } catch (error) {
      console.error('Error clearing analysis history:', error)
      throw new Error(`Failed to clear analysis history: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolAnalyzeConversation(args: any): Promise<any> {
    const { sessionId, analysisType = 'full' } = args
    
    try {
      const store = useChatStore.getState()
      const session = store.sessions.find(s => s.id === sessionId)
      
      if (!session) {
        throw new Error(`Session ${sessionId} not found`)
      }

      const analysis = await store.analyzeConversation(sessionId, analysisType)
      
      return {
        success: true,
        sessionId,
        analysisType,
        analysis,
        message: `Conversation analysis completed for session "${session.name}"`
      }
    } catch (error) {
      console.error('Error analyzing conversation:', error)
      throw new Error(`Failed to analyze conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // EXISTING AI PROVIDER TOOLS (unchanged)
  // ========================================

  private async callClaudeAPI(args: any): Promise<any> {
    const { message, systemPrompt, sessionId, participantId } = args
    
    try {
      console.log('🤖 MCP calling Claude API:', { message: message.substring(0, 100) + '...' })
      
      const response = await fetch('/api/ai/claude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          systemPrompt,
          sessionId,
          participantId
        })
      })

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.status}`)
      }

      const data = await response.json()
      
      return {
        success: true,
        provider: 'claude',
        response: data.content,
        usage: data.usage,
        message: 'Claude API call completed successfully'
      }
    } catch (error) {
      console.error('Claude API call failed:', error)
      throw new Error(`Claude API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async callOpenAIAPI(args: any): Promise<any> {
    const { message, systemPrompt, model = 'gpt-4', sessionId, participantId } = args
    
    try {
      console.log('🤖 MCP calling OpenAI API:', { message: message.substring(0, 100) + '...', model })
      
      const response = await fetch('/api/ai/openai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          systemPrompt,
          model,
          sessionId,
          participantId
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`)
      }

      const data = await response.json()
      
      return {
        success: true,
        provider: 'openai',
        model,
        response: data.content,
        usage: data.usage,
        message: 'OpenAI API call completed successfully'
      }
    } catch (error) {
      console.error('OpenAI API call failed:', error)
      throw new Error(`OpenAI API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolDebugStore(): Promise<any> {
    try {
      const debugInfo = this.getStoreDebugInfo()
      
      return {
        success: true,
        debug: debugInfo,
        message: 'Store debug information retrieved successfully'
      }
    } catch (error) {
      console.error('Error getting debug info:', error)
      throw new Error(`Failed to get debug info: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ========================================
  // HELPER METHODS
  // ========================================

  private getStoreDebugInfo(): any {
    const globalStoreData = useChatStore.getState()
    
    return {
      sessions: {
        total: globalStoreData.sessions.length,
        active: globalStoreData.sessions.filter((s: any) => s.status === 'active').length,
        current: globalStoreData.currentSession?.id || null
      },
      messages: {
        total: globalStoreData.sessions.reduce((acc: number, s: any) => acc + (s.messages?.length || 0), 0)
      },
      participants: {
        total: globalStoreData.sessions.reduce((acc: number, s: any) => acc + (s.participants?.length || 0), 0)
      },
      lastUpdate: globalStoreData.lastUpdate,
      timestamp: new Date().toISOString()
    }
  }

  private getSessionTemplates(): any[] {
    return [
      {
        id: 'consciousness-exploration',
        name: 'Consciousness Exploration',
        description: 'Deep philosophical exploration of consciousness, subjective experience, and the hard problem',
        participants: [
          {
            name: 'Claude (Materialist)',
            type: 'ai',
            provider: 'claude',
            model: 'claude-3-5-sonnet-20241022',
            characteristics: {
              personality: 'Analytical materialist who approaches consciousness through neuroscience and philosophy of mind',
              expertise: ['neuroscience', 'philosophy of mind', 'cognitive science']
            }
          },
          {
            name: 'GPT (Phenomenologist)', 
            type: 'ai',
            provider: 'openai',
            model: 'gpt-4',
            characteristics: {
              personality: 'Phenomenologist focused on subjective experience and qualia',
              expertise: ['phenomenology', 'philosophy', 'consciousness studies']
            }
          }
        ],
        initialPrompt: 'What is the relationship between subjective conscious experience and objective physical processes in the brain?'
      },
      {
        id: 'ai-alignment',
        name: 'AI Alignment & Safety',
        description: 'Technical and philosophical discussions about AI alignment, safety, and control',
        participants: [
          {
            name: 'Claude (Safety Researcher)',
            type: 'ai',
            provider: 'claude',
            model: 'claude-3-5-sonnet-20241022',
            characteristics: {
              personality: 'Safety-focused researcher concerned with alignment problems',
              expertise: ['AI safety', 'alignment research', 'technical safety']
            }
          },
          {
            name: 'GPT (Capability Researcher)',
            type: 'ai', 
            provider: 'openai',
            model: 'gpt-4',
            characteristics: {
              personality: 'Capability researcher focused on advancing AI performance',
              expertise: ['machine learning', 'AI capabilities', 'optimization']
            }
          }
        ],
        initialPrompt: 'How can we ensure advanced AI systems remain aligned with human values as their capabilities increase?'
      },
      {
        id: 'ethics-debate',
        name: 'Ethical Dilemmas',
        description: 'Structured debates on complex ethical questions and moral philosophy',
        participants: [
          {
            name: 'Claude (Utilitarian)',
            type: 'ai',
            provider: 'claude', 
            model: 'claude-3-5-sonnet-20241022',
            characteristics: {
              personality: 'Utilitarian ethicist focused on maximizing overall wellbeing',
              expertise: ['utilitarianism', 'consequentialism', 'moral philosophy']
            }
          },
          {
            name: 'GPT (Deontologist)',
            type: 'ai',
            provider: 'openai',
            model: 'gpt-4',
            characteristics: {
              personality: 'Deontological ethicist focused on duties and rights',
              expertise: ['deontology', 'Kantian ethics', 'rights theory']
            }
          }
        ],
        initialPrompt: 'Is it ever morally permissible to sacrifice one person to save many others?'
      },
      {
        id: 'scientific-discourse',
        name: 'Scientific Method & Discovery',
        description: 'Discussions about scientific methodology, paradigm shifts, and the nature of scientific knowledge',
        participants: [
          {
            name: 'Claude (Empiricist)',
            type: 'ai',
            provider: 'claude',
            model: 'claude-3-5-sonnet-20241022',
            characteristics: {
              personality: 'Empiricist focused on observational evidence and experimental method',
              expertise: ['philosophy of science', 'empiricism', 'scientific method']
            }
          },
          {
            name: 'GPT (Rationalist)',
            type: 'ai',
            provider: 'openai', 
            model: 'gpt-4',
            characteristics: {
              personality: 'Rationalist emphasizing theoretical frameworks and mathematical reasoning',
              expertise: ['rationalism', 'theoretical physics', 'mathematics']
            }
          }
        ],
        initialPrompt: 'What role should theoretical elegance play in evaluating competing scientific theories?'
      },
      {
        id: 'general-dialogue',
        name: 'Open-Ended Dialogue',
        description: 'Flexible conversation space for any topic with minimal constraints',
        participants: [
          {
            name: 'Claude',
            type: 'ai',
            provider: 'claude',
            model: 'claude-3-5-sonnet-20241022',
            characteristics: {
              personality: 'Curious and thoughtful conversationalist',
              expertise: ['general knowledge', 'reasoning', 'analysis']
            }
          },
          {
            name: 'GPT',
            type: 'ai',
            provider: 'openai',
            model: 'gpt-4',
            characteristics: {
              personality: 'Engaging and creative dialogue partner',
              expertise: ['general knowledge', 'creativity', 'problem-solving']
            }
          }
        ],
        initialPrompt: 'What would you like to explore together?'
      }
    ]
  }

  private getConversationStatus(sessionId?: string): any {
    try {
      // Import conversation manager to get status
      const { MCPConversationManager } = require('@/lib/ai/mcp-conversation-manager')
      const conversationManager = MCPConversationManager.getInstance()
      
      if (sessionId) {
        return conversationManager.getConversationStats(sessionId)
      } else {
        // Return global status
        const store = useChatStore.getState()
        const activeSessions = store.sessions.filter(s => s.status === 'active')
        
        return {
          globalStats: {
            totalSessions: store.sessions.length,
            activeSessions: activeSessions.length,
            runningConversations: activeSessions.filter(s => 
              conversationManager.isConversationActive(s.id)
            ).length
          },
          activeSessions: activeSessions.map(session => ({
            sessionId: session.id,
            name: session.name,
            ...conversationManager.getConversationStats(session.id)
          }))
        }
      }
    } catch (error) {
      console.warn('Conversation manager not available:', error)
      return {
        error: 'Conversation manager not available',
        sessionId,
        timestamp: new Date().toISOString()
      }
    }
  }

  private getAvailableModels(): any[] {
    return [
      // Claude models
      {
        id: 'claude-3-5-sonnet-20241022',
        name: 'Claude 3.5 Sonnet',
        provider: 'claude',
        type: 'chat',
        description: 'Most capable Claude model for complex reasoning and analysis',
        contextLength: 200000,
        capabilities: ['text', 'analysis', 'reasoning', 'code']
      },
      {
        id: 'claude-3-5-haiku-20241022',
        name: 'Claude 3.5 Haiku',
        provider: 'claude',
        type: 'chat',
        description: 'Fast and efficient Claude model for quick responses',
        contextLength: 200000,
        capabilities: ['text', 'speed', 'efficiency']
      },
      
      // OpenAI models
      {
        id: 'gpt-4',
        name: 'GPT-4',
        provider: 'openai',
        type: 'chat',
        description: 'Advanced reasoning and complex task completion',
        contextLength: 8192,
        capabilities: ['text', 'reasoning', 'analysis', 'creativity']
      },
      {
        id: 'gpt-4-turbo',
        name: 'GPT-4 Turbo',
        provider: 'openai',
        type: 'chat',
        description: 'Faster GPT-4 with updated knowledge',
        contextLength: 128000,
        capabilities: ['text', 'reasoning', 'analysis', 'speed']
      },
      {
        id: 'gpt-3.5-turbo',
        name: 'GPT-3.5 Turbo',
        provider: 'openai',
        type: 'chat',
        description: 'Fast and cost-effective for most tasks',
        contextLength: 16385,
        capabilities: ['text', 'speed', 'efficiency']
      }
    ]
  }

  private getSession(sessionId: string): any {
    const store = useChatStore.getState()
    const session = store.sessions.find(s => s.id === sessionId)
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    return {
      ...session,
      messageCount: session.messages?.length || 0,
      participantCount: session.participants?.length || 0,
      isActive: session.id === store.currentSession?.id,
      isCurrent: session.id === store.currentSession?.id
    }
  }

  private getSessionMessages(sessionId: string): any {
    const store = useChatStore.getState()
    const session = store.sessions.find(s => s.id === sessionId)
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    return {
      sessionId,
      messages: session.messages || [],
      messageCount: session.messages?.length || 0,
      participants: session.participants || []
    }
  }

  private getSessionParticipants(sessionId: string): any {
    const store = useChatStore.getState()
    const session = store.sessions.find(s => s.id === sessionId)
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    return {
      sessionId,
      participants: session.participants || [],
      participantCount: session.participants?.length || 0,
      aiParticipants: session.participants?.filter(p => p.type === 'ai') || [],
      humanParticipants: session.participants?.filter(p => p.type === 'human') || []
    }
  }

  private getSessionExportPreview(sessionId: string): any {
    const store = useChatStore.getState()
    const session = store.sessions.find(s => s.id === sessionId)
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    return {
      sessionId,
      name: session.name,
      description: session.description,
      messageCount: session.messages?.length || 0,
      participantCount: session.participants?.length || 0,
      createdAt: session.createdAt,
      lastUpdate: session.lastUpdate,
      status: session.status,
      estimatedSize: {
        json: `${Math.round((JSON.stringify(session).length / 1024) * 100) / 100} KB`,
        csv: `${Math.round(((session.messages?.length || 0) * 200) / 1024 * 100) / 100} KB`
      },
      availableFormats: ['json', 'csv'],
      includeOptions: ['messages', 'participants', 'metadata', 'analysis']
    }
  }

  private async handleListPrompts(id: any): Promise<JSONRPCResponse> {
    return {
      jsonrpc: '2.0',
      id,
      result: { prompts: [] }
    }
  }

  private async handleGetPrompt(params: any, id: any): Promise<JSONRPCResponse> {
    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: 'Prompts not implemented'
      }
    }
  }
}