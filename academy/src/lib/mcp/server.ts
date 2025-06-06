// src/lib/mcp/server.ts - Fixed and enhanced MCP Server
import { ChatSession, Message, Participant } from '@/types/chat'

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
} = {
  sessions: [],
  currentSession: null
}

export function setMCPStoreReference(storeData: any) {
  globalStoreData = storeData
}

export class MCPServer {
  private initialized = false
  private clientInfo: any = null

  async handleRequest(request: JSONRPCRequest): Promise<JSONRPCResponse> {
    try {
      const { method, params, id } = request

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
      console.error('MCP Server error:', error)
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

  private async handleInitialize(params: any, id: any): Promise<JSONRPCResponse> {
    this.clientInfo = params?.clientInfo
    this.initialized = true

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
          }
        },
        serverInfo: {
          name: 'The Academy MCP Server',
          version: '1.0.0',
          description: 'AI Research Platform with conversation management and AI provider tools'
        }
      }
    }
  }

  private async handleListResources(id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const sessions = globalStoreData.sessions || []
    
    const resources = [
      {
        uri: 'academy://sessions',
        name: 'All Sessions',
        description: 'List of all conversation sessions',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://current',
        name: 'Current Session',
        description: 'Currently active session',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://stats',
        name: 'Platform Statistics',
        description: 'Overall platform usage statistics',
        mimeType: 'application/json'
      },
      ...sessions.map(session => ({
        uri: `academy://session/${session.id}`,
        name: `Session: ${session.name}`,
        description: `Conversation session with ${session.participants.length} participants and ${session.messages.length} messages`,
        mimeType: 'application/json'
      })),
      ...sessions.map(session => ({
        uri: `academy://session/${session.id}/messages`,
        name: `Messages: ${session.name}`,
        description: `Complete message history for session ${session.name}`,
        mimeType: 'application/json'
      }))
    ]

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
    
    try {
      let content: any

      if (uri === 'academy://sessions') {
        content = globalStoreData.sessions || []
      } else if (uri === 'academy://current') {
        content = globalStoreData.currentSession
      } else if (uri === 'academy://stats') {
        content = this.getPlatformStats()
      } else if (uri.startsWith('academy://session/')) {
        const sessionId = uri.split('/')[2]
        if (uri.endsWith('/messages')) {
          content = this.getSessionMessages(sessionId)
        } else {
          content = this.getSession(sessionId)
        }
      } else {
        return {
          jsonrpc: '2.0',
          id,
          error: {
            code: -32602,
            message: 'Resource not found'
          }
        }
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

    try {
      let result: any

      switch (name) {
        case 'claude_chat':
          result = await this.callClaudeAPI(args)
          break
        case 'openai_chat':
          result = await this.callOpenAIAPI(args)
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
        case 'analyze_conversation':
          result = await this.toolAnalyzeConversation(args)
          break
        default:
          return {
            jsonrpc: '2.0',
            id,
            error: {
              code: -32602,
              message: 'Unknown tool'
            }
          }
      }

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
          system: systemPrompt || 'You are a thoughtful AI participating in a research dialogue.',
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
    return sessions.find(s => s.id === sessionId) || null
  }

  private getSessionMessages(sessionId: string): Message[] {
    const session = this.getSession(sessionId)
    return session?.messages || []
  }

  private getPlatformStats(): any {
    const sessions = globalStoreData.sessions || []
    const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0)
    const activeSessions = sessions.filter(s => s.status === 'active').length

    return {
      totalSessions: sessions.length,
      activeSessions,
      totalMessages,
      averageMessagesPerSession: Math.round(totalMessages / sessions.length) || 0
    }
  }

  // Placeholder tool implementations (these would integrate with your store)
  private async toolCreateSession(args: any): Promise<any> {
    return { 
      success: true, 
      sessionId: `session-${Date.now()}`,
      message: `Session "${args.name}" would be created via store`
    }
  }

  private async toolAddParticipant(args: any): Promise<any> {
    return { 
      success: true, 
      participantId: `participant-${Date.now()}`,
      message: `Participant "${args.name}" would be added via store`
    }
  }

  private async toolSendMessage(args: any): Promise<any> {
    return { 
      success: true, 
      messageId: `message-${Date.now()}`,
      message: 'Message would be sent via store'
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
          session.messages.reduce((sum, msg) => sum + msg.content.length, 0) / session.messages.length
        ) || 0
      }
    }
  }
}