// src/lib/mcp/server.ts - Enhanced with Complete Custom Prompts Integration
import { ChatSession, Message, Participant } from '@/types/chat'
import { mcpAnalysisHandler } from './analysis-handler'

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
  customPrompts: {
    analysisSystemPrompt: string | null
    chatSystemPrompt: string | null
  }
  // Store methods we need
  setCustomAnalysisPrompt: (prompt: string | null) => void
  setCustomChatPrompt: (prompt: string | null) => void
  getAnalysisPrompt: () => string
  getChatPrompt: (participant?: Participant) => string
  resetPromptsToDefault: () => void
  debug?: any
} = {
  sessions: [],
  currentSession: null,
  hasHydrated: false,
  lastUpdate: new Date(),
  customPrompts: {
    analysisSystemPrompt: null,
    chatSystemPrompt: null
  },
  setCustomAnalysisPrompt: () => {},
  setCustomChatPrompt: () => {},
  getAnalysisPrompt: () => 'You are an expert research assistant specializing in philosophical dialogue analysis.',
  getChatPrompt: () => 'You are a thoughtful AI participant in a research dialogue.',
  resetPromptsToDefault: () => {}
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
            listChanged: true
          },
          experimental: {
            analysis: true,
            realTimeUpdates: true,
            customPrompts: true
          }
        },
        serverInfo: {
          name: 'The Academy MCP Server',
          version: '1.3.0',
          description: 'AI Research Platform with conversation management, AI provider tools, analysis engine, and custom prompts'
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
      // Custom Prompts Resources
      {
        uri: 'academy://prompts/custom',
        name: 'Custom Prompts Configuration',
        description: `Custom analysis and chat prompts (Analysis: ${globalStoreData.customPrompts.analysisSystemPrompt ? 'Custom' : 'Default'}, Chat: ${globalStoreData.customPrompts.chatSystemPrompt ? 'Custom' : 'Default'})`,
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
          },
          customPrompts: this.getCustomPromptsInfo()
        }
      } else if (uri === 'academy://store/debug') {
        content = this.getStoreDebugInfo()
      } else if (uri === 'academy://prompts/custom') {
        // *** THIS IS THE MISSING PIECE! ***
        content = this.getCustomPromptsInfo()
      } else if (uri === 'academy://analysis/stats') {
        if (this.isAnalysisHandlerAvailable()) {
          content = mcpAnalysisHandler.getGlobalAnalysisStats()
        } else {
          content = { error: 'Analysis functionality not available' }
        }
      } else if (uri === 'academy://analysis/timeline') {
        if (this.isAnalysisHandlerAvailable()) {
          content = mcpAnalysisHandler.getGlobalAnalysisTimeline()
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
      // Custom Prompts Management Tools
      {
        name: 'get_custom_prompts',
        description: 'Get the current custom prompts configuration',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      {
        name: 'set_custom_analysis_prompt',
        description: 'Set a custom analysis prompt for research dialogue analysis',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { 
              type: 'string', 
              description: 'The custom analysis prompt to set. Pass "null" to reset to default.' 
            }
          },
          required: ['prompt']
        }
      },
      {
        name: 'set_custom_chat_prompt',
        description: 'Set a custom chat prompt template for dialogue participants',
        inputSchema: {
          type: 'object',
          properties: {
            prompt: { 
              type: 'string', 
              description: 'The custom chat prompt template to set. Pass "null" to reset to default.' 
            }
          },
          required: ['prompt']
        }
      },
      {
        name: 'reset_custom_prompts',
        description: 'Reset all custom prompts to defaults',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
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
      {
        name: 'refresh_store',
        description: 'Force refresh the store reference in MCP server',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      },
      // Session Management Tools
      {
        name: 'create_session',
        description: 'Create a new conversation session',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Session name' },
            description: { type: 'string', description: 'Session description' },
            template: { type: 'string', description: 'Template ID to use' }
          },
          required: ['name']
        }
      },
      {
        name: 'add_participant',
        description: 'Add a participant to a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            name: { type: 'string', description: 'Participant name' },
            type: { type: 'string', enum: ['claude', 'gpt', 'human'], description: 'Participant type' },
            settings: {
              type: 'object',
              properties: {
                model: { type: 'string', description: 'AI model to use' },
                temperature: { type: 'number', description: 'AI creativity (0-1)' },
                maxTokens: { type: 'number', description: 'Maximum response length' },
                characteristics: { type: 'string', description: 'AI personality/characteristics' }
              }
            }
          },
          required: ['sessionId', 'name', 'type']
        }
      },
      {
        name: 'send_message',
        description: 'Send a message to a session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            content: { type: 'string', description: 'Message content' },
            participantId: { type: 'string', description: 'Participant ID (optional for human messages)' }
          },
          required: ['sessionId', 'content']
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
            analysis: { type: 'object', description: 'Analysis data' },
            title: { type: 'string', description: 'Analysis title' },
            provider: { type: 'string', description: 'Analysis provider (claude/gpt)' }
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
        name: 'get_analysis_timeline',
        description: 'Get analysis timeline for export',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' }
          },
          required: ['sessionId']
        }
      },
      // Legacy analysis tool (for backward compatibility)
      {
        name: 'analyze_conversation',
        description: 'Analyze conversation patterns and extract insights (legacy)',
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
        case 'claude_chat':
          result = await this.callClaudeAPI(args)
          break
        case 'openai_chat':
          result = await this.callOpenAIAPI(args)
          break
        // Custom Prompts Tools
        case 'get_custom_prompts':
          result = await this.toolGetCustomPrompts()
          break
        case 'set_custom_analysis_prompt':
          result = await this.toolSetCustomAnalysisPrompt(args)
          break
        case 'set_custom_chat_prompt':
          result = await this.toolSetCustomChatPrompt(args)
          break
        case 'reset_custom_prompts':
          result = await this.toolResetCustomPrompts()
          break
        case 'debug_store':
          result = await this.toolDebugStore()
          break
        case 'refresh_store':
          result = await this.toolRefreshStore()
          break
        case 'create_session':
          result = await this.toolCreateSession(args)
          break
        case 'add_participant':
          result = await this.toolAddParticipant(args)
          break
        case 'send_message':
          result = await this.toolSendMessage(args)
          break
        // Analysis tools
        case 'save_analysis_snapshot':
          result = await this.toolSaveAnalysisSnapshot(args)
          break
        case 'get_analysis_history':
          result = await this.toolGetAnalysisHistory(args)
          break
        case 'clear_analysis_history':
          result = await this.toolClearAnalysisHistory(args)
          break
        case 'get_analysis_timeline':
          result = await this.toolGetAnalysisTimeline(args)
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

    // Static prompts
    const staticPrompts = [
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

    // Dynamic prompts based on custom prompt configuration
    const customPrompts = globalStoreData.customPrompts
    const dynamicPrompts = []

    if (customPrompts.analysisSystemPrompt) {
      dynamicPrompts.push({
        name: 'custom_analysis',
        description: 'Custom analysis prompt for research dialogue analysis'
      })
    }

    if (customPrompts.chatSystemPrompt) {
      dynamicPrompts.push({
        name: 'custom_chat',
        description: 'Custom chat prompt template for dialogue participants'
      })
    }

    const allPrompts = [...staticPrompts, ...dynamicPrompts]

    console.log(`✅ MCP Server: Generated ${allPrompts.length} prompts (${staticPrompts.length} static, ${dynamicPrompts.length} custom)`)

    return {
      jsonrpc: '2.0',
      id,
      result: { prompts: allPrompts }
    }
  }

  private async handleGetPrompt(params: any, id: any): Promise<JSONRPCResponse> {
    const { name } = params
    
    // Static prompts
    const staticPrompts: Record<string, string> = {
      consciousness_dialogue: "Let's explore the fundamental question: What does it mean to be conscious? I'd like to hear your perspectives on the nature of awareness, subjective experience, and what it might mean for an AI to have consciousness.",
      creative_collaboration: "How do you approach creative problem-solving? Let's discuss the mechanisms of creativity, inspiration, and how novel ideas emerge from existing knowledge.",
      philosophical_inquiry: "What makes a life meaningful? Let's engage in philosophical inquiry about purpose, meaning, ethics, and the good life."
    }

    // Check for static prompts first
    if (staticPrompts[name]) {
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
                text: staticPrompts[name]
              }
            }
          ]
        }
      }
    }

    // Handle custom prompts
    const customPrompts = globalStoreData.customPrompts

    switch (name) {
      case 'custom_analysis':
        if (customPrompts.analysisSystemPrompt) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: 'Custom analysis prompt for research dialogue analysis',
              messages: [
                {
                  role: 'system',
                  content: {
                    type: 'text',
                    text: customPrompts.analysisSystemPrompt
                  }
                }
              ]
            }
          }
        }
        break

      case 'custom_chat':
        if (customPrompts.chatSystemPrompt) {
          return {
            jsonrpc: '2.0',
            id,
            result: {
              description: 'Custom chat prompt template for dialogue participants',
              messages: [
                {
                  role: 'system',
                  content: {
                    type: 'text',
                    text: customPrompts.chatSystemPrompt
                  }
                }
              ]
            }
          }
        }
        break
    }

    return {
      jsonrpc: '2.0',
      id,
      error: {
        code: -32602,
        message: `Prompt '${name}' not found`
      }
    }
  }

  // Custom Prompts Tool Implementations
  private async toolGetCustomPrompts(): Promise<any> {
    const customPrompts = globalStoreData.customPrompts
    
    return {
      success: true,
      customPrompts: {
        analysisSystemPrompt: customPrompts.analysisSystemPrompt,
        chatSystemPrompt: customPrompts.chatSystemPrompt,
        hasCustomAnalysis: !!customPrompts.analysisSystemPrompt,
        hasCustomChat: !!customPrompts.chatSystemPrompt
      },
      defaultPrompts: {
        analysis: globalStoreData.getAnalysisPrompt(),
        chat: globalStoreData.getChatPrompt()
      }
    }
  }

  private async toolSetCustomAnalysisPrompt(args: any): Promise<any> {
    const { prompt } = args

    try {
      // Set the custom prompt in the store
      if (prompt === 'null' || prompt === null) {
        globalStoreData.setCustomAnalysisPrompt(null)
        return {
          success: true,
          message: 'Analysis prompt reset to default',
          prompt: null,
          isDefault: true
        }
      } else {
        globalStoreData.setCustomAnalysisPrompt(prompt)
        return {
          success: true,
          message: 'Custom analysis prompt set successfully',
          prompt: prompt,
          isDefault: false
        }
      }
    } catch (error) {
      throw new Error(`Failed to set custom analysis prompt: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolSetCustomChatPrompt(args: any): Promise<any> {
    const { prompt } = args

    try {
      // Set the custom prompt in the store
      if (prompt === 'null' || prompt === null) {
        globalStoreData.setCustomChatPrompt(null)
        return {
          success: true,
          message: 'Chat prompt reset to default',
          prompt: null,
          isDefault: true
        }
      } else {
        globalStoreData.setCustomChatPrompt(prompt)
        return {
          success: true,
          message: 'Custom chat prompt set successfully',
          prompt: prompt,
          isDefault: false
        }
      }
    } catch (error) {
      throw new Error(`Failed to set custom chat prompt: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolResetCustomPrompts(): Promise<any> {
    try {
      globalStoreData.resetPromptsToDefault()
      return {
        success: true,
        message: 'All custom prompts reset to defaults',
        prompts: {
          analysis: 'reset to default',
          chat: 'reset to default'
        }
      }
    } catch (error) {
      throw new Error(`Failed to reset custom prompts: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Debug Tools
  private async toolDebugStore(): Promise<any> {
    return this.getStoreDebugInfo()
  }

  private async toolRefreshStore(): Promise<any> {
    // This would trigger a refresh from the client side
    return {
      success: true,
      message: 'Store refresh signal sent',
      currentState: this.getStoreDebugInfo()
    }
  }

  // Helper method to get custom prompts info for resources
  private getCustomPromptsInfo(): any {
    const customPrompts = globalStoreData.customPrompts
    
    return {
      configuration: {
        analysisSystemPrompt: {
          isCustom: !!customPrompts.analysisSystemPrompt,
          prompt: customPrompts.analysisSystemPrompt,
          default: globalStoreData.getAnalysisPrompt(),
          lastModified: globalStoreData.lastUpdate
        },
        chatSystemPrompt: {
          isCustom: !!customPrompts.chatSystemPrompt,
          prompt: customPrompts.chatSystemPrompt,
          default: globalStoreData.getChatPrompt(),
          lastModified: globalStoreData.lastUpdate
        }
      },
      summary: {
        hasCustomAnalysis: !!customPrompts.analysisSystemPrompt,
        hasCustomChat: !!customPrompts.chatSystemPrompt,
        totalCustomPrompts: (!!customPrompts.analysisSystemPrompt ? 1 : 0) + (!!customPrompts.chatSystemPrompt ? 1 : 0)
      },
      availableActions: [
        'get_custom_prompts',
        'set_custom_analysis_prompt', 
        'set_custom_chat_prompt',
        'reset_custom_prompts'
      ]
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

  private getStoreDebugInfo(): any {
    return {
      storeState: {
        hasHydrated: globalStoreData.hasHydrated,
        sessionsCount: globalStoreData.sessions.length,
        currentSessionId: globalStoreData.currentSession?.id || null,
        lastUpdate: globalStoreData.lastUpdate
      },
      customPrompts: this.getCustomPromptsInfo(),
      capabilities: {
        analysis: this.isAnalysisHandlerAvailable(),
        customPrompts: true,
        realTimeUpdates: true
      },
      serverInfo: {
        initialized: this.initialized,
        clientInfo: this.clientInfo
      }
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

  // AI API Methods (implement these based on your existing patterns)
  private async callClaudeAPI(args: any): Promise<any> {
    // Implementation depends on your existing Claude API integration
    return { success: true, message: 'Claude API call would be implemented here', args }
  }

  private async callOpenAIAPI(args: any): Promise<any> {
    // Implementation depends on your existing OpenAI API integration
    return { success: true, message: 'OpenAI API call would be implemented here', args }
  }

  // Analysis Tool Methods (implement based on your existing analysis handler)
  private async toolSaveAnalysisSnapshot(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    return mcpAnalysisHandler.saveAnalysisSnapshot(args.sessionId, args.analysis, args.title, args.provider)
  }

  private async toolGetAnalysisHistory(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    return mcpAnalysisHandler.getAnalysisHistory(args.sessionId)
  }

  private async toolClearAnalysisHistory(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    return mcpAnalysisHandler.clearAnalysisHistory(args.sessionId)
  }

  private async toolGetAnalysisTimeline(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    return mcpAnalysisHandler.getAnalysisTimeline(args.sessionId)
  }

  private async toolAnalyzeConversation(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      throw new Error('Analysis functionality not available')
    }
    return mcpAnalysisHandler.analyzeConversation(args.sessionId, args.analysisType)
  }

  // Session Management Tool Methods (implement based on your store patterns)
  private async toolCreateSession(args: any): Promise<any> {
    // Implementation depends on your session creation logic
    return { success: true, message: 'Session creation would be implemented here', args }
  }

  private async toolAddParticipant(args: any): Promise<any> {
    // Implementation depends on your participant addition logic
    return { success: true, message: 'Participant addition would be implemented here', args }
  }

  private async toolSendMessage(args: any): Promise<any> {
    // Implementation depends on your message sending logic
    return { success: true, message: 'Message sending would be implemented here', args }
  }
}