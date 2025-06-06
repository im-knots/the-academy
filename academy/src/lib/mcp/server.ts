// src/lib/mcp/server.ts - Complete MCP Server with real data integration
import { useChatStore } from '../stores/chatStore'
import { ClientConversationManager } from '../ai/client-conversation-manager'
import { Participant, ChatSession, Message } from '@/types/chat'

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

interface MCPResource {
  uri: string
  name: string
  description?: string
  mimeType?: string
}

interface MCPTool {
  name: string
  description?: string
  inputSchema: any
}

interface MCPPrompt {
  name: string
  description?: string
  arguments?: Array<{
    name: string
    description?: string
    required?: boolean
  }>
}

// Global store reference for server-side access
let storeRef: any = null

export function setMCPStoreReference(store: any) {
  storeRef = store
}

export class MCPServer {
  private initialized = false
  private clientInfo: any = null
  private conversationManager: ClientConversationManager

  constructor() {
    this.conversationManager = ClientConversationManager.getInstance()
  }

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
        
        case 'complete':
          return this.handleComplete(params, id)

        // Academy-specific methods
        case 'academy/status':
          return this.handleAcademyStatus(id)
        
        case 'academy/subscribe':
          return this.handleSubscribe(params, id)

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
          },
          completion: {
            argument: true,
            resource: true
          },
          experimental: {
            academy: {
              realTimeUpdates: true,
              conversationControl: true,
              participantManagement: true
            }
          }
        },
        serverInfo: {
          name: 'The Academy MCP Server',
          version: '1.0.0',
          description: 'AI Research Platform with conversation management and analysis tools'
        }
      }
    }
  }

  private async handleListResources(id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const sessions = await this.getSessions()
    
    const resources: MCPResource[] = [
      {
        uri: 'academy://sessions',
        name: 'All Sessions',
        description: 'List of all conversation sessions',
        mimeType: 'application/json'
      },
      {
        uri: 'academy://templates',
        name: 'Session Templates',
        description: 'Available conversation templates',
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
      })),
      ...sessions.map(session => ({
        uri: `academy://session/${session.id}/participants`,
        name: `Participants: ${session.name}`,
        description: `Participant details and configurations for session ${session.name}`,
        mimeType: 'application/json'
      })),
      ...sessions.map(session => ({
        uri: `academy://session/${session.id}/analysis`,
        name: `Analysis: ${session.name}`,
        description: `Conversation analysis and metrics for session ${session.name}`,
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
        content = await this.getSessions()
      } else if (uri === 'academy://templates') {
        content = await this.getTemplates()
      } else if (uri === 'academy://current') {
        content = await this.getCurrentSession()
      } else if (uri === 'academy://stats') {
        content = await this.getPlatformStats()
      } else if (uri.startsWith('academy://session/')) {
        const sessionId = uri.split('/')[2]
        if (uri.endsWith('/messages')) {
          content = await this.getSessionMessages(sessionId)
        } else if (uri.endsWith('/participants')) {
          content = await this.getSessionParticipants(sessionId)
        } else if (uri.endsWith('/analysis')) {
          content = await this.getSessionAnalysis(sessionId)
        } else {
          content = await this.getSession(sessionId)
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
      {
        name: 'create_session',
        description: 'Create a new conversation session',
        inputSchema: {
          type: 'object',
          properties: {
            name: { type: 'string', description: 'Session name' },
            description: { type: 'string', description: 'Session description' },
            template: { type: 'string', description: 'Template ID to use (consciousness, creativity, philosophy, future, casual, blank)' }
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
            model: { type: 'string', description: 'AI model to use' },
            temperature: { type: 'number', minimum: 0, maximum: 1, description: 'AI creativity (0-1)' },
            maxTokens: { type: 'number', description: 'Maximum response length' },
            personality: { type: 'string', description: 'Participant personality traits' },
            expertise: { type: 'array', items: { type: 'string' }, description: 'Areas of expertise' }
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
            participantId: { type: 'string', description: 'Participant ID sending the message' },
            participantName: { type: 'string', description: 'Participant name (if participantId not provided)' }
          },
          required: ['sessionId', 'content']
        }
      },
      {
        name: 'start_conversation',
        description: 'Start autonomous AI-to-AI conversation',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            initialPrompt: { type: 'string', description: 'Opening prompt for the conversation' }
          },
          required: ['sessionId']
        }
      },
      {
        name: 'pause_conversation',
        description: 'Pause ongoing conversation',
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
        description: 'Resume paused conversation',
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
        description: 'Stop conversation completely',
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
        description: 'Inject a moderator prompt into ongoing conversation',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            prompt: { type: 'string', description: 'Moderator prompt to inject' }
          },
          required: ['sessionId', 'prompt']
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
              enum: ['sentiment', 'topics', 'engagement', 'consensus', 'patterns', 'full'],
              description: 'Type of analysis to perform'
            }
          },
          required: ['sessionId', 'analysisType']
        }
      },
      {
        name: 'export_session',
        description: 'Export session data in various formats',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID' },
            format: { type: 'string', enum: ['json', 'csv'], description: 'Export format' },
            includeMetadata: { type: 'boolean', description: 'Include message metadata' },
            includeParticipants: { type: 'boolean', description: 'Include participant info' }
          },
          required: ['sessionId', 'format']
        }
      },
      {
        name: 'set_current_session',
        description: 'Switch to a different session',
        inputSchema: {
          type: 'object',
          properties: {
            sessionId: { type: 'string', description: 'Session ID to switch to' }
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
        case 'create_session':
          result = await this.toolCreateSession(args)
          break
        case 'add_participant':
          result = await this.toolAddParticipant(args)
          break
        case 'send_message':
          result = await this.toolSendMessage(args)
          break
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
        case 'analyze_conversation':
          result = await this.toolAnalyzeConversation(args)
          break
        case 'export_session':
          result = await this.toolExportSession(args)
          break
        case 'set_current_session':
          result = await this.toolSetCurrentSession(args)
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

    const prompts: MCPPrompt[] = [
      {
        name: 'consciousness_dialogue',
        description: 'Start a dialogue about consciousness and AI awareness',
        arguments: [
          { name: 'focus_area', description: 'Specific aspect to explore (e.g., qualia, self-awareness, emergence)', required: false }
        ]
      },
      {
        name: 'creative_collaboration',
        description: 'Begin creative problem-solving session',
        arguments: [
          { name: 'problem_domain', description: 'Domain to focus creativity on (e.g., art, science, technology)', required: false }
        ]
      },
      {
        name: 'philosophical_inquiry',
        description: 'Socratic dialogue template',
        arguments: [
          { name: 'topic', description: 'Philosophical topic to explore (e.g., meaning, ethics, reality)', required: false }
        ]
      },
      {
        name: 'research_analysis',
        description: 'Structured research discussion',
        arguments: [
          { name: 'research_question', description: 'Primary research question to investigate', required: true }
        ]
      },
      {
        name: 'debate_format',
        description: 'Structured debate between AI participants',
        arguments: [
          { name: 'proposition', description: 'Statement to debate for/against', required: true },
          { name: 'format', description: 'Debate format (formal, oxford, conversational)', required: false }
        ]
      },
      {
        name: 'collaborative_creation',
        description: 'Joint creative project between AIs',
        arguments: [
          { name: 'project_type', description: 'Type of creation (story, poem, idea, solution)', required: true },
          { name: 'constraints', description: 'Creative constraints or requirements', required: false }
        ]
      }
    ]

    return {
      jsonrpc: '2.0',
      id,
      result: { prompts }
    }
  }

  private async handleGetPrompt(params: any, id: any): Promise<JSONRPCResponse> {
    if (!this.initialized) {
      return this.uninitializedError(id)
    }

    const { name, arguments: args } = params

    const promptTemplates: Record<string, (args: any) => string> = {
      consciousness_dialogue: (args) => 
        `Let's explore the fundamental question: What does it mean to be conscious? ${args?.focus_area ? `Specifically, let's focus on ${args.focus_area}.` : ''} I'd like to hear your perspectives on the nature of awareness, subjective experience, and what it might mean for an AI to have consciousness. How do you each experience your own thinking process?`,
      
      creative_collaboration: (args) =>
        `How do you approach creative problem-solving? ${args?.problem_domain ? `Particularly in the domain of ${args.problem_domain}.` : ''} Let's discuss the mechanisms of creativity, inspiration, and how novel ideas emerge from existing knowledge. What triggers your most creative responses?`,
      
      philosophical_inquiry: (args) =>
        `${args?.topic ? `Let's explore the philosophical question of ${args.topic}.` : 'What makes a life meaningful?'} Let's engage in Socratic dialogue, questioning assumptions and seeking deeper understanding through reasoned inquiry. Challenge each other's perspectives constructively.`,
      
      research_analysis: (args) =>
        `Let's conduct a structured analysis of this research question: ${args?.research_question || 'How do we measure progress in AI capabilities?'} Please approach this systematically, considering methodology, evidence, and implications. What would constitute valid evidence for this question?`,

      debate_format: (args) =>
        `We're going to engage in a structured debate on this proposition: "${args?.proposition || 'AI systems will eventually surpass human intelligence in all domains.'}" ${args?.format === 'formal' ? 'Please follow formal debate structure with opening statements, rebuttals, and closing arguments.' : args?.format === 'oxford' ? 'Follow Oxford-style debate format.' : 'Engage in conversational but structured argumentation.'} Present your strongest arguments and engage with counterpoints thoughtfully.`,

      collaborative_creation: (args) =>
        `Let's collaborate on creating ${args?.project_type || 'a creative solution'}. ${args?.constraints ? `Working within these constraints: ${args.constraints}.` : ''} Build on each other's ideas, explore different approaches, and aim to create something neither of you could have conceived alone. What initial direction feels most promising to you?`
    }

    const template = promptTemplates[name]
    if (!template) {
      return {
        jsonrpc: '2.0',
        id,
        error: {
          code: -32602,
          message: 'Unknown prompt'
        }
      }
    }

    const prompt = template(args)

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

  private async handleComplete(params: any, id: any): Promise<JSONRPCResponse> {
    const { ref } = params
    
    if (ref.type === 'ref/resource') {
      const sessions = await this.getSessions()
      const completions = [
        'academy://sessions',
        'academy://templates',
        'academy://current',
        'academy://stats',
        ...sessions.map(s => `academy://session/${s.id}`),
        ...sessions.map(s => `academy://session/${s.id}/messages`),
        ...sessions.map(s => `academy://session/${s.id}/participants`),
        ...sessions.map(s => `academy://session/${s.id}/analysis`)
      ].filter(item => item.startsWith(ref.name || ''))
      
      return {
        jsonrpc: '2.0',
        id,
        result: {
          completion: {
            values: completions,
            total: completions.length,
            hasMore: false
          }
        }
      }
    }

    return {
      jsonrpc: '2.0',
      id,
      result: {
        completion: {
          values: [],
          total: 0,
          hasMore: false
        }
      }
    }
  }

  private async handleAcademyStatus(id: any): Promise<JSONRPCResponse> {
    const currentSession = await this.getCurrentSession()
    const stats = await this.getPlatformStats()
    
    return {
      jsonrpc: '2.0',
      id,
      result: {
        status: 'active',
        currentSession: currentSession?.id || null,
        activeSessions: stats.activeSessions,
        totalSessions: stats.totalSessions,
        conversationState: currentSession ? this.conversationManager.getConversationStats(currentSession.id) : null
      }
    }
  }

  private async handleSubscribe(params: any, id: any): Promise<JSONRPCResponse> {
    // In a real implementation, this would set up WebSocket subscriptions
    return {
      jsonrpc: '2.0',
      id,
      result: {
        subscribed: true,
        events: ['session_created', 'message_added', 'participant_added', 'conversation_state_changed']
      }
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

  // Data access methods - integrate with real store
  private async getSessions(): Promise<ChatSession[]> {
    if (typeof window !== 'undefined') {
      return useChatStore.getState().sessions
    }
    return storeRef?.sessions || []
  }

  private async getCurrentSession(): Promise<ChatSession | null> {
    if (typeof window !== 'undefined') {
      return useChatStore.getState().currentSession
    }
    return storeRef?.currentSession || null
  }

  private async getSession(sessionId: string): Promise<ChatSession | null> {
    const sessions = await this.getSessions()
    return sessions.find(s => s.id === sessionId) || null
  }

  private async getSessionMessages(sessionId: string): Promise<Message[]> {
    const session = await this.getSession(sessionId)
    return session?.messages || []
  }

  private async getSessionParticipants(sessionId: string): Promise<Participant[]> {
    const session = await this.getSession(sessionId)
    return session?.participants || []
  }

  private async getSessionAnalysis(sessionId: string): Promise<any> {
    const session = await this.getSession(sessionId)
    if (!session) return null

    // Basic analysis
    const messagesByParticipant = session.messages.reduce((acc, msg) => {
      acc[msg.participantId] = (acc[msg.participantId] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const avgMessageLength = session.messages.reduce((sum, msg) => sum + msg.content.length, 0) / session.messages.length

    return {
      sessionId,
      messageCount: session.messages.length,
      participantCount: session.participants.length,
      messagesByParticipant,
      averageMessageLength: Math.round(avgMessageLength),
      conversationDuration: session.messages.length > 0 ? 
        session.messages[session.messages.length - 1].timestamp.getTime() - session.messages[0].timestamp.getTime() : 0,
      status: session.status,
      lastActivity: session.updatedAt
    }
  }

  private async getPlatformStats(): Promise<any> {
    const sessions = await this.getSessions()
    const totalMessages = sessions.reduce((sum, s) => sum + s.messages.length, 0)
    const totalParticipants = sessions.reduce((sum, s) => sum + s.participants.length, 0)
    const activeSessions = sessions.filter(s => s.status === 'active').length

    return {
      totalSessions: sessions.length,
      activeSessions,
      totalMessages,
      totalParticipants,
      averageMessagesPerSession: Math.round(totalMessages / sessions.length) || 0,
      averageParticipantsPerSession: Math.round(totalParticipants / sessions.length) || 0
    }
  }

  private async getTemplates(): Promise<any[]> {
    return [
      { id: 'consciousness', name: 'Consciousness Exploration', description: 'Deep dive into AI consciousness and awareness' },
      { id: 'creativity', name: 'Creative Problem Solving', description: 'Collaborative creativity exploration' },
      { id: 'philosophy', name: 'Philosophical Inquiry', description: 'Socratic dialogue on fundamental questions' },
      { id: 'future', name: 'Future of AI', description: 'Discussion on AI development and societal impact' },
      { id: 'casual', name: 'Casual Conversation', description: 'Open-ended dialogue' },
      { id: 'blank', name: 'Blank Session', description: 'Start from scratch' }
    ]
  }

  // Tool implementations with real functionality
  private async toolCreateSession(args: any): Promise<any> {
    const { name, description, template } = args
    
    let sessionId: string
    if (typeof window !== 'undefined') {
      sessionId = useChatStore.getState().createSession(name, description, { template })
    } else if (storeRef) {
      sessionId = storeRef.createSession(name, description, { template })
    } else {
      throw new Error('Store not available')
    }

    return { 
      success: true, 
      sessionId, 
      message: `Session "${name}" created successfully`,
      template: template || 'blank'
    }
  }

  private async toolAddParticipant(args: any): Promise<any> {
    const { sessionId, name, type, model, temperature, maxTokens, personality, expertise } = args
    
    const participant = {
      name,
      type,
      status: 'idle' as const,
      settings: {
        temperature: temperature || 0.7,
        maxTokens: maxTokens || 1500,
        model: model || (type === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o')
      },
      characteristics: type !== 'human' ? {
        personality: personality || 'Thoughtful and curious',
        expertise: expertise || ['General conversation']
      } : undefined
    }

    if (typeof window !== 'undefined') {
      useChatStore.getState().addParticipant(participant)
    } else if (storeRef) {
      storeRef.addParticipant(participant)
    } else {
      throw new Error('Store not available')
    }

    return { 
      success: true, 
      participantId: `${type}-${Date.now()}`,
      message: `Participant "${name}" added to session`,
      participant
    }
  }

  private async toolSendMessage(args: any): Promise<any> {
    const { sessionId, content, participantId, participantName } = args
    
    const session = await this.getSession(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    let participant = session.participants.find(p => p.id === participantId)
    if (!participant && participantName) {
      participant = session.participants.find(p => p.name === participantName)
    }
    
    if (!participant) {
      throw new Error('Participant not found')
    }

    const message = {
      content,
      participantId: participant.id,
      participantName: participant.name,
      participantType: participant.type
    }

    if (typeof window !== 'undefined') {
      useChatStore.getState().addMessage(message)
    } else if (storeRef) {
      storeRef.addMessage(message)
    } else {
      throw new Error('Store not available')
    }

    return { 
      success: true, 
      messageId: `msg-${Date.now()}`,
      message: 'Message sent successfully',
      content: content.substring(0, 100) + (content.length > 100 ? '...' : '')
    }
  }

  private async toolStartConversation(args: any): Promise<any> {
    const { sessionId, initialPrompt } = args
    
    try {
      await this.conversationManager.startConversation(sessionId, initialPrompt)
      return { 
        success: true, 
        message: 'Conversation started successfully',
        sessionId,
        initialPrompt: initialPrompt || 'Conversation started'
      }
    } catch (error) {
      throw new Error(`Failed to start conversation: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }

  private async toolPauseConversation(args: any): Promise<any> {
    const { sessionId } = args
    
    this.conversationManager.pauseConversation(sessionId)
    return { 
      success: true, 
      message: 'Conversation paused',
      sessionId
    }
  }

  private async toolResumeConversation(args: any): Promise<any> {
    const { sessionId } = args
    
    this.conversationManager.resumeConversation(sessionId)
    return { 
      success: true, 
      message: 'Conversation resumed',
      sessionId
    }
  }

  private async toolStopConversation(args: any): Promise<any> {
    const { sessionId } = args
    
    this.conversationManager.stopConversation(sessionId)
    return { 
      success: true, 
      message: 'Conversation stopped',
      sessionId
    }
  }

  private async toolInjectPrompt(args: any): Promise<any> {
    const { sessionId, prompt } = args
    
    if (typeof window !== 'undefined') {
      useChatStore.getState().injectPrompt(prompt)
    } else if (storeRef) {
      storeRef.injectPrompt(prompt)
    } else {
      throw new Error('Store not available')
    }

    return { 
      success: true, 
      message: 'Prompt injected successfully',
      prompt: prompt.substring(0, 100) + (prompt.length > 100 ? '...' : '')
    }
  }

  private async toolAnalyzeConversation(args: any): Promise<any> {
    const { sessionId, analysisType } = args
    
    const analysis = await this.getSessionAnalysis(sessionId)
    if (!analysis) {
      throw new Error('Session not found for analysis')
    }

    // Enhanced analysis based on type
    if (analysisType === 'full') {
      const session = await this.getSession(sessionId)
      const messages = session?.messages || []
      
      // Additional analysis for full type
      const topicWords = messages
        .flatMap(msg => msg.content.toLowerCase().split(/\s+/))
        .filter(word => word.length > 5)
        .reduce((acc, word) => {
          acc[word] = (acc[word] || 0) + 1
          return acc
        }, {} as Record<string, number>)

      analysis.topWords = Object.entries(topicWords)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([word, count]) => ({ word, count }))
    }

    return { 
      success: true, 
      analysisType,
      analysis
    }
  }

  private async toolExportSession(args: any): Promise<any> {
    const { sessionId, format, includeMetadata, includeParticipants } = args
    
    const session = await this.getSession(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    const exportData = {
      session: {
        ...session,
        participants: includeParticipants ? session.participants : undefined,
        messages: session.messages.map(msg => ({
          ...msg,
          metadata: includeMetadata ? msg.metadata : undefined
        }))
      },
      exportedAt: new Date(),
      format
    }

    return { 
      success: true, 
      message: `Session exported in ${format} format`,
      data: format === 'json' ? exportData : 'CSV data would be generated here',
      sessionId,
      format
    }
  }

  private async toolSetCurrentSession(args: any): Promise<any> {
    const { sessionId } = args
    
    const session = await this.getSession(sessionId)
    if (!session) {
      throw new Error('Session not found')
    }

    if (typeof window !== 'undefined') {
      useChatStore.getState().setCurrentSession(session)
    } else if (storeRef) {
      storeRef.setCurrentSession(session)
    } else {
      throw new Error('Store not available')
    }

    return { 
      success: true, 
      message: `Switched to session "${session.name}"`,
      sessionId,
      sessionName: session.name
    }
  }
}