// src/lib/mcp/server.ts - Enhanced with Custom Prompts Integration
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
          lastUpdate: globalStoreData.lastUpdate
        }
      } else if (uri === 'academy://stats') {
        content = this.getPlatformStats()
      } else if (uri === 'academy://store/debug') {
        content = this.getStoreDebugInfo()
      } else if (uri === 'academy://prompts/custom') {
        content = this.getCustomPromptsInfo()
      } else if (uri === 'academy://analysis/stats') {
        if (!this.isAnalysisHandlerAvailable()) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Analysis functionality not available',
              data: 'Analysis handler not initialized yet'
            }
          }
        }
        content = mcpAnalysisHandler.getGlobalAnalysisStats()
      } else if (uri === 'academy://analysis/timeline') {
        if (!this.isAnalysisHandlerAvailable()) {
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Analysis functionality not available',
              data: 'Analysis handler not initialized yet'
            }
          }
        }
        content = this.getGlobalAnalysisTimeline()
      } else if (uri.startsWith('academy://session/')) {
        const pathParts = uri.split('/')
        const sessionId = pathParts[2]
        
        if (uri.endsWith('/analysis')) {
          if (!this.isAnalysisHandlerAvailable()) {
            return {
              jsonrpc: '2.0',
              id,
              error: {
                code: -32602,
                message: 'Analysis functionality not available',
                data: 'Analysis handler not initialized yet'
              }
            }
          }
          content = {
            sessionId,
            snapshots: mcpAnalysisHandler.getAnalysisHistory(sessionId),
            timeline: mcpAnalysisHandler.getAnalysisTimeline(sessionId),
            count: mcpAnalysisHandler.getAnalysisHistory(sessionId).length
          }
        } else if (uri.endsWith('/messages')) {
          content = this.getSessionMessages(sessionId)
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
                maxTokens: { type: 'number', description: 'Maximum response length' }
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
            participantId: { type: 'string', description: 'Participant ID sending the message' }
          },
          required: ['sessionId', 'content', 'participantId']
        }
      },
      // Analysis Tools (only if analysis handler is available)
      {
        name: 'save_analysis_snapshot',
        description: 'Save an analysis snapshot for a session via MCP',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            messageCountAtAnalysis: { type: 'number', description: 'Number of messages when analysis was performed' },
            participantCountAtAnalysis: { type: 'number', description: 'Number of participants when analysis was performed' },
            provider: { type: 'string', enum: ['claude', 'gpt'], description: 'AI provider that performed the analysis' },
            conversationPhase: { type: 'string', description: 'Current phase of conversation' },
            analysis: {
              type: 'object',
              properties: {
                mainTopics: { type: 'array', items: { type: 'string' }, description: 'Main topics being discussed' },
                keyInsights: { type: 'array', items: { type: 'string' }, description: 'Key insights from the conversation' },
                currentDirection: { type: 'string', description: 'Current direction of the conversation' },
                participantDynamics: { type: 'object', description: 'Dynamics between participants' },
                emergentThemes: { type: 'array', items: { type: 'string' }, description: 'Emerging themes' },
                tensions: { type: 'array', items: { type: 'string' }, description: 'Areas of tension' },
                convergences: { type: 'array', items: { type: 'string' }, description: 'Areas of convergence' },
                nextLikelyDirections: { type: 'array', items: { type: 'string' }, description: 'Likely next directions' },
                philosophicalDepth: { type: 'string', enum: ['surface', 'moderate', 'deep', 'profound'], description: 'Depth of philosophical exploration' }
              },
              required: ['mainTopics', 'keyInsights', 'currentDirection', 'philosophicalDepth']
            },
            conversationContext: {
              type: 'object',
              properties: {
                recentMessages: { type: 'number', description: 'Number of recent messages considered' },
                activeParticipants: { type: 'array', items: { type: 'string' }, description: 'Currently active participants' },
                sessionStatus: { type: 'string', description: 'Current session status' },
                moderatorInterventions: { type: 'number', description: 'Number of moderator interventions' }
              }
            }
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
      customPrompts: {
        analysis: {
          isCustom: !!customPrompts.analysisSystemPrompt,
          prompt: customPrompts.analysisSystemPrompt,
          length: customPrompts.analysisSystemPrompt?.length || 0
        },
        chat: {
          isCustom: !!customPrompts.chatSystemPrompt,
          prompt: customPrompts.chatSystemPrompt,
          length: customPrompts.chatSystemPrompt?.length || 0
        }
      },
      currentDefaults: {
        analysis: globalStoreData.getAnalysisPrompt(),
        chat: globalStoreData.getChatPrompt()
      },
      lastUpdate: globalStoreData.lastUpdate
    }
  }

  // AI Provider Tool Implementations
  private async callClaudeAPI(args: any): Promise<any> {
    const { messages, systemPrompt, temperature = 0.7, maxTokens = 1500, model = 'claude-3-5-sonnet-20241022' } = args

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      throw new Error('Anthropic API key not configured')
    }

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature,
          system: systemPrompt || globalStoreData.getAnalysisPrompt(),
          messages: messages.map((msg: any) => ({
            role: msg.role,
            content: msg.content
          }))
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`Claude API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      
      return {
        success: true,
        content: data.content[0]?.text || '',
        usage: data.usage,
        model: data.model,
        provider: 'claude'
      }
    } catch (error) {
      throw new Error(`Claude API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async callOpenAIAPI(args: any): Promise<any> {
    const { messages, temperature = 0.7, maxTokens = 1500, model = 'gpt-4o' } = args

    const apiKey = process.env.OPENAI_API_KEY
    if (!apiKey) {
      throw new Error('OpenAI API key not configured')
    }

    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature
        })
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      
      return {
        success: true,
        content: data.choices[0]?.message?.content || '',
        usage: data.usage,
        model: data.model,
        provider: 'openai'
      }
    } catch (error) {
      throw new Error(`OpenAI API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Analysis Tool Implementations
  private async toolSaveAnalysisSnapshot(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      return {
        success: false,
        error: 'Analysis functionality not available',
        message: 'Analysis handler not initialized yet'
      }
    }

    const { sessionId, ...analysisData } = args

    try {
      console.log(`💾 MCP Tool: Saving analysis snapshot for session ${sessionId}`)
      
      const snapshotId = await mcpAnalysisHandler.saveAnalysisSnapshot(sessionId, analysisData)
      const snapshots = mcpAnalysisHandler.getAnalysisHistory(sessionId)
      
      return {
        success: true,
        snapshotId,
        totalSnapshots: snapshots.length,
        message: `Analysis snapshot saved successfully. Session now has ${snapshots.length} snapshots.`
      }
    } catch (error) {
      throw new Error(`Failed to save analysis snapshot: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetAnalysisHistory(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      return {
        success: false,
        error: 'Analysis functionality not available',
        message: 'Analysis handler not initialized yet'
      }
    }

    const { sessionId } = args

    try {
      const snapshots = mcpAnalysisHandler.getAnalysisHistory(sessionId)
      
      return {
        success: true,
        sessionId,
        snapshots,
        count: snapshots.length,
        timeline: mcpAnalysisHandler.getAnalysisTimeline(sessionId)
      }
    } catch (error) {
      throw new Error(`Failed to get analysis history: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolClearAnalysisHistory(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      return {
        success: false,
        error: 'Analysis functionality not available',
        message: 'Analysis handler not initialized yet'
      }
    }

    const { sessionId } = args

    try {
      mcpAnalysisHandler.clearAnalysisHistory(sessionId)
      
      return {
        success: true,
        sessionId,
        message: 'Analysis history cleared successfully'
      }
    } catch (error) {
      throw new Error(`Failed to clear analysis history: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolGetAnalysisTimeline(args: any): Promise<any> {
    if (!this.isAnalysisHandlerAvailable()) {
      return {
        success: false,
        error: 'Analysis functionality not available',
        message: 'Analysis handler not initialized yet'
      }
    }

    const { sessionId } = args

    try {
      const timeline = mcpAnalysisHandler.getAnalysisTimeline(sessionId)
      
      return {
        success: true,
        sessionId,
        timeline,
        count: timeline.length
      }
    } catch (error) {
      throw new Error(`Failed to get analysis timeline: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  // Helper methods
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

  private getSession(sessionId: string): ChatSession | null {
    const sessions = globalStoreData.sessions || []
    const session = sessions.find(s => s.id === sessionId)
    console.log(`🔧 MCP Server: Getting session ${sessionId}, found: ${!!session}`)
    return session || null
  }

  private getSessionMessages(sessionId: string): any {
    const session = this.getSession(sessionId)
    const messages = session?.messages || []
    return {
      sessionId,
      messages,
      count: messages.length,
      sessionExists: !!session
    }
  }

  private getSessionParticipants(sessionId: string): any {
    const session = this.getSession(sessionId)
    const participants = session?.participants || []
    return {
      sessionId,
      participants,
      count: participants.length,
      sessionExists: !!session
    }
  }

  private getPlatformStats(): any {
    const sessions = globalStoreData.sessions || []
    const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0)
    const activeSessions = sessions.filter(s => s.status === 'active').length
    
    let analysisStats = null
    if (this.isAnalysisHandlerAvailable()) {
      analysisStats = mcpAnalysisHandler.getGlobalAnalysisStats()
    }

    return {
      totalSessions: sessions.length,
      activeSessions,
      totalMessages,
      averageMessagesPerSession: Math.round(totalMessages / (sessions.length || 1)),
      customPrompts: {
        hasCustomAnalysis: !!globalStoreData.customPrompts.analysisSystemPrompt,
        hasCustomChat: !!globalStoreData.customPrompts.chatSystemPrompt
      },
      analysis: analysisStats,
      storeStatus: {
        hasHydrated: globalStoreData.hasHydrated,
        currentSessionId: globalStoreData.currentSession?.id || null,
        lastUpdate: globalStoreData.lastUpdate
      }
    }
  }

  private getStoreDebugInfo(): any {
    const sessions = globalStoreData.sessions || []
    
    let analysisStats = null
    if (this.isAnalysisHandlerAvailable()) {
      analysisStats = mcpAnalysisHandler.getGlobalAnalysisStats()
    }

    return {
      storeState: {
        hasHydrated: globalStoreData.hasHydrated,
        sessionsCount: sessions.length,
        currentSessionId: globalStoreData.currentSession?.id || null,
        lastUpdate: globalStoreData.lastUpdate,
        totalMessages: sessions.reduce((sum, s) => sum + s.messages.length, 0),
        totalParticipants: sessions.reduce((sum, s) => sum + s.participants.length, 0)
      },
      customPrompts: this.getCustomPromptsInfo(),
      sessions: sessions.map(s => ({
        id: s.id,
        name: s.name,
        status: s.status,
        messageCount: s.messages.length,
        participantCount: s.participants.length,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt
      })),
      analysis: analysisStats,
      analysisHandlerAvailable: this.isAnalysisHandlerAvailable(),
      debugInfo: globalStoreData.debug || null
    }
  }

  private getGlobalAnalysisTimeline(): any {
    if (!this.isAnalysisHandlerAvailable()) {
      return {
        totalEntries: 0,
        sessions: 0,
        timeline: [],
        error: 'Analysis handler not available'
      }
    }

    const allSessions = mcpAnalysisHandler.getAllAnalysisSessions()
    const timeline: any[] = []

    allSessions.forEach(session => {
      const sessionTimeline = mcpAnalysisHandler.getAnalysisTimeline(session.sessionId)
      sessionTimeline.forEach(entry => {
        timeline.push({
          ...entry,
          sessionId: session.sessionId
        })
      })
    })

    // Sort by timestamp
    timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())

    return {
      totalEntries: timeline.length,
      sessions: allSessions.length,
      timeline: timeline.slice(0, 50) // Return latest 50 entries
    }
  }

  // Placeholder tool implementations (these would integrate with your store)
  private async toolCreateSession(args: any): Promise<any> {
    return { 
      success: true, 
      sessionId: `session-${Date.now()}`,
      message: `Session "${args.name}" would be created via store integration`,
      storeState: this.getStoreDebugInfo().storeState
    }
  }

  private async toolAddParticipant(args: any): Promise<any> {
    return { 
      success: true, 
      participantId: `participant-${Date.now()}`,
      message: `Participant "${args.name}" would be added via store integration`,
      storeState: this.getStoreDebugInfo().storeState
    }
  }

  private async toolSendMessage(args: any): Promise<any> {
    return { 
      success: true, 
      messageId: `message-${Date.now()}`,
      message: 'Message would be sent via store integration',
      storeState: this.getStoreDebugInfo().storeState
    }
  }

  private async toolAnalyzeConversation(args: any): Promise<any> {
    const session = this.getSession(args.sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    return {
      success: true,
      analysis: {
        messageCount: session.messages.length,
        participantCount: session.participants.length,
        averageMessageLength: Math.round(
          session.messages.reduce((sum, msg) => sum + msg.content.length, 0) / (session.messages.length || 1)
        )
      }
    }
  }
}