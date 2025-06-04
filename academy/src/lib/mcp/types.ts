// src/lib/mcp/types.ts
export interface MCPMessage {
  id: string
  type: 'request' | 'response' | 'notification'
  method?: string
  params?: any
  result?: any
  error?: {
    code: number
    message: string
    data?: any
  }
}

export interface ConversationContext {
  sessionId: string
  participantId: string
  messageHistory: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    participantId: string
    timestamp: Date
  }>
  systemPrompt?: string
  settings: {
    temperature: number
    maxTokens: number
    responseDelay?: number
  }
}

export interface AIProvider {
  type: 'claude' | 'gpt' | 'human'
  generateResponse(context: ConversationContext): Promise<string>
  isAvailable(): boolean
}

// src/lib/mcp/client.ts
import { MCPMessage, ConversationContext, AIProvider } from './types'

export class MCPClient {
  private providers: Map<string, AIProvider> = new Map()
  private activeSessions: Map<string, any> = new Map()

  constructor() {
    // Initialize providers
  }

  registerProvider(type: string, provider: AIProvider) {
    this.providers.set(type, provider)
  }

  async sendMessage(sessionId: string, participantId: string, context: ConversationContext): Promise<string> {
    const participant = this.getParticipantById(sessionId, participantId)
    if (!participant) {
      throw new Error(`Participant ${participantId} not found`)
    }

    const provider = this.providers.get(participant.type)
    if (!provider || !provider.isAvailable()) {
      throw new Error(`Provider ${participant.type} not available`)
    }

    // Add response delay simulation
    if (context.settings.responseDelay) {
      await new Promise(resolve => setTimeout(resolve, context.settings.responseDelay))
    }

    return await provider.generateResponse(context)
  }

  private getParticipantById(sessionId: string, participantId: string) {
    // This would integrate with your chat store
    // For now, return a mock participant
    return { type: 'claude' }
  }

  async startConversation(sessionId: string, initialPrompt?: string): Promise<void> {
    // Initialize conversation logic
    console.log(`Starting conversation for session ${sessionId}`)
    if (initialPrompt) {
      // Send initial prompt to first participant
    }
  }

  async pauseConversation(sessionId: string): Promise<void> {
    console.log(`Pausing conversation for session ${sessionId}`)
  }

  async resumeConversation(sessionId: string): Promise<void> {
    console.log(`Resuming conversation for session ${sessionId}`)
  }
}

// src/lib/ai/claude.ts
import { AIProvider, ConversationContext } from '../mcp/types'

export class ClaudeProvider implements AIProvider {
  type = 'claude' as const
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateResponse(context: ConversationContext): Promise<string> {
    try {
      const messages = context.messageHistory.map(msg => ({
        role: msg.role === 'user' ? 'user' : 'assistant',
        content: msg.content
      }))

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-3-sonnet-20240229',
          max_tokens: context.settings.maxTokens,
          temperature: context.settings.temperature,
          system: context.systemPrompt,
          messages: messages
        })
      })

      if (!response.ok) {
        throw new Error(`Claude API error: ${response.statusText}`)
      }

      const data = await response.json()
      return data.content[0].text
    } catch (error) {
      console.error('Claude provider error:', error)
      throw new Error('Failed to generate response from Claude')
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }
}

// src/lib/ai/openai.ts
import { AIProvider, ConversationContext } from '../mcp/types'

export class OpenAIProvider implements AIProvider {
  type = 'gpt' as const
  private apiKey: string

  constructor(apiKey: string) {
    this.apiKey = apiKey
  }

