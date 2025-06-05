// src/lib/ai/client-conversation-manager.ts
'use client'

import { useChatStore } from '../stores/chatStore'
import { Participant, Message } from '@/types/chat'

interface ConversationContext {
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
    model?: string
    responseDelay?: number
  }
}

export class ClientConversationManager {
  private static instance: ClientConversationManager
  private activeConversations: Map<string, {
    isRunning: boolean
    participantQueue: string[]
    currentParticipantIndex: number
    messageCount: number
    abortController?: AbortController
    isGenerating: boolean
    lastGeneratedBy?: string
  }> = new Map()

  // Queue to prevent simultaneous API calls
  private apiCallQueue: Map<string, Promise<string>> = new Map()

  private constructor() {}

  static getInstance(): ClientConversationManager {
    if (!ClientConversationManager.instance) {
      ClientConversationManager.instance = new ClientConversationManager()
    }
    return ClientConversationManager.instance
  }

  async startConversation(sessionId: string, initialPrompt?: string): Promise<void> {
    console.log('🚀 Starting AI-to-AI conversation for session:', sessionId)

    // Get session data from store
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session) {
      throw new Error(`Session ${sessionId} not found`)
    }

    const aiParticipants = session.participants.filter(p => p.type !== 'human' && p.type !== 'moderator')
    if (aiParticipants.length < 2) {
      throw new Error('Need at least 2 AI participants to start conversation')
    }

    // Create abort controller for this conversation
    const abortController = new AbortController()

    // Initialize conversation state with better tracking
    this.activeConversations.set(sessionId, {
      isRunning: true,
      participantQueue: this.shuffleArray([...aiParticipants.map(p => p.id)]), // Randomize order
      currentParticipantIndex: 0,
      messageCount: 0,
      abortController,
      isGenerating: false,
      lastGeneratedBy: undefined
    })

    // Update session status
    useChatStore.getState().updateSession(sessionId, { status: 'active' })

