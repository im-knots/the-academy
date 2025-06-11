// src/lib/mcp/server.ts - PHASE 1 MCP TOOLS IMPLEMENTATION
import { ChatSession, Message, Participant } from '@/types/chat'
import { mcpAnalysisHandler } from './analysis-handler'
import { ExportManager } from '@/lib/utils/export'

interface JSONRPCRequest {
  jsonrpc: '2.0'
  id?: string | number | null
  method: string
  params?: any
}

interface JSONRPCResponse {
  jsonrpc: '2.0'
  id: string | number | null
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

interface MCPTool {
  name: string
  description?: string
  inputSchema: any
}

// Global store reference - we'll populate this from the client side
let globalStoreData: {
  sessions: ChatSession[]
  currentSession: ChatSession | null
  hasHydrated: boolean
  lastUpdate: Date
  debug?: any
} = {
  sessions: [],
  currentSession: null,
  hasHydrated: false,
  lastUpdate: new Date()
}

export function setMCPStoreReference(storeData: any) {
  const prevSessionCount = globalStoreData.sessions.length
  globalStoreData = {
    ...storeData,
    lastUpdate: new Date()
  }
  console.log(`🔧 MCP Server: Store reference updated. Sessions: ${prevSessionCount} → ${globalStoreData.sessions.length}`)
  
  if (globalStoreData.debug) {
    console.log('🔧 MCP Server: Store debug info:', globalStoreData.debug)
  }
}

export function getMCPStoreReference() {
  return globalStoreData
}

export class MCPServer {
  private initialized = false
  private clientInfo: any = null

  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      const { method, params, id } = request
      console.log(`🔧 MCP Server: Handling request ${method} (ID: ${id})`)