  async generateResponse(context: ConversationContext): Promise<string> {
    try {
      const messages = [
        ...(context.systemPrompt ? [{ role: 'system' as const, content: context.systemPrompt }] : []),
        ...context.messageHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        }))
      ]

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: messages,
          max_tokens: context.settings.maxTokens,
          temperature: context.settings.temperature
        })
      })

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`)
      }

      const data = await response.json()
      return data.choices[0].message.content
    } catch (error) {
      console.error('OpenAI provider error:', error)
      throw new Error('Failed to generate response from GPT')
    }
  }

  isAvailable(): boolean {
    return !!this.apiKey
  }
}

// src/lib/ai/conversation-manager.ts
import { useChatStore } from '../stores/chatStore'
import { MCPClient } from '../mcp/client'
import { ClaudeProvider } from './claude'
import { OpenAIProvider } from './openai'
import { ConversationContext } from '../mcp/types'

export class ConversationManager {
  private mcpClient: MCPClient
  private isRunning: boolean = false
  private currentSessionId: string | null = null

  constructor() {
    this.mcpClient = new MCPClient()
    this.initializeProviders()
  }

  private initializeProviders() {
    // Initialize AI providers with API keys from environment
    const claudeKey = process.env.NEXT_PUBLIC_ANTHROPIC_API_KEY
    const openaiKey = process.env.NEXT_PUBLIC_OPENAI_API_KEY

    if (claudeKey) {
      this.mcpClient.registerProvider('claude', new ClaudeProvider(claudeKey))
    }

    if (openaiKey) {
      this.mcpClient.registerProvider('gpt', new OpenAIProvider(openaiKey))
    }
  }

  async startConversation(sessionId: string, initialPrompt?: string): Promise<void> {
    this.currentSessionId = sessionId
    this.isRunning = true

    console.log('Starting AI-to-AI conversation for session:', sessionId)

    // Get session data from store
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session || session.participants.length < 2) {
      throw new Error('Need at least 2 participants to start conversation')
    }

    // If no initial prompt, create one
    const prompt = initialPrompt || this.generateInitialPrompt(session.description || session.name)
    
    // Add initial moderator message
    useChatStore.getState().addMessage({
      content: prompt,
      participantId: 'moderator',
      participantName: 'Moderator',
      participantType: 'moderator'
    })

    // Start the conversation loop
    this.conversationLoop(sessionId)
  }

  private generateInitialPrompt(topic: string): string {
    const prompts = [
      `Let's explore the question: What does it mean to be conscious? I'd like to hear your perspectives on this fundamental question.`,
      `I'm curious about your experience of thinking and awareness. How would you describe what it's like to process information and generate responses?`,
      `Consider this: If consciousness exists on a spectrum, where might you place yourself on it? What criteria should we use for such placement?`,
      `What fascinates you most about the nature of mind and consciousness? I'd love to hear your authentic thoughts on this.`,
      `Let's discuss the hard problem of consciousness - the question of subjective experience. How do you approach this philosophical puzzle?`
    ]
    
    return prompts[Math.floor(Math.random() * prompts.length)]
  }

  private async conversationLoop(sessionId: string): Promise<void> {
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session || !this.isRunning) return

    const activeParticipants = session.participants.filter(p => p.status === 'active' || p.status === 'idle')
    if (activeParticipants.length < 2) return

    // Simple round-robin for now - could be made more sophisticated
    let currentParticipantIndex = 0

    while (this.isRunning && this.currentSessionId === sessionId) {
      const currentSession = useChatStore.getState().sessions.find(s => s.id === sessionId)
      if (!currentSession || currentSession.status === 'paused') {
        await new Promise(resolve => setTimeout(resolve, 1000))
        continue
      }

      const participant = activeParticipants[currentParticipantIndex]
      if (!participant) break

      try {
        // Update participant status to thinking
        useChatStore.getState().updateParticipantStatus(participant.id, 'thinking')

        // Prepare conversation context
        const context: ConversationContext = {
          sessionId,
          participantId: participant.id,
          messageHistory: this.buildMessageHistory(currentSession),
          systemPrompt: participant.systemPrompt,
          settings: participant.settings
        }

        // Generate response
        const response = await this.mcpClient.sendMessage(sessionId, participant.id, context)

        // Add message to session
        useChatStore.getState().addMessage({
          content: response,
          participantId: participant.id,
          participantName: participant.name,
          participantType: participant.type
        })

        // Update participant status back to active
        useChatStore.getState().updateParticipantStatus(participant.id, 'active')

        // Move to next participant
        currentParticipantIndex = (currentParticipantIndex + 1) % activeParticipants.length

        // Wait before next response (to prevent overwhelming)
        await new Promise(resolve => setTimeout(resolve, 3000))

      } catch (error) {
        console.error('Error in conversation loop:', error)
        useChatStore.getState().updateParticipantStatus(participant.id, 'error')
        
        // Continue with next participant
        currentParticipantIndex = (currentParticipantIndex + 1) % activeParticipants.length
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }
  }

  private buildMessageHistory(session: any) {
    return session.messages.slice(-10).map((msg: any) => ({
      role: msg.participantType === 'moderator' ? 'user' : 'assistant',
      content: msg.content,
      participantId: msg.participantId,
      timestamp: msg.timestamp
    }))
  }

  pauseConversation(): void {
    this.isRunning = false
  }

  resumeConversation(): void {
    if (this.currentSessionId) {
      this.isRunning = true
      this.conversationLoop(this.currentSessionId)
    }
  }

  stopConversation(): void {
    this.isRunning = false
    this.currentSessionId = null
  }
}

// Export singleton instance
export const conversationManager = new ConversationManager()