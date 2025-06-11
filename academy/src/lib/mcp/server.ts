// src/lib/mcp/server.ts - FIXED VERSION
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
            realTimeUpdates: true
          }
        },
        serverInfo: {
          name: 'The Academy MCP Server',
          version: '1.2.0',
          description: 'AI Research Platform with conversation management, AI provider tools, and analysis engine'
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
          }
        }
      } else if (uri === 'academy://store/debug') {
        content = this.getStoreDebugInfo()
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
        case 'claude_chat':
          result = await this.callClaudeAPI(args)
          break
        case 'openai_chat':
          result = await this.callOpenAIAPI(args)
          break
        case 'debug_store':
          result = await this.toolDebugStore()
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
        realTimeUpdates: true
      },
      serverInfo: {
        initialized: this.initialized,
        clientInfo: this.clientInfo
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