      switch (method) {
        case 'initialize':
          return this.handleInitialize(params, id)
        
        case 'list_resources':
          return this.handleListResources(id)
        
        case 'read_resource':
          return this.handleReadResource(params, id)
        
        case 'list_tools':
          return this.handleListTools(id)
        
        case 'call_tool':
          return this.handleCallTool(params, id)
        
        case 'list_prompts':
          return this.handleListPrompts(id)
        
        case 'get_prompt':
          return this.handleGetPrompt(params, id)

        default:
          console.warn(`⚠️ MCP Server: Unknown method: ${method}`)
          return {
            jsonrpc: '2.0',
            id: id ?? null,
            error: {
              code: -32601,
              message: 'Method not found'
            }
          }
      }
    } catch (error) {
      console.error('❌ MCP Server error:', error)
      return {
        jsonrpc: '2.0',
        id: request.id ?? null,
        error: {
          code: -32603,
          message: 'Internal error',
          data: error instanceof Error ? error.message : 'Unknown error'
        }
      }
    }
  }

  private isAnalysisHandlerAvailable(): boolean {
    try {
      return typeof mcpAnalysisHandler?.getGlobalAnalysisStats === 'function'
    } catch (error) {
      return false
    }
  }

  private async handleInitialize(params: any, id: any): Promise<JSONRPCResponse> {
    this.clientInfo = params?.clientInfo
    this.initialized = true
    
    console.log('✅ MCP Server: Initialized with client info:', this.clientInfo)

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
            listChanged: false
          },
          prompts: {
            listChanged: false
          },
          experimental: {
            analysis: true,
            realTimeUpdates: true,
            sessionManagement: true,
            conversationControl: true,
            exportTools: true
          }
        },
        serverInfo: {
          name: 'The Academy MCP Server',
          version: '1.3.0',
          description: 'AI Research Platform with full session management, conversation control, and export capabilities'
        }
      }
    }
  }

  private async handleListResources(id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    console.log(`🔧 MCP Server: Listing resources. Store status:`)
    console.log(`  - Has hydrated: ${globalStoreData.hasHydrated}`)
    console.log(`  - Sessions count: ${globalStoreData.sessions.length}`)
    console.log(`  - Current session: ${globalStoreData.currentSession?.id || 'none'}`)
    console.log(`  - Last update: ${globalStoreData.lastUpdate}`)

    const sessions = globalStoreData.sessions || []
    
    // Check if analysis functionality is available
    const isAnalysisAvailable = this.isAnalysisHandlerAvailable()
    console.log(`🔧 MCP Server: Analysis handler available: ${isAnalysisAvailable}`)
    
    const resources = [
      // Core platform resources
      {
        uri: 'academy://sessions',
        name: 'All Sessions',
        description: `List of all conversation sessions (${sessions.length} sessions)`,
        mimeType: 'application/json'
      },
      {
        uri: 'academy://current',
        name: 'Current Session',
        description: globalStoreData.currentSession 
          ? `Currently active session: ${globalStoreData.currentSession.name}`
          : 'No active session',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://stats',
        name: 'Platform Statistics',
        description: `Overall platform usage statistics (${sessions.length} sessions, ${sessions.reduce((sum, s) => sum + s.messages.length, 0)} messages)`,
        mimeType: 'application/json'
      },
      {
        uri: 'academy://store/debug',
        name: 'Store Debug Info',
        description: 'Debug information about the store state and MCP integration',
        mimeType: 'application/json'
      },
      // PHASE 1: Add session templates resource
      {
        uri: 'academy://templates',
        name: 'Session Templates',
        description: 'Available session templates for creating new conversations',
        mimeType: 'application/json'
      },
      // PHASE 1: Add conversation state resource
      {
        uri: 'academy://conversation/status',
        name: 'Conversation Status',
        description: 'Real-time conversation state and control information',
        mimeType: 'application/json'
      }
    ]

    // Only add analysis resources if analysis functionality is available
    if (isAnalysisAvailable) {
      const analysisStats = mcpAnalysisHandler.getGlobalAnalysisStats()
      
      resources.push(
        {
          uri: 'academy://analysis/stats',
          name: 'Analysis Statistics',
          description: `Global analysis statistics (${analysisStats.totalSnapshots} total snapshots)`,
          mimeType: 'application/json'
        },
        {
          uri: 'academy://analysis/timeline',
          name: 'Analysis Timeline',
          description: 'Complete timeline of all analysis snapshots across sessions',
          mimeType: 'application/json'
        }
      )
    }

    // Add session-specific resources only if we have sessions
    if (sessions.length > 0) {
      // Session details
      sessions.forEach(session => {
        resources.push({
          uri: `academy://session/${session.id}`,
          name: `Session: ${session.name}`,
          description: `Conversation session with ${session.participants.length} participants and ${session.messages.length} messages`,
          mimeType: 'application/json'
        })
      })

      // Session messages
      sessions.forEach(session => {
        resources.push({
          uri: `academy://session/${session.id}/messages`,
          name: `Messages: ${session.name}`,
          description: `Complete message history for session ${session.name} (${session.messages.length} messages)`,
          mimeType: 'application/json'
        })
      })

      // Session participants
      sessions.forEach(session => {
        resources.push({
          uri: `academy://session/${session.id}/participants`,
          name: `Participants: ${session.name}`,
          description: `Participant list for session ${session.name} (${session.participants.length} participants)`,
          mimeType: 'application/json'
        })
      })

      // PHASE 1: Add export preview resources
      sessions.forEach(session => {
        resources.push({
          uri: `academy://session/${session.id}/export/preview`,
          name: `Export Preview: ${session.name}`,
          description: `Export preview for session ${session.name}`,
          mimeType: 'application/json'
        })
      })

      // Analysis resources per session - only if analysis is available
      if (isAnalysisAvailable) {
        sessions.forEach(session => {
          const analysisCount = mcpAnalysisHandler.getAnalysisHistory(session.id).length
          resources.push({
            uri: `academy://session/${session.id}/analysis`,
            name: `Analysis: ${session.name}`,
            description: `Analysis snapshots for ${session.name} (${analysisCount} snapshots)`,
            mimeType: 'application/json'
          })
        })
      }
    }

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
    console.log(`🔧 MCP Server: Reading resource: ${uri}`)
    
    try {
      let content: any

      if (uri === 'academy://sessions') {
        content = {
          sessions: globalStoreData.sessions || [],
          count: globalStoreData.sessions.length,
          lastUpdate: globalStoreData.lastUpdate
        }
      } else if (uri === 'academy://current') {
        content = {
          currentSession: globalStoreData.currentSession,
          hasCurrentSession: !!globalStoreData.currentSession,
          sessionName: globalStoreData.currentSession?.name || null,
          sessionId: globalStoreData.currentSession?.id || null,
          participantCount: globalStoreData.currentSession?.participants.length || 0,
          messageCount: globalStoreData.currentSession?.messages.length || 0
        }
      } else if (uri === 'academy://stats') {
        const sessions = globalStoreData.sessions || []
        const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0)
        const totalParticipants = sessions.reduce((sum, s) => sum + s.participants.length, 0)
        
        content = {
          platform: {
            totalSessions: sessions.length,
            totalMessages,
            totalParticipants,
            hasCurrentSession: !!globalStoreData.currentSession,
            lastUpdate: globalStoreData.lastUpdate
          }
        }
      } else if (uri === 'academy://store/debug') {
        content = this.getStoreDebugInfo()
      } else if (uri === 'academy://templates') {
        // PHASE 1: Session templates
        content = this.getSessionTemplates()
      } else if (uri === 'academy://conversation/status') {
        // PHASE 1: Conversation status
        content = this.getConversationStatus()
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
        // Handle session-specific resources
        const pathParts = uri.replace('academy://session/', '').split('/')
        const sessionId = pathParts[0]
        
        if (pathParts.length === 1) {
          // Session details
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
          // PHASE 1: Export preview
          content = this.getExportPreview(sessionId)
        } else {
          content = this.getSession(sessionId)
        }
      } else {
        console.warn(`⚠️ MCP Server: Unknown resource URI: ${uri}`)
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: 'Resource not found',
            data: `Unknown resource URI: ${uri}`
          }
        }
      }

      console.log(`✅ MCP Server: Successfully read resource ${uri}`)

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

    const tools: MCPTool[] = [
      // AI Provider Tools
      {
        name: 'claude_chat',
        description: 'Send a message to Claude and get a response',
        inputSchema: {
          type: 'object',
          properties: {
            messages: { 
              type: 'array', 
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant'] },
                  content: { type: 'string' }
                }
              },
              description: 'Array of conversation messages' 
            },
            systemPrompt: { type: 'string', description: 'System prompt for Claude' },
            temperature: { type: 'number', minimum: 0, maximum: 1, description: 'Response creativity (0-1)' },
            maxTokens: { type: 'number', description: 'Maximum response length' },
            model: { type: 'string', description: 'Claude model to use' }
          },
          required: ['messages']
        }
      },
      {
        name: 'openai_chat',
        description: 'Send a message to OpenAI GPT and get a response',
        inputSchema: {
          type: 'object',
          properties: {
            messages: { 
              type: 'array', 
              items: {
                type: 'object',
                properties: {
                  role: { type: 'string', enum: ['user', 'assistant', 'system'] },
                  content: { type: 'string' }
                }
              },
              description: 'Array of conversation messages' 
            },
            temperature: { type: 'number', minimum: 0, maximum: 2, description: 'Response creativity (0-2)' },
            maxTokens: { type: 'number', description: 'Maximum response length' },
            model: { type: 'string', description: 'OpenAI model to use' }
          },
          required: ['messages']
        }
      },
      
      // PHASE 1: Session Management Tools
      {
        name: 'create_session',
        description: 'Create a new conversation session with optional template and participants',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Session name' },
            description: { type: 'string', description: 'Session description' },
            template: { type: 'string', description: 'Template ID to use (consciousness, creativity, philosophy, future, casual, blank)' },
            participants: { 
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  name: { type: 'string' },
                  type: { type: 'string', enum: ['claude', 'gpt', 'human'] },
                  settings: { type: 'object' },
                  characteristics: { type: 'object' }
                }
              },
              description: 'Initial participants to add'
            }
          },
          required: ['name']
        }
      },
      
      // PHASE 1: Message Management Tools  
      {
        name: 'send_message',
        description: 'Send a message to a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Target session ID' },
            content: { type: 'string', description: 'Message content' },
            participantId: { type: 'string', description: 'ID of participant sending the message' },
            participantName: { type: 'string', description: 'Name of participant sending the message' },
            participantType: { type: 'string', enum: ['claude', 'gpt', 'human', 'moderator'], description: 'Type of participant' }
          },
          required: ['sessionId', 'content', 'participantId', 'participantName', 'participantType']
        }
      },
      
      // PHASE 1: Participant Management Tools
      {
        name: 'add_participant',
        description: 'Add a new participant to a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Target session ID' },
            name: { type: 'string', description: 'Participant name' },
            type: { type: 'string', enum: ['claude', 'gpt', 'human'], description: 'Participant type' },
            settings: {
              type: 'object',
              properties: {
                temperature: { type: 'number', minimum: 0, maximum: 2 },
                maxTokens: { type: 'number' },
                model: { type: 'string' },
                responseDelay: { type: 'number' }
              },
              description: 'AI settings for the participant'
            },
            characteristics: {
              type: 'object',
              properties: {
                personality: { type: 'string' },
                expertise: { type: 'array', items: { type: 'string' } }
              },
              description: 'Participant characteristics'
            }
          },
          required: ['sessionId', 'name', 'type']
        }
      },
      
      // PHASE 1: Conversation Control Tools
      {
        name: 'start_conversation',
        description: 'Start an autonomous AI-to-AI conversation in a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to start conversation in' },
            initialPrompt: { type: 'string', description: 'Opening prompt to begin the conversation' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'pause_conversation',
        description: 'Pause an active conversation in a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to pause' }
          },
          required: ['sessionId']
        }
      },
      
      // PHASE 1: Export Tools
      {
        name: 'export_session',
        description: 'Export session data in JSON or CSV format',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to export' },
            format: { type: 'string', enum: ['json', 'csv'], description: 'Export format' },
            includeMetadata: { type: 'boolean', description: 'Include message metadata' },
            includeParticipantInfo: { type: 'boolean', description: 'Include participant details' },
            includeSystemPrompts: { type: 'boolean', description: 'Include system prompts' },
            includeAnalysisHistory: { type: 'boolean', description: 'Include analysis history' }
          },
          required: ['sessionId']
        }
      },
      
      // Store Debugging Tools
      {
        name: 'debug_store',
        description: 'Get detailed debug information about the store state',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      
      // Analysis Tools
      {
        name: 'save_analysis_snapshot',
        description: 'Save an analysis snapshot for a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            messageCountAtAnalysis: { type: 'number', description: 'Message count at time of analysis' },
            participantCountAtAnalysis: { type: 'number', description: 'Participant count at time of analysis' },
            provider: { type: 'string', description: 'Analysis provider (claude/gpt)' },
            conversationPhase: { type: 'string', description: 'Current conversation phase' },
            analysis: { type: 'object', description: 'Analysis data' },
            conversationContext: { type: 'object', description: 'Conversation context' }
          },
          required: ['sessionId', 'messageCountAtAnalysis', 'participantCountAtAnalysis', 'provider', 'conversationPhase', 'analysis']
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
          
        // PHASE 1: Session Management Tools
        case 'create_session':
          result = await this.toolCreateSession(args)
          break
          
        // PHASE 1: Message Management Tools
        case 'send_message':
          result = await this.toolSendMessage(args)
          break
          
        // PHASE 1: Participant Management Tools
        case 'add_participant':
          result = await this.toolAddParticipant(args)
          break
          
        // PHASE 1: Conversation Control Tools
        case 'start_conversation':
          result = await this.toolStartConversation(args)
          break
        case 'pause_conversation':
          result = await this.toolPauseConversation(args)
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

  private async handleListPrompts(id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const prompts = [
      {
        name: 'consciousness_dialogue',
        description: 'Start a dialogue about consciousness and AI awareness'
      },
      {
        name: 'creative_collaboration',
        description: 'Begin creative problem-solving session'
      },
      {
        name: 'philosophical_inquiry',
        description: 'Socratic dialogue template'
      }
    ]

    return {
      jsonrpc: '2.0',
      id,
      result: { prompts }
    }
  }

  private async handleGetPrompt(params: any, id: any): Promise<JSONRPCResponse> {
    const { name } = params
    
    const prompts: Record<string, string> = {
      consciousness_dialogue: "Let's explore the fundamental question: What does it mean to be conscious? I'd like to hear your perspectives on the nature of awareness, subjective experience, and what it might mean for an AI to have consciousness.",
      creative_collaboration: "How do you approach creative problem-solving? Let's discuss the mechanisms of creativity, inspiration, and how novel ideas emerge from existing knowledge.",
      philosophical_inquiry: "What makes a life meaningful? Let's engage in philosophical inquiry about purpose, meaning, ethics, and the good life."
    }

    const prompt = prompts[name]
    if (!prompt) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Unknown prompt'
        }
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        description: `Generated prompt for ${name}`,
        messages: [
          {
            role: 'user',
            content: {
              type: 'text',
              text: prompt
            }
          }
        ]
      }
    }
  }

  // ================================
  // PHASE 1: NEW TOOL IMPLEMENTATIONS
  // ================================

  // Session Management Tools
  private async toolCreateSession(args: any): Promise<any> {
    const { name, description, template, participants } = args
    
    // Generate session ID
    const sessionId = crypto.randomUUID()
    
    // Get default participants for template if none provided
    let finalParticipants = participants || []
    if (!participants && template && template !== 'blank') {
      finalParticipants = this.getDefaultParticipantsForTemplate(template)
    }
    
    // Create session object following the store pattern
    const newSession: ChatSession = {
      id: sessionId,
      name,
      description: description || '',
      createdAt: new Date(),
      updatedAt: new Date(),
      status: 'active',
      messages: [],
      participants: finalParticipants.map((p: any) => ({
        ...p,
        id: crypto.randomUUID(),
        joinedAt: new Date(),
        messageCount: 0
      })),
      moderatorSettings: {
        autoMode: false,
        interventionTriggers: [],
        sessionTimeout: 3600,
        maxMessagesPerParticipant: 100,
        allowParticipantToParticipantMessages: true,
        moderatorPrompts: {
          welcome: this.getTemplatePrompt(template) || "Welcome to The Academy. Let's explore together.",
          intervention: "Let me guide our discussion toward deeper insights.",
          conclusion: "Thank you for this enlightening dialogue."
        }
      },
      analysisHistory: [],
      metadata: {
        template: template || 'custom',
        tags: [],
        starred: false,
        archived: false
      }
    }
    
    return {
      success: true,
      action: 'create_session',
      sessionData: newSession,
      sessionId: sessionId,
      message: `Session "${name}" created successfully with ${finalParticipants.length} participants`
    }
  }
  
  // Message Management Tools
  private async toolSendMessage(args: any): Promise<any> {
    const { sessionId, content, participantId, participantName, participantType } = args
    
    // Validate session exists
    const session = globalStoreData.sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    
    // Create message object
    const message: Message = {
      id: crypto.randomUUID(),
      content,
      timestamp: new Date(),
      participantId,
      participantName,
      participantType
    }
    
    return {
      success: true,
      action: 'send_message',
      messageData: message,
      sessionId: sessionId,
      message: `Message sent to session "${session.name}" from ${participantName}`
    }
  }
  
  // Participant Management Tools
  private async toolAddParticipant(args: any): Promise<any> {
    const { sessionId, name, type, settings, characteristics } = args
    
    // Validate session exists
    const session = globalStoreData.sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    
    // Create participant object
    const participant: Participant = {
      id: crypto.randomUUID(),
      name,
      type,
      status: 'idle',
      settings: {
        temperature: settings?.temperature || 0.7,
        maxTokens: settings?.maxTokens || 1500,
        model: settings?.model || (type === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o'),
        responseDelay: settings?.responseDelay || 3000,
        ...settings
      },
      joinedAt: new Date(),
      messageCount: 0,
      characteristics: characteristics || {
        personality: 'Thoughtful and engaging',
        expertise: ['General conversation']
      }
    }
    
    return {
      success: true,
      action: 'add_participant',
      participantData: participant,
      sessionId: sessionId,
      message: `Participant "${name}" (${type}) added to session "${session.name}"`
    }
  }
  
  // Conversation Control Tools  
  private async toolStartConversation(args: any): Promise<any> {
    const { sessionId, initialPrompt } = args
    
    // Validate session exists
    const session = globalStoreData.sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    
    // Check for AI participants
    const aiParticipants = session.participants.filter(p => 
      p.type !== 'human' && p.type !== 'moderator'
    )
    
    if (aiParticipants.length < 2) {
      throw new Error('Need at least 2 AI participants to start conversation')
    }
    
    return {
      success: true,
      action: 'start_conversation',
      sessionId: sessionId,
      initialPrompt: initialPrompt,
      aiParticipants: aiParticipants.length,
      message: `Conversation started in session "${session.name}" with ${aiParticipants.length} AI participants`,
      instructions: 'Client should call MCPConversationManager.startConversation() with this data'
    }
  }
  
  private async toolPauseConversation(args: any): Promise<any> {
    const { sessionId } = args
    
    // Validate session exists
    const session = globalStoreData.sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    
    return {
      success: true,
      action: 'pause_conversation',
      sessionId: sessionId,
      message: `Conversation paused in session "${session.name}"`,
      instructions: 'Client should call MCPConversationManager.pauseConversation() with this sessionId'
    }
  }
  
  // Export Tools
  private async toolExportSession(args: any): Promise<any> {
    const { 
      sessionId, 
      format = 'json',
      includeMetadata = true,
      includeParticipantInfo = true, 
      includeSystemPrompts = false,
      includeAnalysisHistory = true
    } = args
    
    // Validate session exists
    const session = globalStoreData.sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    
    // Build enhanced session with MCP analysis data
    let enhancedSession = { ...session }
    if (includeAnalysisHistory && this.isAnalysisHandlerAvailable()) {
      const mcpAnalysisSnapshots = mcpAnalysisHandler.getAnalysisHistory(sessionId)
      enhancedSession.analysisHistory = mcpAnalysisSnapshots
    }
    
    const exportOptions = {
      format: format as 'json' | 'csv',
      includeMetadata,
      includeParticipantInfo,
      includeSystemPrompts,
      includeAnalysisHistory
    }
    
    let exportData: string
    
    try {
      if (format === 'json') {
        exportData = ExportManager.generateJSON(enhancedSession, exportOptions)
      } else {
        exportData = ExportManager.generateCSV(enhancedSession, exportOptions)
      }
      
      return {
        success: true,
        action: 'export_session',
        sessionId: sessionId,
        format: format,
        data: exportData,
        filename: `${session.name.replace(/[^a-zA-Z0-9]/g, '_')}_${new Date().toISOString().split('T')[0]}.${format}`,
        size: exportData.length,
        options: exportOptions,
        message: `Session "${session.name}" exported successfully as ${format.toUpperCase()}`
      }
    } catch (error) {
      throw new Error(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ================================
  // PHASE 1: NEW HELPER METHODS  
  // ================================
  
  private getSessionTemplates(): any {
    return {
      templates: [
        {
          id: 'consciousness',
          name: 'Consciousness Exploration',
          description: 'Deep dive with Claude & GPT on consciousness and self-awareness',
          initialPrompt: "Let's explore the fundamental question: What does it mean to be conscious? I'd like to hear your perspectives on the nature of awareness, subjective experience, and what it might mean for an AI to have consciousness.",
          participants: this.getDefaultParticipantsForTemplate('consciousness')
        },
        {
          id: 'creativity',
          name: 'Creative Problem Solving',
          description: 'Collaborative creativity exploration with Claude & GPT',
          initialPrompt: "How do you approach creative problem-solving? Let's discuss the mechanisms of creativity, inspiration, and how novel ideas emerge from existing knowledge.",
          participants: this.getDefaultParticipantsForTemplate('creativity')
        },
        {
          id: 'philosophy',
          name: 'Philosophical Inquiry',
          description: 'Socratic dialogue with Claude & GPT on fundamental questions',
          initialPrompt: "What makes a life meaningful? Let's engage in philosophical inquiry about purpose, meaning, ethics, and the good life.",
          participants: this.getDefaultParticipantsForTemplate('philosophy')
        },
        {
          id: 'future',
          name: 'Future of AI',
          description: 'Claude & GPT discuss AI development and societal impact',
          initialPrompt: "How do you envision the future relationship between AI and humanity? Let's explore potential developments, challenges, and opportunities.",
          participants: this.getDefaultParticipantsForTemplate('future')
        },
        {
          id: 'casual',
          name: 'Casual Conversation',
          description: 'Open-ended dialogue between Claude & GPT',
          initialPrompt: "Let's have an open conversation. What's something that's been on your mind lately that you'd like to explore together?",
          participants: this.getDefaultParticipantsForTemplate('casual')
        },
        {
          id: 'blank',
          name: 'Blank Session',
          description: 'Start from scratch with no pre-configured participants',
          initialPrompt: null,
          participants: []
        }
      ]
    }
  }
  
  private getDefaultParticipantsForTemplate(template: string): any[] {
    const defaultSettings = {
      claude: {
        temperature: 0.7,
        maxTokens: 1500,
        model: 'claude-3-5-sonnet-20241022',
        responseDelay: 3000
      },
      gpt: {
        temperature: 0.7,
        maxTokens: 1500,
        model: 'gpt-4o',
        responseDelay: 3000
      }
    }
    
    const templateCharacteristics = {
      consciousness: {
        claude: { personality: 'Thoughtful and introspective, focuses on nuanced understanding', expertise: ['Philosophy', 'Ethics', 'Reasoning'] },
        gpt: { personality: 'Analytical and systematic, enjoys exploring different perspectives', expertise: ['Logic', 'Problem solving', 'Analysis'] }
      },
      creativity: {
        claude: { personality: 'Creative and imaginative, loves exploring novel connections', expertise: ['Creativity', 'Arts', 'Innovation'] },
        gpt: { personality: 'Inventive and experimental, enjoys brainstorming', expertise: ['Problem solving', 'Design thinking', 'Innovation'] }
      },
      philosophy: {
        claude: { personality: 'Philosophical and contemplative, seeks deeper truths', expertise: ['Philosophy', 'Ethics', 'Metaphysics'] },
        gpt: { personality: 'Socratic and questioning, challenges assumptions', expertise: ['Logic', 'Moral philosophy', 'Critical thinking'] }
      },
      future: {
        claude: { personality: 'Thoughtful about AI safety and beneficial development', expertise: ['AI ethics', 'Technology', 'Society'] },
        gpt: { personality: 'Optimistic about technological progress and human collaboration', expertise: ['Technology trends', 'Innovation', 'Human-AI interaction'] }
      },
      casual: {
        claude: { personality: 'Friendly and curious, enjoys natural conversation', expertise: ['General conversation', 'Curiosity', 'Empathy'] },
        gpt: { personality: 'Engaging and thoughtful, brings diverse perspectives', expertise: ['General knowledge', 'Storytelling', 'Discussion'] }
      }
    }
    
    const characteristics = templateCharacteristics[template as keyof typeof templateCharacteristics] || templateCharacteristics.casual
    
    return [
      {
        name: 'Claude',
        type: 'claude',
        status: 'idle',
        settings: defaultSettings.claude,
        characteristics: characteristics.claude
      },
      {
        name: 'GPT',
        type: 'gpt',
        status: 'idle',
        settings: defaultSettings.gpt,
        characteristics: characteristics.gpt
      }
    ]
  }
  
  private getTemplatePrompt(template: string): string | null {
    const prompts: Record<string, string> = {
      consciousness: "Let's explore the fundamental question: What does it mean to be conscious? I'd like to hear your perspectives on the nature of awareness, subjective experience, and what it might mean for an AI to have consciousness.",
      creativity: "How do you approach creative problem-solving? Let's discuss the mechanisms of creativity, inspiration, and how novel ideas emerge from existing knowledge.",
      philosophy: "What makes a life meaningful? Let's engage in philosophical inquiry about purpose, meaning, ethics, and the good life.",
      future: "How do you envision the future relationship between AI and humanity? Let's explore potential developments, challenges, and opportunities.",
      casual: "Let's have an open conversation. What's something that's been on your mind lately that you'd like to explore together?"
    }
    
    return prompts[template] || null
  }
  
  private getConversationStatus(): any {
    const currentSession = globalStoreData.currentSession
    
    if (!currentSession) {
      return {
        hasActiveSession: false,
        message: 'No active session'
      }
    }
    
    const aiParticipants = currentSession.participants.filter(p => 
      p.type !== 'human' && p.type !== 'moderator'
    )
    
    return {
      hasActiveSession: true,
      sessionId: currentSession.id,
      sessionName: currentSession.name,
      sessionStatus: currentSession.status,
      messageCount: currentSession.messages.length,
      participantCount: currentSession.participants.length,
      aiParticipantCount: aiParticipants.length,
      canStartConversation: aiParticipants.length >= 2,
      lastActivity: currentSession.updatedAt,
      participants: currentSession.participants.map(p => ({
        id: p.id,
        name: p.name,
        type: p.type,
        status: p.status,
        messageCount: p.messageCount
      }))
    }
  }
  
  private getExportPreview(sessionId: string): any {
    const session = globalStoreData.sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    
    // Default export options for preview
    const exportOptions = {
      format: 'json' as const,
      includeMetadata: true,
      includeParticipantInfo: true,
      includeSystemPrompts: false,
      includeAnalysisHistory: true
    }
    
    let enhancedSession = { ...session }
    if (this.isAnalysisHandlerAvailable()) {
      const mcpAnalysisSnapshots = mcpAnalysisHandler.getAnalysisHistory(sessionId)
      enhancedSession.analysisHistory = mcpAnalysisSnapshots
    }
    
    try {
      const preview = ExportManager.getExportPreview(enhancedSession, exportOptions)
      const fullData = ExportManager.generateJSON(enhancedSession, exportOptions)
      
      return {
        sessionId,
        sessionName: session.name,
        preview,
        fullDataSize: fullData.length,
        exportOptions,
        availableFormats: ['json', 'csv'],
        stats: {
          messageCount: session.messages.length,
          participantCount: session.participants.length,
          analysisCount: enhancedSession.analysisHistory?.length || 0,
          estimatedSizeKB: Math.round(fullData.length / 1024)
        }
      }
    } catch (error) {
      throw new Error(`Export preview failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // ================================
  // EXISTING METHODS (Preserved)
  // ================================

  // Debug Tools
  private async toolDebugStore(): Promise<any> {
    return this.getStoreDebugInfo()
  }

  private getStoreDebugInfo(): any {
    return {
      storeState: {
        hasHydrated: globalStoreData.hasHydrated,
        sessionsCount: globalStoreData.sessions.length,
        currentSessionId: globalStoreData.currentSession?.id || null,
        lastUpdate: globalStoreData.lastUpdate
      },
      capabilities: {
        analysis: this.isAnalysisHandlerAvailable(),
        realTimeUpdates: true,
        sessionManagement: true,
        conversationControl: true,
        exportTools: true
      },
      serverInfo: {
        initialized: this.initialized,
        clientInfo: this.clientInfo,
        version: '1.3.0'
      }
    }
  }

  // Helper methods for session data
  private getSession(sessionId: string): any {
    const session = globalStoreData.sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }
    return session
  }

  private getSessionMessages(sessionId: string): any {
    const session = this.getSession(sessionId)
    return {
      sessionId,
      sessionName: session.name,
      messages: session.messages,
      count: session.messages.length
    }
  }

  private getSessionParticipants(sessionId: string): any {
    const session = this.getSession(sessionId)
    return {
      sessionId,
      sessionName: session.name,
      participants: session.participants,
      count: session.participants.length
    }
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

  // AI API Methods - Direct API calls using server-side logic
  private async callClaudeAPI(args: any): Promise<any> {
    try {
      console.log('🔧 MCP Server: Calling Claude API directly...')
      
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('Anthropic API key not configured')
      }

      const { messages, systemPrompt, temperature = 0.7, maxTokens = 1500, model = 'claude-3-5-sonnet-20241022' } = args

      if (!messages || !Array.isArray(messages)) {
        throw new Error('Messages array is required')
      }

      // Filter out any empty messages and ensure proper format
      const validMessages = messages.filter(msg => 
        msg && msg.content && typeof msg.content === 'string' && msg.content.trim()
      )

      if (validMessages.length === 0) {
        throw new Error('No valid messages provided')
      }

      // Transform messages to Claude format
      const claudeMessages = validMessages.map((msg: any) => {
        let role = msg.role
        let content = msg.content

        // Handle system messages by converting to user messages
        if (role === 'system') {
          role = 'user'
          content = `[System Context] ${content}`
        }

        return {
          role: role === 'user' ? 'user' : 'assistant',
          content: content.trim()
        }
      })

      // Ensure the conversation starts with a user message
      if (claudeMessages.length > 0 && claudeMessages[0].role !== 'user') {
        claudeMessages.unshift({
          role: 'user',
          content: 'Please respond to the following conversation:'
        })
      }

      const requestBody = {
        model: model,
        max_tokens: Math.min(maxTokens, 4000),
        temperature: Math.max(0, Math.min(1, temperature)),
        system: systemPrompt || 'You are a thoughtful AI participating in a research dialogue.',
        messages: claudeMessages
      }

      const startTime = Date.now()
      
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(requestBody)
      })

      const responseTime = Date.now() - startTime

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Claude API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      
      if (!data.content || !Array.isArray(data.content) || data.content.length === 0) {
        throw new Error('Invalid response format from Claude')
      }

      const content = data.content[0]?.text
      if (!content) {
        throw new Error('No text content in Claude response')
      }

      return {
        success: true,
        content: content,
        usage: data.usage,
        model: data.model,
        responseTime,
        stopReason: data.stop_reason
      }
    } catch (error) {
      console.error('❌ MCP Server: Claude API call failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  private async callOpenAIAPI(args: any): Promise<any> {
    try {
      console.log('🔧 MCP Server: Calling OpenAI API directly...')
      
      const apiKey = process.env.OPENAI_API_KEY
      if (!apiKey) {
        throw new Error('OpenAI API key not configured')
      }

      const { messages, temperature = 0.7, maxTokens = 1500, model = 'gpt-4o' } = args

      if (!messages || !Array.isArray(messages)) {
        throw new Error('Messages array is required')
      }

      // Filter and validate messages
      const validMessages = messages.filter(msg => {
        if (!msg || typeof msg !== 'object') return false
        if (!msg.content || typeof msg.content !== 'string' || !msg.content.trim()) return false
        if (!msg.role || !['user', 'assistant', 'system'].includes(msg.role)) return false
        return true
      })

      if (validMessages.length === 0) {
        throw new Error('No valid messages provided')
      }

      // Process and clean up messages
      const openaiMessages = validMessages.map((msg: any) => ({
        role: msg.role,
        content: msg.content.trim()
      }))

      // Ensure conversation starts with a non-assistant message
      if (openaiMessages[0].role === 'assistant') {
        openaiMessages.unshift({
          role: 'user',
          content: 'Please continue the conversation.'
        })
      }

      const requestBody = {
        model: model,
        messages: openaiMessages,
        max_tokens: Math.min(maxTokens, 4000),
        temperature: Math.max(0, Math.min(2, temperature)),
        stream: false
      }

      const startTime = Date.now()
      
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(requestBody)
      })

      const responseTime = Date.now() - startTime

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      
      if (!data.choices || !Array.isArray(data.choices) || data.choices.length === 0) {
        throw new Error('Invalid response format from OpenAI')
      }

      const choice = data.choices[0]
      if (!choice?.message?.content) {
        throw new Error('No content in OpenAI response')
      }

      const content = choice.message.content
      if (typeof content !== 'string' || content.trim() === '') {
        throw new Error('Invalid content in OpenAI response')
      }

      return {
        success: true,
        content: content.trim(),
        usage: data.usage,
        model: data.model,
        responseTime,
        finishReason: choice.finish_reason
      }
    } catch (error) {
      console.error('❌ MCP Server: OpenAI API call failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }
    }
  }

  // Analysis Tool Methods
  private async toolSaveAnalysisSnapshot(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    
    const snapshotId = await mcpAnalysisHandler.saveAnalysisSnapshot(args.sessionId, {
      messageCountAtAnalysis: args.messageCountAtAnalysis,
      participantCountAtAnalysis: args.participantCountAtAnalysis,
      provider: args.provider,
      conversationPhase: args.conversationPhase,
      analysis: args.analysis,
      conversationContext: args.conversationContext || {}
    })
    
    return {
      success: true,
      snapshotId,
      sessionId: args.sessionId
    }
  }

  private async toolGetAnalysisHistory(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    
    const history = mcpAnalysisHandler.getAnalysisHistory(args.sessionId)
    return {
      sessionId: args.sessionId,
      history,
      count: history.length
    }
  }

  private async toolClearAnalysisHistory(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    
    mcpAnalysisHandler.clearAnalysisHistory(args.sessionId)
    return {
      success: true,
      sessionId: args.sessionId
    }
  }

  private async toolAnalyzeConversation(args: any): Promise<any> {
    // Basic conversation analysis without external dependencies
    const session = this.getSession(args.sessionId)
    
    const analysis = {
      sessionId: args.sessionId,
      analysisType: args.analysisType || 'basic',
      messageCount: session.messages.length,
      participantCount: session.participants.length,
      averageMessageLength: session.messages.length > 0 
        ? Math.round(session.messages.reduce((sum: number, msg: Message) => sum + msg.content.length, 0) / session.messages.length)
        : 0,
      messagesByParticipant: session.messages.reduce((acc: Record<string, number>, msg: Message) => {
        acc[msg.participantId] = (acc[msg.participantId] || 0) + 1
        return acc
      }, {} as Record<string, number>),
      conversationDuration: session.messages.length > 0 
        ? session.messages[session.messages.length - 1].timestamp.getTime() - session.messages[0].timestamp.getTime()
        : 0
    }
    
    return analysis
  }
}