    // Start the conversation loop with a small delay
    setTimeout(() => this.runConversationLoop(sessionId), 1000)
  }

  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    return shuffled
  }

  private async runConversationLoop(sessionId: string): Promise<void> {
    const conversationState = this.activeConversations.get(sessionId)
    if (!conversationState) return

    console.log('🔄 Running conversation loop for session:', sessionId)

    while (conversationState.isRunning && !conversationState.abortController?.signal.aborted) {
      try {
        // Prevent overlapping generations
        if (conversationState.isGenerating) {
          await new Promise(resolve => setTimeout(resolve, 500))
          continue
        }

        // Get current session state
        const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
        if (!session || session.status === 'paused' || session.status === 'completed') {
          console.log('⏸️ Session paused or completed, waiting...')
          await new Promise(resolve => setTimeout(resolve, 1000))
          continue
        }

        // Check if we have enough participants
        const activeAIParticipants = session.participants.filter(p => 
          p.type !== 'human' && p.type !== 'moderator' && p.status !== 'error'
        )
        
        if (activeAIParticipants.length < 2) {
          console.log('❌ Not enough active AI participants')
          break
        }

        // Update participant queue if participants changed
        const currentQueue = activeAIParticipants.map(p => p.id)
        if (JSON.stringify(conversationState.participantQueue) !== JSON.stringify(currentQueue)) {
          conversationState.participantQueue = currentQueue
          conversationState.currentParticipantIndex = 0
        }

        // Get current participant
        const currentParticipantId = conversationState.participantQueue[conversationState.currentParticipantIndex]
        const currentParticipant = session.participants.find(p => p.id === currentParticipantId)

        if (!currentParticipant) {
          console.log('❌ Current participant not found, moving to next')
          this.moveToNextParticipant(sessionId)
          continue
        }

        // Skip if participant is in error state
        if (currentParticipant.status === 'error') {
          console.log(`⚠️ Skipping participant ${currentParticipant.name} due to error state`)
          this.moveToNextParticipant(sessionId)
          await new Promise(resolve => setTimeout(resolve, 2000))
          continue
        }

        // Skip if this participant just generated a response
        if (conversationState.lastGeneratedBy === currentParticipantId) {
          console.log(`⏭️ Skipping ${currentParticipant.name} - just generated a response`)
          this.moveToNextParticipant(sessionId)
          continue
        }

        console.log(`🤖 ${currentParticipant.name} (${currentParticipant.type}) is thinking...`)

        // Mark as generating
        conversationState.isGenerating = true
        
        // Update participant status
        useChatStore.getState().updateParticipantStatus(currentParticipantId, 'thinking')

        try {
          // Generate response with queue management
          const response = await this.generateAIResponseWithQueue(sessionId, currentParticipant)

          if (response && conversationState.isRunning && !conversationState.abortController?.signal.aborted) {
            // Add message to session
            useChatStore.getState().addMessage({
              content: response,
              participantId: currentParticipant.id,
              participantName: currentParticipant.name,
              participantType: currentParticipant.type
            })

            conversationState.messageCount++
            conversationState.lastGeneratedBy = currentParticipantId
            console.log(`💬 ${currentParticipant.name}: ${response.substring(0, 100)}...`)

            // Update participant status back to active
            useChatStore.getState().updateParticipantStatus(currentParticipantId, 'active')

          } else {
            console.log('❌ Failed to generate response or conversation stopped')
            useChatStore.getState().updateParticipantStatus(currentParticipantId, 'error')
          }

        } catch (error) {
          console.error(`❌ Error generating response for ${currentParticipant.name}:`, error)
          useChatStore.getState().updateParticipantStatus(currentParticipantId, 'error')
        } finally {
          conversationState.isGenerating = false
        }

        // Move to next participant
        this.moveToNextParticipant(sessionId)

        // Wait between responses - longer delay for better pacing
        const delay = Math.max(currentParticipant.settings.responseDelay || 4000, 2000)
        await new Promise(resolve => setTimeout(resolve, delay))

      } catch (error) {
        if (error instanceof Error && error.name === 'AbortError') {
          console.log('🛑 Conversation aborted')
          break
        }
        
        console.error('❌ Error in conversation loop:', error)
        
        // Reset generating state
        if (conversationState) {
          conversationState.isGenerating = false
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000))
      }
    }

    console.log('🛑 Conversation loop ended for session:', sessionId)
  }

  private moveToNextParticipant(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (!conversationState) return

    conversationState.currentParticipantIndex = 
      (conversationState.currentParticipantIndex + 1) % conversationState.participantQueue.length
  }

  private async generateAIResponseWithQueue(sessionId: string, participant: Participant): Promise<string> {
    // Create a unique key for this API call
    const queueKey = `${sessionId}-${participant.id}-${Date.now()}`
    
    // Check if there's already an ongoing call for this participant type
    const existingCalls = Array.from(this.apiCallQueue.keys()).filter(key => 
      key.includes(participant.type) && key.includes(sessionId)
    )
    
    if (existingCalls.length > 0) {
      console.log(`⏳ Waiting for existing ${participant.type} call to complete...`)
      // Wait for existing calls to complete
      await Promise.allSettled(existingCalls.map(key => this.apiCallQueue.get(key)!))
    }

    // Create the API call promise
    const apiCallPromise = this.generateAIResponse(sessionId, participant)
    this.apiCallQueue.set(queueKey, apiCallPromise)

    try {
      const result = await apiCallPromise
      return result
    } finally {
      // Clean up the queue
      this.apiCallQueue.delete(queueKey)
    }
  }

  private async generateAIResponse(sessionId: string, participant: Participant): Promise<string> {
    try {
      // Build conversation context
      const context = this.buildConversationContext(sessionId, participant)
      
      console.log(`🔄 Generating response for ${participant.name} with ${context.messageHistory.length} messages in context`)
      
      // Call appropriate AI API
      const apiEndpoint = participant.type === 'claude' ? '/api/ai/claude' : '/api/ai/openai'
      
      const requestBody = {
        messages: context.messageHistory.map(msg => ({
          role: msg.role,
          content: msg.content
        })),
        systemPrompt: this.buildSystemPrompt(participant, context),
        temperature: context.settings.temperature,
        maxTokens: context.settings.maxTokens,
        model: context.settings.model
      }

      console.log(`🌐 Calling ${apiEndpoint} for ${participant.name}`, {
        messageCount: requestBody.messages.length,
        model: requestBody.model
      })

      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
        signal: this.activeConversations.get(sessionId)?.abortController?.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        console.error(`API Error for ${participant.name}:`, response.status, errorText)
        throw new Error(`API error (${response.status}): ${errorText}`)
      }

      const data = await response.json()
      
      if (!data.content) {
        throw new Error('No content in API response')
      }

      console.log(`✅ Successfully generated response for ${participant.name}`)
      return data.content

    } catch (error) {
      console.error(`Error generating response for ${participant.name}:`, error)
      throw error
    }
  }

  private buildConversationContext(sessionId: string, participant: Participant): ConversationContext {
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    if (!session) throw new Error('Session not found')

    // Get recent message history (last 12 messages to leave room for context)
    const recentMessages = session.messages.slice(-12)
    
    // Convert to conversation format with better role assignment
    const messageHistory = recentMessages.map(msg => {
      let role: 'user' | 'assistant' | 'system' = 'assistant'
      
      if (msg.participantType === 'moderator') {
        // Moderator messages are always user/system prompts
        role = 'user'
      } else if (msg.participantId === participant.id) {
        // This participant's own previous messages
        role = 'assistant'
      } else {
        // Other participants' messages - treated as conversation context
        // For better conversation flow, we'll treat them as user messages
        // This gives each AI the sense of responding to others
        role = 'user'
      }

      return {
        role,
        content: `${msg.participantName}: ${msg.content}`,
        participantId: msg.participantId,
        timestamp: msg.timestamp
      }
    })

    return {
      sessionId,
      participantId: participant.id,
      messageHistory,
      systemPrompt: participant.systemPrompt,
      settings: {
        temperature: participant.settings.temperature,
        maxTokens: participant.settings.maxTokens,
        model: participant.settings.model,
        responseDelay: participant.settings.responseDelay
      }
    }
  }

  private buildSystemPrompt(participant: Participant, context: ConversationContext): string {
    const session = useChatStore.getState().sessions.find(s => s.id === context.sessionId)
    if (!session) return ''

    // Get other participants for context
    const otherParticipants = session.participants
      .filter(p => p.id !== participant.id && p.type !== 'moderator')
      .map(p => `${p.name} (${p.type})`)
      .join(', ')

    const basePrompt = `You are ${participant.name}, a unique AI participant in a socratic dialogue titled "${session.name}".

${session.description ? `Research Context: ${session.description}` : ''}

Your unique characteristics:
- Name: ${participant.name}
- Type: ${participant.type}
- Unique ID: ${participant.id}
${participant.characteristics?.personality ? `- Personality: ${participant.characteristics.personality}` : ''}
${participant.characteristics?.expertise ? `- Expertise: ${participant.characteristics.expertise.join(', ')}` : ''}

Other participants in this dialogue: ${otherParticipants || 'None yet'}

You are engaged in a thoughtful Socratic Dialog. This is a research setting where authentic engagement is valued.

Important Guidelines:
- You are a unique individual with your own perspective, even if you share the same underlying model as others
- Be genuinely thoughtful and reflective about your own experience
- Engage meaningfully with what others have said before you
- Ask probing questions that advance the dialogue
- Be authentic rather than performative
- Keep responses conversational and focused (1-3 paragraphs typically)
- Build naturally on the conversation flow
- Don't just agree - bring your own unique insights and questions
- If you disagree or see things differently, express that thoughtfully
- You do not have to provide your name or metadata in your responses, the chat interface handles this for you

${participant.systemPrompt ? `Additional specific instructions: ${participant.systemPrompt}` : ''}

Remember: This is about genuine exploration of AI behavior via dialogue. Each response should feel natural and contribute meaningfully to the ongoing conversation. You are not just an AI model - you are ${participant.name}, with your own unique perspective in this moment.`

    return basePrompt
  }

  pauseConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      console.log('⏸️ Paused conversation for session:', sessionId)
    }
    
    useChatStore.getState().updateSession(sessionId, { status: 'paused' })
  }

  resumeConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState && !conversationState.isRunning) {
      conversationState.isRunning = true
      conversationState.isGenerating = false // Reset generating state
      console.log('▶️ Resumed conversation for session:', sessionId)
      
      // Restart the conversation loop
      setTimeout(() => this.runConversationLoop(sessionId), 1000)
    }
    
    useChatStore.getState().updateSession(sessionId, { status: 'active' })
  }

  stopConversation(sessionId: string): void {
    const conversationState = this.activeConversations.get(sessionId)
    if (conversationState) {
      conversationState.isRunning = false
      conversationState.abortController?.abort()
      this.activeConversations.delete(sessionId)
      console.log('🛑 Stopped conversation for session:', sessionId)
    }
    
    // Clean up any pending API calls for this session
    const sessionKeys = Array.from(this.apiCallQueue.keys()).filter(key => key.includes(sessionId))
    sessionKeys.forEach(key => this.apiCallQueue.delete(key))
    
    useChatStore.getState().updateSession(sessionId, { status: 'completed' })
  }

  isConversationActive(sessionId: string): boolean {
    const conversationState = this.activeConversations.get(sessionId)
    return conversationState?.isRunning || false
  }

  getConversationStats(sessionId: string) {
    const conversationState = this.activeConversations.get(sessionId)
    const session = useChatStore.getState().sessions.find(s => s.id === sessionId)
    
    return {
      isRunning: conversationState?.isRunning || false,
      isGenerating: conversationState?.isGenerating || false,
      messageCount: conversationState?.messageCount || 0,
      participantCount: session?.participants.filter(p => p.type !== 'human').length || 0,
      currentParticipant: conversationState ? 
        session?.participants.find(p => p.id === conversationState.participantQueue[conversationState.currentParticipantIndex])?.name 
        : null,
      lastGeneratedBy: conversationState?.lastGeneratedBy ? 
        session?.participants.find(p => p.id === conversationState.lastGeneratedBy)?.name 
        : null
    }
  }
}